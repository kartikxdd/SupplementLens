/**
 * api.js — Data access layer.
 *
 * Today: reads from MOCK_DB in data.js
 * Later: swap implementations to Supabase without rewriting UI code.
 *
 * Example future wiring:
 *   import { createClient } from '@supabase/supabase-js'
 *   const supabase = createClient(url, anonKey)
 *   // in getSupplements: supabase.from('supplements').select('*, actives:... ')
 */

const Api = (() => {
  const USE_SUPABASE = false; // flip when credentials + tables exist
  // const SUPABASE_URL = '';
  // const SUPABASE_ANON_KEY = '';

  async function delay(ms = 0) {
    // Simulate network latency so UI is already async-ready
    if (ms) await new Promise((r) => setTimeout(r, ms));
  }

  async function getCategories() {
    await delay();
    if (USE_SUPABASE) {
      throw new Error('Supabase not configured — set USE_SUPABASE and client.');
    }
    return structuredClone(MOCK_DB.categories);
  }

  async function getBrands() {
    await delay();
    if (USE_SUPABASE) throw new Error('Supabase not configured');
    return [...MOCK_DB.brands];
  }

  async function getSupplements(filters = {}) {
    await delay();
    if (USE_SUPABASE) throw new Error('Supabase not configured');

    let rows = [...MOCK_DB.supplements];

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
          r.name.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          r.brand.toLowerCase().includes(q) ||
          r.typeLabel.toLowerCase().includes(q) ||
          r.subcategory.toLowerCase().includes(q) ||
          (r.summary || '').toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q)
      );
    }
    if (filters.ids?.length) {
      const set = new Set(filters.ids);
      rows = rows.filter((r) => set.has(r.id));
    }

    return structuredClone(rows);
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
        'brands (id uuid, name, logo_url) — optional; currently placeholders',
        'supplements (id text pk, slug, code, name, brand_id, category_id, subcategory, form, type_label, summary, serving_size_g, servings_per_container, package_size_g, macros cols..., fillers_pct, proprietary_blend, artificial, third_party_tested, lab_name, label_accuracy_pct, heavy_metals_pass, default_price_usd, timing, how_to_use, best_for text[], avoid_if text[], pros text[], cons text[], notes, data_status, updated_at)',
        'supplement_actives (id, supplement_id, name, amount, unit)',
        'supplement_allergens (supplement_id, allergen text)',
        'supplement_aminos (supplement_id, leucine, isoleucine, valine, total_bcaa, ...)',
      ],
      status: USE_SUPABASE ? 'live' : 'mock',
    };
  }

  return {
    USE_SUPABASE,
    getCategories,
    getBrands,
    getSupplements,
    getSupplementById,
    getSchemaNotes,
  };
})();
