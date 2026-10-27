/**
 * explore.js — Catalog browse + add-to-compare
 */

const state = {
  categories: [],
  catalog: [],
  brands: [],
  category: 'all',
  brand: null,
  search: '',
  sort: 'score',
  filterSafeOnly: false,
  filterInBudget: false,
  filterLabOnly: false,
  filterNoProp: false,
  filterSugarPreference: 'no-preference',
  filterMyProfileGoals: false,
  filterSoy: false,
  filterSoyBased: false,
  filterPlantBased: false,
  filterWhey: false,
  filterGluten: false,
  filterNoArtificial: false,
  filterZeroSugar: false,
  applyProfileGoals: false,
  favorites: Shared.loadFavorites(),
  prefs: Shared.loadPrefs(),
};

function catMeta(id) {
  return state.categories.find((c) => c.id === id);
}

function getProduct(id) {
  return state.catalog.find((p) => p.id === id);
}

function compareKnownValues(a, b, getValue, direction = 1) {
  const valueA = getValue(a);
  const valueB = getValue(b);
  const knownA = Number.isFinite(valueA);
  const knownB = Number.isFinite(valueB);
  if (knownA !== knownB) return knownA ? -1 : 1;
  return knownA ? (valueA - valueB) * direction : 0;
}

function smartVerdict(product) {
  let score = 5;
  let knownChecks = 0;
  const missingChecks = [];
  const deductions = [];
  const deduct = (label, amount) => {
    score -= amount;
    knownChecks += 1;
    deductions.push({ label, amount });
  };

  if (Array.isArray(product.cheapFillers)) {
    if (product.cheapFillers.length) deduct('Cheap fillers', Math.min(1.5, product.cheapFillers.length * 0.5));
    else knownChecks += 1;
  } else if (Number.isFinite(product.fillersPct)) {
    if (product.fillersPct > 0) deduct('Fillers', Math.min(1.5, product.fillersPct / 20));
    else knownChecks += 1;
  } else missingChecks.push('Fillers');

  if (Array.isArray(product.sweeteners)) {
    const artificial = product.sweeteners.filter((name) =>
      /sucralose|acesulfame|aspartame|saccharin|neotame/i.test(name)
    );
    if (artificial.length) deduct('Artificial sweeteners', Math.min(1, artificial.length * 0.5));
    else knownChecks += 1;
  } else missingChecks.push('Sweeteners');

  if (Number.isFinite(product.sodiumMg)) {
    if (product.sodiumMg > 500) deduct('High sodium', Math.min(1, (product.sodiumMg - 500) / 500));
    else knownChecks += 1;
  } else missingChecks.push('Sodium');

  const proteinCategory = ['whey', 'plant', 'gainer'].includes(product.category);
  if (proteinCategory && Number.isFinite(product.protein) && Number.isFinite(product.servingSizeG) && product.servingSizeG > 0) {
    if (product.protein < 20) {
      deduct('Low protein yield', Math.min(1.5, (20 - product.protein) / 10));
    } else {
      knownChecks += 1;
    }
  } else if (proteinCategory) {
    missingChecks.push('Protein yield');
  }

  return {
    score: knownChecks ? Math.max(0, Math.round(score * 10) / 10) : null,
    knownChecks,
    totalChecks: missingChecks.length + knownChecks,
    missingChecks,
    deductions,
  };
}

function compatibilityMatch(product, prefs = state.prefs) {
  let earned = 0;
  let possible = 0;
  const reasons = [];
  const restrictions = new Set((prefs.allergens || [])
    .map((value) => String(value).toLowerCase())
    .filter((value) => value !== 'artificial'));
  if (prefs.lactoseIntolerant || (prefs.healthFlags || []).includes('lactose')) restrictions.add('lactose');
  const allergenMatch = Shared.allergenConflicts(product, prefs);
  const hasUnknownRestriction = restrictions.size > 0 && !allergenMatch.restrictionsKnown;
  let hasUnknownData = hasUnknownRestriction;

  if (restrictions.size) {
    possible += 50;
    if (allergenMatch.conflicts.length) {
      allergenMatch.conflicts.forEach(({ allergen, type }) => {
        reasons.push(type === 'may-contain' ? `May contain ${allergen}` : `Contains ${allergen}`);
      });
    } else if (allergenMatch.known) {
      earned += 50;
    }
  }

  if (Number.isFinite(prefs.supplementCalorieCap) && prefs.supplementCalorieCap > 0) {
    possible += 25;
    if (!Number.isFinite(product.calories)) {
      hasUnknownData = true;
    } else if (product.calories <= prefs.supplementCalorieCap) {
      earned += 25;
    } else {
      reasons.push('Exceeds per-serving calorie cap');
    }
  }

  if (prefs.goal === 'cutting' || prefs.goal === 'bulking') {
    possible += 25;
    const goalFits = prefs.goal === 'cutting'
      ? product.category !== 'gainer'
      : ['gainer', 'whey', 'plant', 'creatine', 'amino'].includes(product.category);
    if (goalFits) earned += 25;
    else reasons.push(`Less suited to ${prefs.goal}`);
  }

  return {
    percent: possible && !hasUnknownData
      ? Math.round((earned / possible) * 100)
      : null,
    reasons,
    hasConflict: allergenMatch.conflicts.length > 0,
    hasUnknownRestriction,
  };
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
  if (state.filterSafeOnly) {
    list = list.filter((p) => !Shared.isBlocked(p, state.prefs) && !compatibilityMatch(p).hasUnknownRestriction);
  }
  if (state.filterInBudget) {
    list = list.filter((p) => {
      const price = Shared.productPrice(p, state.prefs);
      return Number.isFinite(price) && price <= state.prefs.budget;
    });
  }
  if (state.filterMyProfileGoals) {
    list = list.filter((p) => {
      const match = compatibilityMatch(p);
      return match.percent >= 70 && !match.hasConflict && !match.hasUnknownRestriction;
    });
  }
  if (state.filterLabOnly) list = list.filter((p) => p.thirdPartyTested);
  if (state.filterNoProp) list = list.filter((p) => !p.proprietaryBlend);
  if (state.filterSugarPreference === 'low') {
    list = list.filter((p) => Number.isFinite(p.addedSugar) && p.addedSugar <= 5);
  }
  if (state.filterSugarPreference === 'zero') {
    list = list.filter((p) => Number.isFinite(p.addedSugar) && p.addedSugar <= 0);
  }
  if (state.filterSoy) {
    list = list.filter((p) => {
      const disclosure = Shared.allergenDisclosure(p);
      return disclosure.known &&
        !disclosure.contains.includes('soy') &&
        !disclosure.mayContain.includes('soy');
    });
  }
  if (state.filterSoyBased) {
    list = list.filter((p) => Shared.allergenDisclosure(p).contains.includes('soy'));
  }
  if (state.filterPlantBased) list = list.filter((p) => p.category === 'plant');
  if (state.filterWhey) list = list.filter((p) => p.category === 'whey');
  if (state.filterGluten) {
    list = list.filter((p) => {
      const disclosure = Shared.allergenDisclosure(p);
      return disclosure.known &&
        !disclosure.contains.includes('gluten') &&
        !disclosure.mayContain.includes('gluten');
    });
  }
  if (state.filterNoArtificial) list = list.filter((p) => p.artificial === false);
  if (state.filterZeroSugar) list = list.filter((p) => Number.isFinite(p.addedSugar) && p.addedSugar <= 0);

  list.sort((a, b) => {
    if (state.applyProfileGoals) {
      return (compatibilityMatch(b).percent ?? -1) - (compatibilityMatch(a).percent ?? -1);
    }
    if (state.sort === 'code') return a.code.localeCompare(b.code);
    if (state.sort === 'price') return compareKnownValues(a, b, (p) => Shared.productPrice(p, state.prefs));
    if (state.sort === 'sugar') return compareKnownValues(a, b, (p) => p.addedSugar);
    if (state.sort === 'protein') return compareKnownValues(a, b, (p) => p.protein, -1);
    if (state.sort === 'purity') return compareKnownValues(a, b, (p) => p.fillersPct);
    return Shared.overallScore(b, state.prefs).avg - Shared.overallScore(a, state.prefs).avg;
  });
  return list;
}

function renderSearchSuggestions(query) {
  const input = document.getElementById('globalSearch');
  const list = document.getElementById('searchSuggestions');
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) {
    list.innerHTML = '';
    list.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    return;
  }

  const matches = state.catalog
    .filter((product) => state.category === 'all' || product.category === state.category)
    .filter((product) => !state.brand || product.brand === state.brand)
    .map((product) => ({
      product,
      text: [product.name, product.code, product.brand, product.typeLabel, product.subcategory, catMeta(product.category)?.name]
        .filter(Boolean).join(' ').toLowerCase(),
    }))
    .filter(({ text }) => terms.every((term) => text.includes(term)))
    .slice(0, 7);

  list.innerHTML = matches.length
    ? matches.map(({ product }) => `
      <li role="option">
        <button type="button" class="search-suggestion" data-search-product="${product.id}">
          <span class="search-suggestion-name">${Shared.escapeHtml(product.name)}</span>
          <span class="search-suggestion-meta">${Shared.escapeHtml(product.brand)} · ${Shared.escapeHtml(product.code)}</span>
        </button>
      </li>`).join('')
    : '<li class="search-suggestion-empty">No matching products</li>';
  list.classList.remove('hidden');
  input.setAttribute('aria-expanded', 'true');

  list.querySelectorAll('[data-search-product]').forEach((button) => {
    button.addEventListener('click', () => {
      const product = state.catalog.find((item) => item.id === button.dataset.searchProduct);
      if (!product) return;
      input.value = product.name;
      state.search = product.name;
      list.classList.add('hidden');
      input.setAttribute('aria-expanded', 'false');
      renderProducts();
      openDetail(product.id);
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

function renderCategories() {
  const grid = document.getElementById('categoryGrid');
  grid.innerHTML =
    state.categories
      .map((c) => {
        const count = state.catalog.filter((p) => p.category === c.id).length;
        return `<button type="button" class="cat-card ${state.category === c.id ? 'active' : ''}" data-category="${c.id}">
          <span class="cat-label">${Shared.escapeHtml(c.name)}</span>
          <span class="cat-count">${count}</span>
        </button>`;
      })
      .join('') +
    `<button type="button" class="cat-card view-all ${state.category === 'all' ? 'active' : ''}" data-category="all">
      <span class="cat-label">All</span>
      <span class="cat-count">${state.catalog.length}</span>
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
        <h3 class="font-display font-bold text-lg">${Shared.escapeHtml(c.name)}</h3>
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
  const brandDetails = new Map(state.brands.map((brand) => [brand.name, brand]));
  row.innerHTML = brands
    .map(
      (name) => {
        const brand = brandDetails.get(name) || { name, logoUrl: null };
        return `<button type="button" class="brand-pill muted ${state.brand === name ? 'active' : ''}" data-brand="${Shared.escapeHtml(name)}">${Shared.brandLogoMarkup(brand)}</button>`;
      }
    )
    .join('');
  Shared.activateBrandLogos(row);
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
    : `${state.catalog.length} sourced entries`;
  document.getElementById('productCount').textContent = `${list.length} shown`;

  if (!list.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = list
    .map((p) => {
      const verdict = smartVerdict(p);
      const match = compatibilityMatch(p);
      const { criteria } = Shared.overallScore(p, state.prefs);
      const grade = verdict.score == null ? '' : Shared.letterGrade(verdict.score);
      const issues = Shared.preferenceIssues(p, state.prefs);
      const allergenData = Shared.allergenDisclosure(p);
      const inCompare = compareIds.includes(p.id);
      const officialUrl = Shared.officialProductUrl(p);
      const coveragePercent = verdict.totalChecks
        ? Math.round((verdict.knownChecks / verdict.totalChecks) * 100)
        : 0;
      const chips = topChips(criteria)
        .map(
          (c) =>
            `<span class="score-chip ${Shared.scoreTone(c.score)}">${Shared.escapeHtml(c.label)}: ${Shared.escapeHtml(c.display)} · <strong>${c.score}/5</strong></span>`
        )
        .join('');

      const tags = [catMeta(p.category)?.name, p.code, p.form, p.subcategory, p.thirdPartyTested ? 'lab-tested' : 'unverified', p.proprietaryBlend ? 'proprietary' : null]
        .filter(Boolean)
        .map((t) => `<span class="meta-tag">${Shared.escapeHtml(t)}</span>`)
        .join('');

      return `
        <article class="product-card dense ${inCompare ? 'in-compare' : ''} ${Shared.isBlocked(p, state.prefs) ? 'blocked' : ''}">
          <div class="product-body">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div class="text-[10px] uppercase tracking-wider text-brand-muted">${Shared.escapeHtml(p.brand)} · ${Shared.escapeHtml(p.typeLabel)}</div>
                <h3 class="product-title">${Shared.escapeHtml(p.name)}</h3>
              </div>
              ${verdict.score == null
                ? `<span class="grade-pill" title="A rating needs at least one known applicable label value.">Smart Verdict unavailable</span>`
                : `<span class="grade-pill grade-${grade}">${verdict.knownChecks < verdict.totalChecks ? 'Provisional Smart Verdict' : 'Smart Verdict'}: ${verdict.score.toFixed(1)}/5</span>`}
            </div>
            <div class="flex flex-wrap gap-2 mt-2">
              ${match.percent == null ? '' : `<span class="meta-tag match-badge">${match.percent}% profile match</span>`}
              ${match.hasUnknownRestriction ? '<span class="meta-tag">Cannot confirm allergen compatibility</span>' : ''}
              <span class="meta-tag label-coverage" title="Checks covered by values present in the catalog: ${verdict.knownChecks}/${verdict.totalChecks}. Missing values were not published in the catalog source.">${coveragePercent}% label coverage · ${verdict.knownChecks}/${verdict.totalChecks}</span>
            </div>
            ${verdict.score == null
              ? `<p class="text-[11px] text-brand-muted mt-1">No quality rating: this source does not list ${Shared.escapeHtml(verdict.missingChecks.join(', ').toLowerCase())}. Missing information does not mean those ingredients or values are absent.</p>`
              : verdict.knownChecks < verdict.totalChecks
                ? `<p class="text-[11px] text-brand-muted mt-1">Provisional rating from ${verdict.knownChecks} available check${verdict.knownChecks === 1 ? '' : 's'}; source does not list ${Shared.escapeHtml(verdict.missingChecks.join(', ').toLowerCase())}. Missing information is not treated as zero.</p>`
                : ''}
            <p class="text-[11px] text-brand-muted mt-1">${verdict.deductions.length
              ? `Deductions: ${verdict.deductions.map((item) => `${Shared.escapeHtml(item.label)} −${item.amount.toFixed(1)}`).join(' · ')}`
              : 'No deduction from available label data'}</p>
            <p class="claim-line">${Shared.escapeHtml(p.summary || '')}</p>
            <div class="meta-row">${tags}</div>
            <div class="score-chips">${chips}</div>
            ${
              issues.length
                ? `<div class="pref-warn">${Shared.escapeHtml(issues[0])}${issues.length > 1 ? ` · +${issues.length - 1} more` : ''}</div>`
                : allergenData.known
                  ? `<div class="text-[11px] ok-line">✓ No selected-allergen conflict listed</div>`
                  : `<div class="text-[11px] text-brand-muted">Allergen information unavailable; compatibility cannot be confirmed</div>`
            }
            <div class="info-strip">
              <span>Protein <strong>${Number.isFinite(p.protein) ? `${p.protein}g` : '—'}</strong></span>
              <span>Calories <strong>${Number.isFinite(p.calories) ? `${p.calories} kcal` : '—'}</strong></span>
              <span>Carbs <strong>${Number.isFinite(p.carbs) ? `${p.carbs}g` : '—'}</strong></span>
              <span>Fat <strong>${Number.isFinite(p.fat) ? `${p.fat}g` : '—'}</strong></span>
              <span>Fillers <strong>${Number.isFinite(p.fillersPct) ? `${p.fillersPct}%` : '—'}</strong></span>
              <span>Sugar <strong>${Number.isFinite(p.addedSugar) ? `${p.addedSugar}g` : '—'}</strong></span>
              <span>Sodium <strong>${Number.isFinite(p.sodiumMg) ? `${p.sodiumMg}mg` : '—'}</strong></span>
              <span title="${Shared.escapeHtml(p.priceSource || 'Price source not recorded')}">Price <strong>${Shared.money(Shared.productPrice(p, state.prefs), state.prefs.currency)}</strong></span>
            </div>
            <div class="product-actions">
              ${officialUrl ? `<a class="btn-buy" href="${Shared.escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">Buy on official site <span aria-hidden="true">↗</span></a>` : ''}
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

  if (state.filterMyProfileGoals) {
    chips.push('<span class="pref-chip">Profile goals · best matches first</span>');
  }

  state.prefs.allergens.forEach((a) => {
    const value = String(a).toLowerCase();
    if (value === 'soy' && !state.filterSoy && !state.filterSoyBased) return;
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
  const officialUrl = Shared.officialProductUrl(p);
  const { avg, criteria } = Shared.overallScore(p, state.prefs);
  const grade = Shared.letterGrade(avg);
  const issues = Shared.preferenceIssues(p, state.prefs);
  const allergenData = Shared.allergenDisclosure(p);
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
      <h4>Allergen disclosures</h4>
      <dl class="detail-dl">
        <div><dt>Contains</dt><dd>${Shared.escapeHtml(allergenData.contains.join(', ') || (allergenData.known ? 'None listed' : 'Not stated'))}</dd></div>
        <div><dt>May contain</dt><dd>${Shared.escapeHtml(allergenData.mayContain.join(', ') || (allergenData.known ? 'None listed' : 'Not stated'))}</dd></div>
        <div><dt>Lactose-free</dt><dd>${p.lactoseFree === true ? 'Label says yes' : p.lactoseFree === false ? 'Label says no' : 'Not stated'}</dd></div>
        <div><dt>Vegan</dt><dd>${p.vegan === true ? 'Label says yes' : p.vegan === false ? 'Label says no' : 'Not stated'}</dd></div>
        <div><dt>Disclosure source</dt><dd>${Shared.escapeHtml(p.labelDisclosures?.provenance || 'Catalog record; verification status not recorded')}</dd></div>
      </dl>
    </div>
    <div class="detail-block">
      <h4>How to use</h4>
      <p class="text-brand-muted">${Shared.escapeHtml(p.howToUse)}</p>
      <p class="text-xs text-brand-faint mt-1" style="color:var(--brand-faint)">Timing: ${Shared.escapeHtml(p.timing || '—')}</p>
    </div>
    ${officialUrl ? `<a class="btn-buy w-full justify-center" href="${Shared.escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">Buy on official site <span aria-hidden="true">↗</span></a>` : ''}
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
  const searchInput = document.getElementById('globalSearch');
  const searchSuggestions = document.getElementById('searchSuggestions');
  searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderSearchSuggestions(e.target.value);
    renderProducts();
  });
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) renderSearchSuggestions(searchInput.value);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchSuggestions.classList.add('hidden');
      searchInput.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.explore-search-panel')) {
      searchSuggestions.classList.add('hidden');
      searchInput.setAttribute('aria-expanded', 'false');
    }
  });
  document.getElementById('sortBy').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderProducts();
  });
  document.getElementById('filterToggle').addEventListener('click', () => {
    document.getElementById('filterPanel').classList.toggle('hidden');
  });
  ['filterSafeOnly', 'filterInBudget', 'filterLabOnly', 'filterNoProp', 'filterMyProfileGoals', 'filterSoy', 'filterSoyBased', 'filterPlantBased', 'filterWhey', 'filterGluten', 'filterNoArtificial', 'filterZeroSugar'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', (e) => {
      state[id] = e.target.checked;
      if (id === 'filterMyProfileGoals') state.applyProfileGoals = e.target.checked;
      renderProducts();
      renderPrefChips();
    });
  });

  const sugarPref = document.getElementById('filterSugarPreference');
  if (sugarPref) {
    sugarPref.addEventListener('change', (e) => {
      state.filterSugarPreference = e.target.value;
      renderProducts();
    });
  }
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
    state.prefs = Shared.loadPrefs();
    const [categories, supplements, brands] = await Promise.all([
      Api.getCategories(),
      Api.getSupplements(),
      Api.getBrands(),
    ]);
    state.categories = categories;
    state.catalog = supplements;
    state.brands = brands;
    document.getElementById('exploreCategoryTotal').textContent = categories.length;
    document.getElementById('exploreProductTotal').textContent = supplements.length;
    renderAll();
  } catch (err) {
    document.getElementById('loadingState').textContent = `Failed to load: ${err.message}`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
