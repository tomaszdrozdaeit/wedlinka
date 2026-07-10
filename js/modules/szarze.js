// ============================================================
// MODUŁ: SZARŻE — Zarządzanie szarżami produkcyjnymi
// Etap 2
// ============================================================

import { listenSzarze, addSzarza, updateSzarza } from '../db.js';
import { toast, openModal, closeModal, escHtml, formatDate } from '../app.js';

const FAZY = [
  { id: 'zbieranie',   label: 'Zbieranie zamówień', icon: '📝' },
  { id: 'planowanie',  label: 'Planowanie',          icon: '📋' },
  { id: 'produkcja',   label: 'Produkcja',           icon: '🏭' },
  { id: 'sprzedaz',    label: 'Sprzedaż',            icon: '💰' },
  { id: 'rozliczenie', label: 'Rozliczenie',         icon: '✅' },
];

const FAZA_BADGE = {
  zbieranie:   'badge-amber',
  planowanie:  'badge-blue',
  produkcja:   'badge-red',
  sprzedaz:    'badge-green',
  rozliczenie: 'badge-gray',
};

let unsubscribe = null;
let allSzarze   = [];

// ============================================================
// ENTRY POINT
// ============================================================

export async function mount(container) {
  container.innerHTML = buildShell();
  bindShellEvents();

  unsubscribe = listenSzarze((szarze, error) => {
    if (error) { toast('Błąd ładowania szarży: ' + error.message, 'error'); return; }
    allSzarze = szarze || [];
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
        <h1 class="page-title">Szarże</h1>
        <p class="page-subtitle" id="szarze-subtitle">Ładowanie…</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-new-szarza">+ Nowa Szarża</button>
      </div>
    </div>
    <div class="content-area" id="szarze-content">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
  `;
}

function bindShellEvents() {
  document.getElementById('btn-new-szarza')?.addEventListener('click', openNewModal);
}

// ============================================================
// RENDER
// ============================================================

function render() {
  const content  = document.getElementById('szarze-content');
  const subtitle = document.getElementById('szarze-subtitle');
  if (!content) return;

  const active   = allSzarze.filter(s => !s.zarchiwizowana);
  const archived = allSzarze.filter(s =>  s.zarchiwizowana);

  if (subtitle) {
    subtitle.textContent = `${active.length} aktywnych · ${archived.length} zarchiwizowanych`;
  }

  if (allSzarze.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">Brak szarży</div>
        <div class="empty-state-desc">Utwórz pierwszą szarżę, aby zacząć zbierać zamówienia.</div>
        <button class="btn btn-primary" id="btn-empty-new">+ Nowa Szarża</button>
      </div>
    `;
    document.getElementById('btn-empty-new')?.addEventListener('click', openNewModal);
    return;
  }

  let html = '';

  if (active.length > 0) {
    html += `<h2 class="section-title">📋 Aktywne szarże</h2>`;
    active.forEach(s => { html += renderCard(s, true); });
  }

  if (archived.length > 0) {
    html += `
      <h2 class="section-title" style="margin-top: var(--sp-8)">
        🗃 Archiwum
        <span class="badge badge-gray">${archived.length}</span>
      </h2>
    `;
    archived.forEach(s => { html += renderCard(s, false); });
  }

  content.innerHTML = html;

  content.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleAction);
  });
}

function renderCard(s, isActive) {
  const fazaIdx  = Math.max(0, FAZY.findIndex(f => f.id === s.faza));
  const fazaInfo = FAZY[fazaIdx];

  const datesHtml = [
    s.dataProdukcji ? `🏭 <strong>${formatDate(s.dataProdukcji)}</strong>` : '',
    s.dataOdbioru   ? `📦 <strong>${formatDate(s.dataOdbioru)}</strong>`   : '',
  ].filter(Boolean).join('&nbsp; · &nbsp;');

  return `
    <div class="szarza-card ${isActive ? 'szarza-card--active' : 'szarza-card--archived'}">

      <div class="szarza-card-header">
        <div class="szarza-card-title-row">
          <h2 class="szarza-nazwa">${escHtml(s.nazwa || 'Szarża bez nazwy')}</h2>
          <span class="badge ${FAZA_BADGE[s.faza] || 'badge-gray'}">
            ${fazaInfo.icon} ${fazaInfo.label}
          </span>
        </div>
        ${datesHtml ? `<div class="szarza-dates">${datesHtml}</div>` : ''}
        ${s.notatki ? `<p style="font-size:var(--text-sm);color:var(--text-muted);margin-top:var(--sp-2)">${escHtml(s.notatki)}</p>` : ''}
      </div>

      ${isActive ? `
        <div class="szarza-phases">${renderStepper(s.faza)}</div>

        <div class="szarza-card-footer">
          <div class="szarza-actions">
            ${fazaIdx > 0 ? `
              <button class="btn btn-secondary btn-sm" data-action="prev" data-id="${s.id}" data-idx="${fazaIdx}">
                ← Poprzednia faza
              </button>
            ` : ''}
            ${fazaIdx < FAZY.length - 1 ? `
              <button class="btn btn-primary btn-sm" data-action="next" data-id="${s.id}" data-idx="${fazaIdx}">
                Następna faza →
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${s.id}">
              ✏️ Edytuj
            </button>
          </div>
          <button class="btn btn-ghost btn-sm" data-action="archive" data-id="${s.id}"
                  title="Archiwizuj szarżę" style="color:var(--text-muted)">
            🗃 Archiwizuj
          </button>
        </div>
      ` : `
        <div class="szarza-card-footer">
          <span style="font-size:var(--text-sm);color:var(--text-muted)">Zarchiwizowana</span>
          <button class="btn btn-ghost btn-sm" data-action="unarchive" data-id="${s.id}">
            ↩ Przywróć
          </button>
        </div>
      `}
    </div>
  `;
}

function renderStepper(activeFaza) {
  const activeIdx = Math.max(0, FAZY.findIndex(f => f.id === activeFaza));

  let html = '<div class="phase-stepper">';

  FAZY.forEach((faza, idx) => {
    const done   = idx < activeIdx;
    const active = idx === activeIdx;
    const cls    = done ? 'done' : active ? 'active' : '';

    html += `
      <div class="phase-step ${cls}">
        <div class="phase-step-dot">${done ? '✓' : faza.icon}</div>
        <div class="phase-step-label">${faza.label}</div>
      </div>
    `;

    if (idx < FAZY.length - 1) {
      html += `<div class="phase-connector ${done ? 'done' : ''}"></div>`;
    }
  });

  html += '</div>';
  return html;
}

// ============================================================
// ACTIONS
// ============================================================

async function handleAction(e) {
  const btn    = e.currentTarget;
  const action = btn.dataset.action;
  const id     = btn.dataset.id;
  const s      = allSzarze.find(x => x.id === id);

  switch (action) {

    case 'next': {
      const idx  = parseInt(btn.dataset.idx);
      const next = FAZY[idx + 1];
      if (!next) return;
      try { await updateSzarza(id, { faza: next.id }); toast(`Faza: ${next.label}`, 'success'); }
      catch (err) { toast(err.message, 'error'); }
      break;
    }

    case 'prev': {
      const idx  = parseInt(btn.dataset.idx);
      const prev = FAZY[idx - 1];
      if (!prev) return;
      try { await updateSzarza(id, { faza: prev.id }); toast(`Faza: ${prev.label}`, 'success'); }
      catch (err) { toast(err.message, 'error'); }
      break;
    }

    case 'edit':
      if (s) openEditModal(s);
      break;

    case 'archive':
      if (!s) return;
      if (!confirm(`Archiwizować szarżę "${s.nazwa}"?\n\nZarchiwizowana szarża jest dostępna tylko do odczytu.`)) return;
      try { await updateSzarza(id, { zarchiwizowana: true });  toast(`"${s.nazwa}" zarchiwizowana ✓`, 'success'); }
      catch (err) { toast(err.message, 'error'); }
      break;

    case 'unarchive':
      try { await updateSzarza(id, { zarchiwizowana: false }); toast('Szarża przywrócona ✓', 'success'); }
      catch (err) { toast(err.message, 'error'); }
      break;
  }
}

// ============================================================
// MODALS
// ============================================================

function dateInputVal(ts) {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().split('T')[0];
  } catch { return ''; }
}

function buildSzarzaForm(s) {
  const now       = new Date();
  const twoWeeks  = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const twoWeeks2 = new Date(now.getTime() + 16 * 24 * 60 * 60 * 1000);
  const toDate = d => d.toISOString().split('T')[0];

  return `
    <form id="szarza-form" autocomplete="off" novalidate>
      <div class="form-group">
        <label class="form-label" for="sz-nazwa">Nazwa szarży *</label>
        <input class="form-input" type="text" id="sz-nazwa"
               placeholder="np. Szarża Lipiec 2026"
               value="${escHtml(s?.nazwa || '')}">
      </div>
      <div class="form-row">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" for="sz-produkcja">Data produkcji</label>
          <input class="form-input" type="date" id="sz-produkcja"
                 value="${s ? dateInputVal(s.dataProdukcji) : toDate(twoWeeks)}">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" for="sz-odbior">Data odbioru</label>
          <input class="form-input" type="date" id="sz-odbior"
                 value="${s ? dateInputVal(s.dataOdbioru) : toDate(twoWeeks2)}">
        </div>
      </div>
      <div class="form-group" style="margin-top:var(--sp-5)">
        <label class="form-label" for="sz-notatki">Notatki (opcjonalnie)</label>
        <textarea class="form-textarea" id="sz-notatki"
                  placeholder="Dodatkowe informacje…">${escHtml(s?.notatki || '')}</textarea>
      </div>
    </form>
  `;
}

function openNewModal() {
  openModal('Nowa Szarża', buildSzarzaForm(null), {
    confirmText: 'Utwórz Szarżę',
    onConfirm: () => saveSzarza(null),
  });
}

function openEditModal(s) {
  openModal('Edytuj Szarżę', buildSzarzaForm(s), {
    confirmText: 'Zapisz zmiany',
    onConfirm: () => saveSzarza(s),
  });
}

async function saveSzarza(existing) {
  const nazwa     = document.getElementById('sz-nazwa')?.value.trim();
  const produkcja = document.getElementById('sz-produkcja')?.value;
  const odbior    = document.getElementById('sz-odbior')?.value;
  const notatki   = document.getElementById('sz-notatki')?.value.trim();

  if (!nazwa) {
    toast('Wpisz nazwę szarży', 'warning');
    document.getElementById('sz-nazwa')?.focus();
    return;
  }

  const btn = document.getElementById('modal-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Zapisywanie…'; }

  try {
    const data = {
      nazwa,
      dataProdukcji: produkcja ? new Date(produkcja) : null,
      dataOdbioru:   odbior    ? new Date(odbior)    : null,
      notatki: notatki || '',
    };

    if (existing) {
      await updateSzarza(existing.id, data);
      toast(`"${nazwa}" zaktualizowana ✓`, 'success');
    } else {
      await addSzarza(data);
      toast(`"${nazwa}" utworzona ✓`, 'success');
    }
    closeModal();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = existing ? 'Zapisz zmiany' : 'Utwórz Szarżę'; }
    toast('Błąd: ' + err.message, 'error');
  }
}
