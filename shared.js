/**
 * shared.js — Cross-page state, scoring, formatting.
 * Stores guest preferences for the current tab and signed-in preferences per account.
 */

const STORE_KEYS = {
  prefs: 'nc_prefs_v1',
  guestPrefs: 'nc_guest_prefs_v1',
  prefsOwner: 'nc_prefs_owner_v1',
  compare: 'nc_compare_v1',
  favorites: 'nc_favorites_v1',
};

if (!localStorage.getItem(STORE_KEYS.prefsOwner)) {
  localStorage.removeItem(STORE_KEYS.prefs);
  const navigation = performance.getEntriesByType('navigation')[0];
  if (navigation?.type === 'reload') sessionStorage.removeItem(STORE_KEYS.guestPrefs);
}

const DEFAULT_PREFS = {
  goal: '',
  calories: 2200,
  protein: 160,
  currency: 'INR',
  budget: 80,
  allergens: [],
  lowSugar: false,
  preferLab: false,
  displayName: '',
  units: 'g',
  lactoseIntolerant: false,
  lowArtificial: false,
  sugarPreference: 'no-preference',
  userType: 'beginner',
  supplementGoal: 'daily-wellness',
  routine: 'balanced',
  experience: 'new',
  healthFlags: [],
  age: 28,
  heightCm: 170,
  weightKg: 70,
  sex: 'prefer-not-to-say',
  activityLevel: 'moderate',
  bmi: 24.2,
  estimatedCalories: 2200,
};

const Shared = (() => {
  function normalizePrefs(raw = {}) {
    const prefs = { ...DEFAULT_PREFS, ...raw, currency: 'INR' };
    const isLegacyDefault =
      raw.goal === 'maintenance' &&
      Array.isArray(raw.allergens) &&
      raw.allergens.includes('lactose') &&
      raw.allergens.includes('artificial') &&
      raw.lowSugar === true;

    return isLegacyDefault ? { ...DEFAULT_PREFS } : prefs;
  }

  function loadPrefs() {
    try {
      const ownerId = localStorage.getItem(STORE_KEYS.prefsOwner);
      const storage = ownerId ? localStorage : sessionStorage;
      const key = ownerId ? STORE_KEYS.prefs : STORE_KEYS.guestPrefs;
      const raw = JSON.parse(storage.getItem(key) || '{}');
      return normalizePrefs(raw);
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs(prefs) {
    const ownerId = localStorage.getItem(STORE_KEYS.prefsOwner);
    const storage = ownerId ? localStorage : sessionStorage;
    const key = ownerId ? STORE_KEYS.prefs : STORE_KEYS.guestPrefs;
    storage.setItem(key, JSON.stringify(prefs));
  }

  function getRecommendationSummary(prefs = loadPrefs()) {
    const safe = { ...DEFAULT_PREFS, ...prefs };
    const summary = [];

    if (safe.userType === 'daily-life') summary.push('Daily-life focused');
    if (safe.userType === 'gym') summary.push('Gym & performance');
    if (safe.userType === 'medical') summary.push('Health-sensitive');
    if (safe.userType === 'beginner') summary.push('Beginner-friendly');

    if (safe.supplementGoal === 'daily-wellness') summary.push('Daily wellness');
    if (safe.supplementGoal === 'gym-performance') summary.push('Workout support');
    if (safe.supplementGoal === 'weight-management') summary.push('Weight management');
    if (safe.supplementGoal === 'recovery') summary.push('Recovery focus');
    if (safe.supplementGoal === 'not-sure') summary.push('Simple starter picks');
    if (safe.supplementGoal === 'daily-energy-vitality') summary.push('Daily energy & vitality');
    if (safe.supplementGoal === 'immunity-longevity') summary.push('Immunity & longevity');
    if (safe.supplementGoal === 'joint-bone-mobility') summary.push('Joint & bone mobility');
    if (safe.supplementGoal === 'stress-sleep-quality') summary.push('Stress & sleep quality');

    if (safe.userType === 'desk-worker') summary.push('Desk worker / student');
    if (safe.userType === 'busy-professional') summary.push('Busy professional');
    if (safe.userType === 'senior-active-adult') summary.push('Senior / active adult');
    if (safe.userType === 'post-recovery') summary.push('Post-recovery wellness');

    if (safe.routine === 'low') summary.push('Low-effort routine');
    if (safe.routine === 'moderate') summary.push('Balanced routine');
    if (safe.routine === 'high') summary.push('High activity routine');

    const flags = Array.isArray(safe.healthFlags) ? safe.healthFlags : [];
    if (flags.includes('lactose')) summary.push('Lactose-aware');
    if (flags.includes('diabetes')) summary.push('Blood sugar aware');
    if (flags.includes('caffeine')) summary.push('Caffeine-sensitive');
    if (flags.includes('vegan')) summary.push('Plant-based friendly');
    if (flags.includes('stomach')) summary.push('Gentle on digestion');
    if (flags.includes('medical')) summary.push('Doctor-aware choices');
    if (flags.includes('vitamin-deficiency')) summary.push('Vitamin D / B12 focus');
    if (flags.includes('joint-discomfort')) summary.push('Joint support focus');
    if (flags.includes('sleep-stress')) summary.push('Sleep & stress aware');
    if (flags.includes('desk-brain-fog')) summary.push('Focus support');

    return summary.length ? summary.slice(0, 5) : ['General support'];
  }

  function loadCompareIds() {
    try {
      const ids = JSON.parse(localStorage.getItem(STORE_KEYS.compare) || '[]');
      return Array.isArray(ids) ? ids.slice(0, 2) : [];
    } catch {
      return [];
    }
  }

  function saveCompareIds(ids) {
    localStorage.setItem(STORE_KEYS.compare, JSON.stringify(ids.slice(0, 2)));
    updateNavCompareCount();
  }

  function loadFavorites() {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORE_KEYS.favorites) || '[]'));
    } catch {
      return new Set();
    }
  }

  function saveFavorites(set) {
    localStorage.setItem(STORE_KEYS.favorites, JSON.stringify([...set]));
  }

  function updateNavCompareCount() {
    const n = loadCompareIds().length;
    document.querySelectorAll('[data-compare-count]').forEach((el) => {
      el.textContent = n ? `(${n})` : '';
    });
  }

  function markActiveNav() {
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      a.classList.toggle('nav-active', href === path || (path === '' && href === 'index.html'));
    });
  }

  function money(n, currency) {
    if (!Number.isFinite(n)) return '—';
    const sym = currency === 'INR' ? '₹' : '$';
    if (n >= 100) return `${sym}${n.toFixed(0)}`;
    if (n >= 1) return `${sym}${n.toFixed(2)}`;
    return `${sym}${n.toFixed(3)}`;
  }

  function productPrice(p, prefs, priceOverrides = {}) {
    const o = priceOverrides[p.id];
    if (o) return o.price;
    return prefs.currency === 'INR'
      ? Math.round(p.defaultPriceUSD * USD_TO_INR)
      : p.defaultPriceUSD;
  }

  function productPackageG(p, priceOverrides = {}) {
    return priceOverrides[p.id]?.packageG ?? p.defaultPackageG ?? p.packageSizeG;
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clampScore(n) {
    return Math.max(0, Math.min(5, Math.round(n * 10) / 10));
  }

  function scoreTone(s) {
    if (s >= 4) return 'hi';
    if (s >= 2.5) return 'mid';
    return 'lo';
  }

  function scoreLinear(value, best, worst) {
    if (best === worst) return 3;
    const t = (value - worst) / (best - worst);
    return clampScore(Math.max(0, Math.min(1, t)) * 5);
  }

  function letterGrade(avg) {
    if (avg >= 4.3) return 'A';
    if (avg >= 3.6) return 'B';
    if (avg >= 2.8) return 'C';
    if (avg >= 2.0) return 'D';
    return 'F';
  }

  function preferenceIssues(p, prefs) {
    const issues = [];
    (p.allergens || []).forEach((a) => {
      if (prefs.allergens.includes(a)) issues.push(`Not for you — contains ${a}`);
    });
    if (prefs.allergens.includes('artificial') && p.artificial) {
      issues.push('Not for you — artificial sweeteners / fillers');
    }
    if (productPrice(p, prefs) > prefs.budget) {
      issues.push(`Over budget (${money(productPrice(p, prefs), prefs.currency)} vs ${money(prefs.budget, prefs.currency)})`);
    }
    if (prefs.lowSugar && (p.addedSugar || 0) >= 5) {
      issues.push(`High added sugar (${p.addedSugar}g) vs low-sugar preference`);
    }
    if (prefs.goal === 'cutting' && p.category === 'gainer') {
      issues.push('Mass gainer conflicts with a cutting goal');
    }
    if (p.proprietaryBlend) issues.push('Proprietary blend — active doses opaque');
    return issues;
  }

  function isBlocked(p, prefs) {
    return preferenceIssues(p, prefs).some((i) => i.startsWith('Not for you'));
  }

  function buildCriteria(p, prefs, normMode = 'serving', priceOverrides = {}) {
    const s = normMode === 'per100g' && p.servingSizeG > 0 ? 100 / p.servingSizeG : 1;
    const protein = (p.protein || 0) * s;
    const sugar = (p.addedSugar || 0) * s;
    const servingG = p.servingSizeG * s;
    const price = productPrice(p, prefs, priceOverrides);
    const pkg = productPackageG(p, priceOverrides);
    const costPerServing = pkg > 0 ? (price / pkg) * (p.servingSizeG * s) : null;
    const costPerGProtein =
      protein > 0 && costPerServing != null ? costPerServing / protein : null;
    const purity = servingG > 0 && protein > 0 ? (protein / servingG) * 100 : 0;
    const sodium = (p.sodiumMg || 0) * s;
    const list = [];
    const productText = [
      p.name, p.typeLabel, p.subcategory, p.activeName, p.summary,
      ...(p.bestFor || []), ...(p.actives || []).map((active) => active.name),
    ].filter(Boolean).join(' ').toLowerCase();
    const hasAnyTerm = (terms) => terms.some((term) => productText.includes(term));
    const isCaffeineHeavy = (p.caffeineMg || 0) >= 150;
    const profileTargets = {
      'vitamin-deficiency': {
        label: 'Vitamin D / B12 fit',
        matches: ['vitamin d', 'b12', 'multivitamin'],
        categories: ['multi'],
      },
      'joint-discomfort': {
        label: 'Joint support fit',
        matches: ['collagen', 'glucosamine', 'omega-3', 'fish oil', 'joint', 'knee'],
        categories: ['collagen', 'omega'],
      },
      'sleep-stress': {
        label: 'Sleep / stress fit',
        matches: ['ashwagandha', 'magnesium glycinate', 'glycinate', 'glycine', 'magnesium'],
        categories: [],
      },
      'desk-brain-fog': {
        label: 'Focus support fit',
        matches: ['l-theanine', 'theanine', 'electrolyte', 'nootropic'],
        categories: [],
      },
      'daily-energy-vitality': {
        label: 'Energy / vitality fit',
        matches: ['b12', 'vitamin d', 'electrolyte', 'energy'],
        categories: ['multi'],
      },
      'immunity-longevity': {
        label: 'Immunity / longevity fit',
        matches: ['multivitamin', 'vitamin c', 'vitamin d', 'omega-3', 'fish oil'],
        categories: ['multi', 'omega'],
      },
      'joint-bone-mobility': {
        label: 'Joint / bone mobility fit',
        matches: ['collagen', 'glucosamine', 'omega-3', 'fish oil', 'joint'],
        categories: ['collagen', 'omega'],
      },
      'stress-sleep-quality': {
        label: 'Stress / sleep fit',
        matches: ['ashwagandha', 'magnesium glycinate', 'glycinate', 'glycine', 'magnesium'],
        categories: [],
      },
    };
    const selectedTargets = [
      ...(Array.isArray(prefs.healthFlags) ? prefs.healthFlags : []),
      prefs.supplementGoal,
    ];
    [...new Set(selectedTargets)].forEach((target) => {
      const definition = profileTargets[target];
      if (!definition) return;
      const isMatch = definition.categories.includes(p.category) || hasAnyTerm(definition.matches);
      const score = isMatch ? 5 :
        ['sleep-stress', 'stress-sleep-quality'].includes(target) && isCaffeineHeavy ? 1 : 2.5;
      list.push({
        key: `profile-${target}`,
        label: definition.label,
        display: isMatch ? 'Relevant match' : isCaffeineHeavy && score === 1 ? 'High caffeine' : 'No direct match',
        score,
        weight: 1.2,
      });
    });

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
      weight: prefs.lowSugar ? 1.3 : 1.0,
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
        display: money(costPerGProtein, prefs.currency),
        score: scoreLinear(costPerGProtein, 0.02, 0.2),
        weight: 1.2,
      });
    } else if (costPerServing != null) {
      list.push({
        key: 'costServing',
        label: 'Cost / serving',
        display: money(costPerServing, prefs.currency),
        score: scoreLinear(costPerServing, 0.15, 2.5),
        weight: 1.2,
      });
    }

    list.push({
      key: 'testing',
      label: '3rd-party tested',
      display: p.thirdPartyTested ? `Yes${p.labName ? ` · ${p.labName}` : ''}` : 'No',
      score: p.thirdPartyTested ? (prefs.preferLab ? 5 : 4.5) : prefs.preferLab ? 1 : 2,
      weight: prefs.preferLab ? 1.3 : 0.9,
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
      display: isBlocked(p, prefs) ? 'Conflict' : (p.allergens || []).length ? (p.allergens || []).join(', ') : 'Clean',
      score: isBlocked(p, prefs) ? 0 : (p.allergens || []).length === 0 ? 5 : 3.5,
      weight: 1.5,
    });

    let goalScore = 3.5;
    let goalDisplay = 'Neutral';
    if (prefs.goal === 'cutting') {
      if (p.category === 'gainer') {
        goalScore = 1;
        goalDisplay = 'Poor for cutting';
      } else if (protein > 0 && p.calories > 0) {
        goalScore = scoreLinear(protein / (p.calories * s || p.calories), 0.25, 0.05);
        goalDisplay = 'Protein density vs calories';
      } else if (p.category === 'creatine') {
        goalScore = 4.5;
        goalDisplay = 'Useful on a cut';
      }
    } else if (prefs.goal === 'bulking') {
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
      label: `Fit for ${prefs.goal}`,
      display: goalDisplay,
      score: clampScore(goalScore),
      weight: 1.0,
    });

    return list;
  }

  function overallScore(p, prefs, normMode = 'serving', priceOverrides = {}) {
    const criteria = buildCriteria(p, prefs, normMode, priceOverrides);
    let w = 0;
    let s = 0;
    criteria.forEach((c) => {
      w += c.weight;
      s += c.score * c.weight;
    });
    return { avg: clampScore(w ? s / w : 0), criteria };
  }

  function toggleCompare(id) {
    const ids = loadCompareIds();
    const idx = ids.indexOf(id);
    if (idx >= 0) ids.splice(idx, 1);
    else {
      if (ids.length >= 2) ids.shift();
      ids.push(id);
    }
    saveCompareIds(ids);
    return ids;
  }

  function initShell() {
    markActiveNav();
    updateNavCompareCount();
  }

  return {
    loadPrefs,
    savePrefs,
    getRecommendationSummary,
    loadCompareIds,
    saveCompareIds,
    loadFavorites,
    saveFavorites,
    updateNavCompareCount,
    markActiveNav,
    initShell,
    money,
    productPrice,
    productPackageG,
    escapeHtml,
    scoreTone,
    letterGrade,
    preferenceIssues,
    isBlocked,
    buildCriteria,
    overallScore,
    toggleCompare,
    DEFAULT_PREFS,
  };
})();

document.addEventListener('DOMContentLoaded', () => Shared.initShell());
