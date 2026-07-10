// ============================================================
// MODUŁ: SPRZEDAŻ — Wydawanie zamówień, korekta wagi, płatności
// Etap 3
// ============================================================

import {
  listenSzarze, listenZamowienia,
  updateZamowienie,
} from '../db.js';
import { toast, openModal, closeModal, escHtml } from '../app.js';

// ── State ─────────────────────────────────────────────────────
let activeBatch  = null;
let zamowienia   = [];
let unsubSzarze  = null;
let unsubZam     = null;

// ── Filter ────────────────────────────────────────────────────
let filterOdbior  = 'all';       // 'all' | 'odbior' | 'dostawa'
let filterStatus  = 'oczekuje';  // 'all' | 'oczekuje' | 'wydano'

// ============================================================
// ENTRY POINT
// ============================================================

export async function mount(container) {
  // Reset module state to prevent singleton cache issues across mounts
  activeBatch   = null;
  zamowienia    = [];
  unsubSzarze   = null;
  unsubZam      = null;

  container.innerHTML = buildShell();
  bindShellEvents();

  unsubSzarze = listenSzarze((szarze, err) => {
    if (err) { toast('Błąd: ' + err.message, 'error'); return; }
    const newActive = (szarze || []).find(s => !s.zarchiwizowana) || null;

    if (newActive?.id !== activeBatch?.id) {
      activeBatch = newActive;
      if (unsubZam) { unsubZam(); unsubZam = null; }
      if (activeBatch) {
        unsubZam = listenZamowienia(activeBatch.id, (data, e2) => {
          if (!e2) { zamowienia = data || []; renderContent(); updateBadges(); }
        });
      } else {
        zamowienia = [];
        renderContent();
        updateBadges();
      }
    }
    renderBatchBanner();
  });

  return () => { [unsubSzarze, unsubZam].forEach(u => u?.()); };
}

// ============================================================
// SHELL
// ============================================================

function buildShell() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Sprzedaż</h1>
        <div id="sprzedaz-banner" style="margin-top:var(--sp-1)"></div>
      </div>
      <div class="page-actions">
        <div id="sprzedaz-summary-strip"></div>
      </div>
    </div>

    <!-- ODBIÓR / DOSTAWA FILTER -->
    <div class="category-tabs" id="odbior-tabs">
      <button class="category-tab active" data-odbior="all">
        Wszystkie <span class="category-tab-count" id="cnt-sp-all">0</span>
      </button>
      <button class="category-tab" data-odbior="odbior">
        🏠 Odbiór <span class="category-tab-count" id="cnt-sp-odbior">0</span>
      </button>
      <button class="category-tab" data-odbior="dostawa">
        🚗 Dostawa <span class="category-tab-count" id="cnt-sp-dostawa">0</span>
      </button>
    </div>

    <!-- STATUS FILTER -->
    <div class="category-tabs" id="status-sp-tabs"
         style="padding-top:0;border-top:none;background:var(--bg-main)">
      <button class="category-tab active" data-spstat="oczekuje">
        ⏳ Oczekujące <span class="category-tab-count" id="cnt-sp-oczek">0</span>
      </button>
      <button class="category-tab" data-spstat="all">
        Wszystkie <span class="category-tab-count" id="cnt-sp-total">0</span>
      </button>
      <button class="category-tab" data-spstat="wydano">
        ✅ Wydane <span class="category-tab-count" id="cnt-sp-wydano">0</span>
      </button>
    </div>

    <div id="sprzedaz-content">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
  `;
}

function bindShellEvents() {
  document.getElementById('odbior-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.category-tab');
    if (!tab) return;
    document.querySelectorAll('#odbior-tabs .category-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    filterOdbior = tab.dataset.odbior;
    renderContent();
  });

  document.getElementById('status-sp-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.category-tab');
    if (!tab) return;
    document.querySelectorAll('#status-sp-tabs .category-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    filterStatus = tab.dataset.spstat;
    renderContent();
  });
}

// ============================================================
// BANNER & BADGES
// ============================================================

function renderBatchBanner() {
  const el = document.getElementById('sprzedaz-banner');
  if (!el) return;
  const FAZY = { zbieranie:'📝 Zbieranie', planowanie:'📋 Planowanie', produkcja:'🏭 Produkcja', sprzedaz:'💰 Sprzedaż', rozliczenie:'✅ Rozliczenie' };
  if (!activeBatch) {
    el.innerHTML = `<span style="font-size:var(--text-sm);color:var(--clr-warning)">⚠️ Brak aktywnej szarży</span>`;
  } else {
    el.innerHTML = `<span style="font-size:var(--text-sm);color:var(--text-secondary)">
      Szarża: <strong>${escHtml(activeBatch.nazwa || '—')}</strong>
      &nbsp;·&nbsp; ${FAZY[activeBatch.faza] || activeBatch.faza}
    </span>`;
  }
}

function updateBadges() {
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const z = zamowienia.filter(o => o.status !== 'anulowano');

  s('cnt-sp-all',    z.length);
  s('cnt-sp-odbior', z.filter(o => !o.klientDostawa).length);
  s('cnt-sp-dostawa',z.filter(o => o.klientDostawa).length);
  s('cnt-sp-total',  z.length);
  s('cnt-sp-oczek',  z.filter(o => o.status === 'oczekuje').length);
  s('cnt-sp-wydano', z.filter(o => o.status === 'wydano').length);

  // Summary strip
  const strip  = document.getElementById('sprzedaz-summary-strip');
  const paid   = z.filter(o => o.platnosc === 'gotowka' || o.platnosc === 'przelew');
  const unpaid = z.filter(o => !o.platnosc || o.platnosc === 'nieoplacone');
  const totalVal   = z.reduce((s, o) => s + calcTotal(o), 0);
  const paidVal    = paid.reduce((s, o) => s + calcFinalTotal(o), 0);
  const unpaidVal  = unpaid.filter(o => o.status !== 'anulowano').reduce((s, o) => s + calcFinalTotal(o), 0);

  if (strip) {
    strip.innerHTML = `
      <div class="sprzedaz-strip">
        <div class="strip-item">
          <span class="strip-label">Wartość szarży</span>
          <span class="strip-value">${fmtPLN(totalVal)}</span>
        </div>
        <div class="strip-item">
          <span class="strip-label">Zapłacone</span>
          <span class="strip-value" style="color:var(--clr-success)">${fmtPLN(paidVal)}</span>
        </div>
        <div class="strip-item">
          <span class="strip-label">Do zapłaty</span>
          <span class="strip-value" style="color:${unpaidVal > 0 ? 'var(--clr-warning)' : 'var(--text-muted)'}">${fmtPLN(unpaidVal)}</span>
        </div>
      </div>
    `;
  }
}

// ============================================================
// HELPERS
// ============================================================

function fmtPLN(v) {
  return (v || 0).toFixed(2).replace('.', ',') + ' zł';
}

function fmtQty(ilosc, jednostka) {
  const n = Number(ilosc);
  if (isNaN(n)) return '—';
  return jednostka === 'szt'
    ? `${n} szt`
    : `${n % 1 === 0 ? n : n.toFixed(2).replace('.', ',')} kg`;
}

function calcTotal(o) {
  return (o.pozycje || []).reduce((s, p) => s + (p.cena || 0) * (p.ilosc || 0), 0);
}

function calcFinalTotal(o) {
  // Use corrected qty if available, else original
  return (o.pozycje || []).reduce((s, p) =>
    s + (p.cena || 0) * (p.iloscWydana ?? p.ilosc ?? 0), 0);
}

// ============================================================
// CONTENT ROUTER
// ============================================================

function renderContent() {
  const c = document.getElementById('sprzedaz-content');
  if (!c) return;

  if (!activeBatch) {
    c.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💰</div>
        <div class="empty-state-title">Brak aktywnej szarży</div>
        <div class="empty-state-desc">Utwórz szarżę, aby zarządzać sprzedażą.</div>
      </div>`;
    return;
  }

  const z = zamowienia.filter(o => o.status !== 'anulowano');
  let filtered = z;

  // Odbiór filter
  if (filterOdbior === 'odbior')  filtered = filtered.filter(o => !o.klientDostawa);
  if (filterOdbior === 'dostawa') filtered = filtered.filter(o => o.klientDostawa);

  // Status filter
  if (filterStatus === 'oczekuje') filtered = filtered.filter(o => o.status === 'oczekuje');
  if (filterStatus === 'wydano')   filtered = filtered.filter(o => o.status === 'wydano');

  if (filtered.length === 0) {
    c.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💰</div>
        <div class="empty-state-title">Brak zamówień w tej kategorii</div>
        <div class="empty-state-desc">Zmień filtr lub dodaj zamówienia w module Zamówienia.</div>
      </div>`;
    return;
  }

  c.innerHTML = `
    <div class="sprzedaz-list">
      ${filtered.map(o => renderSprzedazCard(o)).join('')}
    </div>
  `;

  c.querySelectorAll('[data-sp-action]').forEach(btn => {
    btn.addEventListener('click', handleSprzedazAction);
  });
}

// ============================================================
// SPRZEDAŻ CARD
// ============================================================

function renderSprzedazCard(o) {
  const name    = [o.klientImie, o.klientNazwisko].filter(Boolean).join(' ') || '—';
  const pozycje = Array.isArray(o.pozycje) ? o.pozycje : [];
  const total   = calcFinalTotal(o);

  const PLATNOSC = {
    gotowka:     '<span class="badge badge-green">💵 Gotówka</span>',
    przelew:     '<span class="badge badge-blue">💳 Przelew</span>',
    nieoplacone: '<span class="badge badge-red">❌ Nieopłacone</span>',
  };
  const statusBadge = o.status === 'wydano'
    ? '<span class="badge badge-green">✅ Wydano</span>'
    : '<span class="badge badge-amber">⏳ Oczekuje</span>';

  return `
    <div class="sprzedaz-card status-${o.status}" id="sp-${o.id}">

      <div class="sprzedaz-card-header">
        <div class="sprzedaz-client">
          <div class="sprzedaz-client-name">${escHtml(name)}</div>
          <div class="sprzedaz-client-meta">
            ${o.klientTelefon ? `<a href="tel:${encodeURIComponent(o.klientTelefon)}" style="color:var(--clr-info)">📞 ${escHtml(o.klientTelefon)}</a>` : ''}
            ${o.klientDostawa ? '&nbsp;·&nbsp; 🚗 Dostawa' : '&nbsp;·&nbsp; 🏠 Odbiór własny'}
          </div>
        </div>
        <div class="sprzedaz-card-badges">
          ${statusBadge}
          ${o.platnosc ? (PLATNOSC[o.platnosc] || '') : ''}
        </div>
      </div>

      <!-- Items z korekta wagi -->
      <div class="sprzedaz-items">
        ${pozycje.map(p => {
          const iloscWydana = p.iloscWydana ?? p.ilosc;
          const wartoscFin  = (p.cena || 0) * iloscWydana;
          const wasCorr     = p.iloscWydana != null && p.iloscWydana !== p.ilosc;
          return `
            <div class="sprzedaz-item">
              <span class="sprzedaz-item-name">${escHtml(p.produktNazwa || '—')}</span>
              <span class="sprzedaz-item-qty">
                ${wasCorr
                  ? `<s style="color:var(--text-muted)">${fmtQty(p.ilosc, p.jednostka)}</s>
                     <strong>${fmtQty(iloscWydana, p.jednostka)}</strong>`
                  : fmtQty(iloscWydana, p.jednostka)
                }
              </span>
              <span class="sprzedaz-item-val">${fmtPLN(wartoscFin)}</span>
            </div>`;
        }).join('')}
      </div>

      ${o.notatki ? `<div class="order-note" style="margin:var(--sp-2) 0">💬 ${escHtml(o.notatki)}</div>` : ''}

      <div class="sprzedaz-card-footer">
        <div class="sprzedaz-total">
          <span style="font-size:var(--text-sm);color:var(--text-muted)">Razem:</span>
          <span style="font-size:var(--text-xl);font-weight:var(--w-bold)">${fmtPLN(total)}</span>
        </div>
        <div class="sprzedaz-card-actions">
          ${o.status === 'oczekuje' ? `
            <button class="btn btn-secondary btn-sm"
                    data-sp-action="koryguj" data-id="${o.id}">⚖️ Koryguj wagę</button>
            <button class="btn btn-success btn-sm"
                    data-sp-action="wydaj" data-id="${o.id}">✅ Wydaj</button>
          ` : ''}
          ${o.status === 'wydano' ? `
            <button class="btn btn-secondary btn-sm"
                    data-sp-action="koryguj" data-id="${o.id}">⚖️ Koryguj wagę</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--clr-warning)"
                    data-sp-action="cofnij" data-id="${o.id}">↩ Cofnij</button>
          ` : ''}
          ${o.status === 'wydano' && !o.platnosc ? `
            <button class="btn btn-primary btn-sm"
                    data-sp-action="platnosc" data-id="${o.id}">💳 Zarejestruj płatność</button>
          ` : ''}
          ${o.status === 'wydano' && o.platnosc ? `
            <button class="btn btn-ghost btn-sm" style="color:var(--text-muted)"
                    data-sp-action="platnosc" data-id="${o.id}">✏️ Zmień płatność</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

async function handleSprzedazAction(e) {
  const btn    = e.currentTarget;
  const action = btn.dataset.spAction;
  const id     = btn.dataset.id;
  const o      = zamowienia.find(x => x.id === id);
  if (!o) return;

  if (action === 'cofnij') {
    const name = [o.klientImie, o.klientNazwisko].filter(Boolean).join(' ');
    if (!confirm(`Cofnąć zamówienie klienta "${name}" z powrotem do stanu "Oczekuje"?`)) return;
    try {
      await updateZamowienie(id, { status: 'oczekuje' });
      toast(`Zamówienie cofnięte — ${name}`, 'warning');
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  if (action === 'wydaj') {
    const name = [o.klientImie, o.klientNazwisko].filter(Boolean).join(' ');
    if (!confirm(`Wydać zamówienie klienta "${name}"?`)) return;
    try {
      await updateZamowienie(id, { status: 'wydano' });
      toast(`Zamówienie wydane — ${name} ✓`, 'success');
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  if (action === 'koryguj') {
    openKorektaModal(o);
    return;
  }

  if (action === 'platnosc') {
    openPlatnoscModal(o);
    return;
  }
}

// ============================================================
// MODAL: KOREKTA WAGI
// ============================================================

function openKorektaModal(o) {
  const name    = [o.klientImie, o.klientNazwisko].filter(Boolean).join(' ') || '—';
  const pozycje = Array.isArray(o.pozycje) ? o.pozycje : [];

  openModal(`⚖️ Korekta wagi — ${name}`,
    `<form id="korrekta-form" autocomplete="off">
      <p style="font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-4)">
        Wprowadź faktycznie wydaną ilość dla każdego produktu.<br>
        Wartość zostanie automatycznie przeliczona.
      </p>
      ${pozycje.map((p, i) => {
        const iloscWydana = p.iloscWydana ?? p.ilosc;
        const step        = p.jednostka === 'szt' ? 1 : 0.01;
        return `
          <div class="form-group" style="margin-bottom:var(--sp-4)">
            <label class="form-label">${escHtml(p.produktNazwa || '—')}</label>
            <div style="display:flex;align-items:center;gap:var(--sp-3)">
              <input type="number" class="form-input" id="kor-qty-${i}"
                     value="${iloscWydana}" min="0" step="${step}"
                     style="max-width:140px">
              <span style="color:var(--text-muted);font-size:var(--text-sm)">
                ${p.jednostka === 'szt' ? 'szt' : 'kg'}
                &nbsp;·&nbsp; zam. <strong>${fmtQty(p.ilosc, p.jednostka)}</strong>
              </span>
            </div>
            <div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:4px" id="kor-val-${i}">
              ${fmtPLN((p.cena || 0) * iloscWydana)}
            </div>
          </div>`;
      }).join('')}
      <div class="order-form-total" id="kor-total-row">
        <span class="order-form-total-label">Szacunkowa wartość:</span>
        <span class="order-form-total-value" id="kor-total">
          ${fmtPLN(pozycje.reduce((s, p) => s + (p.cena || 0) * (p.iloscWydana ?? p.ilosc), 0))}
        </span>
      </div>
    </form>`,
    {
      confirmText:  'Zapisz korektę',
      confirmClass: 'btn-primary',
      maxWidth:     '520px',
      onConfirm:    () => saveKorekta(o, pozycje),
    }
  );

  // Live total recalc
  pozycje.forEach((p, i) => {
    const input = document.getElementById(`kor-qty-${i}`);
    if (!input) return;
    const recalc = () => {
      const val  = Math.max(0, parseFloat(input.value) || 0);
      const cena = p.cena || 0;
      const valEl = document.getElementById(`kor-val-${i}`);
      if (valEl) valEl.textContent = fmtPLN(cena * val);
      // Recalc total
      let total = 0;
      pozycje.forEach((pp, ii) => {
        const inp = document.getElementById(`kor-qty-${ii}`);
        total += (pp.cena || 0) * (parseFloat(inp?.value) || 0);
      });
      const totEl = document.getElementById('kor-total');
      if (totEl) totEl.textContent = fmtPLN(total);
    };
    input.addEventListener('input', recalc);
  });
}

async function saveKorekta(o, pozycje) {
  const updated = pozycje.map((p, i) => ({
    ...p,
    iloscWydana: Math.max(0, parseFloat(document.getElementById(`kor-qty-${i}`)?.value) || 0),
  }));

  const btn = document.getElementById('modal-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Zapisywanie…'; }

  try {
    await updateZamowienie(o.id, { pozycje: updated });
    toast('Korekta wagi zapisana ✓', 'success');
    closeModal();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Zapisz korektę'; }
    toast('Błąd: ' + err.message, 'error');
  }
}

// ============================================================
// MODAL: PŁATNOŚĆ
// ============================================================

function openPlatnoscModal(o) {
  const name  = [o.klientImie, o.klientNazwisko].filter(Boolean).join(' ') || '—';
  const total = calcFinalTotal(o);
  const cur   = o.platnosc || '';

  openModal(`💳 Płatność — ${name}`,
    `<form id="platnosc-form">
      <p style="color:var(--text-secondary);margin-bottom:var(--sp-5)">
        Do zapłaty: <strong style="font-size:var(--text-xl)">${fmtPLN(total)}</strong>
      </p>

      <div class="form-group">
        <label class="form-label">Sposób płatności</label>
        <div style="display:flex;flex-direction:column;gap:var(--sp-3);margin-top:var(--sp-2)">
          ${[
            ['gotowka',     '💵 Gotówka',     'Zapłacono gotówką'],
            ['przelew',     '💳 Przelew',      'Przelew bankowy / BLIK'],
            ['nieoplacone', '❌ Nieopłacone',  'Odebrane, ale jeszcze nie zapłacone'],
          ].map(([val, label, desc]) => `
            <label class="payment-option ${cur === val ? 'selected' : ''}" id="popt-${val}">
              <input type="radio" name="platnosc" value="${val}" ${cur === val ? 'checked' : ''}
                     id="prad-${val}" style="display:none">
              <div>
                <div style="font-size:var(--text-md);font-weight:var(--w-semibold)">${label}</div>
                <div style="font-size:var(--text-sm);color:var(--text-muted)">${desc}</div>
              </div>
            </label>
          `).join('')}
        </div>
      </div>
    </form>`,
    {
      confirmText:  'Zapisz',
      confirmClass: 'btn-primary',
      maxWidth:     '460px',
      onConfirm:    () => savePlatnosc(o.id),
    }
  );

  document.querySelectorAll('input[name="platnosc"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.payment-option').forEach(el => el.classList.remove('selected'));
      document.getElementById(`popt-${radio.value}`)?.classList.add('selected');
    });
  });

  document.querySelectorAll('.payment-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const radio = opt.querySelector('input[type=radio]');
      if (radio) radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio?.click();
    });
  });
}

async function savePlatnosc(id) {
  const val = document.querySelector('input[name="platnosc"]:checked')?.value;
  if (!val) { toast('Wybierz sposób płatności', 'warning'); return; }

  const btn = document.getElementById('modal-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Zapisywanie…'; }

  try {
    await updateZamowienie(id, { platnosc: val });
    toast('Płatność zarejestrowana ✓', 'success');
    closeModal();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Zapisz'; }
    toast('Błąd: ' + err.message, 'error');
  }
}
