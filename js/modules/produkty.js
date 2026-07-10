// ============================================================
// MODUŁ: KATALOG PRODUKTÓW
// Pełna implementacja CRUD — Etap 1
// ============================================================

import { listenProdukty, addProdukt, updateProdukt, deleteProdukt } from '../db.js';
import { toast, openModal, closeModal, escHtml, formatCena } from '../app.js';

// Kategorie produktów
const KATEGORIE = [
  { id: 'kielbasky',         label: 'Kiełbasy',          icon: '🌭' },
  { id: 'wedzonki',          label: 'Wędzonki',           icon: '🥩' },
  { id: 'pasztety',          label: 'Pasztety',           icon: '🫙' },
  { id: 'salcesony',         label: 'Salcesony',          icon: '🍖' },
  { id: 'wedliny_gotowane',  label: 'Wędliny gotowane',   icon: '🍗' },
  { id: 'inne',              label: 'Inne',               icon: '🏷️'  },
];

// Stan modułu
let unsubscribe   = null;
let allProdukty   = [];
let activeFilter  = 'all';
let searchQuery   = '';

// ============================================================
// ENTRY POINT
// ============================================================

/**
 * Montuje moduł w podanym kontenerze.
 * Zwraca funkcję cleanup (unsubscribe od Firebase listener).
 */
export async function mount(container) {
  container.innerHTML = buildShell();
  bindShellEvents();

  // Nasłuchuj zmian produktów w Firebase (real-time)
  unsubscribe = listenProdukty((produkty, error) => {
    if (error) {
      toast('Błąd ładowania produktów: ' + error.message, 'error');
      return;
    }
    allProdukty = produkty || [];
    updateCountBadges();
    renderGrid();
    updateSubtitle();
  });

  return unsubscribe; // router wywoła to przy zmianie trasy
}

// ============================================================
// HTML SHELL
// ============================================================

function buildShell() {
  return `
    <!-- PAGE HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Katalog Produktów</h1>
        <p class="page-subtitle" id="produkty-subtitle">Ładowanie…</p>
      </div>
      <div class="page-actions">
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-input" id="search-produkty"
                 placeholder="Szukaj produktu…" autocomplete="off">
        </div>
        <button class="btn btn-secondary" id="btn-share-cennik" style="margin-right:var(--sp-2)">
          📱 Generuj Cennik
        </button>
        <button class="btn btn-primary" id="btn-add-produkt">
          + Dodaj Produkt
        </button>
      </div>
    </div>

    <!-- CATEGORY TABS -->
    <div class="category-tabs" id="category-tabs">
      <button class="category-tab active" data-cat="all">
        Wszystkie <span class="category-tab-count" id="cnt-all">0</span>
      </button>
      ${KATEGORIE.map((k) => `
        <button class="category-tab" data-cat="${k.id}">
          ${k.icon} ${k.label}
          <span class="category-tab-count" id="cnt-${k.id}">0</span>
        </button>
      `).join('')}
    </div>

    <!-- PRODUCTS GRID -->
    <div id="produkty-grid" class="products-grid">
      <div class="loading-overlay" style="grid-column:1/-1">
        <div class="spinner"></div>
      </div>
    </div>
  `;
}

// ============================================================
// EVENTS
// ============================================================

function bindShellEvents() {
  // Search
  document.getElementById('search-produkty')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderGrid();
  });

  // Category tabs
  document.getElementById('category-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.category-tab');
    if (!tab) return;
    document.querySelectorAll('.category-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.cat;
    renderGrid();
  });

  // Add button
  document.getElementById('btn-add-produkt')?.addEventListener('click', () => {
    openProductModal(null);
  });

  // Share cennik button
  document.getElementById('btn-share-cennik')?.addEventListener('click', () => {
    openShareCennikModal();
  });
}

// ============================================================
// RENDER
// ============================================================

function updateSubtitle() {
  const el = document.getElementById('produkty-subtitle');
  if (!el) return;
  const active = allProdukty.filter((p) => p.aktywny !== false).length;
  el.textContent = `${allProdukty.length} produktów w katalogu • ${active} aktywnych`;
}

function updateCountBadges() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('cnt-all', allProdukty.length);
  KATEGORIE.forEach((k) => {
    set(`cnt-${k.id}`, allProdukty.filter((p) => p.kategoria === k.id).length);
  });
}

function getFiltered() {
  return allProdukty.filter((p) => {
    const catOk  = activeFilter === 'all' || p.kategoria === activeFilter;
    const termOk = !searchQuery ||
      (p.nazwa  || '').toLowerCase().includes(searchQuery) ||
      (p.opis   || '').toLowerCase().includes(searchQuery) ||
      getKatLabel(p.kategoria).toLowerCase().includes(searchQuery);
    return catOk && termOk;
  });
}

function renderGrid() {
  const grid = document.getElementById('produkty-grid');
  if (!grid) return;

  const filtered = getFiltered();

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">${searchQuery ? '🔍' : '🥩'}</div>
        <div class="empty-state-title">
          ${searchQuery ? 'Brak wyników wyszukiwania' : 'Brak produktów w tej kategorii'}
        </div>
        <div class="empty-state-desc">
          ${searchQuery
            ? `Nie znaleziono produktów pasujących do "<strong>${escHtml(searchQuery)}</strong>"`
            : allProdukty.length === 0
              ? 'Dodaj pierwszy produkt klikając przycisk poniżej.'
              : 'Wybierz inną kategorię lub zmień filtr.'
          }
        </div>
        ${allProdukty.length === 0 ? `
          <button class="btn btn-primary" id="btn-empty-add">+ Dodaj Produkt</button>
        ` : ''}
      </div>
    `;
    document.getElementById('btn-empty-add')?.addEventListener('click', () => openProductModal(null));
    return;
  }

  grid.innerHTML = filtered.map(renderCard).join('');

  // Bind card button events
  grid.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', handleCardAction);
  });
}

function renderCard(p) {
  const aktywny   = p.aktywny !== false;
  const katLabel  = getKatLabel(p.kategoria);
  const katIcon   = getKatIcon(p.kategoria);
  const cenaFmt   = formatCena(p.cena, p.jednostka);

  return `
    <div class="product-card ${aktywny ? '' : 'inactive'}" id="pc-${p.id}">
      <div class="product-card-header">
        <div class="product-name">${escHtml(p.nazwa)}</div>
        <div class="product-price">${formatCenaRaw(p)}</div>
      </div>

      <div class="product-meta">
        <span class="badge badge-gray">${katIcon} ${escHtml(katLabel)}</span>
        ${aktywny
          ? '<span class="badge badge-green">✓ Aktywny</span>'
          : '<span class="badge badge-gray">Nieaktywny</span>'
        }
      </div>

      ${p.opis ? `<p class="product-desc">${escHtml(p.opis)}</p>` : ''}

      <div class="product-actions">
        <button class="btn btn-secondary btn-sm"
                data-action="edit" data-id="${p.id}" title="Edytuj">
          ✏️ Edytuj
        </button>
        <button class="btn ${aktywny ? 'btn-ghost' : 'btn-success'} btn-sm"
                data-action="toggle" data-id="${p.id}"
                title="${aktywny ? 'Dezaktywuj' : 'Aktywuj'}">
          ${aktywny ? '⏸ Dezaktywuj' : '▶ Aktywuj'}
        </button>
        <button class="btn btn-ghost btn-sm"
                data-action="delete" data-id="${p.id}"
                title="Usuń" style="color: var(--clr-danger)">
          🗑
        </button>
      </div>
    </div>
  `;
}

function formatCenaRaw(p) {
  if (!p.cena && p.cena !== 0) return '<span style="color:var(--text-muted)">—</span>';
  const val  = Number(p.cena).toFixed(2).replace('.', ',');
  const unit = p.jednostka === 'szt' ? '/szt' : '/kg';
  return `${val} zł<span class="product-price-unit">${unit}</span>`;
}

// ============================================================
// CARD ACTIONS
// ============================================================

async function handleCardAction(e) {
  const btn    = e.currentTarget;
  const action = btn.dataset.action;
  const id     = btn.dataset.id;
  const p      = allProdukty.find((x) => x.id === id);
  if (!p) return;

  switch (action) {
    case 'edit':
      openProductModal(p);
      break;

    case 'toggle':
      try {
        await updateProdukt(id, { aktywny: !p.aktywny });
        toast(
          p.aktywny ? `"${p.nazwa}" dezaktywowany` : `"${p.nazwa}" aktywowany ✓`,
          p.aktywny ? 'warning' : 'success'
        );
      } catch (err) {
        toast('Błąd: ' + err.message, 'error');
      }
      break;

    case 'delete':
      if (!confirm(`Usunąć "${p.nazwa}"?\nTej operacji nie można cofnąć.`)) return;
      try {
        await deleteProdukt(id);
        toast(`"${p.nazwa}" usunięty`, 'success');
      } catch (err) {
        toast('Błąd: ' + err.message, 'error');
      }
      break;
  }
}

// ============================================================
// ADD / EDIT MODAL
// ============================================================

function openProductModal(produkt) {
  const isEdit = !!produkt;

  const formHTML = `
    <form id="produkt-form" autocomplete="off" novalidate>

      <div class="form-group">
        <label class="form-label" for="p-nazwa">Nazwa produktu *</label>
        <input class="form-input" type="text" id="p-nazwa"
               placeholder="np. Kiełbasa Śląska"
               value="${escHtml(produkt?.nazwa ?? '')}" autocomplete="off">
      </div>

      <div class="form-row">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" for="p-kategoria">Kategoria *</label>
          <select class="form-select" id="p-kategoria">
            ${KATEGORIE.map((k) => `
              <option value="${k.id}" ${produkt?.kategoria === k.id ? 'selected' : ''}>
                ${k.icon} ${k.label}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" for="p-cena">Cena *</label>
          <div class="price-input-wrap">
            <input class="form-input" type="number" id="p-cena"
                   placeholder="0,00" step="0.01" min="0"
                   value="${produkt?.cena ?? ''}">
            <span class="price-unit-label" id="price-unit-lbl">
              zł/${produkt?.jednostka === 'szt' ? 'szt' : 'kg'}
            </span>
          </div>
        </div>
      </div>

      <div class="form-group" style="margin-top: var(--sp-5)">
        <label class="form-label">Jednostka sprzedaży *</label>
        <div class="radio-group">
          <label class="radio-option ${!produkt || produkt.jednostka !== 'szt' ? 'selected' : ''}"
                 id="radio-kg">
            <input type="radio" name="jednostka" value="kg"
                   ${!produkt || produkt.jednostka !== 'szt' ? 'checked' : ''}>
            <div class="radio-custom"></div>
            <span class="radio-label">⚖️ Za kilogram (kg)</span>
          </label>
          <label class="radio-option ${produkt?.jednostka === 'szt' ? 'selected' : ''}"
                 id="radio-szt">
            <input type="radio" name="jednostka" value="szt"
                   ${produkt?.jednostka === 'szt' ? 'checked' : ''}>
            <div class="radio-custom"></div>
            <span class="radio-label">🔢 Za sztukę (szt)</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="p-opis">Opis (opcjonalnie)</label>
        <textarea class="form-textarea" id="p-opis"
                  placeholder="Krótki opis produktu, skład, uwagi…">${escHtml(produkt?.opis ?? '')}</textarea>
      </div>

      <div class="form-group">
        <div class="toggle-group">
          <label class="toggle">
            <input type="checkbox" id="p-aktywny"
                   ${produkt?.aktywny !== false ? 'checked' : ''}>
            <div class="toggle-slider"></div>
          </label>
          <span class="toggle-text">Aktywny w bieżącej szarży</span>
        </div>
        <p class="form-hint">
          Tylko aktywne produkty pojawiają się na cenniku i w formularzu zamówień.
        </p>
      </div>

    </form>
  `;

  openModal(
    isEdit ? 'Edytuj Produkt' : 'Dodaj Nowy Produkt',
    formHTML,
    {
      confirmText:  isEdit ? 'Zapisz zmiany' : 'Dodaj Produkt',
      confirmClass: 'btn-primary',
      onConfirm:    () => handleModalSave(produkt),
    }
  );

  // Radio interaction — update label and styles
  document.querySelectorAll('.radio-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.radio-option').forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
      opt.querySelector('input[type=radio]').checked = true;
      const unit = opt.querySelector('input').value;
      const lbl  = document.getElementById('price-unit-lbl');
      if (lbl) lbl.textContent = `zł/${unit}`;
    });
  });
}

async function handleModalSave(existing) {
  const nazwa     = document.getElementById('p-nazwa')?.value.trim();
  const kategoria = document.getElementById('p-kategoria')?.value;
  const jednostka = document.querySelector('input[name="jednostka"]:checked')?.value || 'kg';
  const cena      = parseFloat(document.getElementById('p-cena')?.value);
  const opis      = document.getElementById('p-opis')?.value.trim();
  const aktywny   = document.getElementById('p-aktywny')?.checked ?? true;

  // Walidacja
  if (!nazwa) {
    toast('Wpisz nazwę produktu', 'warning');
    document.getElementById('p-nazwa')?.focus();
    return;
  }
  if (isNaN(cena) || cena < 0) {
    toast('Wpisz prawidłową cenę (liczba większa lub równa 0)', 'warning');
    document.getElementById('p-cena')?.focus();
    return;
  }

  const confirmBtn = document.getElementById('modal-confirm');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Zapisywanie…'; }

  try {
    const data = { nazwa, kategoria, jednostka, cena, opis, aktywny };

    if (existing) {
      await updateProdukt(existing.id, data);
      toast(`"${nazwa}" zaktualizowany ✓`, 'success');
    } else {
      await addProdukt(data);
      toast(`"${nazwa}" dodany do katalogu ✓`, 'success');
    }
    closeModal();
  } catch (err) {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = existing ? 'Zapisz zmiany' : 'Dodaj Produkt';
    }
    toast('Błąd zapisu: ' + err.message, 'error');
  }
}

// ============================================================
// HELPERS
// ============================================================

function getKatLabel(id) {
  return KATEGORIE.find((k) => k.id === id)?.label ?? id ?? 'Inne';
}

function getKatIcon(id) {
  return KATEGORIE.find((k) => k.id === id)?.icon ?? '🏷️';
}

// ── SHARE CENNIK MODAL ────────────────────────────────────────

function openShareCennikModal() {
  const activeProds = allProdukty.filter((p) => p.aktywny !== false);

  if (activeProds.length === 0) {
    toast('Nie masz żadnych aktywnych produktów do dodania do cennika.', 'warning');
    return;
  }

  // Generate formatted text
  const dateStr = new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  const publicUrl = window.location.origin + window.location.pathname.replace('index.html', '') + 'cennik.html';

  let textLines = [];
  textLines.push(`🥩 *WĘDLINKA — CENNIK* 🥩`);
  textLines.push(`Aktualny na dzień: ${dateStr}\n`);

  KATEGORIE.forEach((kat) => {
    const items = activeProds.filter((p) => p.kategoria === kat.id);
    if (items.length === 0) return;
    textLines.push(`*${kat.icon} ${kat.label.toUpperCase()}:*`);
    items.forEach((p) => {
      const unit = p.jednostka === 'szt' ? 'szt' : 'kg';
      const val  = Number(p.cena).toFixed(2).replace('.', ',');
      textLines.push(`• ${p.nazwa} — ${val} zł/${unit}`);
    });
    textLines.push(''); // blank line
  });

  const knownIds = KATEGORIE.map((k) => k.id);
  const others = activeProds.filter((p) => !knownIds.includes(p.kategoria));
  if (others.length > 0) {
    textLines.push(`*🏷️ POZOSTAŁE:*`);
    others.forEach((p) => {
      const unit = p.jednostka === 'szt' ? 'szt' : 'kg';
      const val  = Number(p.cena).toFixed(2).replace('.', ',');
      textLines.push(`• ${p.nazwa} — ${val} zł/${unit}`);
    });
    textLines.push('');
  }

  textLines.push(`📱 Złóż zamówienie telefonicznie lub przez WhatsApp!`);
  textLines.push(`👉 Sprawdź szczegóły i opisy produktów online:`);
  textLines.push(publicUrl);

  const fullText = textLines.join('\n');

  const bodyHTML = `
    <!-- Modal Tab Header -->
    <div class="category-tabs" id="share-tabs" style="margin-top:0; padding-top:0; border-top:none">
      <button class="category-tab active" data-tab="tekst">📝 Tekst (WhatsApp/SMS)</button>
      <button class="category-tab" data-tab="grafika">🖼️ Obraz / Druk</button>
    </div>

    <!-- TAB 1: TEKST -->
    <div id="share-tab-tekst" class="share-tab-content">
      <div class="form-group">
        <label class="form-label" for="share-txt-area">Gotowy tekst do skopiowania:</label>
        <textarea id="share-txt-area" class="form-textarea" readonly style="min-height: 250px; font-family: monospace; font-size:var(--text-sm); line-height: 1.5; background: var(--bg-main); color: var(--text-primary)">${escHtml(fullText)}</textarea>
      </div>
      <div style="display:flex; gap: var(--sp-2); margin-top: var(--sp-3)">
        <button class="btn btn-primary" id="btn-share-copy" style="flex:1">
          📋 Kopiuj do schowka
        </button>
        <a class="btn btn-secondary" id="btn-share-whatsapp" href="https://wa.me/?text=${encodeURIComponent(fullText)}" target="_blank" rel="noopener" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center">
          💬 Wyślij na WhatsApp
        </a>
      </div>
    </div>

    <!-- TAB 2: GRAFIKA -->
    <div id="share-tab-grafika" class="share-tab-content hidden" style="padding: var(--sp-3) 0">
      <div style="background:var(--bg-main); border:1px solid var(--border); border-radius: var(--r-md); padding: var(--sp-4); margin-bottom: var(--sp-4)">
        <p style="font-size: var(--text-md); font-weight: var(--w-semibold); color: var(--text-primary); margin-bottom: var(--sp-2)">
          Wskazówka dotycząca wysyłania grafiki:
        </p>
        <ol style="margin-left: var(--sp-4); padding-left: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.6">
          <li>Kliknij przycisk poniżej, aby otworzyć cennik publiczny.</li>
          <li>Zrób zrzut ekranu (screenshot) na telefonie lub tablecie.</li>
          <li>Utnij zbędne krawędzie i wyślij gotowy obrazek swoim klientom!</li>
        </ol>
      </div>
      <div style="display:flex; flex-direction:column; gap: var(--sp-2)">
        <a href="${publicUrl}" target="_blank" rel="noopener" class="btn btn-primary" style="text-decoration:none; text-align:center">
          🔗 Otwórz cennik publiczny
        </a>
        <a href="${publicUrl}?print=1" target="_blank" rel="noopener" class="btn btn-secondary" style="text-decoration:none; text-align:center">
          🖨️ Wydrukuj / Zapisz jako PDF cennik
        </a>
      </div>
    </div>
  `;

  openModal(
    'Udostępnij Cennik',
    bodyHTML,
    {
      showFooter: false,
      maxWidth: '560px'
    }
  );

  // Tab switching inside modal
  document.getElementById('share-tabs')?.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.category-tab');
    if (!tabBtn) return;
    document.querySelectorAll('#share-tabs .category-tab').forEach(b => b.classList.remove('active'));
    tabBtn.classList.add('active');

    const targetTab = tabBtn.dataset.tab;
    if (targetTab === 'tekst') {
      document.getElementById('share-tab-tekst')?.classList.remove('hidden');
      document.getElementById('share-tab-grafika')?.classList.add('hidden');
    } else {
      document.getElementById('share-tab-tekst')?.classList.add('hidden');
      document.getElementById('share-tab-grafika')?.classList.remove('hidden');
    }
  });

  // Copy button handler
  document.getElementById('btn-share-copy')?.addEventListener('click', () => {
    const ta = document.getElementById('share-txt-area');
    if (!ta) return;
    ta.select();
    ta.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(ta.value)
      .then(() => {
        toast('Skopiowano cennik do schowka! ✓', 'success');
      })
      .catch(() => {
        toast('Nie udało się skopiować automatycznie. Zaznacz tekst ręcznie.', 'error');
      });
  });
}

