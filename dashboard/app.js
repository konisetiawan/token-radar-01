(function () {
  'use strict';

  var DATA = window.RADAR;
  var state = {q: '', category: 'all', chain: 'all', tvl: 'all', verdict: 'all', tab: 'board', sort: 'rank', dir: 1, selected: null};
  var hashKeys = {q: 'q', category: 'cat', chain: 'chain', tvl: 'tvl', verdict: 'verdict', tab: 'tab', sort: 'sort', dir: 'dir', selected: 'sel'};

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'class') node.className = value;
      else if (key.slice(0, 2) === 'on' && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'value' || key === 'selected') node[key] = value;
      else if (value !== null && value !== undefined) node.setAttribute(key, value);
    });
    (Array.isArray(children) ? children : [children]).forEach(function (child) {
      if (child !== null && child !== undefined) node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  function fmtUsd(n) {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
    n = Number(n);
    var magnitude = Math.abs(n);
    var scale = magnitude >= 1e12 ? 1e12 : magnitude >= 1e9 ? 1e9 : magnitude >= 1e6 ? 1e6 : magnitude >= 1e3 ? 1e3 : 1;
    var suffix = scale === 1e12 ? 'T' : scale === 1e9 ? 'B' : scale === 1e6 ? 'M' : scale === 1e3 ? 'K' : '';
    var amount = magnitude / scale;
    var digits = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
    return (n < 0 ? '-' : '') + '$' + (digits ? amount.toFixed(digits).replace(/\.?0+$/, '') : amount.toFixed(0)) + suffix;
  }

  function fmtPct(n) {
    return n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : (Number(n) >= 0 ? '+' : '') + Number(n).toFixed(1) + '%';
  }

  function fmtAge(days) {
    if (days === null || days === undefined || !Number.isFinite(Number(days))) return '—';
    return days < 548 ? Math.round(days) + 'd' : (days / 365).toFixed(1) + 'y';
  }

  function readHash() {
    var params = new URLSearchParams(location.hash.slice(1));
    Object.keys(hashKeys).forEach(function (key) {
      var value = params.get(hashKeys[key]);
      state[key] = key === 'dir' ? (value === '-1' ? -1 : 1) : key === 'selected' ? (value || null) : value === null ? (key === 'q' ? '' : key === 'tab' ? 'board' : key === 'sort' ? 'rank' : 'all') : value;
    });
    if (['board', 'live', 'aside', 'method'].indexOf(state.tab) < 0) state.tab = 'board';
    if (['rank', 'name', 'tvl', 'growth', 'age', 'implied', 'slice', 'net'].indexOf(state.sort) < 0) state.sort = 'rank';
  }

  function writeHash() {
    var params = new URLSearchParams();
    Object.keys(hashKeys).forEach(function (key) {
      if (state[key] !== null) params.set(hashKeys[key], String(state[key]));
    });
    history.replaceState(null, '', '#' + params.toString());
  }

  function update(key, value) {
    state[key] = value;
    writeHash();
    render();
  }

  function header() {
    return el('header', {class: 'top'}, [
      el('div', {class: 'brand', text: 'Token Radar'}),
      el('div', {class: 'sub', text: 'DefiLlama snapshot 2026-11-14 · 758 protocols · watchlist floor $50M'})
    ]);
  }

  function hero() {
    return el('section', {class: 'hero'}, [
      el('h1', {text: '200 pre-token protocols ranked by what a launch would be worth — fitted from 117 real token launches.'}),
      el('div', {class: 'tiles'}, [DATA.rows.length + ' rows', DATA.watchlist_size + '/40 watchlist', DATA.farm_counts.farm + ' FARM', 'LOO ×' + DATA.backtest.loo_miss.toFixed(2)].map(function (text) {
        return el('div', {class: 'tile', text: text});
      }))
    ]);
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean))).sort();
  }

  function selectControl(key, label, options) {
    return el('label', {}, [el('span', {text: label}), el('select', {'aria-label': label, onchange: function (event) { update(key, event.target.value); }}, options.map(function (option) {
      return el('option', {value: option[0], selected: state[key] === option[0], text: option[1]});
    }))]);
  }

  function controls() {
    return el('section', {class: 'controls'}, [
      el('input', {id: 'protocol-search', type: 'search', placeholder: 'Search protocol…', 'aria-label': 'Search protocol', value: state.q, oninput: function (event) {
        var position = event.target.selectionStart;
        update('q', event.target.value);
        var search = document.getElementById('protocol-search');
        search.focus();
        if (position !== null) search.setSelectionRange(position, position);
      }}),
      selectControl('category', 'Category', [['all', 'All']].concat(unique(DATA.rows.map(function (row) { return row.category; })).map(function (value) { return [value, value]; }))),
      selectControl('chain', 'Chain', [['all', 'All']].concat(unique(DATA.rows.map(function (row) { return row.chains[0]; })).map(function (value) { return [value, value]; }))),
      selectControl('tvl', 'TVL', [['all', 'All'], ['1b', '≥$1B'], ['100m', '$100M–$1B'], ['50m', '$50M–$100M'], ['under50m', '<$50M']]),
      selectControl('verdict', 'Verdict', [['all', 'All'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']]),
      el('nav', {'aria-label': 'Dashboard views'}, [['board', 'No token yet'], ['live', 'Token trades'], ['aside', 'Set aside'], ['method', 'Method and backtest']].map(function (tab) {
        return el('button', {type: 'button', class: 'tab' + (state.tab === tab[0] ? ' active' : ''), 'aria-pressed': String(state.tab === tab[0]), text: tab[1], onclick: function () { update('tab', tab[0]); }});
      })),
      el('div', {class: 'count', text: (state.tab === 'board' ? filteredRows().length : state.tab === 'live' ? DATA.live.length : 0) + ' rows shown'})
    ]);
  }

  function filteredRows() {
    var query = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (row) {
      var tvl = row.tvl_usd;
      return (!query || (row.name + ' ' + row.slug).toLowerCase().indexOf(query) !== -1) &&
        (state.category === 'all' || row.category === state.category) &&
        (state.chain === 'all' || row.chains[0] === state.chain) &&
        (state.verdict === 'all' || row.verdict === state.verdict) &&
        (state.tvl === 'all' || state.tvl === '1b' && tvl >= 1e9 || state.tvl === '100m' && tvl >= 1e8 && tvl < 1e9 || state.tvl === '50m' && tvl >= 5e7 && tvl < 1e8 || state.tvl === 'under50m' && tvl < 5e7);
    });
  }

  function clearFilters() {
    state = {q: '', category: 'all', chain: 'all', tvl: 'all', verdict: 'all', tab: 'board', sort: 'rank', dir: 1, selected: null};
    writeHash();
    render();
  }

  function sortHeader(label, key) {
    return el('th', {scope: 'col', 'aria-sort': state.sort === key ? (state.dir === 1 ? 'ascending' : 'descending') : 'none'}, [
      el('button', {type: 'button', text: label + (state.sort === key ? (state.dir === 1 ? ' ↑' : ' ↓') : ''), onclick: function () {
        state.dir = state.sort === key ? -state.dir : 1;
        state.sort = key;
        writeHash();
        render();
      }})
    ]);
  }

  function boardTable() {
    var fields = {rank: 'rank', name: 'name', tvl: 'tvl_usd', growth: 'change_7d', age: 'age_days', implied: 'implied_value_usd', slice: 'slice_usd', net: 'net_per_hour_usd'};
    var rows = filteredRows().sort(function (a, b) {
      var left = a[fields[state.sort]];
      var right = b[fields[state.sort]];
      if (left == null && right == null) return a.rank - b.rank;
      if (left == null) return 1;
      if (right == null) return -1;
      return (typeof left === 'string' ? left.localeCompare(right) : left - right) * state.dir || a.rank - b.rank;
    });
    if (!rows.length) return el('section', {class: 'empty'}, [el('p', {text: 'No protocols match your filters.'}), el('button', {type: 'button', text: 'Clear filters', onclick: clearFilters})]);
    return el('div', {class: 'table-wrap'}, [el('table', {class: 'board-table'}, [
      el('thead', {}, [el('tr', {}, [sortHeader('Rank', 'rank'), sortHeader('Protocol', 'name'), el('th', {scope: 'col', text: 'Category'}), sortHeader('TVL', 'tvl'), sortHeader('7d', 'growth'), sortHeader('Age', 'age'), sortHeader('Implied value', 'implied'), sortHeader('$1K slice', 'slice'), sortHeader('Net $/hr', 'net'), el('th', {scope: 'col', text: 'Verdict'})])]),
      el('tbody', {}, rows.map(function (row) {
        function activate() {
          state.selected = row.slug;
          writeHash();
          openDetail(row.slug);
        }
        return el('tr', {tabindex: '0', 'aria-label': 'View ' + row.name, onclick: activate, onkeydown: function (event) {
          if (event.key === 'Enter') { event.preventDefault(); activate(); }
        }}, [
          el('td', {text: row.rank}),
          el('td', {}, [el('strong', {text: row.name}), el('div', {class: 'chains', text: row.chains.join(', ')})]),
          el('td', {text: row.category}),
          el('td', {text: fmtUsd(row.tvl_usd)}),
          el('td', {text: fmtPct(row.change_7d)}),
          el('td', {text: fmtAge(row.age_days)}),
          el('td', {}, [el('strong', {text: fmtUsd(row.implied_value_usd)}), el('div', {class: 'range', text: fmtUsd(row.implied_low_usd) + '–' + fmtUsd(row.implied_high_usd)})]),
          el('td', {text: fmtUsd(row.slice_usd)}),
          el('td', {text: fmtUsd(row.net_per_hour_usd)}),
          el('td', {}, [el('span', {class: 'badge verdict-' + row.verdict.toLowerCase(), text: row.verdict})])
        ]);
      }))
    ])]);
  }

  function render() {
    document.title = 'Token Radar: pre-token protocols ranked by implied value';
    var board = document.getElementById('board');
    board.replaceChildren();
    board.appendChild(header());
    board.appendChild(hero());
    board.appendChild(controls());
    board.appendChild(state.tab === 'live' ? liveTable() : state.tab === 'aside' ? asidePanel() : state.tab === 'method' ? methodPanel() : boardTable());
    if (state.selected) openDetail(state.selected);
  }

  window.addEventListener('hashchange', function () { readHash(); render(); });
  readHash();
  render();
function liveTable() {
  const table = el('table');
  const caption = el('caption');
  caption.textContent = `Already trading: market cap is a fact, not a model. These ${window.RADAR.live.length} are set aside from the pre-token ranking.`;
  table.append(caption);
  const head = el('thead');
  const headings = el('tr');
  ['Protocol', 'Category', 'TVL', 'Market cap', 'Multiple', '7d'].forEach(label => {
    const cell = el('th');
    cell.scope = 'col';
    cell.textContent = label;
    headings.append(cell);
  });
  head.append(headings);
  table.append(head);
  const body = el('tbody');
  [...window.RADAR.live].sort((a, b) => b.mcap_usd - a.mcap_usd).forEach(item => {
    const row = el('tr');
    [item.name, item.category, fmtUsd(item.tvl_usd), fmtUsd(item.mcap_usd),
      item.tvl_usd > 0 ? `×${(item.mcap_usd / item.tvl_usd).toFixed(2)}` : '—',
      fmtPct(item.change_7d)].forEach(value => {
      const cell = el('td');
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
  table.append(body);
  return table;
}

function asidePanel() {
  const panel = el('aside');
  panel.className = 'panel';
  const title = el('h2');
  title.textContent = 'Set aside';
  const list = el('ul');
  [
    `The ${window.RADAR.live.length} live-token protocols in “Token trades”.`,
    'Wrapped, staked, bridged, versioned and exchange protocols excluded from the watchlist.',
    'Protocols below the $5M snapshot floor.'
  ].forEach(text => {
    const item = el('li');
    item.textContent = text;
    list.append(item);
  });
  const note = el('p');
  note.textContent = 'Nothing on this page is a price prediction.';
  panel.append(title, list, note);
  return panel;
}

function methodPanel() {
  const { model, backtest, rows, live } = window.RADAR;
  const panel = el('section');
  panel.className = 'panel method';
  const title = el('h2');
  title.textContent = 'Method and validation';
  const formula = el('div');
  formula.className = 'formula';
  formula.style.fontFamily = 'monospace';
  formula.style.whiteSpace = 'pre-wrap';
  formula.textContent = [
    'ln(implied value) = intercept + slope·ln(TVL) + category + growth_slope·growth7d + age_slope·age_years',
    'Implied value = exp(the fitted log value) × sibling discount',
    'P10–P90 band = value ÷/× exp(1.28·residual_sd)',
    `intercept = ${model.intercept}; slope = ${model.slope}; growth_slope = ${model.growth_slope}; age_slope = ${model.age_slope}`,
    `Fitted from ${model.comps_count} token launches; R² = ${model.r_squared}; residual sd = ${model.residual_sd}`,
    `Model version: ${model.model_version}`,
    `Category factors: ${Object.entries(model.category_factors).map(([name, value]) => `${name}: ${value}`).join('; ')}`
  ].join('\n');
  panel.append(title, formula);

  const table = el('table');
  const caption = el('caption');
  caption.textContent = 'Backtest';
  const head = el('thead');
  const heading = el('tr');
  ['Evaluation', 'Miss', 'Within 3×', 'Within 10×', 'n', 'Time miss', 'Time within 3×'].forEach(label => {
    const cell = el('th');
    cell.scope = 'col';
    cell.textContent = label;
    heading.append(cell);
  });
  head.append(heading);
  const body = el('tbody');
  [
    ['Leave-one-out (blind)', `×${backtest.loo_miss}`, (backtest.loo_within3 * 100).toFixed(1) + '%', (backtest.loo_within10 * 100).toFixed(1) + '%', backtest.loo_n, '—', '—'],
    ['Time-split', `×${backtest.time_miss}`, (backtest.time_within3 * 100).toFixed(1) + '%', '—', backtest.time_n, '—', '—'],
    ['Flat baseline', `LOO ×${backtest.flat_loo_miss}`, (backtest.flat_loo_within3 * 100).toFixed(1) + '%', '—', '—', `×${backtest.flat_time_miss}`, (backtest.flat_time_within3 * 100).toFixed(1) + '%']
  ].forEach(values => {
    const row = el('tr');
    values.forEach((value, index) => {
      const cell = el(index === 0 ? 'th' : 'td');
      if (index === 0) cell.scope = 'row';
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
  table.append(caption, head, body);
  panel.append(table);

  const namespace = document.documentElement.namespaceURI.replace(/1999\/xhtml$/, '2000/svg');
  const svgNode = (tag, attributes, text) => {
    const node = document.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svg = svgNode('svg', { viewBox: '0 0 720 320', width: 720, height: 320, role: 'img', 'aria-label': 'TVL versus implied value and live market cap, on logarithmic axes' });
  svg.style.maxWidth = '100%';
  svg.style.height = 'auto';
  const points = [
    ...rows.map(row => ({ name: row.name, tvl: row.tvl_usd, value: row.implied_value_usd, color: '#fbbf24' })),
    ...live.map(row => ({ name: row.name, tvl: row.tvl_usd, value: row.mcap_usd, color: '#22d3ee' }))
  ].filter(point => Number.isFinite(point.tvl) && point.tvl > 0 && Number.isFinite(point.value) && point.value > 0);
  if (points.length) {
    const xs = points.map(point => Math.log(point.tvl));
    const ys = points.map(point => Math.log(point.value));
    let xMin = Math.min(...xs), xMax = Math.max(...xs);
    let yMin = Math.min(...ys), yMax = Math.max(...ys);
    if (xMin === xMax) { xMin -= 0.5; xMax += 0.5; }
    if (yMin === yMax) { yMin -= 0.5; yMax += 0.5; }
    const left = 72, right = 696, top = 20, bottom = 264;
    const x = value => left + (value - xMin) / (xMax - xMin) * (right - left);
    const y = value => bottom - (value - yMin) / (yMax - yMin) * (bottom - top);
    svg.append(svgNode('path', { d: `M${left},${top}V${bottom}H${right}`, fill: 'none', stroke: 'currentColor' }));
    [1e7, 1e8, 1e9, 1e10].forEach(value => {
      const position = x(Math.log(value));
      if (position < left || position > right) return;
      svg.append(svgNode('line', { x1: position, x2: position, y1: top, y2: bottom, stroke: 'currentColor', opacity: 0.15 }));
      svg.append(svgNode('text', { x: position, y: bottom + 20, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': 11 }, fmtUsd(value)));
    });
    [1e6, 1e7, 1e8, 1e9].forEach(value => {
      const position = y(Math.log(value));
      if (position < top || position > bottom) return;
      svg.append(svgNode('line', { x1: left, x2: right, y1: position, y2: position, stroke: 'currentColor', opacity: 0.15 }));
      svg.append(svgNode('text', { x: left - 8, y: position + 4, 'text-anchor': 'end', fill: 'currentColor', 'font-size': 11 }, fmtUsd(value)));
    });
    let lineMin = xMin, lineMax = xMax;
    if (model.slope !== 0) {
      const bounds = [(yMin - model.intercept) / model.slope, (yMax - model.intercept) / model.slope].sort((a, b) => a - b);
      lineMin = Math.max(lineMin, bounds[0]);
      lineMax = Math.min(lineMax, bounds[1]);
    }
    if (lineMin <= lineMax && (model.slope !== 0 || (model.intercept >= yMin && model.intercept <= yMax))) {
      svg.append(svgNode('line', { x1: x(lineMin), y1: y(model.intercept + model.slope * lineMin), x2: x(lineMax), y2: y(model.intercept + model.slope * lineMax), stroke: 'currentColor', 'stroke-width': 2, 'stroke-dasharray': '5 4' }));
    }
    points.forEach(point => {
      const dot = svgNode('circle', { cx: x(Math.log(point.tvl)), cy: y(Math.log(point.value)), r: 3, fill: point.color, opacity: 0.8 });
      dot.append(svgNode('title', {}, `${point.name}: TVL ${fmtUsd(point.tvl)}, value ${fmtUsd(point.value)}`));
      svg.append(dot);
    });
    svg.append(svgNode('text', { x: (left + right) / 2, y: 312, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': 12 }, 'TVL (log scale)'));
    svg.append(svgNode('text', { x: 16, y: (top + bottom) / 2, transform: `rotate(-90 16 ${(top + bottom) / 2})`, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': 12 }, 'Value (log scale)'));
  }
  const legend = el('p');
  legend.textContent = `Amber: ${rows.length} pre-token implied values. Cyan: ${live.length} live market caps. Dashed line: intercept + slope·ln(TVL), before other adjustments.`;
  panel.append(svg, legend);
  return panel;
}

function openDetail(slug) {
  const row = window.RADAR.rows.find((candidate) => candidate.slug === slug);
  if (!row) return;
  let dialog = document.getElementById('detail');
  if (!dialog) {
    dialog = el('dialog');
    dialog.className = 'detail';
    dialog.id = 'detail';
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => {
      state.selected = null;
      writeHash();
    });
  }
  dialog.replaceChildren();
  const add = (tag, text, parent = dialog) => {
    const node = el(tag);
    node.textContent = text;
    parent.appendChild(node);
    return node;
  };
  state.selected = row.slug;
  writeHash();
  add('h2', row.name + ' · #' + row.rank);
  add('p', row.category + ' · ' + row.chains.join(', '));
  add('p', 'TVL: ' + fmtUsd(row.tvl_usd) + ' · 7d: ' +
    fmtPct(row.change_7d) + ' · Age: ' + fmtAge(row.age_days));
  add('h3', 'Implied value: ' + fmtUsd(row.implied_value_usd));
  add('p', 'P10–P90: ' + fmtUsd(row.implied_low_usd) + '–' +
    fmtUsd(row.implied_high_usd));
  add('p', row.verdict + ' · $1K slice: ' + fmtUsd(row.slice_usd) +
    ' · Net $/hr: ' + fmtUsd(row.net_per_hour_usd));

  const model = window.RADAR.model;
  const base = Math.exp(model.intercept + model.slope * Math.log(row.tvl_usd));
  const category = Math.exp(model.category_factors[row.category]);
  const growth = Math.exp(model.growth_slope *
    Math.max(-30, Math.min(60, row.change_7d)));
  const age = Math.exp(model.age_slope * row.age_days / 365.25);
  const sibling = row.implied_value_usd / (base * category * growth * age);
  add('h3', 'Model decomposition');
  const decomposition = el('dl');
  dialog.appendChild(decomposition);
  [
    ['Base · exp(intercept + slope × ln TVL)', fmtUsd(base)],
    ['Category · exp(category factor)', '× ' + category.toFixed(3)],
    ['Growth · exp(growth slope × clamped 7d change)', '× ' + growth.toFixed(3)],
    ['Age · exp(age slope × age in years)', '× ' + age.toFixed(3)],
    ['Sibling · implied value / (base × category × growth × age)', '× ' + sibling.toFixed(3)]
  ].forEach(([label, value]) => {
    add('dt', label, decomposition);
    add('dd', value, decomposition);
  });
  add('p', 'Base × category × growth × age × sibling = ' +
    fmtUsd(row.implied_value_usd));
  const steps = el('ol');
  steps.className = 'steps';
  row.farm_steps.forEach((step) => add('li', step, steps));
  dialog.appendChild(steps);
  const close = add('button', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
})();
