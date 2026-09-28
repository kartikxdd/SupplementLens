/**
 * explore.js — Catalog browse + add-to-compare
 */

const state = {
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
  filterSoy: false,
  filterGluten: false,
  filterNoArtificial: false,
  filterZeroSugar: false,
  favorites: Shared.loadFavorites(),
  prefs: Shared.loadPrefs(),
};

function catMeta(id) {
  return state.categories.find((c) => c.id === id);
}

function getProduct(id) {
  return state.catalog.find((p) => p.id === id);
}

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
  if (state.filterSafeOnly) list = list.filter((p) => !Shared.isBlocked(p, state.prefs));
  if (state.filterInBudget) {
    list = list.filter((p) => Shared.productPrice(p, state.prefs) <= state.prefs.budget);
  }
  if (state.filterLabOnly) list = list.filter((p) => p.thirdPartyTested);
  if (state.filterNoProp) list = list.filter((p) => !p.proprietaryBlend);
  if (state.filterSoy) list = list.filter((p) => !(p.allergens || []).includes('soy'));
  if (state.filterGluten) list = list.filter((p) => !(p.allergens || []).includes('gluten'));
  if (state.filterNoArtificial) list = list.filter((p) => !(p.allergens || []).includes('artificial') && !p.artificial);
  if (state.filterZeroSugar) list = list.filter((p) => (p.addedSugar || 0) <= 0);

  list.sort((a, b) => {
    if (state.sort === 'code') return a.code.localeCompare(b.code);
    if (state.sort === 'price') return Shared.productPrice(a, state.prefs) - Shared.productPrice(b, state.prefs);
    if (state.sort === 'sugar') return (a.addedSugar || 0) - (b.addedSugar || 0);
    if (state.sort === 'protein') return (b.protein || 0) - (a.protein || 0);
    if (state.sort === 'purity') return (a.fillersPct || 0) - (b.fillersPct || 0);
    return Shared.overallScore(b, state.prefs).avg - Shared.overallScore(a, state.prefs).avg;
  });
  return list;
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

function renderCategories() {
  const grid = document.getElementById('categoryGrid');
  grid.innerHTML =
    state.categories
      .map((c) => {
        const count = state.catalog.filter((p) => p.category === c.id).length;
        return `<button type="button" class="cat-card ${state.category === c.id ? 'active' : ''}" data-category="${c.id}">
          <div class="cat-visual">${c.icon}</div>
          <div class="cat-label">${Shared.escapeHtml(c.name)} · ${count}</div>
        </button>`;
      })
      .join('') +
    `<button type="button" class="cat-card view-all ${state.category === 'all' ? 'active' : ''}" data-category="all">
      <div class="cat-visual">▦</div>
      <div class="cat-label">All (${state.catalog.length})</div>
    </button>`;

  grid.querySelectorAll('[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.category = btn.dataset.category;
      state.brand = null;
      renderAll();
    });
  });
}

function renderCategoryBrief() {
  const el = document.getElementById('categoryBrief');
  const c = catMeta(state.category);
  if (!c) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="flex flex-wrap gap-4 justify-between">
      <div class="max-w-3xl">
        <h3 class="font-display font-bold text-lg">${c.icon} ${Shared.escapeHtml(c.name)}</h3>
        <p class="text-sm text-brand-muted mt-2 leading-relaxed">${Shared.escapeHtml(c.description)}</p>
      </div>
      <div>
        <div class="text-[10px] uppercase tracking-wider text-brand-muted mb-2">What we score here</div>
        <ul class="text-xs text-brand-muted space-y-1">
          ${(c.whatWeScore || []).map((w) => `<li class="flex gap-2"><span class="text-brand-sage">▸</span>${Shared.escapeHtml(w)}</li>`).join('')}
        </ul>
      </div>
    </div>`;
}

function renderBrands() {
  const row = document.getElementById('brandRow');
  const pool = state.category === 'all' ? state.catalog : state.catalog.filter((p) => p.category === state.category);
  const brands = [...new Set(pool.map((p) => p.brand))];
  row.innerHTML = brands
    .map(
      (b) =>
        `<button type="button" class="brand-pill muted ${state.brand === b ? 'active' : ''}" data-brand="${Shared.escapeHtml(b)}">${Shared.escapeHtml(b)}</button>`
    )
    .join('');
  row.querySelectorAll('[data-brand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.brand = state.brand === btn.dataset.brand ? null : btn.dataset.brand;
      renderAll();
    });
  });
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  const empty = document.getElementById('emptyState');
  document.getElementById('loadingState').classList.add('hidden');
  const list = filteredProducts();
  const cat = catMeta(state.category);
  const compareIds = Shared.loadCompareIds();

  document.getElementById('productsHeading').textContent = cat ? cat.name : 'Catalog entries';
  document.getElementById('productsSub').textContent = cat
    ? `${cat.short} · category-specific scoring`
    : `${state.catalog.length} placeholder entries`;
  document.getElementById('productCount').textContent = `${list.length} shown`;

  if (!list.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = list
    .map((p) => {
      const { avg, criteria } = Shared.overallScore(p, state.prefs);
      const grade = Shared.letterGrade(avg);
      const issues = Shared.preferenceIssues(p, state.prefs);
      const inCompare = compareIds.includes(p.id);
      const chips = topChips(criteria)
        .map(
          (c) =>
            `<span class="score-chip ${Shared.scoreTone(c.score)}">${Shared.escapeHtml(c.label)}: ${Shared.escapeHtml(c.display)} · <strong>${c.score}/5</strong></span>`
        )
        .join('');

      const tags = [p.form, p.subcategory, p.thirdPartyTested ? 'lab-tested' : 'unverified', p.proprietaryBlend ? 'proprietary' : null]
        .filter(Boolean)
        .map((t) => `<span class="meta-tag">${Shared.escapeHtml(t)}</span>`)
        .join('');

      return `
        <article class="product-card dense ${inCompare ? 'in-compare' : ''} ${Shared.isBlocked(p, state.prefs) ? 'blocked' : ''}">
          <div class="product-thumb">
            <span class="cat-tag">${Shared.escapeHtml(catMeta(p.category)?.name || '')}</span>
            <span class="thumb-emoji">${p.icon}</span>
            <span class="code-badge">${Shared.escapeHtml(p.code)}</span>
          </div>
          <div class="product-body">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div class="text-[10px] uppercase tracking-wider text-brand-muted">${Shared.escapeHtml(p.brand)} · ${Shared.escapeHtml(p.typeLabel)}</div>
                <h3 class="product-title">${Shared.escapeHtml(p.name)}</h3>
              </div>
              <span class="grade-pill grade-${grade}">Rating: ${grade} · ${avg}/5</span>
            </div>
            <p class="claim-line">${Shared.escapeHtml(p.summary || '')}</p>
            <div class="meta-row">${tags}</div>
            <div class="score-chips">${chips}</div>
            ${
              issues.length
                ? `<div class="pref-warn">${Shared.escapeHtml(issues[0])}${issues.length > 1 ? ` · +${issues.length - 1} more` : ''}</div>`
                : `<div class="text-[11px] ok-line">✓ No hard allergen conflict</div>`
            }
            <div class="info-strip">
              <span>Fillers <strong>${p.fillersPct || 0}%</strong></span>
              <span>Sugar <strong>${p.addedSugar || 0}g</strong></span>
              <span>Sodium <strong>${p.sodiumMg || 0}mg</strong></span>
              <span>MSRP <strong>${Shared.money(Shared.productPrice(p, state.prefs), state.prefs.currency)}</strong></span>
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
    btn.addEventListener('click', () => {
      Shared.toggleCompare(btn.dataset.compare);
      renderProducts();
      renderTray();
    })
  );
  grid.querySelectorAll('[data-fav]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.fav;
      if (state.favorites.has(id)) state.favorites.delete(id);
      else state.favorites.add(id);
      Shared.saveFavorites(state.favorites);
      renderProducts();
    })
  );
  grid.querySelectorAll('[data-detail]').forEach((btn) =>
    btn.addEventListener('click', () => openDetail(btn.dataset.detail))
  );
}

function renderPrefChips() {
  const chips = [];

  if (state.prefs.goal) {
    chips.push(`<span class="pref-chip">${Shared.escapeHtml(state.prefs.goal)}</span>`);
  }

  state.prefs.allergens.forEach((a) => {
    chips.push(`<span class="pref-chip alert">${Shared.escapeHtml(a)}</span>`);
  });

  if (state.prefs.lowSugar) {
    chips.push('<span class="pref-chip">low sugar</span>');
  }

  document.getElementById('activePrefChips').innerHTML = chips.join('');
}

function renderTray() {
  const tray = document.getElementById('compareTray');
  const ids = Shared.loadCompareIds();
  if (!ids.length) {
    tray.classList.add('hidden');
    return;
  }
  tray.classList.remove('hidden');
  document.getElementById('traySlots').innerHTML = ids
    .map((id) => {
      const p = getProduct(id);
      if (!p) return '';
      return `<div class="tray-chip"><span>${Shared.escapeHtml(p.code)}</span><button type="button" data-remove="${id}">✕</button></div>`;
    })
    .join('');
  document.querySelectorAll('#traySlots [data-remove]').forEach((btn) =>
    btn.addEventListener('click', () => {
      Shared.toggleCompare(btn.dataset.remove);
      renderProducts();
      renderTray();
    })
  );
}

function openDetail(id) {
  const p = getProduct(id);
  if (!p) return;
  const { avg, criteria } = Shared.overallScore(p, state.prefs);
  const grade = Shared.letterGrade(avg);
  const issues = Shared.preferenceIssues(p, state.prefs);
  document.getElementById('detailBody').innerHTML = `
    <div>
      <div class="text-xs text-brand-muted">${Shared.escapeHtml(p.code)} · ${Shared.escapeHtml(p.brand)}</div>
      <h3 class="font-display font-bold text-xl mt-1">${Shared.escapeHtml(p.name)}</h3>
      <p class="text-sm text-brand-muted mt-2">${Shared.escapeHtml(p.summary)}</p>
      <div class="mt-2"><span class="grade-pill grade-${grade}">${grade} · ${avg}/5</span></div>
    </div>
    ${issues.length ? `<div class="pref-warn">${issues.map(Shared.escapeHtml).join('<br/>')}</div>` : ''}
    <div class="detail-block">
      <h4>Criterion scores</h4>
      <div class="score-chips">${criteria.map((c) => `<span class="score-chip ${Shared.scoreTone(c.score)}">${Shared.escapeHtml(c.label)}: ${c.score}/5</span>`).join('')}</div>
    </div>
    <div class="detail-block">
      <h4>How to use</h4>
      <p class="text-brand-muted">${Shared.escapeHtml(p.howToUse)}</p>
      <p class="text-xs text-brand-faint mt-1" style="color:var(--brand-faint)">Timing: ${Shared.escapeHtml(p.timing || '—')}</p>
    </div>
    <button type="button" class="btn-teal w-full py-2.5 rounded-xl" data-compare-detail="${p.id}">
      ${Shared.loadCompareIds().includes(p.id) ? 'Already in compare' : 'Add to compare'}
    </button>`;
  document.querySelector('[data-compare-detail]')?.addEventListener('click', () => {
    if (!Shared.loadCompareIds().includes(p.id)) Shared.toggleCompare(p.id);
    closeDetail();
    renderProducts();
    renderTray();
  });
  document.getElementById('detailDrawer').classList.add('open');
}

function closeDetail() {
  document.getElementById('detailDrawer').classList.remove('open');
}

function renderAll() {
  renderCategories();
  renderCategoryBrief();
  renderBrands();
  renderProducts();
  renderPrefChips();
  renderTray();
}

function initEvents() {
  document.getElementById('viewAllCats').addEventListener('click', () => {
    state.category = 'all';
    state.brand = null;
    renderAll();
  });
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderProducts();
  });
  document.getElementById('sortBy').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderProducts();
  });
  document.getElementById('filterToggle').addEventListener('click', () => {
    document.getElementById('filterPanel').classList.toggle('hidden');
  });
  ['filterSafeOnly', 'filterInBudget', 'filterLabOnly', 'filterNoProp', 'filterSoy', 'filterGluten', 'filterNoArtificial', 'filterZeroSugar'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', (e) => {
      state[id] = e.target.checked;
      renderProducts();
    });
  });
  document.getElementById('detailClose').addEventListener('click', closeDetail);
  document.getElementById('detailBackdrop').addEventListener('click', closeDetail);
  document.getElementById('trayClear').addEventListener('click', () => {
    Shared.saveCompareIds([]);
    renderProducts();
    renderTray();
  });
}

async function boot() {
  initEvents();
  try {
    const [categories, supplements] = await Promise.all([Api.getCategories(), Api.getSupplements()]);
    state.categories = categories;
    state.catalog = supplements;
    renderAll();
  } catch (err) {
    document.getElementById('loadingState').textContent = `Failed to load: ${err.message}`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
