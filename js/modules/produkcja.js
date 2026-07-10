// ============================================================
// MODUŁ: PRODUKCJA — Planowanie i lista zakupów
// Etap 3
// Funkcje: lista produkcji (z zapasem), lista zakupów, notatki
// ============================================================

import {
  listenSzarze, listenZamowienia, listenProdukty,
  updateSzarza,
} from '../db.js';
import { toast, escHtml, openModal, closeModal } from '../app.js';

// ── State ─────────────────────────────────────────────────────
let activeBatch = null;
let zamowienia  = [];
let produkty    = [];
let currentKupItems = []; // cache list items for custom modals and updates

let unsubSzarze   = null;
let unsubZam      = null;
let unsubProdukty = null;

// ── View tabs ─────────────────────────────────────────────────
let viewMode = 'produkcja';   // 'produkcja' | 'zakupy' | 'notatki'

// ============================================================
// ENTRY POINT
// ============================================================

export async function mount(container) {
  // Reset module state to prevent singleton cache issues across mounts
  activeBatch   = null;
  zamowienia    = [];
  produkty      = [];
  currentKupItems = [];
  unsubSzarze   = null;
  unsubZam      = null;
  unsubProdukty = null;

  container.innerHTML = buildShell();
  bindShellEvents();

  unsubProdukty = listenProdukty((data, err) => {
    if (!err) { produkty = data || []; renderContent(); }
  });

  unsubSzarze = listenSzarze((szarze, err) => {
    if (err) { toast('Błąd: ' + err.message, 'error'); return; }
    const newActive = (szarze || []).find(s => !s.zarchiwizowana) || null;

    if (newActive?.id !== activeBatch?.id) {
      activeBatch = newActive;
      if (unsubZam) { unsubZam(); unsubZam = null; }
      if (activeBatch) {
        unsubZam = listenZamowienia(activeBatch.id, (data, e2) => {
          if (!e2) { zamowienia = data || []; renderContent(); }
        });
      } else {
        zamowienia = [];
        renderContent();
      }
    }
    renderBatchBanner();
  });

  return () => {
    [unsubSzarze, unsubZam, unsubProdukty].forEach(u => u?.());
  };
}

// ============================================================
// SHELL
// ============================================================

function buildShell() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Produkcja</h1>
        <div id="prod-batch-banner" style="margin-top:var(--sp-1)"></div>
      </div>
    </div>

    <!-- VIEW TABS -->
    <div class="category-tabs" id="prod-view-tabs">
      <button class="category-tab active" data-view="produkcja">🏭 Lista Produkcji</button>
      <button class="category-tab" data-view="zakupy">🛒 Lista Zakupów</button>
      <button class="category-tab" data-view="notatki">📝 Notatki</button>
    </div>

    <div id="prod-content">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
  `;
}

function bindShellEvents() {
  document.getElementById('prod-view-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.category-tab');
    if (!tab) return;
    document.querySelectorAll('#prod-view-tabs .category-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    viewMode = tab.dataset.view;
    renderContent();
  });
}

// ============================================================
// BATCH BANNER
// ============================================================

function renderBatchBanner() {
  const el = document.getElementById('prod-batch-banner');
  if (!el) return;
  if (!activeBatch) {
    el.innerHTML = `<span style="font-size:var(--text-sm);color:var(--clr-warning)">⚠️ Brak aktywnej szarży</span>`;
  } else {
    const FAZY = { zbieranie:'📝 Zbieranie', planowanie:'📋 Planowanie', produkcja:'🏭 Produkcja', sprzedaz:'💰 Sprzedaż', rozliczenie:'✅ Rozliczenie' };
    el.innerHTML = `<span style="font-size:var(--text-sm);color:var(--text-secondary)">
      Szarża: <strong>${escHtml(activeBatch.nazwa || '—')}</strong>
      &nbsp;·&nbsp; ${FAZY[activeBatch.faza] || activeBatch.faza}
    </span>`;
  }
}

// ============================================================
// CONTENT ROUTER
// ============================================================

function renderContent() {
  const c = document.getElementById('prod-content');
  if (!c) return;
  if (!activeBatch) {
    c.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏭</div>
        <div class="empty-state-title">Brak aktywnej szarży</div>
        <div class="empty-state-desc">Utwórz szarżę w module <strong>Szarże</strong>, aby zobaczyć listę produkcji.</div>
      </div>`;
    return;
  }
  if (viewMode === 'produkcja') renderProdukcja(c);
  if (viewMode === 'zakupy')    renderZakupy(c);
  if (viewMode === 'notatki')   renderNotatki(c);
}

// ============================================================
// HELPERS
// ============================================================

function fmtQty(ilosc, jednostka) {
  const n = Number(ilosc);
  if (isNaN(n)) return '—';
  if (jednostka === 'szt') return `${n} szt`;
  if (jednostka === 'g') return `${n} g`;
  if (jednostka === 'opak') return `${n} opak`;
  return `${n % 1 === 0 ? n : n.toFixed(1).replace('.', ',')} kg`;
}

/** Agreguj zamówienia (tylko aktywne) per produkt */
function buildAgg() {
  const agg = {};   // produktId → { nazwa, jednostka, ilosc, zapas }
  const activeOrders = zamowienia.filter(z => z.status !== 'anulowano');
  activeOrders.forEach(z => {
    (z.pozycje || []).forEach(p => {
      const key = p.produktId || p.produktNazwa;
      if (!agg[key]) {
        const prod = produkty.find(x => x.id === p.produktId);
        agg[key] = {
          id:        p.produktId,
          nazwa:     p.produktNazwa || '—',
          jednostka: p.jednostka || 'kg',
          ilosc:     0,
          zapas:     prod?.zapasProdukcji || 0,  // stored in Firestore
        };
      }
      agg[key].ilosc += Number(p.ilosc) || 0;
    });
  });
  return Object.values(agg).sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
}

// ============================================================
// VIEW: LISTA PRODUKCJI
// ============================================================

function renderProdukcja(c) {
  const rows = buildAgg();
  const zCount = zamowienia.filter(z => z.status !== 'anulowano').length;

  if (rows.length === 0) {
    c.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏭</div>
        <div class="empty-state-title">Brak pozycji</div>
        <div class="empty-state-desc">Dodaj zamówienia w module <strong>Zamówienia</strong>.</div>
      </div>`;
    return;
  }

  c.innerHTML = `
    <div class="production-section">

      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--sp-3);margin-bottom:var(--sp-5)">
        <div>
          <h2 style="font-size:var(--text-xl);font-weight:var(--w-bold)">Lista produkcji</h2>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:2px">
            Na podstawie ${zCount} aktywnych zamówień · Możesz dodać zapas ręczny do każdej pozycji
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="window.print()">🖨️ Drukuj</button>
      </div>

      <div class="production-list" id="production-list">
        ${rows.map((r, i) => renderProdRow(r, i)).join('')}
      </div>

      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:var(--sp-4);text-align:center">
        ⓘ Kolumna "Do produkcji" = zamówiona ilość + ręczny zapas. Zmiany zapasu są zapisywane automatycznie.
      </p>
    </div>
  `;

  bindProdEvents(rows);
}

function renderProdRow(r, i) {
  const total = (Number(r.ilosc) || 0) + (Number(r.zapas) || 0);
  return `
    <div class="prod-row" id="prow-${i}" data-pid="${r.id}">
      <div class="prod-row-name">
        <span class="prod-row-product">${escHtml(r.nazwa)}</span>
        <span class="prod-row-ordered">zamówione: <strong>${fmtQty(r.ilosc, r.jednostka)}</strong></span>
      </div>

      <div class="prod-row-zapas">
        <label class="prod-zapas-label">+ Zapas</label>
        <div class="qty-control">
          <button type="button" class="qty-btn minus" data-zapas-pid="${r.id}" data-step="${r.jednostka === 'szt' ? 1 : 0.5}"
                  ${(Number(r.zapas) || 0) <= 0 ? 'disabled' : ''}>−</button>
          <input type="number" class="qty-input prod-zapas-input" id="zapas-${r.id}"
                 value="${Number(r.zapas) || 0}" min="0" step="${r.jednostka === 'szt' ? 1 : 0.5}"
                 data-zapas-pid="${r.id}" data-jednostka="${r.jednostka}">
          <button type="button" class="qty-btn plus" data-zapas-pid="${r.id}" data-step="${r.jednostka === 'szt' ? 1 : 0.5}">+</button>
        </div>
      </div>

      <div class="prod-row-total">
        <span class="prod-total-label">Do produkcji</span>
        <span class="prod-total-value" id="ptotal-${r.id}">${fmtQty(total, r.jednostka)}</span>
      </div>
    </div>
  `;
}

function bindProdEvents(rows) {
  // Debounced save per product
  const saveTimers = {};

  function getZapas(pid) {
    const el = document.getElementById(`zapas-${pid}`);
    return el ? (parseFloat(el.value) || 0) : 0;
  }

  function updateTotal(pid, jednostka) {
    const row   = rows.find(r => r.id === pid);
    if (!row) return;
    const ilosc = row.ilosc || 0;
    const zapas = getZapas(pid);
    const el    = document.getElementById(`ptotal-${pid}`);
    if (el) el.textContent = fmtQty(ilosc + zapas, jednostka);
  }

  function schedSave(pid) {
    clearTimeout(saveTimers[pid]);
    saveTimers[pid] = setTimeout(async () => {
      const zapas = getZapas(pid);
      const prod  = produkty.find(p => p.id === pid);
      if (!prod) return;
      try {
        const { updateProdukt } = await import('../db.js');
        await updateProdukt(pid, { zapasProdukcji: zapas });
      } catch (e) { toast('Nie udało się zapisać zapasu: ' + e.message, 'error'); }
    }, 800);
  }

  // Qty buttons
  document.querySelectorAll('#production-list .qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid  = btn.dataset.zapasPid;
      const step = parseFloat(btn.dataset.step) || 0.5;
      const el   = document.getElementById(`zapas-${pid}`);
      if (!el) return;
      const row      = rows.find(r => r.id === pid);
      const cur      = parseFloat(el.value) || 0;
      const newVal   = Math.max(0, cur + (btn.classList.contains('plus') ? step : -step));
      el.value       = newVal;
      const minBtn   = document.querySelector(`.qty-btn.minus[data-zapas-pid="${pid}"]`);
      if (minBtn) minBtn.disabled = newVal <= 0;
      updateTotal(pid, row?.jednostka || 'kg');
      schedSave(pid);
    });
  });

  // Direct input
  document.querySelectorAll('.prod-zapas-input').forEach(input => {
    input.addEventListener('change', () => {
      const pid      = input.dataset.zapasPid;
      const row      = rows.find(r => r.id === pid);
      const minBtn   = document.querySelector(`.qty-btn.minus[data-zapas-pid="${pid}"]`);
      const val      = Math.max(0, parseFloat(input.value) || 0);
      input.value    = val;
      if (minBtn) minBtn.disabled = val <= 0;
      updateTotal(pid, row?.jednostka || 'kg');
      schedSave(pid);
    });
  });
}

// ============================================================
// VIEW: LISTA ZAKUPÓW
// ============================================================

function renderZakupy(c) {
  const rows  = buildAgg();
  const saved = activeBatch.listaZakupow || [];  // [{id, nazwa, jednostka, ilosc, kupione, isManual}]

  // Merge: from agg (with zapas) + any manual items from batch
  currentKupItems = mergeLista(rows, saved);

  c.innerHTML = `
    <div class="production-section">

      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--sp-3);margin-bottom:var(--sp-5)">
        <div>
          <h2 style="font-size:var(--text-xl);font-weight:var(--w-bold)">Lista zakupów surowców</h2>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:2px">
            Zaznaczaj pozycje jako kupione podczas zakupów
          </p>
        </div>
        <div style="display:flex;gap:var(--sp-2)">
          <button class="btn btn-primary btn-sm" id="btn-kup-add">+ Dodaj pozycję</button>
          <button class="btn btn-secondary btn-sm" id="btn-kup-copy">📋 Kopiuj do schowka</button>
          <button class="btn btn-secondary btn-sm" onclick="window.print()">🖨️ Drukuj</button>
        </div>
      </div>

      <div class="zakupy-list" id="zakupy-list">
        ${currentKupItems.length === 0
          ? '<p style="color:var(--text-muted);text-align:center;padding:var(--sp-8)">Brak pozycji — dodaj zamówienia lub stwórz pozycję.</p>'
          : currentKupItems.map(item => renderZakupItem(item)).join('')
        }
      </div>

      ${currentKupItems.length > 0 ? `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:var(--sp-4);padding-top:var(--sp-4);border-top:1px solid var(--border)">
          <span style="font-size:var(--text-sm);color:var(--text-muted)">
            ✅ ${currentKupItems.filter(x => x.kupione).length} / ${currentKupItems.length} pozycji kupionych
          </span>
          <button class="btn btn-ghost btn-sm" id="btn-odznacz-all">Odznacz wszystkie</button>
        </div>
      ` : ''}
    </div>
  `;

  bindZakupEvents(currentKupItems);
}

function mergeLista(agg, saved) {
  const result = agg.map(r => {
    const existing = saved.find(s => s.id === r.id);
    const total    = (Number(r.ilosc) || 0) + (Number(r.zapas) || 0);
    return {
      id:       r.id,
      nazwa:    r.nazwa,
      jednostka: r.jednostka,
      ilosc:    total,
      kupione:  existing?.kupione ?? false,
    };
  });
  // Add manual items from saved that are not in agg
  saved.filter(s => !agg.find(r => r.id === s.id)).forEach(s => {
    result.push({ ...s });
  });
  return result;
}

function renderZakupItem(item) {
  const deleteBtn = item.isManual
    ? `<button class="btn btn-ghost btn-sm btn-delete-custom" data-id="${item.id}"
               style="color:var(--clr-danger); margin-left:var(--sp-2); padding:var(--sp-1); font-size: 14px;" title="Usuń pozycję">🗑</button>`
    : '';

  return `
    <div class="zakup-item ${item.kupione ? 'kupione' : ''}" id="zakup-${item.id}">
      <label class="zakup-check-label">
        <input type="checkbox" class="zakup-check" data-id="${item.id}"
               ${item.kupione ? 'checked' : ''}>
        <span class="zakup-check-box"></span>
      </label>
      <span class="zakup-name">${escHtml(item.nazwa)}</span>
      <span class="zakup-qty" style="margin-right:auto">${fmtQty(item.ilosc, item.jednostka)}</span>
      ${deleteBtn}
    </div>
  `;
}

function bindZakupEvents(items) {
  let saveTimer = null;

  function getCurrentState() {
    return items.map(item => ({
      id:        item.id,
      nazwa:     item.nazwa,
      jednostka: item.jednostka,
      ilosc:     item.ilosc,
      isManual:  item.isManual ?? false,
      kupione:   document.querySelector(`.zakup-check[data-id="${item.id}"]`)?.checked ?? item.kupione,
    }));
  }

  function schedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const state = getCurrentState();
      try {
        await updateSzarza(activeBatch.id, { listaZakupow: state });
      } catch (e) { toast('Błąd zapisu: ' + e.message, 'error'); }
    }, 600);
  }

  document.querySelectorAll('.zakup-check').forEach(chk => {
    chk.addEventListener('change', () => {
      const id  = chk.dataset.id;
      const row = document.getElementById(`zakup-${id}`);
      if (row) row.classList.toggle('kupione', chk.checked);
      // Update counter
      const all   = document.querySelectorAll('.zakup-check').length;
      const done  = document.querySelectorAll('.zakup-check:checked').length;
      document.querySelectorAll('.production-section span').forEach(el => {
        if (el.textContent.includes('/ ' + all + ' pozycji')) {
          el.textContent = `✅ ${done} / ${all} pozycji kupionych`;
        }
      });
      schedSave();
    });
  });

  // Delete manual item button
  document.querySelectorAll('.btn-delete-custom').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm('Czy na pewno chcesz usunąć tę pozycję z listy zakupów?')) return;
      const state = getCurrentState().filter(x => x.id !== id);
      try {
        await updateSzarza(activeBatch.id, { listaZakupow: state });
        toast('Pozycja usunięta ✓', 'success');
        // reload data triggers listener, but since we modify local activeBatch directly sometimes or wait for FB:
        // Firestore listener will fire and trigger renderContent() automatically!
      } catch (e) { toast('Błąd: ' + e.message, 'error'); }
    });
  });

  // Add custom manual item button
  document.getElementById('btn-kup-add')?.addEventListener('click', () => {
    openAddCustomZakupModal(getCurrentState());
  });

  // Copy to clipboard
  document.getElementById('btn-kup-copy')?.addEventListener('click', () => {
    const text = items
      .map(item => `• ${item.nazwa}: ${fmtQty(item.ilosc, item.jednostka)}`)
      .join('\n');
    const header = `🛒 Lista zakupów — ${activeBatch.nazwa || 'szarża'}\n${'─'.repeat(30)}\n`;
    navigator.clipboard.writeText(header + text)
      .then(() => toast('Skopiowano do schowka ✓', 'success'))
      .catch(() => toast('Nie udało się skopiować', 'error'));
  });

  // Uncheck all
  document.getElementById('btn-odznacz-all')?.addEventListener('click', () => {
    document.querySelectorAll('.zakup-check').forEach(c => {
      c.checked = false;
      const row = document.getElementById(`zakup-${c.dataset.id}`);
      if (row) row.classList.remove('kupione');
    });
    schedSave();
  });
}

async function openAddCustomZakupModal(currentState) {
  const bodyHTML = `
    <form id="custom-zakup-form" autocomplete="off">
      <div class="form-group">
        <label class="form-label" for="cz-nazwa">Nazwa składnika / opakowania *</label>
        <input type="text" class="form-input" id="cz-nazwa" placeholder="np. Słoiki 500ml, Sól peklująca..." required>
      </div>
      <div class="form-group" style="display:grid; grid-template-columns: 1fr 120px; gap: var(--sp-3)">
        <div>
          <label class="form-label" for="cz-ilosc">Ilość *</label>
          <input type="number" class="form-input" id="cz-ilosc" placeholder="0" min="0.01" step="0.01" required>
        </div>
        <div>
          <label class="form-label" for="cz-jednostka">Jednostka</label>
          <select class="form-select" id="cz-jednostka">
            <option value="szt">szt</option>
            <option value="kg">kg</option>
            <option value="opak">opak</option>
            <option value="g">g</option>
          </select>
        </div>
      </div>
    </form>
  `;
  openModal('Dodaj pozycję do zakupów', bodyHTML, {
    confirmText: 'Dodaj do listy',
    onConfirm: async () => {
      const nazwa = document.getElementById('cz-nazwa')?.value.trim();
      const ilosc = parseFloat(document.getElementById('cz-ilosc')?.value) || 0;
      const jednostka = document.getElementById('cz-jednostka')?.value || 'szt';

      if (!nazwa) { toast('Wpisz nazwę', 'warning'); document.getElementById('cz-nazwa')?.focus(); return; }
      if (ilosc <= 0) { toast('Wprowadź ilość większą od 0', 'warning'); document.getElementById('cz-ilosc')?.focus(); return; }

      const newItem = {
        id: 'manual-' + Date.now(),
        nazwa,
        ilosc,
        jednostka,
        kupione: false,
        isManual: true
      };

      const newState = [...currentState, newItem];
      const confirmBtn = document.getElementById('modal-confirm');
      if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Dodawanie…'; }

      try {
        await updateSzarza(activeBatch.id, { listaZakupow: newState });
        toast('Dodano pozycję do listy ✓', 'success');
        closeModal();
      } catch (err) {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Dodaj do listy'; }
        toast('Błąd zapisu: ' + err.message, 'error');
      }
    }
  });
}

function renderNotatki(c) {
  const saved = activeBatch.notatkiProdukcyjne || '';

  c.innerHTML = `
    <div class="production-section">
      <div style="margin-bottom:var(--sp-5)">
        <h2 style="font-size:var(--text-xl);font-weight:var(--w-bold)">Notatki produkcyjne</h2>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:2px">
          Dodatkowe uwagi, zmiany receptur, problemy, spostrzeżenia z tej szarży
        </p>
      </div>

      <textarea id="prod-notatki" class="form-textarea"
                style="min-height:280px;font-size:var(--text-md);line-height:1.7"
                placeholder="Wpisz notatki produkcyjne…">${escHtml(saved)}</textarea>

      <div style="display:flex;align-items:center;justify-content:flex-end;margin-top:var(--sp-3);gap:var(--sp-2)">
        <span id="notatki-status" style="font-size:var(--text-sm);color:var(--text-muted)"></span>
        <button class="btn btn-primary" id="btn-save-notatki">💾 Zapisz</button>
      </div>
    </div>
  `;

  let saveTimer = null;
  const ta      = document.getElementById('prod-notatki');
  const status  = document.getElementById('notatki-status');

  async function save() {
    try {
      await updateSzarza(activeBatch.id, { notatkiProdukcyjne: ta.value });
      if (status) status.textContent = '✓ Zapisano';
    } catch (e) {
      toast('Błąd: ' + e.message, 'error');
    }
  }

  ta?.addEventListener('input', () => {
    if (status) status.textContent = 'Niezapisane zmiany…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1200);
  });

  document.getElementById('btn-save-notatki')?.addEventListener('click', save);
}
