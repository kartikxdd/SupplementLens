const state = {
  favorites: Shared.loadFavorites(),
  catalog: [],
  prefs: Shared.loadPrefs(),
};

function renderBookmarks() {
  const status = document.getElementById('bookmarksStatus');
  const grid = document.getElementById('bookmarksGrid');
  const savedProducts = [...state.favorites]
    .map((id) => state.catalog.find((product) => product.id === id))
    .filter(Boolean);

  if (!savedProducts.length) {
    grid.innerHTML = '';
    status.textContent = state.favorites.size
      ? 'No saved products were found in the current catalog.'
      : 'You have no bookmarks yet. Save products with the star button in Explore.';
    status.classList.remove('hidden');
    return;
  }

  status.classList.add('hidden');
  const compareIds = Shared.loadCompareIds();
  grid.innerHTML = savedProducts.map((product) => {
    const { avg } = Shared.overallScore(product, state.prefs);
    const grade = Shared.letterGrade(avg);
    const issues = Shared.preferenceIssues(product, state.prefs);
    const officialUrl = Shared.officialProductUrl(product);
    const category = product.category.replace(/-/g, ' ');

    return `
      <article class="product-card dense ${Shared.isBlocked(product, state.prefs) ? 'blocked' : ''}">
        <div class="product-body">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div class="text-[10px] uppercase tracking-wider text-brand-muted">${Shared.escapeHtml(product.brand)} · ${Shared.escapeHtml(product.typeLabel || category)}</div>
              <h2 class="product-title">${Shared.escapeHtml(product.name)}</h2>
            </div>
            <span class="grade-pill grade-${grade}">${grade} · ${avg}/5</span>
          </div>
          <div class="meta-row">
            <span class="meta-tag">${Shared.escapeHtml(category)}</span>
            ${product.code ? `<span class="meta-tag">${Shared.escapeHtml(product.code)}</span>` : ''}
            ${product.form ? `<span class="meta-tag">${Shared.escapeHtml(product.form)}</span>` : ''}
          </div>
          <p class="claim-line">${Shared.escapeHtml(product.summary || 'No summary available.')}</p>
          ${issues.length
            ? `<div class="pref-warn">${Shared.escapeHtml(issues[0])}${issues.length > 1 ? ` · +${issues.length - 1} more` : ''}</div>`
            : ''}
          <div class="info-strip">
            <span>Protein <strong>${Number.isFinite(product.protein) ? `${product.protein}g` : '—'}</strong></span>
            <span>Calories <strong>${Number.isFinite(product.calories) ? `${product.calories} kcal` : '—'}</strong></span>
            <span>Sugar <strong>${Number.isFinite(product.addedSugar) ? `${product.addedSugar}g` : '—'}</strong></span>
            <span>Price <strong>${Shared.money(Shared.productPrice(product, state.prefs), state.prefs.currency)}</strong></span>
          </div>
          <div class="product-actions">
            ${officialUrl ? `<a class="btn-buy" href="${Shared.escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">Official site <span aria-hidden="true">↗</span></a>` : ''}
            <button type="button" class="btn-compare ${compareIds.includes(product.id) ? 'is-on' : ''}" data-compare="${Shared.escapeHtml(product.id)}">${compareIds.includes(product.id) ? 'Added' : 'Compare'}</button>
            <button type="button" class="btn-outline text-xs px-2.5 py-1.5 rounded-md" data-remove="${Shared.escapeHtml(product.id)}" aria-label="Remove ${Shared.escapeHtml(product.name)} from bookmarks">Remove bookmark</button>
          </div>
        </div>
      </article>`;
  }).join('');

  grid.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      state.favorites.delete(button.dataset.remove);
      Shared.saveFavorites(state.favorites);
      renderBookmarks();
    });
  });
  grid.querySelectorAll('[data-compare]').forEach((button) => {
    button.addEventListener('click', () => {
      Shared.toggleCompare(button.dataset.compare);
      renderBookmarks();
    });
  });
}

async function loadBookmarks() {
  const status = document.getElementById('bookmarksStatus');
  const ids = [...state.favorites];
  if (!ids.length) {
    renderBookmarks();
    return;
  }

  try {
    state.catalog = await Api.getSupplements({ ids });
    renderBookmarks();
  } catch (error) {
    status.textContent = `Unable to load bookmarks: ${error.message}`;
  }
}

document.addEventListener('DOMContentLoaded', loadBookmarks);
