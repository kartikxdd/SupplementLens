/**
 * api.js — Data access layer.
 *
 * Reads the local data.json dataset. The UI stays async-ready for future APIs.
 *
 * Example future wiring:
 *   import { createClient } from '@supabase/supabase-js'
 *   const supabase = createClient(url, anonKey)
 *   // in getSupplements: supabase.from('supplements').select('*, actives:... ')
 */

const Api = (() => {
  let datasetPromise;

  // Stable pseudo-random values keep the presentation demo consistent on reload.
  function demoValuesForProduct(product) {
    let seed = [...String(product.id || product.name)].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const pick = (min, max, decimals = 0) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const value = min + (seed / 0x100000000) * (max - min);
      return Number(value.toFixed(decimals));
    };
    const set = (key, value) => {
      if (product[key] == null) {
        product[key] = value;
        product.demoGeneratedFields ||= [];
        product.demoGeneratedFields.push(key);
      }
    };
    const category = product.category;
    const servingRanges = { whey: [30, 40], plant: [30, 40], creatine: [3, 6], gainer: [100, 150], amino: [5, 12], collagen: [10, 15], pre: [8, 15], omega: [1, 2], multi: [1, 3] };
    const [minServing, maxServing] = servingRanges[category] || [10, 30];
    set('servingSizeG', pick(minServing, maxServing, 1));
    const profiles = {
      whey: { protein: [20, 30], carbs: [1, 8], fat: [1, 5], fiber: [0, 2], sugar: [0, 5], addedSugar: [0, 3], sodiumMg: [80, 350] },
      plant: { protein: [20, 30], carbs: [2, 12], fat: [2, 7], fiber: [2, 8], sugar: [0, 5], addedSugar: [0, 3], sodiumMg: [100, 450] },
      creatine: { protein: [0, 0], carbs: [0, 0], fat: [0, 0], fiber: [0, 0], sugar: [0, 0], addedSugar: [0, 0], sodiumMg: [0, 30] },
      gainer: { protein: [20, 40], carbs: [60, 110], fat: [4, 15], fiber: [2, 10], sugar: [5, 30], addedSugar: [0, 20], sodiumMg: [200, 800] },
      amino: { protein: [0, 2], carbs: [0, 5], fat: [0, 1], fiber: [0, 2], sugar: [0, 2], addedSugar: [0, 1], sodiumMg: [0, 400] },
      collagen: { protein: [8, 12], carbs: [0, 4], fat: [0, 2], fiber: [0, 2], sugar: [0, 3], addedSugar: [0, 2], sodiumMg: [20, 250] },
      pre: { protein: [0, 3], carbs: [0, 8], fat: [0, 2], fiber: [0, 3], sugar: [0, 5], addedSugar: [0, 3], sodiumMg: [50, 500] },
      omega: { protein: [0, 0], carbs: [0, 0], fat: [1, 2], fiber: [0, 0], sugar: [0, 0], addedSugar: [0, 0], sodiumMg: [0, 20] },
      multi: { protein: [0, 0], carbs: [0, 1], fat: [0, 1], fiber: [0, 0], sugar: [0, 1], addedSugar: [0, 0], sodiumMg: [0, 50] },
    };
    const profile = profiles[category] || profiles.amino;
    for (const [key, range] of Object.entries(profile)) set(key, pick(...range, key.endsWith('Mg') ? 0 : 1));
    set('calories', pick(category === 'gainer' ? 400 : category === 'whey' || category === 'plant' ? 100 : 0, category === 'gainer' ? 650 : category === 'whey' || category === 'plant' ? 180 : 40, 0));
    set('potassiumMg', pick(0, 250));
    set('calciumMg', pick(0, 300));
    set('cholesterolMg', pick(0, 30));
    set('fillersPct', pick(0, 18, 1));
    if (product.servingsPerContainer == null) {
      const packageG = product.defaultPackageG ?? product.packageSizeG;
      const servings = Number.isFinite(packageG) && Number.isFinite(product.servingSizeG) && product.servingSizeG > 0
        ? Math.max(1, Math.floor(packageG / product.servingSizeG))
        : pick(20, 70);
      set('servingsPerContainer', servings);
    }
    set('thirdPartyTested', pick(0, 2) === 1);
    set('labelAccuracyPct', pick(88, 100));
    set('heavyMetalsPass', pick(0, 2) === 1);
    if (category === 'pre') {
      set('caffeineMg', pick(0, 251));
      set('citrullineG', pick(0, 8, 1));
      set('betaAlanineG', pick(0, 4, 1));
    }

    if (!Array.isArray(product.actives) || product.actives.length === 0) {
      const activeSets = {
        whey: [['Protein', 'g', 20, 30], ['BCAAs', 'g', 4, 7]],
        plant: [['Plant protein blend', 'g', 20, 30], ['BCAAs', 'g', 3, 6]],
        creatine: [['Creatine monohydrate', 'g', 3, 5]],
        gainer: [['Protein blend', 'g', 20, 40], ['Carbohydrate blend', 'g', 60, 100]],
        amino: [['BCAAs', 'g', 4, 8], ['L-glutamine', 'g', 1, 3]],
        collagen: [['Collagen peptides', 'g', 8, 12], ['Vitamin C', 'mg', 20, 100]],
        pre: [['Citrulline malate', 'g', 3, 8], ['Beta-alanine', 'g', 1.6, 3.2], ['Caffeine', 'mg', 100, 250]],
        omega: [['EPA', 'mg', 180, 600], ['DHA', 'mg', 120, 400]],
        multi: [['Vitamin C', 'mg', 40, 120], ['Vitamin D3', 'mcg', 5, 25], ['Zinc', 'mg', 5, 15]],
      };
      product.actives = (activeSets[category] || activeSets.amino).map(([name, unit, min, max]) => ({ name, amount: pick(min, max, unit === 'g' ? 1 : 0), unit }));
      product.demoGeneratedFields ||= [];
      product.demoGeneratedFields.push('actives');
    }
    if (product.activeDoseG == null && product.actives[0]) {
      const first = product.actives[0];
      set('activeDoseG', first.unit === 'g' ? first.amount : Number((first.amount / 1000).toFixed(2)));
      set('activeName', first.name);
    }
    product.demoGenerated = product.demoGeneratedFields?.length > 0;
    return product;
  }

  async function getDataset() {
    if (!datasetPromise) {
      datasetPromise = fetch('data.json')
        .then((response) => {
          if (!response.ok) throw new Error(`Could not load data.json (${response.status}).`);
          return response.json();
        })
        .then((data) => {
          if (!data || !Array.isArray(data.categories) || !Array.isArray(data.supplements)) {
            throw new Error('data.json must contain categories and supplements arrays.');
          }
          return data;
        })
        .catch((error) => {
          datasetPromise = null;
          if (error instanceof TypeError) {
            throw new Error('Unable to fetch data.json. Run the site through a local web server instead of opening the HTML file directly.');
          }
          throw error;
        });
    }
    return datasetPromise;
  }

  async function getCategories() {
    const data = await getDataset();
    return structuredClone(data.categories);
  }

  async function getBrands() {
    const data = await getDataset();
    return [...new Set(data.supplements.map((product) => product.brand).filter(Boolean))].map((name) => ({
      name,
      logoUrl: data.brandLogos?.[name] || null,
    }));
  }

  async function getSupplements(filters = {}) {
    const data = await getDataset();
    let rows = [...data.supplements];

    if (filters.category && filters.category !== 'all') {
      rows = rows.filter((r) => r.category === filters.category);
    }
    if (filters.brand) {
      rows = rows.filter((r) => r.brand === filters.brand);
    }
    if (filters.search) {
      const q = String(filters.search).toLowerCase();
      rows = rows.filter(
        (r) =>
          String(r.name || '').toLowerCase().includes(q) ||
          String(r.code || '').toLowerCase().includes(q) ||
          String(r.brand || '').toLowerCase().includes(q) ||
          String(r.typeLabel || '').toLowerCase().includes(q) ||
          String(r.subcategory || '').toLowerCase().includes(q) ||
          (r.summary || '').toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q)
      );
    }
    if (filters.ids?.length) {
      const set = new Set(filters.ids);
      rows = rows.filter((r) => set.has(r.id));
    }

    return structuredClone(rows.map((product) => demoValuesForProduct(product)));
  }

  async function getSupplementById(id) {
    const rows = await getSupplements({ ids: [id] });
    return rows[0] || null;
  }

  /** Schema hint for when you create Supabase SQL migrations */
  function getSchemaNotes() {
    return {
      tables: [
        'categories (id text pk, name, short, icon, color, description, what_we_score jsonb)',
        'brands (id uuid, name, logo_url) — optional',
        'supplements (id text pk, slug, code, name, brand_id, category_id, subcategory, form, type_label, summary, serving_size_g, servings_per_container, package_size_g, macros cols..., fillers_pct, proprietary_blend, artificial, third_party_tested, lab_name, label_accuracy_pct, heavy_metals_pass, default_price_inr, default_price_usd, source_url, timing, how_to_use, best_for text[], avoid_if text[], pros text[], cons text[], notes, data_status, updated_at)',
        'supplement_actives (id, supplement_id, name, amount, unit)',
        'supplement_allergens (supplement_id, allergen text)',
        'supplement_aminos (supplement_id, leucine, isoleucine, valine, total_bcaa, ...)',
      ],
      status: 'local-json',
      source: 'data.json',
    };
  }

  return {
    getCategories,
    getBrands,
    getSupplements,
    getSupplementById,
    getSchemaNotes,
  };
})();
