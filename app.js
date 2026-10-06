/**
 * app.js — UI, scoring, compare.
 * All data loads through Api.* so Supabase can replace the mock later.
 */

const state = {
  view: 'explore',
  categories: [],
  catalog: [],
  category: 'all',
  brand: null,
  search: '',
  sort: 'score',
  filterSafeOnly: false,
  filterInBudget: false,
  filterLabOnly: false,
  filterNoProp: false,
  favorites: new Set(),
  compareIds: [],
  normMode: 'serving',
  prices: {},
  prefs: {
    goal: '',
    calories: 2200,
    protein: 160,
    currency: 'INR',
    budget: 80,
    allergens: [],
    lowSugar: false,
    preferLab: false,
  },
};

let radarChart = null;
let barChart = null;

/* ---------- helpers ---------- */

function catMeta(id) {
  return state.categories.find((c) => c.id === id);
}

function getProduct(id) {
  return state.catalog.find((p) => p.id === id);
}

function money(n) {
  if (!Number.isFinite(n)) return '—';
  const sym = state.prefs.currency === 'INR' ? '₹' : '$';
  if (n >= 100) return `${sym}${n.toFixed(0)}`;
  if (n >= 1) return `${sym}${n.toFixed(2)}`;
  return `${sym}${n.toFixed(3)}`;
}

function productPrice(p) {
  const o = state.prices[p.id];
  if (o) return o.price;
  return state.prefs.currency === 'INR'
    ? Math.round(p.defaultPriceUSD * USD_TO_INR)
    : p.defaultPriceUSD;
}

function productPackageG(p) {
  return state.prices[p.id]?.packageG ?? p.defaultPackageG ?? p.packageSizeG;
}

function scale(p) {
  if (state.normMode !== 'per100g') return 1;
  return p.servingSizeG > 0 ? 100 / p.servingSizeG : 1;
}

function clampScore(n) {
  return Math.max(0, Math.min(5, Math.round(n * 10) / 10));
}

function scoreTone(s) {
  if (s >= 4) return 'hi';
  if (s >= 2.5) return 'mid';
  return 'lo';
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scoreLinear(value, best, worst) {
  if (best === worst) return 3;
  const t = (value - worst) / (best - worst);
  return clampScore(Math.max(0, Math.min(1, t)) * 5);
}

/* ---------- preferences / conflicts ---------- */

function preferenceIssues(p) {
  const issues = [];
  const { allergens, budget, lowSugar, goal } = state.prefs;

  (p.allergens || []).forEach((a) => {
    if (allergens.includes(a)) issues.push(`Not for you — contains ${a}`);
  });
  if (allergens.includes('artificial') && p.artificial) {
    issues.push('Not for you — artificial sweeteners / fillers');
  }
  if (productPrice(p) > budget) {
    issues.push(`Over budget (${money(productPrice(p))} vs ${money(budget)})`);
  }
  if (lowSugar && (p.addedSugar || 0) >= 5) {
    issues.push(`High added sugar (${p.addedSugar}g) vs low-sugar preference`);
  }
  if (goal === 'cutting' && p.category === 'gainer') {
    issues.push('Mass gainer conflicts with a cutting goal');
  }
  if (p.proprietaryBlend) {
    issues.push('Proprietary blend — active doses opaque');
  }
  return issues;
}

function isBlocked(p) {
  return preferenceIssues(p).some((i) => i.startsWith('Not for you'));
}

/* ---------- scoring ---------- */

function buildCriteria(p) {
  const s = scale(p);
  const protein = (p.protein || 0) * s;
  const sugar = (p.addedSugar || 0) * s;
  const servingG = p.servingSizeG * s;
  const price = productPrice(p);
  const pkg = productPackageG(p);
  const costPerServing = pkg > 0 ? (price / pkg) * (p.servingSizeG * s) : null;
  const costPerGProtein =
    protein > 0 && costPerServing != null ? costPerServing / protein : null;
  const purity = servingG > 0 && protein > 0 ? (protein / servingG) * 100 : 0;
  const sodium = (p.sodiumMg || 0) * s;
  const list = [];

  if (['whey', 'plant', 'gainer', 'collagen'].includes(p.category)) {
    const proteinBest = p.category === 'gainer' ? 45 : p.category === 'collagen' ? 12 : 28;
    const proteinWorst = p.category === 'gainer' ? 20 : p.category === 'collagen' ? 5 : 15;
    list.push({
      key: 'protein',
      label: 'Protein per serving',
      display: `${protein.toFixed(1)}g`,
      score: scoreLinear(protein, proteinBest, proteinWorst),
      weight: 1.4,
    });
    if (protein > 0) {
      list.push({
        key: 'purity',
        label: 'Protein % of serving',
        display: `${purity.toFixed(0)}%`,
        score: scoreLinear(purity, p.category === 'gainer' ? 35 : 90, p.category === 'gainer' ? 15 : 50),
        weight: 1.2,
      });
    }
  }

  if (p.category === 'creatine') {
    list.push({
      key: 'dose',
      label: 'Creatine dose / serving',
      display: `${((p.activeDoseG || 0) * s).toFixed(1)}g`,
      score: scoreLinear((p.activeDoseG || 0) * s, 5, 2),
      weight: 1.5,
    });
    list.push({
      key: 'purity',
      label: 'Creatine purity',
      display: `${(100 - (p.fillersPct || 0)).toFixed(0)}%`,
      score: scoreLinear(100 - (p.fillersPct || 0), 100, 50),
      weight: 1.3,
    });
  }

  if (p.category === 'amino') {
    list.push({
      key: 'dose',
      label: 'Active aminos / scoop',
      display: `${((p.activeDoseG || 0) * s).toFixed(1)}g`,
      score: scoreLinear((p.activeDoseG || 0) * s, 8, 3),
      weight: 1.4,
    });
  }

  if (p.category === 'pre') {
    const caf = (p.caffeineMg || 0) * s;
    const cit = (p.citrullineG || 0) * s;
    list.push({
      key: 'citrulline',
      label: 'Citrulline dose',
      display: `${cit.toFixed(1)}g`,
      score: scoreLinear(cit, 6, 0.5),
      weight: 1.3,
    });
    list.push({
      key: 'caffeine',
      label: 'Caffeine transparency',
      display: caf > 0 ? `${caf.toFixed(0)}mg` : 'Stim-free',
      score: caf === 0 ? 5 : scoreLinear(caf <= 300 ? caf : 600 - caf, 250, 50),
      weight: 1.0,
    });
    list.push({
      key: 'prop',
      label: 'Formula transparency',
      display: p.proprietaryBlend ? 'Proprietary' : 'Fully disclosed',
      score: p.proprietaryBlend ? 1 : 5,
      weight: 1.2,
    });
  }

  if (p.category === 'omega') {
    const epa = (p.actives || []).find((a) => /epa/i.test(a.name));
    const dha = (p.actives || []).find((a) => /dha/i.test(a.name));
    const totalMg = (epa?.amount || 0) + (dha?.amount || 0);
    list.push({
      key: 'epadha',
      label: 'EPA + DHA / serving',
      display: `${totalMg}mg`,
      score: scoreLinear(totalMg, 600, 150),
      weight: 1.5,
    });
  }

  if (p.category === 'multi') {
    list.push({
      key: 'coverage',
      label: 'Disclosed actives count',
      display: `${(p.actives || []).length} listed`,
      score: scoreLinear((p.actives || []).length, 4, 1),
      weight: 1.0,
    });
  }

  list.push({
    key: 'sugar',
    label: 'Added sugars',
    display: `${sugar.toFixed(1)}g`,
    score: sugar <= 0 ? 5 : scoreLinear(sugar, 0, 12),
    weight: state.prefs.lowSugar ? 1.3 : 1.0,
  });

  list.push({
    key: 'fillers',
    label: 'Net fillers',
    display: `${p.fillersPct || 0}%`,
    score: scoreLinear(p.fillersPct || 0, 0, 40),
    weight: 1.1,
  });

  list.push({
    key: 'sodium',
    label: 'Sodium',
    display: `${sodium.toFixed(0)}mg`,
    score: scoreLinear(sodium, 0, 350),
    weight: 0.8,
  });

  if (costPerGProtein != null) {
    list.push({
      key: 'costProtein',
      label: 'Cost / g protein',
      display: money(costPerGProtein),
      score: scoreLinear(costPerGProtein, 0.02, 0.2),
      weight: 1.2,
    });
  } else if (costPerServing != null) {
    list.push({
      key: 'costServing',
      label: 'Cost / serving',
      display: money(costPerServing),
      score: scoreLinear(costPerServing, 0.15, 2.5),
      weight: 1.2,
    });
  }

  list.push({
    key: 'testing',
    label: '3rd-party tested',
    display: p.thirdPartyTested ? `Yes${p.labName ? ` · ${p.labName}` : ''}` : 'No',
    score: p.thirdPartyTested ? (state.prefs.preferLab ? 5 : 4.5) : state.prefs.preferLab ? 1 : 2,
    weight: state.prefs.preferLab ? 1.3 : 0.9,
  });

  if (p.labelAccuracyPct != null) {
    list.push({
      key: 'label',
      label: 'Label accuracy',
      display: `${p.labelAccuracyPct}%`,
      score: scoreLinear(p.labelAccuracyPct, 100, 80),
      weight: 1.0,
    });
  }

  list.push({
    key: 'allergens',
    label: 'Allergen fit',
    display: isBlocked(p) ? 'Conflict' : (p.allergens || []).length ? (p.allergens || []).join(', ') : 'Clean',
    score: isBlocked(p) ? 0 : (p.allergens || []).length === 0 ? 5 : 3.5,
    weight: 1.5,
  });

  let goalScore = 3.5;
  let goalDisplay = 'Neutral';
  if (state.prefs.goal === 'cutting') {
    if (p.category === 'gainer') {
      goalScore = 1;
      goalDisplay = 'Poor for cutting';
    } else if (protein > 0 && p.calories > 0) {
      const dens = protein / (p.calories * s || p.calories);
      goalScore = scoreLinear(dens, 0.25, 0.05);
      goalDisplay = 'Protein density vs calories';
    } else if (p.category === 'creatine') {
      goalScore = 4.5;
      goalDisplay = 'Useful on a cut';
    }
  } else if (state.prefs.goal === 'bulking') {
    if (p.category === 'gainer' || (p.calories || 0) >= 120) {
      goalScore = 4.5;
      goalDisplay = 'Supports surplus';
    } else if (p.category === 'creatine') {
      goalScore = 5;
      goalDisplay = 'Excellent for bulking';
    }
  }
  list.push({
    key: 'goal',
    label: `Fit for ${state.prefs.goal}`,
    display: goalDisplay,
    score: clampScore(goalScore),
    weight: 1.0,
  });

  return list;
}

function overallScore(p) {
  const criteria = buildCriteria(p);
  let w = 0;
  let s = 0;
  criteria.forEach((c) => {
    w += c.weight;
    s += c.score * c.weight;
  });
  return { avg: clampScore(w ? s / w : 0), criteria };
}

function letterGrade(avg) {
  if (avg >= 4.3) return 'A';
  if (avg >= 3.6) return 'B';
  if (avg >= 2.8) return 'C';
  if (avg >= 2.0) return 'D';
  return 'F';
}

/* ---------- filter / sort ---------- */

function filteredProducts() {
  let list = [...state.catalog];
  if (state.category !== 'all') list = list.filter((p) => p.category === state.category);
  if (state.brand) list = list.filter((p) => p.brand === state.brand);
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.typeLabel.toLowerCase().includes(q) ||
        (p.summary || '').toLowerCase().includes(q) ||
        (p.subcategory || '').toLowerCase().includes(q)
    );
  }
  if (state.filterSafeOnly) list = list.filter((p) => !isBlocked(p));
  if (state.filterInBudget) list = list.filter((p) => productPrice(p) <= state.prefs.budget);
  if (state.filterLabOnly) list = list.filter((p) => p.thirdPartyTested);
  if (state.filterNoProp) list = list.filter((p) => !p.proprietaryBlend);

  list.sort((a, b) => {
    if (state.sort === 'code') return a.code.localeCompare(b.code);
    if (state.sort === 'price') return productPrice(a) - productPrice(b);
    if (state.sort === 'sugar') return (a.addedSugar || 0) - (b.addedSugar || 0);
    if (state.sort === 'protein') return (b.protein || 0) - (a.protein || 0);
    if (state.sort === 'purity') return (a.fillersPct || 0) - (b.fillersPct || 0);
    return overallScore(b).avg - overallScore(a).avg;
  });
  return list;
}

/* ---------- render explore ---------- */

function renderCategories() {
  const grid = document.getElementById('categoryGrid');
  const cards = state.categories
    .map((c) => {
      const count = state.catalog.filter((p) => p.category === c.id).length;
      return `
        <button type="button" class="cat-card ${state.category === c.id ? 'active' : ''}" data-category="${c.id}">
          <div class="cat-visual">${c.icon}</div>
          <div class="cat-label">${escapeHtml(c.name)} · ${count}</div>
        </button>`;
    })
    .join('');

  grid.innerHTML =
    cards +
    `<button type="button" class="cat-card view-all ${state.category === 'all' ? 'active' : ''}" data-category="all">
      <div class="cat-visual">▦</div>
      <div class="cat-label">All (${state.catalog.length})</div>
    </button>`;

  grid.querySelectorAll('[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.category = btn.dataset.category;
      state.brand = null;
      renderExplore();
    });
  });
}

function renderCategoryBrief() {
  const el = document.getElementById('categoryBrief');
  const c = catMeta(state.category);
  if (!c) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="flex flex-wrap gap-4 justify-between">
      <div class="max-w-3xl">
        <h3 class="font-display font-bold text-lg">${c.icon} ${escapeHtml(c.name)}</h3>
        <p class="text-sm text-slate-300 mt-2 leading-relaxed">${escapeHtml(c.description)}</p>
      </div>
      <div>
        <div class="text-[10px] uppercase tracking-wider text-slate-500 mb-2">What we score here</div>
        <ul class="text-xs text-slate-300 space-y-1">
          ${(c.whatWeScore || []).map((w) => `<li class="flex gap-2"><span class="text-brand-sage">▸</span>${escapeHtml(w)}</li>`).join('')}
        </ul>
      </div>
    </div>`;
}

function renderBrands() {
  const row = document.getElementById('brandRow');
  const pool =
    state.category === 'all'
      ? state.catalog
      : state.catalog.filter((p) => p.category === state.category);
  const brands = [...new Set(pool.map((p) => p.brand))];
  row.innerHTML = brands
    .map(
      (b) =>
        `<button type="button" class="brand-pill muted ${state.brand === b ? 'active' : ''}" data-brand="${escapeHtml(b)}">${escapeHtml(b)}</button>`
    )
    .join('');
  row.querySelectorAll('[data-brand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.brand = state.brand === btn.dataset.brand ? null : btn.dataset.brand;
      renderExplore();
    });
  });
}

function topChips(criteria) {
  const priority = ['protein', 'dose', 'epadha', 'sugar', 'fillers', 'costProtein', 'costServing', 'citrulline', 'testing', 'allergens'];
  return [...criteria]
    .sort((a, b) => {
      const ia = priority.indexOf(a.key);
      const ib = priority.indexOf(b.key);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .slice(0, 5);
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  const empty = document.getElementById('emptyState');
  const loading = document.getElementById('loadingState');
  loading.classList.add('hidden');

  const list = filteredProducts();
  const cat = catMeta(state.category);
  document.getElementById('productsHeading').textContent = cat ? cat.name : 'Catalog entries';
  document.getElementById('productsSub').textContent = cat
    ? `${cat.short} · category-specific scoring`
    : `${state.catalog.length} placeholder entries across ${state.categories.length} categories`;
  document.getElementById('productCount').textContent = `${list.length} shown`;

  if (!list.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = list
    .map((p) => {
      const { avg, criteria } = overallScore(p);
      const grade = letterGrade(avg);
      const issues = preferenceIssues(p);
      const inCompare = state.compareIds.includes(p.id);
      const chips = topChips(criteria)
        .map(
          (c) =>
            `<span class="score-chip ${scoreTone(c.score)}">${escapeHtml(c.label)}: ${escapeHtml(c.display)} · <strong>${c.score}/5</strong></span>`
        )
        .join('');

      const s = scale(p);
      const macroBits = [];
      if (p.protein) macroBits.push(`${(p.protein * s).toFixed(0)}g protein`);
      if (p.carbs) macroBits.push(`${(p.carbs * s).toFixed(0)}g carbs`);
      if (p.fat) macroBits.push(`${(p.fat * s).toFixed(1)}g fat`);
      if (p.calories) macroBits.push(`${Math.round(p.calories * s)} kcal`);
      if (p.category === 'creatine') macroBits.push(`${((p.activeDoseG || 0) * s).toFixed(1)}g creatine`);
      if (p.category === 'pre') {
        macroBits.push(`${((p.citrullineG || 0) * s).toFixed(1)}g citrulline`);
        macroBits.push(`${Math.round((p.caffeineMg || 0) * s)}mg caffeine`);
      }

      const tags = [
        p.form,
        p.subcategory,
        p.thirdPartyTested ? 'lab-tested' : 'unverified',
        p.proprietaryBlend ? 'proprietary' : null,
        p.dataStatus,
      ]
        .filter(Boolean)
        .map((t) => `<span class="meta-tag">${escapeHtml(t)}</span>`)
        .join('');

      return `
        <article class="product-card dense ${inCompare ? 'in-compare' : ''} ${isBlocked(p) ? 'blocked' : ''}">
          <div class="product-thumb">
            <span class="cat-tag">${escapeHtml(catMeta(p.category)?.name || '')}</span>
            <span class="thumb-emoji">${p.icon}</span>
            <span class="code-badge">${escapeHtml(p.code)}</span>
          </div>
          <div class="product-body">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div class="text-[10px] uppercase tracking-wider text-slate-500">${escapeHtml(p.brand)} · ${escapeHtml(p.typeLabel)}</div>
                <h3 class="product-title">${escapeHtml(p.name)}</h3>
              </div>
              <span class="grade-pill grade-${grade}">Rating: ${grade} · ${avg}/5</span>
            </div>
            <p class="claim-line">${escapeHtml(p.summary || '')}</p>
            <p class="claim-line mono">${escapeHtml(macroBits.join(' · '))}${p.servingLabel ? ` · ${escapeHtml(p.servingLabel)}` : ''}</p>
            <div class="meta-row">${tags}</div>
            <div class="score-chips">${chips}</div>
            ${
              issues.length
                ? `<div class="pref-warn">${escapeHtml(issues[0])}${issues.length > 1 ? ` · +${issues.length - 1} more` : ''}</div>`
                : `<div class="text-[11px] ok-line">✓ No hard allergen conflict with current prefs</div>`
            }
            <div class="info-strip">
              <span>Fillers <strong>${p.fillersPct || 0}%</strong></span>
              <span>Added sugar <strong>${p.addedSugar || 0}g</strong></span>
              <span>Sodium <strong>${p.sodiumMg || 0}mg</strong></span>
              <span>MSRP <strong>${money(productPrice(p))}</strong></span>
              <span>Pkg <strong>${productPackageG(p)}g</strong></span>
            </div>
            <div class="product-actions">
              <button type="button" class="btn-compare ${inCompare ? 'is-on' : ''}" data-compare="${p.id}">${inCompare ? 'Added' : 'Compare'}</button>
              <button type="button" class="btn-outline text-xs px-2.5 py-1.5 rounded-md" data-detail="${p.id}">Full dossier</button>
              <button type="button" class="btn-star ${state.favorites.has(p.id) ? 'on' : ''}" data-fav="${p.id}">★</button>
            </div>
          </div>
        </article>`;
    })
    .join('');

  grid.querySelectorAll('[data-compare]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCompare(btn.dataset.compare);
    })
  );
  grid.querySelectorAll('[data-fav]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.fav;
      if (state.favorites.has(id)) state.favorites.delete(id);
      else state.favorites.add(id);
      renderProducts();
    })
  );
  grid.querySelectorAll('[data-detail]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail(btn.dataset.detail);
    })
  );
}

function renderPrefChips() {
  const el = document.getElementById('activePrefChips');
  el.innerHTML = [
    `<span class="pref-chip">${escapeHtml(state.prefs.goal)}</span>`,
    ...state.prefs.allergens.map((a) => `<span class="pref-chip alert">${escapeHtml(a)}</span>`),
    state.prefs.lowSugar ? `<span class="pref-chip">low sugar</span>` : '',
  ].join('');
}

function renderExplore() {
  renderCategories();
  renderCategoryBrief();
  renderBrands();
  renderProducts();
  renderPrefChips();
  renderTray();
}

/* ---------- detail drawer ---------- */

function openDetail(id) {
  const p = getProduct(id);
  if (!p) return;
  const { avg, criteria } = overallScore(p);
  const grade = letterGrade(avg);
  const issues = preferenceIssues(p);
  const body = document.getElementById('detailBody');

  body.innerHTML = `
    <div>
      <div class="text-xs text-slate-500">${escapeHtml(p.code)} · ${escapeHtml(p.brand)} · data_status: ${escapeHtml(p.dataStatus)}</div>
      <h3 class="font-display font-bold text-xl mt-1">${escapeHtml(p.name)}</h3>
      <p class="text-sm text-slate-300 mt-2">${escapeHtml(p.summary)}</p>
      <div class="mt-2"><span class="grade-pill grade-${grade}">${grade} · ${avg}/5 overall</span></div>
    </div>

    ${issues.length ? `<div class="pref-warn">${issues.map(escapeHtml).join('<br/>')}</div>` : ''}

    <div class="detail-block">
      <h4>Identity</h4>
      <dl class="detail-dl">
        <div><dt>Category</dt><dd>${escapeHtml(catMeta(p.category)?.name)} / ${escapeHtml(p.subcategory)}</dd></div>
        <div><dt>Form</dt><dd>${escapeHtml(p.form)}</dd></div>
        <div><dt>Type</dt><dd>${escapeHtml(p.typeLabel)}</dd></div>
        <div><dt>Serving</dt><dd>${escapeHtml(p.servingLabel)} · ${p.servingsPerContainer} servings/tub</dd></div>
        <div><dt>Package</dt><dd>${productPackageG(p)}g · MSRP ${money(productPrice(p))}</dd></div>
        <div><dt>Updated</dt><dd>${escapeHtml(p.updatedAt)}</dd></div>
      </dl>
    </div>

    <div class="detail-block">
      <h4>Macros (label serving)</h4>
      <div class="macro-grid">
        ${[
          ['Calories', p.calories],
          ['Protein', `${p.protein}g`],
          ['Carbs', `${p.carbs}g`],
          ['Fat', `${p.fat}g`],
          ['Fiber', `${p.fiber || 0}g`],
          ['Sugar', `${p.sugar}g`],
          ['Added sugar', `${p.addedSugar}g`],
          ['Sodium', `${p.sodiumMg}mg`],
          ['Potassium', `${p.potassiumMg || 0}mg`],
          ['Calcium', `${p.calciumMg || 0}mg`],
          ['Cholesterol', `${p.cholesterolMg || 0}mg`],
        ]
          .map(([k, v]) => `<div class="macro-cell"><span>${k}</span><strong>${v}</strong></div>`)
          .join('')}
      </div>
    </div>

    <div class="detail-block">
      <h4>Active ingredients</h4>
      <ul class="detail-list">
        ${(p.actives || []).map((a) => `<li>${escapeHtml(a.name)} — <strong>${a.amount}${a.unit}</strong></li>`).join('') || '<li class="text-slate-500">None listed</li>'}
      </ul>
      ${
        p.aminoProfile
          ? `<p class="text-xs text-slate-400 mt-2">BCAA proxy: Leu ${p.aminoProfile.leucine}g · Ile ${p.aminoProfile.isoleucine}g · Val ${p.aminoProfile.valine}g · Total ${p.aminoProfile.totalBcaa}g</p>`
          : ''
      }
      ${p.caffeineMg != null ? `<p class="text-xs text-slate-400 mt-1">Caffeine: ${p.caffeineMg}mg · Citrulline: ${p.citrullineG || 0}g · Beta-alanine: ${p.betaAlanineG || 0}g</p>` : ''}
    </div>

    <div class="detail-block">
      <h4>Quality &amp; trust</h4>
      <dl class="detail-dl">
        <div><dt>Fillers</dt><dd>${p.fillersPct}%</dd></div>
        <div><dt>Sweeteners</dt><dd>${(p.sweeteners || []).join(', ') || 'None'}</dd></div>
        <div><dt>Thickeners</dt><dd>${(p.thickeners || []).join(', ') || 'None'}</dd></div>
        <div><dt>Colors</dt><dd>${(p.colors || []).join(', ') || 'None'}</dd></div>
        <div><dt>Proprietary blend</dt><dd>${p.proprietaryBlend ? 'Yes' : 'No'}</dd></div>
        <div><dt>Artificial</dt><dd>${p.artificial ? 'Yes' : 'No'}</dd></div>
        <div><dt>Allergens</dt><dd>${(p.allergens || []).join(', ') || 'None flagged'}</dd></div>
        <div><dt>3rd-party tested</dt><dd>${p.thirdPartyTested ? `Yes (${p.labName || 'Lab TBD'})` : 'No'}</dd></div>
        <div><dt>Label accuracy</dt><dd>${p.labelAccuracyPct != null ? p.labelAccuracyPct + '%' : '—'}</dd></div>
        <div><dt>Heavy metals</dt><dd>${p.heavyMetalsPass == null ? '—' : p.heavyMetalsPass ? 'Pass' : 'Fail'}</dd></div>
      </dl>
    </div>

    <div class="detail-block">
      <h4>Criterion scores</h4>
      <div class="score-chips">
        ${criteria.map((c) => `<span class="score-chip ${scoreTone(c.score)}">${escapeHtml(c.label)}: ${escapeHtml(c.display)} · ${c.score}/5</span>`).join('')}
      </div>
    </div>

    <div class="detail-block">
      <h4>How to use</h4>
      <p class="text-slate-300">${escapeHtml(p.howToUse)}</p>
      <p class="text-xs text-slate-500 mt-1">Timing: ${escapeHtml(p.timing || '—')}</p>
      <div class="grid grid-cols-2 gap-3 mt-3 text-xs">
        <div><div class="text-slate-500 mb-1">Best for</div>${(p.bestFor || []).map((x) => `<div>• ${escapeHtml(x)}</div>`).join('') || '—'}</div>
        <div><div class="text-slate-500 mb-1">Avoid if</div>${(p.avoidIf || []).map((x) => `<div>• ${escapeHtml(x)}</div>`).join('') || '—'}</div>
        <div><div class="text-brand-muted mb-1">Pros</div>${(p.pros || []).map((x) => `<div class="ok-line">• ${escapeHtml(x)}</div>`).join('') || '—'}</div>
        <div><div class="text-brand-muted mb-1">Cons</div>${(p.cons || []).map((x) => `<div class="text-[#C47A84]">• ${escapeHtml(x)}</div>`).join('') || '—'}</div>
      </div>
      ${p.notes ? `<p class="text-xs text-slate-500 mt-3 border-t border-white/5 pt-3">${escapeHtml(p.notes)}</p>` : ''}
    </div>

    <button type="button" class="btn-teal w-full py-2.5 rounded-xl" data-compare-detail="${p.id}">
      ${state.compareIds.includes(p.id) ? 'Already in compare' : 'Add to compare'}
    </button>
  `;

  body.querySelector('[data-compare-detail]')?.addEventListener('click', () => {
    if (!state.compareIds.includes(p.id)) toggleCompare(p.id);
    closeDetail();
  });

  document.getElementById('detailDrawer').classList.add('open');
  document.getElementById('detailDrawer').setAttribute('aria-hidden', 'false');
}

function closeDetail() {
  document.getElementById('detailDrawer').classList.remove('open');
  document.getElementById('detailDrawer').setAttribute('aria-hidden', 'true');
}

/* ---------- compare ---------- */

function toggleCompare(id) {
  const idx = state.compareIds.indexOf(id);
  if (idx >= 0) state.compareIds.splice(idx, 1);
  else {
    if (state.compareIds.length >= 2) state.compareIds.shift();
    state.compareIds.push(id);
  }
  renderProducts();
  renderTray();
  document.getElementById('compareCount').textContent = `(${state.compareIds.length})`;
}

function renderTray() {
  const tray = document.getElementById('compareTray');
  if (!state.compareIds.length) {
    tray.classList.add('hidden');
    document.getElementById('compareCount').textContent = '(0)';
    return;
  }
  tray.classList.remove('hidden');
  document.getElementById('compareCount').textContent = `(${state.compareIds.length})`;
  document.getElementById('traySlots').innerHTML = state.compareIds
    .map((id) => {
      const p = getProduct(id);
      return `<div class="tray-chip"><span>${escapeHtml(p.code)} · ${escapeHtml(p.name)}</span><button type="button" data-remove="${id}">✕</button></div>`;
    })
    .join('');
  document.querySelectorAll('#traySlots [data-remove]').forEach((btn) =>
    btn.addEventListener('click', () => toggleCompare(btn.dataset.remove))
  );
  document.getElementById('trayGo').disabled = state.compareIds.length < 2;
}

function showView(name) {
  state.view = name;
  const viewExplore = document.getElementById('viewExplore');
  const viewCompare = document.getElementById('viewCompare');
  if (viewExplore) viewExplore.classList.toggle('hidden', name !== 'explore');
  if (viewCompare) viewCompare.classList.toggle('hidden', name !== 'compare');
  if (name === 'compare') renderCompare();
}

function getCompareMatches(query = '') {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return state.catalog.filter((p) => {
    const haystack = [p.name, p.code, p.brand, p.typeLabel, p.summary, p.subcategory].join(' ').toLowerCase();
    return haystack.includes(q);
  }).slice(0, 8);
}

function renderCompareSuggestions(slot, query = '') {
  const inputId = slot === 'A' ? 'searchSlotA' : 'searchSlotB';
  const listId = slot === 'A' ? 'suggestA' : 'suggestB';
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;

  const matches = getCompareMatches(query);
  if (!matches.length) {
    list.innerHTML = '<li class="px-3 py-2 text-xs text-brand-muted">No matches</li>';
    list.classList.remove('hidden');
    return;
  }

  list.innerHTML = matches
    .map(
      (p) => `
        <li>
          <button type="button" class="w-full text-left px-3 py-2 hover:bg-white/5" data-slot-product="${slot}" data-product-id="${p.id}">
            <span class="font-medium text-brand-text">${escapeHtml(p.name)}</span>
            <span class="block text-[10px] uppercase tracking-wider text-brand-muted">${escapeHtml(p.code)} · ${escapeHtml(p.brand)}</span>
          </button>
        </li>`
    )
    .join('');

  list.classList.remove('hidden');

  list.querySelectorAll('[data-slot-product]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const productId = btn.dataset.productId;
      const next = [...state.compareIds];
      if (slot === 'A') next[0] = productId;
      else next[1] = productId;
      state.compareIds = next;
      input.value = '';
      list.classList.add('hidden');
      renderCompare();
    });
  });
}

function renderCompare() {
  const [idA, idB] = state.compareIds;
  const a = getProduct(idA);
  const b = getProduct(idB);
  const slots = document.getElementById('compareSlots');
  const mismatch = document.getElementById('compareMismatch');
  if (!a || !b) {
    slots.innerHTML = `<div class="compare-slot empty">Add 2 entries to compare.</div>`;
    return;
  }
  if (a.category !== b.category) {
    mismatch.textContent = `Different categories (${catMeta(a.category).name} vs ${catMeta(b.category).name}). Prefer same-category matchups.`;
    mismatch.classList.remove('hidden');
  } else mismatch.classList.add('hidden');

  slots.innerHTML = [a, b]
    .map((p, i) => {
      const { avg, criteria } = overallScore(p);
      const grade = letterGrade(avg);
      const issues = preferenceIssues(p);
      return `
        <div class="compare-slot">
          <div class="text-[10px] uppercase tracking-wider text-slate-500">Product ${i === 0 ? 'A' : 'B'} · ${escapeHtml(p.code)}</div>
          <h3 class="font-display font-bold text-base mt-1">${escapeHtml(p.name)}</h3>
          <p class="text-xs text-slate-400 mt-1">${escapeHtml(p.typeLabel)} · ${escapeHtml(p.summary)}</p>
          <div class="mt-2"><span class="grade-pill grade-${grade}">${grade} · ${avg}/5</span></div>
          ${issues.length ? `<div class="pref-warn mt-3">${issues.map(escapeHtml).join(' · ')}</div>` : `<div class="text-xs ok-line mt-3">✓ Fits allergen prefs</div>`}
          <div class="slot-price-row">
            <label>Local price<input type="number" data-price-id="${p.id}" value="${productPrice(p)}" min="0" step="0.01" /></label>
            <label>Package (g)<input type="number" data-pkg-id="${p.id}" value="${productPackageG(p)}" min="1" /></label>
          </div>
          <div class="score-chips mt-3">${criteria.slice(0, 6).map((c) => `<span class="score-chip ${scoreTone(c.score)}">${escapeHtml(c.label)} ${c.score}/5</span>`).join('')}</div>
          <button type="button" class="btn-outline text-xs mt-3 px-2 py-1 rounded-md" data-detail="${p.id}">Open full dossier</button>
        </div>`;
    })
    .join('');

  slots.querySelectorAll('[data-price-id]').forEach((input) => {
    input.addEventListener('input', () => {
      const id = input.dataset.priceId;
      state.prices[id] = { price: +input.value || 0, packageG: state.prices[id]?.packageG ?? productPackageG(getProduct(id)) };
      renderCompare();
    });
  });
  slots.querySelectorAll('[data-pkg-id]').forEach((input) => {
    input.addEventListener('input', () => {
      const id = input.dataset.pkgId;
      state.prices[id] = { price: state.prices[id]?.price ?? productPrice(getProduct(id)), packageG: +input.value || 0 };
      renderCompare();
    });
  });
  slots.querySelectorAll('[data-detail]').forEach((btn) =>
    btn.addEventListener('click', () => openDetail(btn.dataset.detail))
  );

  renderScorecard(a, b);
  renderMacroTable(a, b);
  renderVerdict(a, b);
  updateCharts(a, b);
}

function renderScorecard(a, b) {
  const ca = overallScore(a).criteria;
  const cb = overallScore(b).criteria;
  const keys = [...new Set([...ca.map((c) => c.key), ...cb.map((c) => c.key)])];
  const labelOf = (k) => ca.find((c) => c.key === k)?.label || cb.find((c) => c.key === k)?.label || k;
  const cell = (c) =>
    c
      ? `<div><span class="stars ${scoreTone(c.score)}">${c.score}/5</span><div class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(c.display)}</div></div>`
      : '—';

  document.getElementById('scorecardTable').innerHTML = `
    <table class="score-table">
      <thead><tr><th>Criterion</th><th>${escapeHtml(a.code)}</th><th>${escapeHtml(b.code)}</th></tr></thead>
      <tbody>
        ${keys
          .map((key) => {
            const left = ca.find((c) => c.key === key);
            const right = cb.find((c) => c.key === key);
            let w = '';
            if (left && right) {
              if (left.score > right.score + 0.15) w = ' → A';
              else if (right.score > left.score + 0.15) w = ' → B';
            }
            return `<tr><td>${escapeHtml(labelOf(key))}<span class="text-brand-sage text-[10px]">${w}</span></td><td>${cell(left)}</td><td>${cell(right)}</td></tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

function renderMacroTable(a, b) {
  const s = (p, key) => {
    const v = p[key];
    if (v == null) return '—';
    return typeof v === 'number' ? +(v * scale(p)).toFixed(2) : v;
  };
  const rows = [
    ['Calories', 'calories', ''],
    ['Protein (g)', 'protein', ''],
    ['Carbs (g)', 'carbs', ''],
    ['Fat (g)', 'fat', ''],
    ['Fiber (g)', 'fiber', ''],
    ['Sugar (g)', 'sugar', ''],
    ['Added sugar (g)', 'addedSugar', ''],
    ['Sodium (mg)', 'sodiumMg', ''],
    ['Fillers %', 'fillersPct', 'raw'],
    ['Active dose (g)', 'activeDoseG', ''],
    ['Servings / container', 'servingsPerContainer', 'raw'],
  ];
  document.getElementById('macroTable').innerHTML = `
    <table class="score-table">
      <thead><tr><th>Field</th><th>${escapeHtml(a.name)}</th><th>${escapeHtml(b.name)}</th></tr></thead>
      <tbody>
        ${rows
          .map(([label, key, mode]) => {
            const va = mode === 'raw' ? a[key] ?? '—' : s(a, key);
            const vb = mode === 'raw' ? b[key] ?? '—' : s(b, key);
            return `<tr><td>${label}</td><td>${va}</td><td>${vb}</td></tr>`;
          })
          .join('')}
        <tr><td>Actives</td><td class="text-xs">${(a.actives || []).map((x) => `${x.name} ${x.amount}${x.unit}`).join('<br/>') || '—'}</td>
            <td class="text-xs">${(b.actives || []).map((x) => `${x.name} ${x.amount}${x.unit}`).join('<br/>') || '—'}</td></tr>
      </tbody>
    </table>`;
}

function renderVerdict(a, b) {
  const sa = overallScore(a);
  const sb = overallScore(b);
  const blockedA = isBlocked(a);
  const blockedB = isBlocked(b);
  let title = '';
  let body = '';
  const bullets = [];

  if (blockedA && !blockedB) {
    title = `${b.name} is safer for your prefs`;
    body = `${a.code} conflicts with allergen alerts. ${b.code} scores ${sb.avg}/5 overall.`;
  } else if (blockedB && !blockedA) {
    title = `${a.name} is safer for your prefs`;
    body = `${b.code} conflicts with allergen alerts. ${a.code} scores ${sa.avg}/5.`;
  } else if (blockedA && blockedB) {
    title = 'Both clash with your preferences';
    body = 'Adjust allergens in Preferences or pick different entries.';
  } else if (sa.avg > sb.avg + 0.15) {
    title = `${a.name} wins for ${state.prefs.goal}`;
    body = `${sa.avg}/5 vs ${sb.avg}/5 on category-weighted criteria.`;
  } else if (sb.avg > sa.avg + 0.15) {
    title = `${b.name} wins for ${state.prefs.goal}`;
    body = `${sb.avg}/5 vs ${sa.avg}/5 on the scorecard.`;
  } else {
    title = 'Near tie — decide on price or taste';
    body = `Both near ${sa.avg}/5. Check divergent criterion rows.`;
  }

  const mapB = Object.fromEntries(sb.criteria.map((c) => [c.key, c]));
  sa.criteria
    .map((c) => ({ c, d: c.score - (mapB[c.key]?.score ?? c.score), other: mapB[c.key] }))
    .filter((x) => x.other && Math.abs(x.d) >= 0.8)
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
    .slice(0, 4)
    .forEach((x) => {
      const better = x.d > 0 ? a : b;
      const side = x.d > 0 ? x.c : x.other;
      bullets.push(`${better.code} leads on ${x.c.label}: ${side.display} (${side.score}/5)`);
    });

  document.getElementById('verdictTitle').textContent = title;
  document.getElementById('verdictBody').textContent = body;
  document.getElementById('verdictBullets').innerHTML = bullets
    .map((t) => `<li class="verdict-bullet">${escapeHtml(t)}</li>`)
    .join('');
}

/* ---------- charts ---------- */

function ensureCharts() {
  if (!radarChart) {
    radarChart = new Chart(document.getElementById('radarChart'), {
      type: 'radar',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 5,
            ticks: { display: false, backdropColor: 'transparent' },
            grid: { color: 'rgba(42,52,61,0.9)' },
            angleLines: { color: 'rgba(42,52,61,0.9)' },
            pointLabels: { color: '#8A99A6', font: { size: 10 } },
          },
        },
        plugins: { legend: { labels: { color: '#E8ECEF', boxWidth: 12, font: { size: 11 } } } },
      },
    });
  }
  if (!barChart) {
    barChart = new Chart(document.getElementById('barChart'), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#8A99A6', font: { size: 10 } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: '#8A99A6' }, grid: { color: 'rgba(42,52,61,0.8)' } },
        },
        plugins: { legend: { labels: { color: '#E8ECEF', boxWidth: 12, font: { size: 11 } } } },
      },
    });
  }
}

function costKey(p) {
  const s = scale(p);
  const cost = (productPrice(p) / productPackageG(p)) * (p.servingSizeG * s);
  const protein = (p.protein || 0) * s;
  if (protein > 0) return cost / protein;
  return cost;
}

function updateCharts(a, b) {
  ensureCharts();
  const ca = overallScore(a).criteria;
  const cb = overallScore(b).criteria;
  const keys = [...new Set([...ca.map((c) => c.key), ...cb.map((c) => c.key)])].slice(0, 7);
  const label = (k) => ca.find((c) => c.key === k)?.label || cb.find((c) => c.key === k)?.label || k;
  radarChart.data.labels = keys.map(label);
  radarChart.data.datasets = [
    { label: a.code, data: keys.map((k) => ca.find((c) => c.key === k)?.score ?? 0), borderColor: '#2DD4BF', backgroundColor: 'rgba(45,212,191,0.12)', pointBackgroundColor: '#2DD4BF' },
    { label: b.code, data: keys.map((k) => cb.find((c) => c.key === k)?.score ?? 0), borderColor: '#8A99A6', backgroundColor: 'rgba(138,153,166,0.12)', pointBackgroundColor: '#8A99A6' },
  ];
  radarChart.update();

  barChart.data.labels = ['Cost efficiency', 'Fillers % ÷ 10', 'Added sugar (g)', 'Sodium ÷ 100'];
  barChart.data.datasets = [
    { label: a.code, data: [costKey(a), (a.fillersPct || 0) / 10, (a.addedSugar || 0) * scale(a), (a.sodiumMg || 0) / 100], backgroundColor: 'rgba(45,212,191,0.75)', borderRadius: 4, maxBarThickness: 36 },
    { label: b.code, data: [costKey(b), (b.fillersPct || 0) / 10, (b.addedSugar || 0) * scale(b), (b.sodiumMg || 0) / 100], backgroundColor: 'rgba(138,153,166,0.65)', borderRadius: 4, maxBarThickness: 36 },
  ];
  barChart.update();
}

/* ---------- prefs / events / boot ---------- */

function openPrefs(open) {
  document.getElementById('prefsDrawer').classList.toggle('open', open);
  document.getElementById('prefsDrawer').setAttribute('aria-hidden', String(!open));
}

function readPrefsFromDOM() {
  const prev = state.prefs.currency;
  state.prefs.goal = document.getElementById('prefGoal').value;
  state.prefs.calories = +document.getElementById('prefCalories').value || 0;
  state.prefs.protein = +document.getElementById('prefProtein').value || 0;
  state.prefs.currency = document.getElementById('prefCurrency').value;
  state.prefs.budget = +document.getElementById('prefBudget').value || 0;
  state.prefs.allergens = [...document.querySelectorAll('.pref-allergen:checked')].map((c) => c.value);
  state.prefs.lowSugar = document.getElementById('prefLowSugar').value === '1';
  state.prefs.preferLab = document.getElementById('prefLabOnly').value === '1';
  if (prev !== state.prefs.currency) {
    const factor = state.prefs.currency === 'INR' ? USD_TO_INR : 1 / USD_TO_INR;
    Object.values(state.prices).forEach((row) => {
      row.price = +(row.price * factor).toFixed(state.prefs.currency === 'INR' ? 0 : 2);
    });
  }
}

function initEvents() {
  const logoHome = document.getElementById('logoHome');
  if (logoHome) {
    logoHome.addEventListener('click', () => {
      state.category = 'all';
      state.brand = null;
      showView('explore');
      renderExplore();
    });
  }

  const viewAllCats = document.getElementById('viewAllCats');
  if (viewAllCats) {
    viewAllCats.addEventListener('click', () => {
      state.category = 'all';
      state.brand = null;
      renderExplore();
    });
  }

  const prefsBtn = document.getElementById('prefsBtn');
  if (prefsBtn) prefsBtn.addEventListener('click', () => openPrefs(true));
  const prefsClose = document.getElementById('prefsClose');
  if (prefsClose) prefsClose.addEventListener('click', () => openPrefs(false));
  const prefsBackdrop = document.getElementById('prefsBackdrop');
  if (prefsBackdrop) prefsBackdrop.addEventListener('click', () => openPrefs(false));
  const prefsApply = document.getElementById('prefsApply');
  if (prefsApply) {
    prefsApply.addEventListener('click', () => {
      readPrefsFromDOM();
      openPrefs(false);
      if (state.view === 'compare') renderCompare();
      else renderExplore();
    });
  }

  const detailClose = document.getElementById('detailClose');
  if (detailClose) detailClose.addEventListener('click', closeDetail);
  const detailBackdrop = document.getElementById('detailBackdrop');
  if (detailBackdrop) detailBackdrop.addEventListener('click', closeDetail);

  ['A', 'B'].forEach((slot) => {
    const input = document.getElementById(`searchSlot${slot}`);
    const list = document.getElementById(`suggest${slot}`);
    if (!input || !list) return;

    input.addEventListener('input', (e) => renderCompareSuggestions(slot, e.target.value));
    input.addEventListener('focus', () => renderCompareSuggestions(slot, input.value));
    input.addEventListener('blur', () => setTimeout(() => list.classList.add('hidden'), 120));
  });

  const globalSearch = document.getElementById('globalSearch');
  if (globalSearch) {
    globalSearch.addEventListener('input', (e) => {
      state.search = e.target.value;
      renderProducts();
    });
  }

  const sortBy = document.getElementById('sortBy');
  if (sortBy) {
    sortBy.addEventListener('change', (e) => {
      state.sort = e.target.value;
      renderProducts();
    });
  }

  const filterToggle = document.getElementById('filterToggle');
  if (filterToggle) {
    filterToggle.addEventListener('click', () => {
      const panel = document.getElementById('filterPanel');
      if (panel) panel.classList.toggle('hidden');
    });
  }

  const filterSafeOnly = document.getElementById('filterSafeOnly');
  if (filterSafeOnly) {
    filterSafeOnly.addEventListener('change', (e) => {
      state.filterSafeOnly = e.target.checked;
      renderProducts();
    });
  }

  const filterInBudget = document.getElementById('filterInBudget');
  if (filterInBudget) {
    filterInBudget.addEventListener('change', (e) => {
      state.filterInBudget = e.target.checked;
      renderProducts();
    });
  }

  const filterLabOnly = document.getElementById('filterLabOnly');
  if (filterLabOnly) {
    filterLabOnly.addEventListener('change', (e) => {
      state.filterLabOnly = e.target.checked;
      renderProducts();
    });
  }

  const filterNoProp = document.getElementById('filterNoProp');
  if (filterNoProp) {
    filterNoProp.addEventListener('change', (e) => {
      state.filterNoProp = e.target.checked;
      renderProducts();
    });
  }

  const navCompare = document.getElementById('navCompare');
  if (navCompare) {
    navCompare.addEventListener('click', () => {
      if (state.compareIds.length >= 2) showView('compare');
      else renderTray();
    });
  }

  const trayGo = document.getElementById('trayGo');
  if (trayGo) {
    trayGo.addEventListener('click', () => {
      if (state.compareIds.length >= 2) showView('compare');
    });
  }

  const trayClear = document.getElementById('trayClear');
  if (trayClear) {
    trayClear.addEventListener('click', () => {
      state.compareIds = [];
      Shared.saveCompareIds([]);
      renderTray();
      renderProducts();
    });
  }

  const backToExplore = document.getElementById('backToExplore');
  if (backToExplore) {
    backToExplore.addEventListener('click', () => {
      showView('explore');
      renderExplore();
    });
  }

  document.querySelectorAll('.norm-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.norm-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.normMode = btn.dataset.mode;
      if (state.view === 'compare') renderCompare();
      else renderProducts();
    });
  });
}

async function boot() {
  initEvents();

  const badge = document.getElementById('dataModeBadge');
  if (badge) {
    badge.textContent = Api.USE_SUPABASE ? 'Supabase' : 'Mock DB';
    badge.classList.toggle('hidden', false);
  }

  try {
    const [categories, supplements] = await Promise.all([Api.getCategories(), Api.getSupplements()]);
    state.categories = categories;
    state.catalog = supplements;
    state.compareIds = Shared.loadCompareIds();

    if (document.getElementById('categoryGrid') || document.getElementById('productGrid')) {
      renderExplore();
    } else if (document.getElementById('compareSlots')) {
      renderCompare();
    }
  } catch (err) {
    const loading = document.getElementById('loadingState');
    if (loading) loading.textContent = `Failed to load catalog: ${err.message}`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
