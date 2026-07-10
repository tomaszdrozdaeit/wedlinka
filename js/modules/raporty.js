// ============================================================
// MODUŁ: RAPORTY i FINANSE
// Etap 4
// Funkcje: zestawienie szarży, koszty surowców, marża,
//           tabela należności, porównanie szarż (SVG chart)
// ============================================================

import { listenSzarze, listenKlienci, updateSzarza } from '../db.js';
import { db } from '../firebase-config.js';
import {
  collection, query, where, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { toast, escHtml } from '../app.js';

// ── State ─────────────────────────────────────────────────────
let allSzarze   = [];
let selectedSzarzaId = '';
let zamowienia      = []; // dla wybranej szarży
let klienci         = [];
let currentKoszty   = null; // { mieso, przyprawy, jelita, inne }

let viewMode = 'szczegoly'; // 'szczegoly' | 'porownanie'

let unsubSzarze    = null;
let unsubKlienci   = null;
let unsubZamowienia = null;

// ============================================================
// ENTRY POINT
// ============================================================

export async function mount(container) {
  container.innerHTML = buildShell();
  bindShellEvents();

  unsubKlienci = listenKlienci((data, err) => {
    if (!err) klienci = data || [];
  });

  unsubSzarze = listenSzarze((szarze, err) => {
    if (err) { toast('Błąd: ' + err.message, 'error'); return; }
    allSzarze = szarze || [];

    // Default to the first active batch, or the latest one
    if (!selectedSzarzaId && allSzarze.length > 0) {
      const active = allSzarze.find(s => !s.zarchiwizowana);
      selectedSzarzaId = active ? active.id : allSzarze[0].id;
    }

    renderSzarzaSelector();
    loadSzarzaData();
  });

  return () => {
    [unsubSzarze, unsubKlienci, unsubZamowienia].forEach(u => u?.());
  };
}

// ============================================================
// SHELL
// ============================================================

function buildShell() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Raporty i Finanse</h1>
        <p class="page-subtitle">Zestawienie finansowe szarż i rozliczenia</p>
      </div>
    </div>

    <!-- VIEW TABS -->
    <div class="category-tabs" id="raporty-tabs">
      <button class="category-tab active" data-view="szczegoly">📊 Analiza szarży</button>
      <button class="category-tab" data-view="porownanie">📈 Porównanie szarż</button>
    </div>

    <div id="raporty-content">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
  `;
}

function bindShellEvents() {
  document.getElementById('raporty-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.category-tab');
    if (!tab) return;
    document.querySelectorAll('#raporty-tabs .category-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    viewMode = tab.dataset.view;
    renderContent();
  });
}

function renderSzarzaSelector() {
  const select = document.getElementById('rep-szarza-select');
  if (!select) return;

  const html = allSzarze.map(s => {
    const activeText = s.zarchiwizowana ? ' Archiwum' : ' Aktywna';
    return `<option value="${s.id}" ${s.id === selectedSzarzaId ? 'selected' : ''}>
      ${escHtml(s.nazwa)} (${activeText})
    </option>`;
  }).join('');

  select.innerHTML = html;
}

// ============================================================
// DATA LOADERS
// ============================================================

function loadSzarzaData() {
  if (unsubZamowienia) { unsubZamowienia(); unsubZamowienia = null; }

  if (!selectedSzarzaId) {
    renderContent();
    return;
  }

  // Find koszty stored in szarza document
  const szarza = allSzarze.find(s => s.id === selectedSzarzaId);
  currentKoszty = szarza?.koszty || null;

  // Listen to orders for this specific batch
  const q = query(collection(db, 'zamowienia'), where('szarzaId', '==', selectedSzarzaId));
  unsubZamowienia = onSnapshot(q, (snapshot) => {
    zamowienia = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderContent();
  }, (err) => {
    toast('Błąd ładowania zamówień: ' + err.message, 'error');
  });
}

// ============================================================
// CONTENT ROUTER
// ============================================================

function renderContent() {
  const c = document.getElementById('raporty-content');
  if (!c) return;

  if (allSzarze.length === 0) {
    c.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📈</div>
        <div class="empty-state-title">Brak danych</div>
        <div class="empty-state-desc">Utwórz szarżę i dodaj zamówienia, aby zobaczyć raporty.</div>
      </div>
    `;
    return;
  }

  if (viewMode === 'szczegoly') renderSzczegoly(c);
  if (viewMode === 'porownanie') renderPorownanie(c);
}

// ============================================================
// VIEW: ANALIZA SZARŻY (DETAILS)
// ============================================================

function renderSzczegoly(container) {
  const szarza = allSzarze.find(s => s.id === selectedSzarzaId);
  if (!szarza) return;

  // Calculations
  const activeOrders = zamowienia.filter(z => z.status !== 'anulowano');
  const totalRev     = activeOrders.reduce((sum, z) => sum + calcOrderFinalTotal(z), 0);
  const paidOrders   = activeOrders.filter(z => z.platnosc === 'gotowka' || z.platnosc === 'przelew');
  const paidRev      = paidOrders.reduce((sum, z) => sum + calcOrderFinalTotal(z), 0);

  const costMieso     = Number(currentKoszty?.mieso) || 0;
  const costPrzyprawy = Number(currentKoszty?.przyprawy) || 0;
  const costJelita    = Number(currentKoszty?.jelita) || 0;
  const costInne      = Number(currentKoszty?.inne) || 0;
  const totalCost     = costMieso + costPrzyprawy + costJelita + costInne;

  const marginVal = Math.max(0, totalRev - totalCost);
  const marginPct = totalRev > 0 ? (marginVal / totalRev * 100) : 0;

  // Unpaid table data
  const unpaidList = activeOrders.filter(z => !z.platnosc || z.platnosc === 'nieoplacone');

  container.innerHTML = `
    <div class="production-section" style="max-width:1040px">

      <!-- Batch Selector Bar -->
      <div class="card" style="padding:var(--sp-4) var(--sp-5); margin-bottom:var(--sp-5); display:flex; align-items:center; gap:var(--sp-4); flex-wrap:wrap">
        <label class="form-label" for="rep-szarza-select" style="margin-bottom:0; font-weight:var(--w-bold)">
          Wybrana szarża:
        </label>
        <select class="form-select" id="rep-szarza-select" style="max-width:320px; margin-bottom:0">
          <!-- populated dynamically -->
        </select>
        <button class="btn btn-secondary btn-sm" onclick="window.print()" style="margin-left:auto">🖨️ Drukuj raport</button>
      </div>

      <!-- Financial Cards Grid -->
      <div class="stats-grid" style="margin-bottom:var(--sp-6)">
        <div class="stat-card">
          <div class="stat-label">Przychód (Wydane/Oczekujące)</div>
          <div class="stat-value" style="color:var(--text-primary)">${fmtPLN(totalRev)}</div>
          <div class="stat-sub">Zapłacono: ${fmtPLN(paidRev)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Koszty surowców (Suma)</div>
          <div class="stat-value" style="color:var(--clr-danger)">${fmtPLN(totalCost)}</div>
          <div class="stat-sub">Mięso, przyprawy, jelita i inne</div>
        </div>
        <div class="stat-card" style="border-left:4px solid var(--clr-success)">
          <div class="stat-label">Marża szacunkowa</div>
          <div class="stat-value" style="color:var(--clr-success)">${fmtPLN(marginVal)}</div>
          <div class="stat-sub">Rentowność: <strong>${marginPct.toFixed(1).replace('.', ',')}%</strong></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Klienci (Aktywni)</div>
          <div class="stat-value">${activeOrders.length}</div>
          <div class="stat-sub">Nieodebrane: ${activeOrders.filter(o => o.status !== 'wydano').length}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--sp-6)" class="reports-two-col">

        <!-- Column 1: Costs Form -->
        <div class="card" style="padding:var(--sp-5)">
          <h3 style="font-size:var(--text-lg); font-weight:var(--w-bold); margin-bottom:var(--sp-4); border-bottom:1px solid var(--border); padding-bottom:var(--sp-2)">
            🛒 Koszty surowców
          </h3>
          <form id="costs-form" autocomplete="off">
            <div class="form-group">
              <label class="form-label" for="c-mieso">Mięso / surowiec główny (zł)</label>
              <input type="number" class="form-input cost-input" id="c-mieso" value="${costMieso || ''}" placeholder="0,00" min="0" step="0.01">
            </div>
            <div class="form-group">
              <label class="form-label" for="c-jelita">Jelita / osłonki (zł)</label>
              <input type="number" class="form-input cost-input" id="c-jelita" value="${costJelita || ''}" placeholder="0,00" min="0" step="0.01">
            </div>
            <div class="form-group">
              <label class="form-label" for="c-przyprawy">Przyprawy i dodatki (zł)</label>
              <input type="number" class="form-input cost-input" id="c-przyprawy" value="${costPrzyprawy || ''}" placeholder="0,00" min="0" step="0.01">
            </div>
            <div class="form-group">
              <label class="form-label" for="c-inne">Inne koszty (drewno, prąd, transport) (zł)</label>
              <input type="number" class="form-input cost-input" id="c-inne" value="${costInne || ''}" placeholder="0,00" min="0" step="0.01">
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%; margin-top:var(--sp-3)">
              💾 Zapisz koszty
            </button>
          </form>
        </div>

        <!-- Column 2: Unpaid List -->
        <div class="card" style="padding:var(--sp-5)">
          <h3 style="font-size:var(--text-lg); font-weight:var(--w-bold); margin-bottom:var(--sp-4); border-bottom:1px solid var(--border); padding-bottom:var(--sp-2)">
            ❌ Zestawienie należności (${unpaidList.length})
          </h3>
          ${unpaidList.length === 0
            ? '<p style="color:var(--text-muted); text-align:center; padding:var(--sp-8)">Wszystkie wydane zamówienia zostały opłacone! ✓</p>'
            : `
              <div class="summary-table-wrap" style="max-height: 380px; overflow-y: auto">
                <table class="summary-table" style="font-size:var(--text-sm)">
                  <thead>
                    <tr>
                      <th>Klient</th>
                      <th>Telefon</th>
                      <th>Kwota</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${unpaidList.map(z => {
                      const name = [z.klientImie, z.klientNazwisko].filter(Boolean).join(' ');
                      return `
                        <tr>
                          <td><strong>${escHtml(name)}</strong></td>
                          <td>${z.klientTelefon ? `<a href="tel:${encodeURIComponent(z.klientTelefon)}" style="color:var(--clr-info)">${escHtml(z.klientTelefon)}</a>` : '—'}</td>
                          <td style="font-weight:var(--w-semibold); color:var(--clr-danger)">${fmtPLN(calcOrderFinalTotal(z))}</td>
                        </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `
          }
        </div>

      </div>

    </div>
  `;

  renderSzarzaSelector();

  // Bind change handler
  document.getElementById('rep-szarza-select')?.addEventListener('change', e => {
    selectedSzarzaId = e.target.value;
    loadSzarzaData();
  });

  // Bind cost form save
  document.getElementById('costs-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const mieso     = parseFloat(document.getElementById('c-mieso')?.value) || 0;
    const jelita    = parseFloat(document.getElementById('c-jelita')?.value) || 0;
    const przyprawy = parseFloat(document.getElementById('c-przyprawy')?.value) || 0;
    const inne      = parseFloat(document.getElementById('c-inne')?.value) || 0;

    const saveBtn = e.target.querySelector('button[type="submit"]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Zapisywanie…'; }

    try {
      await updateSzarza(selectedSzarzaId, {
        koszty: { mieso, jelita, przyprawy, inne }
      });
      toast('Koszty szarży zapisane ✓', 'success');
      loadSzarzaData();
    } catch (err) {
      toast('Błąd zapisu: ' + err.message, 'error');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Zapisz koszty'; }
    }
  });
}

// ============================================================
// VIEW: BATCH COMPARISON (SVG CHART)
// ============================================================

function renderPorownanie(container) {
  // We need to calculate revenue and cost for each batch.
  // Since we only have real-time listeners for the selected batch,
  // we will load previous batch summaries. We can do client-side computations
  // if we fetch documents or if we use aggregated values stored on the batch document itself.
  // Wait! A very fast way is to pull all orders for all batches to draw the chart,
  // or compile data from batches. Let's do a simple batch aggregation.
  // Since it's a demo/offline local app with small batches, we can fetch all orders
  // or use cached aggregates. Let's load orders for batches using a batch read.
  // Wait, to keep it simple, robust, and fast without blocking, we can compute the chart
  // by querying the 'zamowienia' collection once, then grouping. Since Firestore supports
  // reading all orders at once (capped or uncapped), this is extremely fast.

  container.innerHTML = `
    <div class="production-section" style="max-width:1040px">
      <div class="card" style="padding:var(--sp-6)">
        <h2 style="font-size:var(--text-lg); font-weight:var(--w-bold); margin-bottom:var(--sp-4)">
          Porównanie przychodów i kosztów szarż
        </h2>
        <p style="font-size:var(--text-sm); color:var(--text-secondary); margin-bottom:var(--sp-6)">
          Wykres przedstawia sumaryczny przychód (słupek zielony) oraz koszty surowców (słupek czerwony) dla poszczególnych szarż.
        </p>

        <div id="chart-loader" style="padding:var(--sp-12); text-align:center">
          <div class="spinner" style="margin: 0 auto var(--sp-3) auto"></div>
          Ładowanie wykresu…
        </div>

        <div id="chart-container" class="hidden">
          <!-- Rendered SVG chart goes here -->
        </div>
      </div>
    </div>
  `;

  loadChartData();
}

async function loadChartData() {
  const loader = document.getElementById('chart-loader');
  const wrap   = document.getElementById('chart-container');
  if (!loader || !wrap) return;

  try {
    const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const snap = await getDocs(collection(db, 'zamowienia'));
    const allOrders = snap.docs.map(doc => doc.data());

    // Group orders by szarzaId
    const revMap = {};
    allOrders.forEach(o => {
      if (o.status === 'anulowano') return;
      const sId = o.szarzaId;
      if (!revMap[sId]) revMap[sId] = 0;
      revMap[sId] += (o.pozycje || []).reduce((s, p) => s + (p.cena || 0) * (p.iloscWydana ?? p.ilosc ?? 0), 0);
    });

    // Compile chart data sorted by createdAt (oldest to newest)
    const chartData = [...allSzarze]
      .reverse() // oldest first
      .map(s => {
        const rev  = revMap[s.id] || 0;
        const c    = s.koszty || {};
        const cost = (Number(c.mieso) || 0) + (Number(c.jelita) || 0) + (Number(c.przyprawy) || 0) + (Number(c.inne) || 0);
        return {
          nazwa: s.nazwa || '—',
          przychod: rev,
          koszty: cost,
          marza: Math.max(0, rev - cost)
        };
      });

    loader.classList.add('hidden');
    wrap.classList.remove('hidden');
    wrap.innerHTML = buildSvgChart(chartData);
  } catch (err) {
    loader.innerHTML = `<span style="color:var(--clr-danger)">⚠️ Nie udało się załadować danych wykresu: ${escHtml(err.message)}</span>`;
  }
}

function buildSvgChart(data) {
  if (data.length === 0) {
    return `<div style="text-align:center;color:var(--text-muted);padding:var(--sp-6)">Brak danych do wygenerowania wykresu.</div>`;
  }

  // SVG parameters
  const w = 860;
  const h = 340;
  const paddingLeft   = 60;
  const paddingRight  = 20;
  const paddingTop     = 20;
  const paddingBottom  = 40;

  const chartW = w - paddingLeft - paddingRight;
  const chartH = h - paddingTop - paddingBottom;

  // Find max value for scaling
  const maxVal = Math.max(100, ...data.map(d => Math.max(d.przychod, d.koszty)));
  const yMax   = Math.ceil(maxVal / 100) * 100; // round up to nearest 100

  // Scales
  const getX = (index) => paddingLeft + (index * (chartW / data.length)) + (chartW / data.length / 2);
  const getY = (val) => paddingTop + chartH - (val / yMax * chartH);

  // Background Grid Lines
  const gridLines = [];
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const val = (yMax / ticks) * i;
    const y   = getY(val);
    gridLines.push(`
      <line x1="${paddingLeft}" y1="${y}" x2="${w - paddingRight}" y2="${y}" stroke="var(--border)" stroke-dasharray="4,4" />
      <text x="${paddingLeft - 10}" y="${y + 4}" font-size="10" fill="var(--text-secondary)" text-anchor="end">${val} zł</text>
    `);
  }

  // Bars and Labels
  const bars = [];
  const barW = Math.max(12, Math.min(32, (chartW / data.length) / 3));

  data.forEach((d, i) => {
    const cx = getX(i);
    const revY  = getY(d.przychod);
    const costY = getY(d.koszty);

    const revH  = chartH - (revY - paddingTop);
    const costH = chartH - (costY - paddingTop);

    // Green bar (revenue)
    bars.push(`
      <rect x="${cx - barW - 2}" y="${revY}" width="${barW}" height="${revH}" fill="#2ECC71" rx="3" />
    `);
    // Red bar (cost)
    bars.push(`
      <rect x="${cx + 2}" y="${costY}" width="${barW}" height="${costH}" fill="#E74C3C" rx="3" />
    `);
    // Label
    bars.push(`
      <text x="${cx}" y="${h - paddingBottom + 20}" font-size="10" fill="var(--text-secondary)" text-anchor="middle">${escHtml(d.nazwa)}</text>
    `);
  });

  return `
    <div style="overflow-x:auto; width:100%">
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="min-width: 640px; font-family:var(--font-sans)">
        <!-- Grid -->
        ${gridLines.join('')}

        <!-- Bars -->
        ${bars.join('')}

        <!-- X Axis line -->
        <line x1="${paddingLeft}" y1="${h - paddingBottom}" x2="${w - paddingRight}" y2="${h - paddingBottom}" stroke="var(--border-strong)" stroke-width="2" />
      </svg>
    </div>
    <div style="display:flex; justify-content:center; gap:var(--sp-5); margin-top:var(--sp-4); font-size:var(--text-sm)">
      <div style="display:flex; align-items:center; gap:var(--sp-2)">
        <span style="display:block; width:16px; height:12px; background:#2ECC71; border-radius:3px"></span>
        <span>Przychód</span>
      </div>
      <div style="display:flex; align-items:center; gap:var(--sp-2)">
        <span style="display:block; width:16px; height:12px; background:#E74C3C; border-radius:3px"></span>
        <span>Koszty surowców</span>
      </div>
    </div>
  `;
}

// ============================================================
// HELPER CALCS
// ============================================================

function calcOrderFinalTotal(o) {
  return (o.pozycje || []).reduce((s, p) =>
    s + (p.cena || 0) * (p.iloscWydana ?? p.ilosc ?? 0), 0);
}

function fmtPLN(v) {
  return (v || 0).toFixed(2).replace('.', ',') + ' zł';
}
