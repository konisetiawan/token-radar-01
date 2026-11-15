export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  intercept: number;
  slope: number;
  r_squared: number;
  residual_sd: number;
  comps_count: number;
  growth_slope: number;
  age_slope: number;
  category_factors: Record<string, number>;
  model_version: string;
}

export const MODEL_VERSION = 'radar-2';

export function parseSnapshot(text: string): Snapshot {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error('Invalid JSON: ' + (err as Error).message);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Snapshot must be a JSON object');
  }

  if (typeof data.as_of !== 'string' || isNaN(Date.parse(data.as_of))) {
    throw new Error('Invalid or missing as_of date string');
  }

  if (typeof data.source !== 'string') {
    throw new Error('Invalid or missing source string');
  }

  if (typeof data.floor_usd !== 'number' || !Number.isInteger(data.floor_usd) || data.floor_usd <= 0) {
    throw new Error('floor_usd must be a positive integer');
  }

  if (!Array.isArray(data.protocols)) {
    throw new Error('protocols must be an array');
  }

  if (!Array.isArray(data.watchlist) || !data.watchlist.every((w: any) => typeof w === 'string')) {
    throw new Error('watchlist must be an array of strings');
  }

  const protocols: SnapshotProtocol[] = data.protocols.map((p: any, idx: number) => {
    if (!p || typeof p !== 'object') {
      throw new Error(`Protocol at index ${idx} must be an object`);
    }
    if (typeof p.slug !== 'string') {
      throw new Error(`Protocol at index ${idx} missing string slug`);
    }
    if (typeof p.name !== 'string') {
      throw new Error(`Protocol at index ${idx} missing string name`);
    }
    if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new Error(`Protocol at index ${idx} missing finite tvl_usd`);
    }

    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.map((c: any) => String(c)) : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });

  return {
    as_of: data.as_of,
    source: data.source,
    floor_usd: data.floor_usd,
    protocols,
    watchlist: [...data.watchlist],
  };
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!asOf || !listedAt) return null;
  const asOfTime = Date.parse(asOf);
  const listedTime = Date.parse(listedAt);
  if (isNaN(asOfTime) || isNaN(listedTime)) return null;
  const diffMs = asOfTime - listedTime;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

export function fitModel(snapshot: Snapshot): ModelConstants {
  const stablecoins = new Set(['usdt', 'usdc', 'dai', 'usde', 'usdd', 'frax']);
  const normalize = (value: string | null) => (value ?? '').trim().toLowerCase();
  const clamp = (value: number, low: number, high: number) =>
    Math.max(low, Math.min(high, value));
  let comps = snapshot.protocols.filter(p =>
    p.mcap_usd !== null && Number.isFinite(p.mcap_usd) && p.mcap_usd > 0 &&
    Number.isFinite(p.tvl_usd) && p.tvl_usd > 0 &&
    normalize(p.category) !== 'cex' &&
    !normalize(p.category).includes('stablecoin') &&
    !stablecoins.has(normalize(p.symbol)) && !stablecoins.has(normalize(p.name))
  ).map(protocol => ({
    protocol,
    x: Math.log(protocol.tvl_usd),
    y: Math.log(protocol.mcap_usd!),
  }));

  // Centered least squares includes an intercept for each regression.
  const regress = (points: { x: number; y: number }[]) => {
    const n = points.length;
    const meanX = points.reduce((sum, p) => sum + p.x, 0) / (n || 1);
    const meanY = points.reduce((sum, p) => sum + p.y, 0) / (n || 1);
    let xx = 0;
    let xy = 0;
    let yy = 0;
    for (const p of points) {
      xx += (p.x - meanX) ** 2;
      xy += (p.x - meanX) * (p.y - meanY);
      yy += (p.y - meanY) ** 2;
    }
    const slope = xx > 0 ? xy / xx : 0;
    const intercept = meanY - slope * meanX;
    const residuals = points.map(p => p.y - intercept - slope * p.x);
    const sse = residuals.reduce((sum, r) => sum + r * r, 0);
    return {
      intercept, slope, residuals,
      r_squared: yy > 0 ? clamp(1 - sse / yy, 0, 1) : 0,
      residual_sd: Math.sqrt(sse / Math.max(1, n - 2)),
    };
  };

  if (comps.length < 3) throw new Error('At least three eligible comps are required');
  const initial = regress(comps);
  comps = comps.filter((_, i) => Math.abs(initial.residuals[i]) <= 3 * initial.residual_sd);
  if (comps.length < 3) throw new Error('At least three comps must remain after outlier removal');
  const fitted = regress(comps);
  const byCategory = new Map<string, number[]>();
  const growthPoints: { x: number; y: number }[] = [];
  const agePoints: { x: number; y: number }[] = [];
  comps.forEach(({ protocol }, i) => {
    const residual = fitted.residuals[i];
    if (protocol.category !== null) {
      const group = byCategory.get(protocol.category) ?? [];
      group.push(residual);
      byCategory.set(protocol.category, group);
    }
    growthPoints.push({ x: clamp(protocol.change_7d ?? 0, -30, 60), y: residual });
    const days = ageDays(snapshot.as_of, protocol.listed_at);
    if (days !== null) agePoints.push({ x: days / 365.25, y: residual });
  });
  const category_factors: Record<string, number> = Object.create(null);
  for (const protocol of snapshot.protocols) {
    if (protocol.category !== null) category_factors[protocol.category] = 0;
  }
  for (const [category, residuals] of byCategory) {
    const n = residuals.length;
    if (n < 5) continue;
    residuals.sort((a, b) => a - b);
    const middle = Math.floor(n / 2);
    const median = n % 2 ? residuals[middle] : (residuals[middle - 1] + residuals[middle]) / 2;
    category_factors[category] = clamp(median * n / (n + 5), -0.7, 0.7);
  }
  return {
    intercept: fitted.intercept,
    slope: fitted.slope,
    r_squared: fitted.r_squared,
    residual_sd: fitted.residual_sd,
    comps_count: comps.length,
    growth_slope: regress(growthPoints).slope,
    age_slope: regress(agePoints).slope,
    category_factors,
    model_version: MODEL_VERSION,
  };
}

export function impliedValue(
  protocol: SnapshotProtocol,
  model: ModelConstants,
  asOf: string,
  siblingFactor?: number,
): { value: number; low: number; high: number } {
  const base = Math.exp(model.intercept + model.slope * Math.log(protocol.tvl_usd));
  const categoryAdjustment = protocol.category === null
    ? 0
    : (model.category_factors[protocol.category] ?? 0);
  const categoryFactor = Math.exp(categoryAdjustment);
  const growth = Math.max(-30, Math.min(60, protocol.change_7d ?? 0));
  const growthFactor = Math.exp(model.growth_slope * growth);
  const ageFactor = Math.exp(model.age_slope * (ageDays(asOf, protocol.listed_at) ?? 0) / 365.25);
  const sibling = siblingFactor ?? 1;
  const value = base * categoryFactor * growthFactor * ageFactor * sibling;
  const band = Math.exp(1.28 * model.residual_sd);
  const low = value / band;
  const high = value * band;
  return { value, low, high };
}

export interface BacktestResult {
  loo_miss: number;
  loo_within3: number;
  loo_within10: number;
  loo_n: number;
  time_miss: number;
  time_within3: number;
  time_n: number;
  flat_loo_miss: number;
  flat_loo_within3: number;
  flat_time_miss: number;
  flat_time_within3: number;
}

export function backtestModel(snapshot: Snapshot, model: ModelConstants): BacktestResult {
  const stablecoins = new Set(['usdt', 'usdc', 'dai', 'usde', 'usdd', 'frax']);
  const normalize = (value: string | null) => (value ?? '').trim().toLowerCase();
  const comps = snapshot.protocols.filter(p =>
    p.mcap_usd !== null && Number.isFinite(p.mcap_usd) && p.mcap_usd > 0 &&
    Number.isFinite(p.tvl_usd) && p.tvl_usd > 0 &&
    normalize(p.category) !== 'cex' &&
    !normalize(p.category).includes('stablecoin') &&
    !stablecoins.has(normalize(p.symbol)) && !stablecoins.has(normalize(p.name))
  ).map(p => ({
    x: Math.log(p.tvl_usd),
    y: Math.log(p.mcap_usd!),
    multiple: p.mcap_usd! / p.tvl_usd,
    category: p.category,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
  }));

  const median = (values: number[]): number => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const fit = (points: { x: number; y: number }[]) => {
    const meanX = points.reduce((sum, p) => sum + p.x, 0) / (points.length || 1);
    const meanY = points.reduce((sum, p) => sum + p.y, 0) / (points.length || 1);
    let xx = 0;
    let xy = 0;
    for (const p of points) {
      xx += (p.x - meanX) ** 2;
      xy += (p.x - meanX) * (p.y - meanY);
    }
    const slope = xx > 0 ? xy / xx : 0;
    return { intercept: meanY - slope * meanX, slope };
  };
  const modelError = (p: typeof comps[number], base: ReturnType<typeof fit>) => {
    const categoryFactor = p.category === null ? 0 : (model.category_factors[p.category] ?? 0);
    const growth = Math.max(-30, Math.min(60, p.change_7d ?? 0));
    const ageYears = (ageDays(snapshot.as_of, p.listed_at) ?? 0) / 365.25;
    // The log of the product prediction avoids intermediate overflow.
    const logPrediction = base.intercept + base.slope * p.x + categoryFactor +
      model.growth_slope * growth + model.age_slope * ageYears;
    return Math.abs(p.y - logPrediction);
  };
  const flatError = (p: typeof comps[number], multiple: number) =>
    Math.abs(p.y - (Math.log(multiple) + p.x));
  const miss = (errors: number[]) => errors.length ? Math.exp(median(errors)) : 0;
  const within = (errors: number[], factor: number) => errors.length
    ? errors.filter(error => error <= Math.log(factor)).length / errors.length
    : 0;

  const looErrors: number[] = [];
  const flatLooErrors: number[] = [];
  if (comps.length > 1) {
    comps.forEach((p, index) => {
      const others = comps.filter((_, i) => i !== index);
      looErrors.push(modelError(p, fit(others)));
      flatLooErrors.push(flatError(p, median(others.map(other => other.multiple))));
    });
  }

  const cutoff = Date.parse('2025-01-01');
  const train = comps.filter(p => p.listed_at !== null && Date.parse(p.listed_at) < cutoff);
  const test = comps.filter(p => p.listed_at !== null && Date.parse(p.listed_at) >= cutoff);
  const timeErrors: number[] = [];
  const flatTimeErrors: number[] = [];
  if (train.length && test.length) {
    const base = fit(train);
    const multiple = median(train.map(p => p.multiple));
    for (const p of test) {
      timeErrors.push(modelError(p, base));
      flatTimeErrors.push(flatError(p, multiple));
    }
  }

  return {
    loo_miss: miss(looErrors),
    loo_within3: within(looErrors, 3),
    loo_within10: within(looErrors, 10),
    loo_n: comps.length,
    time_miss: miss(timeErrors),
    time_within3: within(timeErrors, 3),
    time_n: timeErrors.length,
    flat_loo_miss: miss(flatLooErrors),
    flat_loo_within3: within(flatLooErrors, 3),
    flat_time_miss: miss(flatTimeErrors),
    flat_time_within3: within(flatTimeErrors, 3),
  };
}

export interface FarmStep { text: string; cost: string; time: string; }
export type FarmVerdict = 'FARM' | 'THIN' | 'SKIP';
export interface FarmPlan {
  verdict: FarmVerdict;
  slice_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  work_hours: number;
  gas_usd: number;
  fees_usd: number;
  forgone_usd: number;
  capital_usd: number;
  hold_days: number;
  steps: FarmStep[];
}

export function chainOf(p: SnapshotProtocol): string {
  return p.chains[0] ?? 'its main chain';
}

export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  return age < 365 ? 45 : 30;
}

export function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const category = (p.category ?? '').toLowerCase();
  const has = (...terms: string[]) => terms.some(term => category.includes(term));
  let action: string;
  if (has('lend', 'cdp', 'collateral')) action = 'Supply USDC';
  else if (has('dex', 'yield', 'leveraged farm')) action = 'Provide liquidity';
  else if (has('bridge')) action = 'Bridge USDC';
  else if (has('staking', 'restak')) action = 'Stake';
  else if (has('perpetual', 'derivative')) action = 'Deposit margin';
  else if (has('prediction')) action = 'Fund a market position';
  else if (has('curator', 'allocator')) action = 'Deposit into a vault';
  else if (has('stable')) action = 'Mint or deposit the stable asset';
  else if (has('rwa')) action = 'Mint the yield asset';
  else if (has('insurance')) action = 'Buy cover';
  else action = 'Deposit USDC';
  return `${action} with $${capital} through ${p.name} on ${chain}.`;
}

export function farmSteps(
  p: SnapshotProtocol,
  capital: number,
  hold_days: number,
  gas: number = 8,
  fees: number = 2,
): FarmStep[] {
  const chain = chainOf(p);
  const budget = `$${capital} capital; $${gas} total gas budget; $${fees} total fees over ${hold_days} days`;
  const forgone = capital * 0.04 * (hold_days / 365);
  return [
    {
      text: `Create a fresh wallet for ${p.name} on ${chain} and fund its capital and gas budget.`,
      cost: budget,
      time: `5 minutes of setup before the ${hold_days}-day hold`,
    },
    {
      text: actionFor(p, capital, chain),
      cost: `${budget}; use the existing capital allocation`,
      time: `10 minutes to enter, then hold for ${hold_days} days`,
    },
    {
      text: `Perform one qualifying action each week according to ${p.name}'s published requirements.`,
      cost: `${budget}; reuse capital and draw gas from the total budget`,
      time: `10.2 minutes each week during ${hold_days} days`,
    },
    {
      text: `Hold the $${capital} position in ${p.name} for ${hold_days} days.`,
      cost: `${budget}; $${forgone.toFixed(2)} forgone yield at 4% annually`,
      time: `${hold_days} elapsed days; no additional active work beyond weekly checks`,
    },
    {
      text: `Claim only from ${p.name}'s own published link when a claim is available.`,
      cost: `${budget}; claim gas comes from the total gas budget`,
      time: `5.1 minutes when available after the ${hold_days}-day hold`,
    },
    {
      text: `Keep a farm log for ${p.name} with transaction links, dates, costs and any claim proceeds.`,
      cost: `${budget}; $0 additional logging cost`,
      time: `5.1 minutes total to maintain the log across ${hold_days} days`,
    },
  ];
}

export function farmPlan(p: SnapshotProtocol, implied_value_usd: number, age_days: number | null): FarmPlan {
  const capital_usd = 1000;
  const hold_days = holdDaysFor(age_days);
  const slice_usd = implied_value_usd * 0.10 * (capital_usd / p.tvl_usd);
  const gas_usd = 8;
  const fees_usd = 2;
  const forgone_usd = capital_usd * 0.04 * (hold_days / 365);
  const work_hours = 0.25 + 0.17 * (hold_days / 7) + 0.17;
  const net_usd = slice_usd - gas_usd - fees_usd - forgone_usd;
  const net_per_hour_usd = net_usd / work_hours;
  const verdict: FarmVerdict = net_per_hour_usd >= 1 ? 'FARM' : net_usd > 0 ? 'THIN' : 'SKIP';
  return {
    verdict, slice_usd, net_usd, net_per_hour_usd, work_hours,
    gas_usd, fees_usd, forgone_usd, capital_usd, hold_days,
    steps: farmSteps(p, capital_usd, hold_days, gas_usd, fees_usd),
  };
}

export function stepText(step: FarmStep): string {
  let text = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (text.length < 20) text += " Hold the position and check the protocol's own page.";
  return text.length > 600 ? text.slice(0, 597) + '...' : text;
}

export const EARLY_ROWS = 160;

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  model: {
    base_usd: number;
    category_multiplier: number;
    growth_multiplier: number;
    age_multiplier: number;
    sibling_multiplier: number;
    age_days: number | null;
  };
  verdict: FarmVerdict;
  slice_usd: number;
  net_per_hour_usd: number;
  farm_steps: string[];
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name) &&
    (p.category === null || !p.category.toLowerCase().includes('stablecoin')) &&
    !/^(wrapped|staked|bridged)\s/i.test(p.name);
}

export function familyOf(name: string): string {
  return name.replace(VERSIONED, '').trim().toLowerCase();
}

export function siblingFactors(snapshot: Snapshot): Map<string, number> {
  const families = new Map<string, SnapshotProtocol[]>();
  for (const p of snapshot.protocols) {
    const family = familyOf(p.name);
    const members = families.get(family) ?? [];
    members.push(p);
    families.set(family, members);
  }
  const factors = new Map<string, number>();
  for (const members of families.values()) {
    const factor = 1 / (1 + 0.5 * (members.length - 1));
    for (const p of members) factors.set(p.slug, factor);
  }
  return factors;
}

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const model = fitModel(snapshot);
  const siblings = siblingFactors(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  const bySlug = (a: SnapshotProtocol, b: SnapshotProtocol) =>
    a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  for (const p of snapshot.protocols) {
    if (watchlist.has(p.slug)) chosen.set(p.slug, p);
  }
  const early = snapshot.protocols
    .filter(p => isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || bySlug(a, b))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map(p => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const sibling = siblings.get(p.slug) ?? 1;
    const implied = impliedValue(p, model, snapshot.as_of, sibling);
    const plan = farmPlan(p, implied.value, age);
    return { p, age, sibling, implied, plan };
  });
  scored.sort((a, b) => b.implied.value - a.implied.value || bySlug(a.p, b.p));
  const wholeDollar = (value: number) => Math.max(1, Math.round(value));
  const cents = (value: number) => Math.round(value * 100) / 100;
  return scored.map(({ p, age, sibling, implied, plan }, index) => ({
    ...p,
    rank: index + 1,
    token_status: 'pre-token',
    age_days: age,
    implied_value_usd: wholeDollar(implied.value),
    implied_low_usd: wholeDollar(implied.low),
    implied_high_usd: wholeDollar(implied.high),
    model: {
      base_usd: Math.exp(model.intercept + model.slope * Math.log(p.tvl_usd)),
      category_multiplier: Math.exp(p.category === null ? 0 : (model.category_factors[p.category] ?? 0)),
      growth_multiplier: Math.exp(model.growth_slope * Math.max(-30, Math.min(60, p.change_7d ?? 0))),
      age_multiplier: Math.exp(model.age_slope * (age ?? 0) / 365.25),
      sibling_multiplier: sibling,
      age_days: age,
    },
    verdict: plan.verdict,
    slice_usd: cents(plan.slice_usd),
    net_per_hour_usd: cents(plan.net_per_hour_usd),
    farm_steps: plan.steps.map(stepText),
  }));
}

export const LIVE_ROWS = 24;

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  verdict: FarmVerdict;
  slice_usd: number;
  net_per_hour_usd: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  backtest: BacktestResult;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  farm_counts: { farm: number; thin: number; skip: number };
  rows: RadarRow[];
  live: LiveRow[];
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter(p => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map(p => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    verdict: row.verdict,
    slice_usd: row.slice_usd,
    net_per_hour_usd: row.net_per_hour_usd,
    farm_steps: row.farm_steps,
  };
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const model = fitModel(snapshot);
  const backtest = backtestModel(snapshot, model);
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const farm_counts = { farm: 0, thin: 0, skip: 0 };
  for (const row of board) {
    if (row.verdict === 'FARM') farm_counts.farm++;
    else if (row.verdict === 'THIN') farm_counts.thin++;
    else farm_counts.skip++;
  }
  const watchlist = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    backtest,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter(row => !watchlist.has(row.slug)).length,
    live_size: live.length,
    farm_counts,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const boardSlugs = new Set(board.map(r => r.slug));
  const missingWatchlist = snapshot.watchlist.filter(slug => !boardSlugs.has(slug));
  if (missingWatchlist.length > 0) {
    const firstFive = missingWatchlist.slice(0, 5).join(', ');
    return `Watchlist slug ${missingWatchlist[0]}: ${missingWatchlist.length} watchlist slugs missing from board (first five: ${firstFive})`;
  }

  for (let i = 0; i < board.length; i++) {
    const row = board[i];
    if (row.rank !== i + 1) {
      return `slug ${row.slug}: invalid rank ${row.rank}, expected ${i + 1}`;
    }
  }

  for (let i = 0; i < board.length - 1; i++) {
    const curr = board[i];
    const next = board[i + 1];
    if (curr.implied_value_usd < next.implied_value_usd) {
      return `slug ${next.slug}: implied value increased from ${curr.implied_value_usd} at rank ${curr.rank} to ${next.implied_value_usd} at rank ${next.rank}`;
    }
  }

  if (board.length >= 2) {
    const first = board[0];
    const last = board[board.length - 1];
    if (first.implied_value_usd === last.implied_value_usd) {
      return `slug ${last.slug}: first implied value (${first.implied_value_usd}) equals last implied value (${last.implied_value_usd})`;
    }
  }

  for (const row of board) {
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `slug ${row.slug}: farm_steps count ${row.farm_steps.length} out of range [3, 12]`;
    }
    for (const step of row.farm_steps) {
      if (step.length < 20 || step.length > 600) {
        return `slug ${row.slug}: farm_step length ${step.length} out of range [20, 600]`;
      }
    }
  }

  for (const row of board) {
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `slug ${row.slug}: invalid implied_value_usd ${row.implied_value_usd} (must be safe integer above zero)`;
    }
  }

  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
