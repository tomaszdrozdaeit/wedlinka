// ============================================================
// MODUŁ: DASHBOARD — Pulpit główny
// Etap 2
// ============================================================

import { listenSzarze, listenZamowienia, listenKlienci } from '../db.js';
import { escHtml, formatDate } from '../app.js';

const FAZY_LABEL = {
  zbieranie:   '📝 Zbieranie zamówień',
  planowanie:  '📋 Planowanie produkcji',
  produkcja:   '🏭 Produkcja',
  sprzedaz:    '💰 Sprzedaż / Wydawanie',
  rozliczenie: '✅ Rozliczenie',
};

const FAZY_NEXT = {
  zbieranie:   '📋 Planowanie',
  planowanie:  '🏭 Produkcja',
  produkcja:   '💰 Sprzedaż',
  sprzedaz:    '✅ Rozliczenie',
};

// ── State ─────────────────────────────────────────────────────
let allSzarze   = [];
let zamowienia  = [];
let klienci     = [];
let activeBatch = null;

let unsubSzarze  = null;
let unsubZam     = null;
let unsubKlienci = null;

// ============================================================
// ENTRY POINT
// ============================================================

export async function mount(container) {
  // Reset module state to prevent singleton cache issues across mounts
  allSzarze    = [];
  zamowienia   = [];
  klienci      = [];
  activeBatch  = null;
  unsubSzarze  = null;
  unsubZam     = null;
  unsubKlienci = null;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle" id="db-subtitle">Ładowanie…</p>
      </div>
    </div>
    <div id="db-content">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
  `;

  unsubKlienci = listenKlienci((d, e) => {
    if (!e) { klienci = d || []; render(); }
  });

  unsubSzarze = listenSzarze((szarze, err) => {
    if (err) return;
    allSzarze = szarze || [];
    const newActive = allSzarze.find(s => !s.zarchiwizowana) || null;

    if (newActive?.id !== activeBatch?.id) {
      activeBatch = newActive;
      if (unsubZam) { unsubZam(); unsubZam = null; }
      if (activeBatch) {
        unsubZam = listenZamowienia(activeBatch.id, (data, e2) => {
          if (!e2) { zamowienia = data || []; render(); }
        });
      } else {
        zamowienia = [];
        render();
      }
    } else {
      render();
    }
  });

  return () => {
    [unsubSzarze, unsubZam, unsubKlienci].forEach(u => u?.());
  };
}

// ============================================================
// RENDER
// ============================================================

function render() {
  const content  = document.getElementById('db-content');
  const subtitle = document.getElementById('db-subtitle');
  if (!content) return;

  const now = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (subtitle) subtitle.textContent = now.charAt(0).toUpperCase() + now.slice(1);

  if (!activeBatch) {
    content.innerHTML = `
      <div class="dashboard-content">
        <div class="empty-state" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-lg);padding:var(--sp-12)">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">Brak aktywnej szarży</div>
          <div class="empty-state-desc">
            Utwórz nową szarżę, aby zacząć zbierać zamówienia i zarządzać produkcją.
          </div>
          <a href="#/szarze" class="btn btn-primary" style="margin-top:var(--sp-4)">
            + Utwórz pierwszą szarżę
          </a>
        </div>
      </div>
    `;
    return;
  }

  // ── Calculate stats ──────────────────────────────────────────
  const activeZam  = zamowienia.filter(z => z.status !== 'anulowano');
  const waiting    = zamowienia.filter(z => z.status === 'oczekuje');
  const delivered  = zamowienia.filter(z => z.status === 'wydano');
  const toDeliver  = zamowienia.filter(z => z.klientDostawa && z.status === 'oczekuje');

  const totalValue = activeZam.reduce((sum, z) =>
    sum + (z.pozycje || []).reduce((s, p) => s + (p.cena || 0) * (p.ilosc || 0), 0), 0);

  const fmtPLN = v => v.toFixed(2).replace('.', ',') + ' zł';
  const faza   = activeBatch.faza || 'zbieranie';

  // ── Dates ─────────────────────────────────────────────────────
  const dateProd   = activeBatch.dataProdukcji ? formatDate(activeBatch.dataProdukcji) : '—';
  const dateOdbior = activeBatch.dataOdbioru   ? formatDate(activeBatch.dataOdbioru)   : '—';

  content.innerHTML = `
    <div class="dashboard-content">

      <!-- Active batch card -->
      <div class="dashboard-batch">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:var(--sp-3)">
          <div>
            <div class="dashboard-batch-name">📋 ${escHtml(activeBatch.nazwa || 'Szarża bez nazwy')}</div>
            <div class="dashboard-batch-meta">
              <span>${FAZY_LABEL[faza] || faza}</span>
              ${activeBatch.dataProdukcji ? `<span>· 🏭 ${dateProd}</span>` : ''}
              ${activeBatch.dataOdbioru   ? `<span>· 📦 ${dateOdbior}</span>` : ''}
            </div>
          </div>
          <a href="#/szarze" class="btn btn-secondary btn-sm">Zarządzaj szarżą →</a>
        </div>

        <!-- Stats grid -->
        <div class="stats-grid" style="margin-top:var(--sp-5)">
          <div class="stat-card">
            <div class="stat-label">Zamówienia</div>
            <div class="stat-value">${activeZam.length}</div>
            <div class="stat-sub">${waiting.length} oczekujących</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Szacunkowa wartość</div>
            <div class="stat-value" style="font-size:var(--text-2xl)">${fmtPLN(totalValue)}</div>
            <div class="stat-sub">${delivered.length} zamówień wydanych</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Dostawy do zrealizowania</div>
            <div class="stat-value" style="color:${toDeliver.length > 0 ? 'var(--clr-warning)' : 'var(--text-primary)'}">${toDeliver.length}</div>
            <div class="stat-sub">klientów czeka na dowóz</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Klienci</div>
            <div class="stat-value">${klienci.length}</div>
            <div class="stat-sub">${klienci.filter(k => k.dostawa).length} z dostawą</div>
          </div>
        </div>

        <!-- Quick actions -->
        <div class="dashboard-quick-actions">
          <a href="#/zamowienia" class="btn btn-primary">📝 Dodaj zamówienie</a>
          <a href="#/zamowienia" class="btn btn-secondary">📊 Podsumowanie zapotrzebowania</a>
          <a href="#/zamowienia" class="btn btn-secondary">🚗 Lista dostaw</a>
          ${FAZY_NEXT[faza] ? `
            <a href="#/szarze" class="btn btn-ghost" style="color:var(--text-secondary)">
              Przejdź do: ${FAZY_NEXT[faza]} →
            </a>
          ` : ''}
        </div>
      </div>

      <!-- Last 5 orders preview -->
      ${activeZam.length > 0 ? `
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-4)">
            <h2 class="section-title" style="margin-bottom:0;border:none;padding:0">
              Ostatnie zamówienia
            </h2>
            <a href="#/zamowienia" class="btn btn-ghost btn-sm">Zobacz wszystkie →</a>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden">
            ${activeZam.slice(0, 5).map(z => renderOrderRow(z)).join('')}
          </div>
        </div>
      ` : ''}

    </div>
  `;
}

function renderOrderRow(z) {
  const name    = [z.klientImie, z.klientNazwisko].filter(Boolean).join(' ') || '—';
  const total   = (z.pozycje || []).reduce((s, p) => s + (p.cena || 0) * (p.ilosc || 0), 0);
  const fmtPLN  = v => v.toFixed(2).replace('.', ',') + ' zł';

  const statusIcon = { oczekuje: '⏳', wydano: '✓', anulowano: '✕' }[z.status] || '';
  const statusCls  = { oczekuje: 'color:var(--clr-warning)', wydano: 'color:var(--clr-success)', anulowano: 'color:var(--text-muted)' }[z.status] || '';

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--sp-3) var(--sp-5);border-bottom:1px solid var(--border);gap:var(--sp-3);flex-wrap:wrap"
         class="order-row-dash">
      <div>
        <strong style="font-size:var(--text-md)">${escHtml(name)}</strong>
        <span style="font-size:var(--text-sm);color:var(--text-secondary);margin-left:var(--sp-2)">
          ${(z.pozycje || []).length} pozycji
          ${z.klientDostawa ? '· 🚗' : ''}
        </span>
      </div>
      <div style="display:flex;align-items:center;gap:var(--sp-3)">
        <span style="font-weight:var(--w-semibold)">${fmtPLN(total)}</span>
        <span style="${statusCls};font-size:var(--text-sm)">${statusIcon} ${z.status}</span>
      </div>
    </div>
  `;
}
