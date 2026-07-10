// ============================================================
// MODUŁ: ZAMÓWIENIA
// Etap 2 — Lista zamówień, podsumowanie, lista dostaw
// ============================================================

import {
  listenSzarze, listenZamowienia, listenKlienci, listenProdukty,
  addZamowienie, updateZamowienie, deleteZamowienie,
} from '../db.js';
import { toast, openModal, closeModal, escHtml } from '../app.js';

// ── State ─────────────────────────────────────────────────────
let allSzarze   = [];
let allKlienci  = [];
let allProdukty = [];
let zamowienia  = [];
let activeBatch = null;

let viewMode    = 'lista';   // 'lista' | 'podsumowanie' | 'dostawy'
let filterStat  = 'all';     // 'all' | 'oczekuje' | 'wydano' | 'anulowano'
let searchStr   = '';

// ── Firebase listeners ─────────────────────────────────────────
let unsubSzarze    = null;
let unsubZam       = null;
let unsubKlienci   = null;
let unsubProdukty  = null;

// ============================================================
// ENTRY POINT
// ============================================================

export async function mount(container) {
  // Reset module state to prevent singleton cache issues across mounts
  allSzarze       = [];
  allKlienci      = [];
  allProdukty     = [];
  zamowienia      = [];
  activeBatch     = null;
  unsubSzarze     = null;
  unsubZam        = null;
  unsubKlienci    = null;
  unsubProdukty   = null;

  container.innerHTML = buildShell();
  bindShellEvents();

  unsubKlienci  = listenKlienci( (d, e) => { if (!e) allKlienci  = d || []; });
  unsubProdukty = listenProdukty((d, e) => { if (!e) allProdukty = d || []; });

  unsubSzarze = listenSzarze((szarze, err) => {
    if (err) { toast('Błąd: ' + err.message, 'error'); return; }
    allSzarze = szarze || [];

    const newActive = allSzarze.find(s => !s.zarchiwizowana) || null;
    if (newActive?.id !== activeBatch?.id) {
      activeBatch = newActive;
      if (unsubZam) { unsubZam(); unsubZam = null; }
      if (activeBatch) {
        unsubZam = listenZamowienia(activeBatch.id, (data, e2) => {
          if (!e2) { zamowienia = data || []; renderContent(); updateBadges(); }
          else toast('Błąd zamówień: ' + e2.message, 'error');
        });
      } else {
        zamowienia = [];
        renderContent();
        updateBadges();
      }
    }
    renderBatchBanner();
  });

  return () => {
    [unsubSzarze, unsubZam, unsubKlienci, unsubProdukty].forEach(u => u?.());
  };
}

// ============================================================
// SHELL HTML
// ============================================================

function buildShell() {
  return `
    <!-- PAGE HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Zamówienia</h1>
        <div id="batch-banner" style="margin-top:var(--sp-1)"></div>
      </div>
      <div class="page-actions" id="header-actions">
        <div class="search-wrapper" id="search-wrap">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-input" id="search-zam"
                 placeholder="Szukaj klienta…" autocomplete="off">
        </div>
        <button class="btn btn-primary" id="btn-add-zam">+ Dodaj Zamówienie</button>
      </div>
    </div>

    <!-- VIEW TABS -->
    <div class="category-tabs" id="view-tabs">
      <button class="category-tab active" data-view="lista">
        📝 Lista <span class="category-tab-count" id="cnt-lista">0</span>
      </button>
      <button class="category-tab" data-view="podsumowanie">
        📊 Zapotrzebowanie
      </button>
      <button class="category-tab" data-view="dostawy">
        🚗 Lista dostaw <span class="category-tab-count" id="cnt-dostawy">0</span>
      </button>
    </div>

    <!-- STATUS FILTER (only in lista view) -->
    <div class="category-tabs" id="status-tabs"
         style="padding-top:0; border-top:none; background:var(--bg-main)">
      <button class="category-tab active" data-status="all">Wszystkie <span class="category-tab-count" id="cnt-all">0</span></button>
      <button class="category-tab" data-status="oczekuje">⏳ Oczekujące <span class="category-tab-count" id="cnt-oczekuje">0</span></button>
      <button class="category-tab" data-status="wydano">✓ Wydane <span class="category-tab-count" id="cnt-wydano">0</span></button>
      <button class="category-tab" data-status="anulowano">✕ Anulowane <span class="category-tab-count" id="cnt-anulowano">0</span></button>
    </div>

    <!-- CONTENT -->
    <div id="zam-content">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
  `;
}

function bindShellEvents() {
  // View tabs
  document.getElementById('view-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.category-tab');
    if (!tab) return;
    document.querySelectorAll('#view-tabs .category-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    viewMode = tab.dataset.view;
    // Show/hide status filter
    const statusTabs = document.getElementById('status-tabs');
    const searchWrap = document.getElementById('search-wrap');
    if (statusTabs) statusTabs.style.display = viewMode === 'lista' ? 'flex' : 'none';
    if (searchWrap)  searchWrap.style.display = viewMode === 'lista' ? 'block' : 'none';
    renderContent();
  });

  // Status filter
  document.getElementById('status-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.category-tab');
    if (!tab) return;
    document.querySelectorAll('#status-tabs .category-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    filterStat = tab.dataset.status;
    renderContent();
  });

  // Search
  document.getElementById('search-zam')?.addEventListener('input', e => {
    searchStr = e.target.value.toLowerCase().trim();
    renderContent();
  });

  // Add order button
  document.getElementById('btn-add-zam')?.addEventListener('click', () => {
    if (!activeBatch) { toast('Najpierw utwórz szarżę w module Szarże.', 'warning'); return; }
    openOrderModal(null);
  });
}

// ============================================================
// BATCH BANNER
// ============================================================

function renderBatchBanner() {
  const el = document.getElementById('batch-banner');
  if (!el) return;
  if (!activeBatch) {
    el.innerHTML = `<span style="font-size:var(--text-sm);color:var(--clr-warning)">
      ⚠️ Brak aktywnej szarży — przejdź do modułu <strong>Szarże</strong>, aby utworzyć nową.
    </span>`;
    const addBtn = document.getElementById('btn-add-zam');
    if (addBtn) addBtn.disabled = true;
  } else {
    const FAZY_LABEL = {
      zbieranie: '📝 Zbieranie zamówień', planowanie: '📋 Planowanie',
      produkcja: '🏭 Produkcja', sprzedaz: '💰 Sprzedaż', rozliczenie: '✅ Rozliczenie',
    };
    el.innerHTML = `<span style="font-size:var(--text-sm);color:var(--text-secondary)">
      Szarża: <strong>${escHtml(activeBatch.nazwa || '—')}</strong>
      &nbsp;·&nbsp; ${FAZY_LABEL[activeBatch.faza] || activeBatch.faza}
    </span>`;
    const addBtn = document.getElementById('btn-add-zam');
    if (addBtn) addBtn.disabled = false;
  }
}

// ============================================================
// BADGE COUNTS
// ============================================================

function updateBadges() {
  const s = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  const z = zamowienia;
  s('cnt-lista',    z.length);
  s('cnt-dostawy',  z.filter(o => o.klientDostawa && o.status !== 'anulowano').length);
  s('cnt-all',      z.length);
  s('cnt-oczekuje', z.filter(o => o.status === 'oczekuje').length);
  s('cnt-wydano',   z.filter(o => o.status === 'wydano').length);
  s('cnt-anulowano',z.filter(o => o.status === 'anulowano').length);
}

// ============================================================
// CONTENT ROUTER
// ============================================================

function renderContent() {
  const c = document.getElementById('zam-content');
  if (!c) return;

  if (!activeBatch) {
    c.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">Brak aktywnej szarży</div>
        <div class="empty-state-desc">Utwórz szarżę w module <strong>Szarże</strong>, a następnie wróć tu, aby zbierać zamówienia.</div>
      </div>
    `;
    return;
  }

  if (viewMode === 'lista')        return renderLista(c);
  if (viewMode === 'podsumowanie') return renderPodsumowanie(c);
  if (viewMode === 'dostawy')      return renderDostawy(c);
}

// ============================================================
// VIEW: LISTA ZAMÓWIEŃ
// ============================================================

function getFilteredOrders() {
  return zamowienia.filter(o => {
    const statOk = filterStat === 'all' || o.status === filterStat;
    const nameOk = !searchStr ||
      `${o.klientImie || ''} ${o.klientNazwisko || ''}`.toLowerCase().includes(searchStr);
    return statOk && nameOk;
  });
}

function renderLista(container) {
  const filtered = getFilteredOrders();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-title">Brak zamówień${filterStat !== 'all' ? ' w tej kategorii' : ''}</div>
        <div class="empty-state-desc">
          ${zamowienia.length === 0
            ? 'Dodaj pierwsze zamówienie klikając przycisk powyżej.'
            : 'Zmień filtr lub wyszukiwanie.'
          }
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="orders-list">
      ${filtered.map(renderOrderCard).join('')}
    </div>
  `;

  container.querySelectorAll('[data-order-action]').forEach(btn => {
    btn.addEventListener('click', handleOrderAction);
  });
}

function fmtPLN(val) {
  if (val == null || isNaN(val)) return '—';
  return Number(val).toFixed(2).replace('.', ',') + ' zł';
}

function fmtQty(ilosc, jednostka) {
  const n = Number(ilosc);
  if (isNaN(n)) return '—';
  return jednostka === 'szt'
    ? `${n} szt`
    : `${n % 1 === 0 ? n : n.toFixed(2).replace('.', ',')} kg`;
}

function renderOrderCard(o) {
  const fullName  = [o.klientImie, o.klientNazwisko].filter(Boolean).join(' ') || '—';
  const pozycje   = Array.isArray(o.pozycje) ? o.pozycje : [];
  const total     = pozycje.reduce((s, p) => s + (p.cena || 0) * (p.ilosc || 0), 0);

  const statusBadge = {
    oczekuje:  '<span class="badge badge-amber">⏳ Oczekuje</span>',
    wydano:    '<span class="badge badge-green">✓ Wydano</span>',
    anulowano: '<span class="badge badge-gray">✕ Anulowano</span>',
  }[o.status] || '';

  return `
    <div class="order-card status-${o.status}" id="order-${o.id}">

      <div class="order-card-header">
        <div>
          <div class="order-client-name">${escHtml(fullName)}</div>
          <div class="order-client-sub">
            ${o.klientTelefon ? `📞 ${escHtml(o.klientTelefon)}` : ''}
            ${o.klientDostawa ? '&nbsp;·&nbsp; 🚗 Dostawa' : '&nbsp;·&nbsp; 🏠 Odbiór'}
          </div>
        </div>
        <div class="order-badges">
          ${statusBadge}
          ${o.spoznione ? '<span class="badge badge-red">⚠ Spóźnione</span>' : ''}
        </div>
      </div>

      <div class="order-items-list">
        ${pozycje.length === 0
          ? '<p style="color:var(--text-muted);font-size:var(--text-sm);padding:var(--sp-2) 0">Brak pozycji</p>'
          : pozycje.map(p => `
              <div class="order-item-row">
                <span class="order-item-name">${escHtml(p.produktNazwa || '—')}</span>
                <span class="order-item-qty">${fmtQty(p.ilosc, p.jednostka)}</span>
                <span class="order-item-val">${fmtPLN((p.cena || 0) * (p.ilosc || 0))}</span>
              </div>
            `).join('')
        }
      </div>

      ${o.notatki ? `
        <div class="order-note">💬 ${escHtml(o.notatki)}</div>
      ` : ''}

      <div class="order-footer">
        <div class="order-total">${fmtPLN(total)}</div>
        <div class="order-actions">
          ${o.status === 'oczekuje' ? `
            <button class="btn btn-success btn-sm"
                    data-order-action="wydaj" data-id="${o.id}">✓ Wydaj</button>
          ` : ''}
          <button class="btn btn-secondary btn-sm"
                  data-order-action="edit" data-id="${o.id}">✏️ Edytuj</button>
          ${o.status !== 'anulowano' ? `
            <button class="btn btn-ghost btn-sm" style="color:var(--clr-danger)"
                    data-order-action="anuluj" data-id="${o.id}">✕ Anuluj</button>
          ` : `
            <button class="btn btn-ghost btn-sm" style="color:var(--clr-danger)"
                    data-order-action="delete" data-id="${o.id}">🗑 Usuń</button>
          `}
        </div>
      </div>
    </div>
  `;
}

async function handleOrderAction(e) {
  const btn    = e.currentTarget;
  const action = btn.dataset.orderAction;
  const id     = btn.dataset.id;
  const o      = zamowienia.find(x => x.id === id);

  switch (action) {
    case 'edit':
      if (o) openOrderModal(o);
      break;

    case 'wydaj':
      if (!o) return;
      if (!confirm(`Oznaczyć zamówienie klienta "${[o.klientImie, o.klientNazwisko].filter(Boolean).join(' ')}" jako WYDANE?`)) return;
      try { await updateZamowienie(id, { status: 'wydano' }); toast('Zamówienie wydane ✓', 'success'); }
      catch (err) { toast(err.message, 'error'); }
      break;

    case 'anuluj':
      if (!o) return;
      if (!confirm('Anulować to zamówienie?')) return;
      try { await updateZamowienie(id, { status: 'anulowano' }); toast('Zamówienie anulowane', 'warning'); }
      catch (err) { toast(err.message, 'error'); }
      break;

    case 'delete':
      if (!confirm('Usunąć to zamówienie na stałe?')) return;
      try { await deleteZamowienie(id); toast('Zamówienie usunięte', 'success'); }
      catch (err) { toast(err.message, 'error'); }
      break;
  }
}

// ============================================================
// VIEW: PODSUMOWANIE ZAPOTRZEBOWANIA
// ============================================================

function renderPodsumowanie(container) {
  const activeOrders = zamowienia.filter(o => o.status !== 'anulowano');

  if (activeOrders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-title">Brak zamówień do podsumowania</div>
        <div class="empty-state-desc">Dodaj zamówienia, aby zobaczyć zapotrzebowanie na produkty.</div>
      </div>
    `;
    return;
  }

  // Aggregate by product
  const agg = {};  // produktId → { nazwa, jednostka, ilosc, zamCount }
  activeOrders.forEach(o => {
    (o.pozycje || []).forEach(p => {
      const key = p.produktId || p.produktNazwa;
      if (!agg[key]) {
        agg[key] = { nazwa: p.produktNazwa || '—', jednostka: p.jednostka || 'kg', ilosc: 0, count: 0 };
      }
      agg[key].ilosc += Number(p.ilosc) || 0;
      agg[key].count += 1;
    });
  });

  const rows = Object.values(agg).sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));

  if (rows.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-title">Brak pozycji w zamówieniach</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="summary-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-4);flex-wrap:wrap;gap:var(--sp-3)">
        <div>
          <h2 style="font-size:var(--text-xl);font-weight:var(--w-bold)">Zapotrzebowanie produkcyjne</h2>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:var(--sp-1)">
            Na podstawie ${activeOrders.length} aktywnych zamówień
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" id="btn-print-summary" onclick="window.print()">
          🖨️ Drukuj
        </button>
      </div>

      <div class="summary-table-wrap">
        <table class="summary-table">
          <thead>
            <tr>
              <th>Produkt</th>
              <th>Ilość do produkcji</th>
              <th>Liczba zamówień</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${escHtml(r.nazwa)}</td>
                <td><span class="summary-qty">${fmtQty(r.ilosc, r.jednostka)}</span></td>
                <td style="color:var(--text-secondary)">${r.count} zam.</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:var(--sp-4);text-align:center">
        ⚠️ Ilości pokazują zamówione wartości — finalna waga przy wydaniu może się różnić (zaokrąglenie do pęta/sztuki).
      </p>
    </div>
  `;
}

// ============================================================
// VIEW: LISTA DOSTAW
// ============================================================

function renderDostawy(container) {
  const toDeliver = zamowienia.filter(o =>
    o.klientDostawa && o.status !== 'anulowano'
  );

  if (toDeliver.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🚗</div>
        <div class="empty-state-title">Brak zamówień z dostawą</div>
        <div class="empty-state-desc">
          Klienci ze znacznikiem "dostawa" pojawią się tu jako lista do rozwozu.
        </div>
      </div>
    `;
    return;
  }

  const waiting   = toDeliver.filter(o => o.status !== 'wydano');
  const delivered = toDeliver.filter(o => o.status === 'wydano');

  let html = '<div class="delivery-section">';

  if (waiting.length > 0) {
    html += `<h2 class="section-title">🕓 Do dowozu (${waiting.length})</h2>`;
    waiting.forEach(o => { html += renderDeliveryCard(o, false); });
  }

  if (delivered.length > 0) {
    html += `<h2 class="section-title" style="margin-top:var(--sp-4)">✅ Dostarczone (${delivered.length})</h2>`;
    delivered.forEach(o => { html += renderDeliveryCard(o, true); });
  }

  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('[data-del-action]').forEach(btn => {
    btn.addEventListener('click', handleDeliveryAction);
  });
}

function renderDeliveryCard(o, delivered) {
  const fullName = [o.klientImie, o.klientNazwisko].filter(Boolean).join(' ') || '—';
  const pozycje  = Array.isArray(o.pozycje) ? o.pozycje : [];
  const total    = pozycje.reduce((s, p) => s + (p.cena || 0) * (p.ilosc || 0), 0);

  return `
    <div class="delivery-card ${delivered ? 'delivered' : ''}" id="del-${o.id}">

      <div class="delivery-card-header">
        <div class="delivery-client">
          <h3>${escHtml(fullName)}</h3>
          ${o.klientAdres ? `<div class="address">📍 ${escHtml(o.klientAdres)}</div>` : ''}
          ${o.klientTelefon
            ? `<div class="address"><a href="tel:${encodeURIComponent(o.klientTelefon)}" style="color:var(--clr-info)">📞 ${escHtml(o.klientTelefon)}</a></div>`
            : ''
          }
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:var(--sp-2)">
          <span style="font-size:var(--text-xl);font-weight:var(--w-bold)">${fmtPLN(total)}</span>
          ${!delivered ? `
            <button class="btn btn-success btn-sm" data-del-action="wydaj" data-id="${o.id}">
              ✓ Dostarczone
            </button>
          ` : '<span class="badge badge-green">✓ Dostarczone</span>'}
        </div>
      </div>

      <div class="delivery-items">
        ${pozycje.map(p => `
          <div class="delivery-item">
            <span class="delivery-item-name">${escHtml(p.produktNazwa || '—')}</span>
            <span class="delivery-item-qty">${fmtQty(p.ilosc, p.jednostka)}</span>
          </div>
        `).join('')}
        ${o.notatki ? `
          <div style="padding:var(--sp-2) 0;font-size:var(--text-sm);color:var(--text-secondary);font-style:italic">
            💬 ${escHtml(o.notatki)}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

async function handleDeliveryAction(e) {
  const btn    = e.currentTarget;
  const action = btn.dataset.delAction;
  const id     = btn.dataset.id;
  const o      = zamowienia.find(x => x.id === id);

  if (action === 'wydaj' && o) {
    const name = [o.klientImie, o.klientNazwisko].filter(Boolean).join(' ');
    if (!confirm(`Potwierdzić dostawę do "${name}"?`)) return;
    try { await updateZamowienie(id, { status: 'wydano' }); toast(`Dostawa do "${name}" potwierdzona ✓`, 'success'); }
    catch (err) { toast(err.message, 'error'); }
  }
}

// ============================================================
// ORDER FORM MODAL
// ============================================================

function openOrderModal(existing) {
  const isEdit = !!existing;

  // ── Exclude clients who already have an active order in this batch ──
  const takenIds = new Set(
    zamowienia
      .filter(z => z.status !== 'anulowano' && z.id !== (existing?.id))
      .map(z => z.klientId)
      .filter(Boolean)
  );

  const klienci = [...allKlienci]
    .filter(k => !takenIds.has(k.id))
    .sort((a, b) => (a.nazwisko || '').localeCompare(b.nazwisko || '', 'pl'));

  const filteredOut = allKlienci.length - klienci.length;
  const produkty    = allProdukty.filter(p => p.aktywny !== false);


  // Build picked state from existing order
  const picked = {};   // produktId → { ilosc: number }
  if (isEdit && existing.pozycje) {
    existing.pozycje.forEach(p => { picked[p.produktId] = { ilosc: p.ilosc }; });
  }

  const selectedKlientId = isEdit ? (existing.klientId || '') : '';

  openModal(
    isEdit ? 'Edytuj Zamówienie' : 'Nowe Zamówienie',
    buildOrderForm(klienci, produkty, picked, selectedKlientId, existing?.notatki || '', existing?.spoznione, filteredOut),
    {
      confirmText:  isEdit ? 'Zapisz zmiany' : 'Zapisz Zamówienie',
      confirmClass: 'btn-primary',
      maxWidth:     '680px',
      onConfirm:    () => saveOrder(existing, picked),
    }
  );

  // Bind qty controls inside modal
  bindPickerEvents(produkty, picked);
}

function buildOrderForm(klienci, produkty, picked, selectedKlientId, notatki, spoznione, filteredOut = 0) {
  const klientOptions = klienci.length === 0
    ? '<option value="" disabled>Wszyscy klienci mają już złożone zamówienie w tej szarży</option>'
    : klienci.map(k => {
        const name = [k.imie, k.nazwisko].filter(Boolean).join(' ');
        const sel  = k.id === selectedKlientId ? 'selected' : '';
        return `<option value="${k.id}" ${sel}>${escHtml(name)}${k.dostawa ? ' 🚗' : ''}</option>`;
      }).join('');

  const filteredNote = filteredOut > 0
    ? `<p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:var(--sp-1)">
         ℹ️ ${filteredOut} klient${filteredOut === 1 ? '' : 'ów'} ukryt${filteredOut === 1 ? 'y' : 'ych'} — już ${filteredOut === 1 ? 'ma' : 'mają'} zamówienie w tej szarży
       </p>`
    : '';

  const prodRows = produkty.length === 0
    ? '<div style="padding:var(--sp-4);color:var(--text-muted);text-align:center">Brak aktywnych produktów</div>'
    : produkty.map(p => {
        const ilosc = picked[p.id]?.ilosc || 0;
        const step  = p.jednostka === 'szt' ? 1 : 0.5;
        return `
          <div class="product-pick-row ${ilosc > 0 ? 'selected' : ''}" id="ppr-${p.id}">
            <div class="product-pick-info">
              <div class="product-pick-name">${escHtml(p.nazwa)}</div>
              <div class="product-pick-price">${fmtPLN(p.cena)} / ${p.jednostka === 'szt' ? 'szt' : 'kg'}</div>
            </div>
            <div class="qty-control">
              <button type="button" class="qty-btn minus"
                      data-pid="${p.id}" data-step="${step}"
                      ${ilosc <= 0 ? 'disabled' : ''}>−</button>
              <input type="number" class="qty-input" id="qty-${p.id}"
                     value="${ilosc > 0 ? ilosc : ''}" placeholder="0"
                     min="0" step="${step}" data-pid="${p.id}">
              <button type="button" class="qty-btn plus"
                      data-pid="${p.id}" data-step="${step}">+</button>
            </div>
          </div>
        `;
      }).join('');

  const initTotal = produkty
    .filter(p => (picked[p.id]?.ilosc || 0) > 0)
    .reduce((s, p) => s + (p.cena || 0) * (picked[p.id]?.ilosc || 0), 0);

  return `
    <form id="order-form" autocomplete="off" novalidate>

      <div class="form-group">
        <label class="form-label" for="o-klient">Klient *</label>
        <select class="form-select" id="o-klient">
          <option value="">— wybierz klienta —</option>
          ${klientOptions}
        </select>
        ${filteredNote}
      </div>

      <div class="form-group">
        <label class="form-label">Produkty i ilości *</label>
        <p style="font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)">
          Użyj przycisków + / − lub wpisz ilość ręcznie. Krok: 0,5 kg / 1 szt.
        </p>
        <div class="product-picker" id="product-picker">
          ${prodRows}
        </div>
      </div>

      <div class="order-form-total">
        <span class="order-form-total-label">Szacunkowa wartość:</span>
        <span class="order-form-total-value" id="order-total-display">${fmtPLN(initTotal)}</span>
      </div>

      <div class="form-group" style="margin-top:var(--sp-5)">
        <div class="toggle-group">
          <label class="toggle">
            <input type="checkbox" id="o-spoznione" ${spoznione ? 'checked' : ''}>
            <div class="toggle-slider"></div>
          </label>
          <span class="toggle-text">⚠️ Zamówienie spóźnione (po zamknięciu zbierania)</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="o-notatki">Notatki (opcjonalnie)</label>
        <textarea class="form-textarea" id="o-notatki"
                  placeholder="np. poproszono o cienkie plasterki, odbiór w sobotę rano…">${escHtml(notatki)}</textarea>
      </div>

    </form>
  `;
}

function bindPickerEvents(produkty, picked) {
  const totalEl = document.getElementById('order-total-display');

  function recalcTotal() {
    const total = produkty.reduce((s, p) => {
      const ilosc = picked[p.id]?.ilosc || 0;
      return s + (p.cena || 0) * ilosc;
    }, 0);
    if (totalEl) totalEl.textContent = fmtPLN(total);
  }

  function setQty(pid, newVal) {
    const p    = produkty.find(x => x.id === pid);
    if (!p) return;
    const step = p.jednostka === 'szt' ? 1 : 0.5;
    const val  = Math.max(0, Math.round(newVal / step) * step);

    const input  = document.getElementById(`qty-${pid}`);
    const row    = document.getElementById(`ppr-${pid}`);
    const minBtn = document.querySelector(`.qty-btn.minus[data-pid="${pid}"]`);

    if (val > 0) {
      picked[pid] = { ilosc: val };
      if (input) input.value = val;
      if (row)   row.classList.add('selected');
      if (minBtn) minBtn.disabled = false;
    } else {
      delete picked[pid];
      if (input) input.value = '';
      if (row)   row.classList.remove('selected');
      if (minBtn) minBtn.disabled = true;
    }

    recalcTotal();
  }

  // + / − buttons
  document.querySelectorAll('#product-picker .qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid  = btn.dataset.pid;
      const step = parseFloat(btn.dataset.step) || 0.5;
      const cur  = picked[pid]?.ilosc || 0;
      const dir  = btn.classList.contains('plus') ? 1 : -1;
      setQty(pid, cur + dir * step);
    });
  });

  // Direct input
  document.querySelectorAll('#product-picker .qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const pid = input.dataset.pid;
      const val = parseFloat(input.value) || 0;
      setQty(pid, val);
    });
  });
}

async function saveOrder(existing, picked) {
  const klientId = document.getElementById('o-klient')?.value;
  const notatki  = document.getElementById('o-notatki')?.value.trim();
  const spoznione = document.getElementById('o-spoznione')?.checked ?? false;

  if (!klientId) { toast('Wybierz klienta', 'warning'); document.getElementById('o-klient')?.focus(); return; }

  const pozycje = Object.entries(picked)
    .map(([pid, { ilosc }]) => {
      const p = allProdukty.find(x => x.id === pid);
      if (!p || ilosc <= 0) return null;
      return {
        produktId:    p.id,
        produktNazwa: p.nazwa,
        jednostka:    p.jednostka || 'kg',
        ilosc,
        cena:         p.cena || 0,
      };
    })
    .filter(Boolean);

  if (pozycje.length === 0) { toast('Dodaj co najmniej jeden produkt do zamówienia', 'warning'); return; }

  const klient = allKlienci.find(k => k.id === klientId);
  if (!klient) { toast('Nie znaleziono klienta', 'error'); return; }

  const btn = document.getElementById('modal-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Zapisywanie…'; }

  try {
    const data = {
      szarzaId:        activeBatch.id,
      klientId:        klient.id,
      klientImie:      klient.imie      || '',
      klientNazwisko:  klient.nazwisko  || '',
      klientTelefon:   klient.telefon   || '',
      klientDostawa:   klient.dostawa   ?? false,
      klientAdres:     klient.adresDost || '',
      pozycje,
      notatki:    notatki || '',
      spoznione,
    };

    if (existing) {
      await updateZamowienie(existing.id, data);
      toast('Zamówienie zaktualizowane ✓', 'success');
    } else {
      await addZamowienie(data);
      toast('Zamówienie dodane ✓', 'success');
    }
    closeModal();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = existing ? 'Zapisz zmiany' : 'Zapisz Zamówienie'; }
    toast('Błąd: ' + err.message, 'error');
  }
}
