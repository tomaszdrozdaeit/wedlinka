// ============================================================
// MODUŁ: KLIENCI — Kartoteka klientów
// Etap 2
// ============================================================

import { listenKlienci, addKlient, updateKlient, deleteKlient, syncKlientInZamowienia } from '../db.js';
import { toast, openModal, closeModal, escHtml } from '../app.js';

// ── Helpers ───────────────────────────────────────────────────

/**
 * Formatuje numer telefonu jako "500 600 700" (maks. 9 cyfr).
 */
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

let unsubscribe  = null;
let allKlienci   = [];
let searchQuery  = '';
let filterMode   = 'all';   // 'all' | 'osobisty' | 'dostawa'

// ============================================================
// ENTRY POINT
// ============================================================

export async function mount(container) {
  container.innerHTML = buildShell();
  bindShellEvents();

  unsubscribe = listenKlienci((klienci, error) => {
    if (error) { toast('Błąd ładowania klientów: ' + error.message, 'error'); return; }
    allKlienci = klienci || [];
    updateBadges();
    render();
  });

  return unsubscribe;
}

// ============================================================
// SHELL
// ============================================================

function buildShell() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Klienci</h1>
        <p class="page-subtitle" id="klienci-subtitle">Ładowanie…</p>
      </div>
      <div class="page-actions">
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-input" id="search-klienci"
                 placeholder="Szukaj po nazwisku lub telefonie…" autocomplete="off">
        </div>
        <button class="btn btn-primary" id="btn-add-klient">+ Dodaj Klienta</button>
      </div>
    </div>

    <div class="category-tabs" id="filter-tabs">
      <button class="category-tab active" data-filter="all">
        Wszyscy <span class="category-tab-count" id="cnt-all">0</span>
      </button>
      <button class="category-tab" data-filter="osobisty">
        🏠 Odbiór własny <span class="category-tab-count" id="cnt-osobisty">0</span>
      </button>
      <button class="category-tab" data-filter="dostawa">
        🚗 Dostawa <span class="category-tab-count" id="cnt-dostawa">0</span>
      </button>
    </div>

    <div style="margin: var(--sp-4) var(--sp-8); background:var(--bg-card);
                border: 1px solid var(--border); border-radius: var(--r-lg); overflow:hidden;">
      <div id="klienci-list">
        <div class="loading-overlay"><div class="spinner"></div></div>
      </div>
    </div>
  `;
}

function bindShellEvents() {
  document.getElementById('search-klienci')?.addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase().trim();
    render();
  });

  document.getElementById('filter-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.category-tab');
    if (!tab) return;
    document.querySelectorAll('#filter-tabs .category-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    filterMode = tab.dataset.filter;
    render();
  });

  document.getElementById('btn-add-klient')?.addEventListener('click', () => openKlientModal(null));
}

// ============================================================
// RENDER
// ============================================================

function updateBadges() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('klienci-subtitle', `${allKlienci.length} klientów w bazie`);
  set('cnt-all',       allKlienci.length);
  set('cnt-osobisty',  allKlienci.filter(k => !k.dostawa).length);
  set('cnt-dostawa',   allKlienci.filter(k =>  k.dostawa).length);
}

function getFiltered() {
  return allKlienci.filter(k => {
    const nameOk = !searchQuery ||
      `${k.imie || ''} ${k.nazwisko || ''}`.toLowerCase().includes(searchQuery) ||
      (k.telefon || '').replace(/\s/g, '').includes(searchQuery.replace(/\s/g, ''));
    const modeOk = filterMode === 'all' ||
      (filterMode === 'dostawa'  &&  k.dostawa) ||
      (filterMode === 'osobisty' && !k.dostawa);
    return nameOk && modeOk;
  });
}

function render() {
  const list = document.getElementById('klienci-list');
  if (!list) return;

  const filtered = getFiltered();

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="min-height:220px">
        <div class="empty-state-icon">${searchQuery ? '🔍' : '👥'}</div>
        <div class="empty-state-title">${searchQuery ? 'Brak wyników' : 'Brak klientów'}</div>
        <div class="empty-state-desc">
          ${searchQuery
            ? 'Zmień wyszukiwane hasło.'
            : 'Dodaj pierwszego klienta, klikając przycisk powyżej.'
          }
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = `<div class="client-list">${filtered.map(renderRow).join('')}</div>`;

  list.querySelectorAll('[data-client-action]').forEach(btn => {
    btn.addEventListener('click', handleClientAction);
  });
}

function renderRow(k) {
  const fullName = [k.imie, k.nazwisko].filter(Boolean).join(' ') || '—';
  const initial  = fullName.charAt(0).toUpperCase();

  return `
    <div class="client-row" id="klient-${k.id}">
      <div class="client-avatar">${initial}</div>

      <div class="client-info">
        <div class="client-name">
          ${escHtml(fullName)}
          ${k.stalKlient ? '<span class="badge badge-amber" style="margin-left:var(--sp-2)">⭐ Stały</span>' : ''}
        </div>
        <div class="client-phone">
          ${k.telefon
            ? `<a href="tel:${encodeURIComponent(k.telefon)}" style="color:inherit">📞 ${escHtml(k.telefon)}</a>`
            : '<span style="color:var(--text-muted)">brak telefonu</span>'
          }
        </div>
        ${k.dostawa && k.adresDost ? `
          <div class="client-phone">📍 ${escHtml(k.adresDost)}</div>
        ` : ''}
      </div>

      <div style="display:flex;align-items:center;gap:var(--sp-3);flex-shrink:0;flex-wrap:wrap">
        <span class="badge ${k.dostawa ? 'badge-blue' : 'badge-green'}">
          ${k.dostawa ? '🚗 Dostawa' : '🏠 Odbiór'}
        </span>
        <div class="client-actions">
          <button class="btn btn-secondary btn-sm btn-icon"
                  data-client-action="edit" data-id="${k.id}" title="Edytuj klienta">✏️</button>
          <button class="btn btn-ghost btn-sm btn-icon"
                  data-client-action="delete" data-id="${k.id}"
                  title="Usuń klienta" style="color:var(--clr-danger)">🗑</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// ACTIONS
// ============================================================

async function handleClientAction(e) {
  const btn    = e.currentTarget;
  const id     = btn.dataset.id;
  const action = btn.dataset.clientAction;
  const k      = allKlienci.find(x => x.id === id);

  switch (action) {
    case 'edit':
      if (k) openKlientModal(k);
      break;

    case 'delete':
      if (!k) return;
      const name = [k.imie, k.nazwisko].filter(Boolean).join(' ');
      if (!confirm(`Usunąć klienta "${name}"?\nTa operacja jest nieodwracalna.`)) return;
      try {
        await deleteKlient(id);
        toast(`"${name}" usunięty`, 'success');
      } catch (err) { toast(err.message, 'error'); }
      break;
  }
}

// ============================================================
// MODAL
// ============================================================

function openKlientModal(klient) {
  const isEdit = !!klient;

  openModal(
    isEdit ? 'Edytuj Klienta' : 'Dodaj Nowego Klienta',
    `
    <form id="klient-form" autocomplete="off" novalidate>
      <div class="form-row">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" for="k-imie">Imię</label>
          <input class="form-input" type="text" id="k-imie"
                 placeholder="Jan" value="${escHtml(klient?.imie || '')}">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" for="k-nazwisko">Nazwisko *</label>
          <input class="form-input" type="text" id="k-nazwisko"
                 placeholder="Kowalski" value="${escHtml(klient?.nazwisko || '')}">
        </div>
      </div>

      <div class="form-group" style="margin-top:var(--sp-5)">
        <label class="form-label" for="k-telefon">Numer telefonu</label>
        <input class="form-input" type="text" inputmode="tel" id="k-telefon"
               placeholder="500 600 700" maxlength="11" autocomplete="tel"
               value="${escHtml(formatPhone(klient?.telefon || ''))}">
      </div>

      <div class="form-group">
        <label class="form-label">Sposób odbioru *</label>
        <div class="radio-group">
          <label class="radio-option ${!klient?.dostawa ? 'selected' : ''}" id="ro-osobisty">
            <input type="radio" name="dostawa" value="0" ${!klient?.dostawa ? 'checked' : ''}>
            <div class="radio-custom"></div>
            <span class="radio-label">🏠 Odbierze osobiście</span>
          </label>
          <label class="radio-option ${klient?.dostawa ? 'selected' : ''}" id="ro-dostawa">
            <input type="radio" name="dostawa" value="1" ${klient?.dostawa ? 'checked' : ''}>
            <div class="radio-custom"></div>
            <span class="radio-label">🚗 Trzeba dowieźć</span>
          </label>
        </div>
      </div>

      <div class="form-group" id="adres-group"
           style="display:${klient?.dostawa ? 'block' : 'none'}">
        <label class="form-label" for="k-adres">Adres dostawy</label>
        <input class="form-input" type="text" id="k-adres"
               placeholder="ul. Przykładowa 1, Miejscowość"
               value="${escHtml(klient?.adresDost || '')}">
      </div>

      <div class="form-group">
        <div class="toggle-group">
          <label class="toggle">
            <input type="checkbox" id="k-staly" ${klient?.stalKlient ? 'checked' : ''}>
            <div class="toggle-slider"></div>
          </label>
          <span class="toggle-text">⭐ Stały klient</span>
        </div>
      </div>
    </form>
    `,
    {
      confirmText: isEdit ? 'Zapisz zmiany' : 'Dodaj Klienta',
      onConfirm: () => saveKlient(klient),
    }
  );

  // ── Phone formatting ──────────────────────────────────────────
  const phoneInput = document.getElementById('k-telefon');
  if (phoneInput) {
    // Block non-digit keypresses (allow control combos and navigation keys)
    phoneInput.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey || e.altKey;
      const nav  = ['Backspace','Delete','ArrowLeft','ArrowRight',
                    'ArrowUp','ArrowDown','Tab','Home','End'].includes(e.key);
      if (!ctrl && !nav && !/^\d$/.test(e.key)) e.preventDefault();
    });

    // Format on every input event (type=text — no selectionRange issues)
    phoneInput.addEventListener('input', () => {
      // Save caret position before reformatting
      const pos  = phoneInput.selectionStart ?? phoneInput.value.length;
      const raw  = phoneInput.value;
      const fmt  = formatPhone(raw);
      if (raw !== fmt) {
        phoneInput.value = fmt;
        // Adjust cursor: spaces added before current position shift it right
        const spacesBefore = (fmt.slice(0, pos).match(/ /g) || []).length -
                             (raw.slice(0, pos).match(/ /g) || []).length;
        try { phoneInput.setSelectionRange(pos + spacesBefore, pos + spacesBefore); } catch {}
      }
    });

    // Also format on paste (value not yet updated, use setTimeout)
    phoneInput.addEventListener('paste', () => {
      setTimeout(() => {
        phoneInput.value = formatPhone(phoneInput.value);
      }, 0);
    });
  }

  // ── Radio listeners ──────────────────────────────────────────
  document.querySelectorAll('input[name="dostawa"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
      radio.closest('.radio-option').classList.add('selected');
      const showAdres = radio.value === '1';
      const grp = document.getElementById('adres-group');
      if (grp) grp.style.display = showAdres ? 'block' : 'none';
    });
  });

  document.querySelectorAll('.radio-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const radio = opt.querySelector('input[type=radio]');
      if (radio) radio.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

async function saveKlient(existing) {
  const imie      = document.getElementById('k-imie')?.value.trim();
  const nazwisko  = document.getElementById('k-nazwisko')?.value.trim();
  const telefon   = document.getElementById('k-telefon')?.value.trim();
  const dostawa   = document.querySelector('input[name="dostawa"]:checked')?.value === '1';
  const adresDost = document.getElementById('k-adres')?.value.trim();
  const stalKlient = document.getElementById('k-staly')?.checked ?? false;

  if (!nazwisko) {
    toast('Wpisz nazwisko klienta', 'warning');
    document.getElementById('k-nazwisko')?.focus();
    return;
  }

  const btn = document.getElementById('modal-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Zapisywanie…'; }

  const fullName = [imie, nazwisko].filter(Boolean).join(' ');

  try {
    const data = {
      imie:      imie      || '',
      nazwisko:  nazwisko,
      telefon:   telefon   || '',
      dostawa,
      adresDost: adresDost || '',
      stalKlient,
    };

    if (existing) {
      await updateKlient(existing.id, data);
      // Synchronizuj dane klienta we wszystkich jego zamówieniach
      await syncKlientInZamowienia(existing.id, data);
      toast(`"${fullName}" zaktualizowany ✓`, 'success');
    } else {
      await addKlient(data);
      toast(`"${fullName}" dodany ✓`, 'success');
    }
    closeModal();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = existing ? 'Zapisz zmiany' : 'Dodaj Klienta'; }
    toast('Błąd: ' + err.message, 'error');
  }
}
