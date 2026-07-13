// ============================================================
// MAIN APPLICATION — Router, Navigation, Auth, Notifications
// Wedlinka — System zarządzania masarnią
// ============================================================

import { onAuthChange, signInWithGoogle, signOutUser } from './auth.js';

// ============================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================

/**
 * Pokazuje powiadomienie toast.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration - ms
 */
export function toast(message, type = 'success', duration = 3800) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <span class="toast-icon">${icons[type] ?? '●'}</span>
    <span class="toast-message">${escHtml(message)}</span>
  `;

  container.appendChild(el);

  const remove = () => {
    el.classList.add('exiting');
    setTimeout(() => el.remove(), 300);
  };

  el.addEventListener('click', remove);
  setTimeout(remove, duration);
}

// ============================================================
// MODAL SYSTEM
// ============================================================

/**
 * Otwiera modal z podaną treścią.
 * @param {string} title
 * @param {string} bodyHTML
 * @param {object} options
 */
export function openModal(title, bodyHTML, {
  onConfirm     = null,
  confirmText   = 'Zapisz',
  confirmClass  = 'btn-primary',
  cancelText    = 'Anuluj',
  showFooter    = true,
  maxWidth      = '520px',
} = {}) {
  const overlay   = document.getElementById('modal-overlay');
  const modalEl   = document.getElementById('modal');
  const titleEl   = document.getElementById('modal-title');
  const bodyEl    = document.getElementById('modal-body');

  titleEl.textContent = title;
  bodyEl.innerHTML    = bodyHTML;
  if (maxWidth) modalEl.style.maxWidth = maxWidth;

  // Remove any old footer
  const oldFooter = modalEl.querySelector('.modal-footer');
  if (oldFooter) oldFooter.remove();

  if (showFooter) {
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.innerHTML = `
      <button class="btn btn-secondary" id="modal-cancel">${cancelText}</button>
      <button class="btn ${confirmClass}" id="modal-confirm">${confirmText}</button>
    `;
    modalEl.appendChild(footer);
    document.getElementById('modal-cancel').onclick = closeModal;
    if (onConfirm) document.getElementById('modal-confirm').onclick = onConfirm;
  }

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Auto-focus first interactive element
  setTimeout(() => {
    const first = overlay.querySelector('input:not([type=hidden]), select, textarea');
    if (first) first.focus();
  }, 120);
}

/**
 * Zamknij modal.
 */
export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
  // Clean footer
  const footer = document.querySelector('#modal .modal-footer');
  if (footer) footer.remove();
}

// ============================================================
// ROUTER — hash-based SPA routing
// ============================================================

const ROUTES = {
  dashboard:  () => import('./modules/dashboard.js'),
  szarze:     () => import('./modules/szarze.js'),
  klienci:    () => import('./modules/klienci.js'),
  zamowienia: () => import('./modules/zamowienia.js'),
  produkcja:  () => import('./modules/produkcja.js'),
  produkty:   () => import('./modules/produkty.js'),
  sprzedaz:   () => import('./modules/sprzedaz.js'),
  raporty:    () => import('./modules/raporty.js'),
};

let currentCleanup = null; // Firebase listener unsubscribe from active module

function getRouteFromHash() {
  const hash = window.location.hash || '';
  const route = hash.replace(/^#\/?/, '').split('/')[0];
  return ROUTES[route] ? route : 'dashboard';
}

async function navigate(route) {
  if (!route || !ROUTES[route]) route = 'dashboard';

  // Mark active nav
  document.querySelectorAll('[data-route]').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === route);
  });

  const container = document.getElementById('main-content');

  // Cleanup previous module
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (_) {}
    currentCleanup = null;
  }

  // Show loading
  container.innerHTML = `
    <div class="loading-overlay">
      <div class="spinner"></div>
      <p>Ładowanie...</p>
    </div>
  `;

  try {
    const mod = await ROUTES[route]();
    currentCleanup = (await mod.mount(container)) ?? null;
  } catch (err) {
    console.error('Router error:', err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Błąd ładowania modułu</div>
        <div class="empty-state-desc">${escHtml(err.message)}</div>
      </div>
    `;
  }
}

// ============================================================
// AUTH UI
// ============================================================

function updateUserUI(user) {
  const nameEl   = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  if (!nameEl || !avatarEl) return;

  const displayName = user.displayName || user.email || 'Użytkownik';
  nameEl.textContent = displayName;

  if (user.photoURL) {
    avatarEl.innerHTML = `<img src="${user.photoURL}" alt="Awatar" loading="lazy">`;
  } else {
    avatarEl.textContent = displayName.charAt(0).toUpperCase();
  }
}

function resetLoginButton() {
  const btn = document.getElementById('btn-google-login');
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = `
    <svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
      <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z"/>
      <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"/>
      <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
    </svg>
    Zaloguj się przez Google
  `;
}

// ============================================================
// APP INIT
// ============================================================

function init() {
  const loginScreen = document.getElementById('login-screen');
  const appShell    = document.getElementById('app');

  // --- Login button ---
  const loginBtn = document.getElementById('btn-google-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      loginBtn.disabled = true;
      loginBtn.textContent = 'Logowanie…';
      try {
        await signInWithGoogle();
        // onAuthChange fires automatically — no need to do anything here
      } catch (err) {
        console.error('Login error:', err);
        resetLoginButton();
        toast('Nie udało się zalogować. Spróbuj ponownie.', 'error');
      }
    });
  }

  // --- Theme toggle buttons ---
  updateThemeIcons();  // sync icons with saved theme
  document.getElementById('btn-theme-sidebar')?.addEventListener('click', toggleTheme);
  document.getElementById('btn-theme-float')?.addEventListener('click', toggleTheme);
  document.getElementById('btn-drawer-theme')?.addEventListener('click', toggleTheme);

  // --- Drawer controls ---
  const btnMoreMenu    = document.getElementById('btn-more-menu');
  const drawerOverlay  = document.getElementById('drawer-overlay');
  const drawerPanel    = document.getElementById('drawer-panel');

  const openDrawer = () => {
    drawerOverlay?.classList.remove('hidden');
    drawerPanel?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  };

  const closeDrawer = () => {
    drawerOverlay?.classList.add('hidden');
    drawerPanel?.classList.add('hidden');
    document.body.style.overflow = '';
  };

  btnMoreMenu?.addEventListener('click', openDrawer);
  drawerOverlay?.addEventListener('click', closeDrawer);

  // Close drawer on link click
  document.querySelectorAll('.drawer-item').forEach(item => {
    item.addEventListener('click', closeDrawer);
  });

  // --- Logout button ---
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('Czy na pewno chcesz się wylogować?')) {
        await signOutUser();
      }
    });
  }

  // --- Modal close ---
  const modalClose   = document.getElementById('modal-close');
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalClose)   modalClose.addEventListener('click', closeModal);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  // --- Keyboard: Escape closes modal & drawer ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalOverlay && !modalOverlay.classList.contains('hidden')) {
        closeModal();
      }
      if (drawerPanel && !drawerPanel.classList.contains('hidden')) {
        closeDrawer();
      }
    }
  });

  // --- Hash-based navigation ---
  window.addEventListener('hashchange', () => {
    navigate(getRouteFromHash());
  });

  // --- Auth state observer ---
  onAuthChange(async (user) => {
    if (user) {
      // Logged in
      loginScreen?.classList.add('hidden');
      appShell?.classList.remove('hidden');
      updateUserUI(user);
      navigate(getRouteFromHash());
    } else {
      // Logged out
      appShell?.classList.add('hidden');
      loginScreen?.classList.remove('hidden');
      resetLoginButton();
    }
  });
}

// ============================================================
// THEME MANAGEMENT
// ============================================================

function updateThemeIcons() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const icon    = current === 'dark' ? '☀️' : '🌙';
  const title   = current === 'dark' ? 'Przełącz na jasny' : 'Przełącz na ciemny';
  ['btn-theme-sidebar', 'btn-theme-float', 'btn-drawer-theme'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (id === 'btn-drawer-theme') {
      btn.textContent = `${icon} Przełącz motyw`;
    } else {
      btn.textContent = icon;
    }
    btn.title       = title;
    btn.setAttribute('aria-label', title);
  });
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('wedlinka-theme', next);
  updateThemeIcons();
}

// ============================================================
// HELPERS (exported for modules)
// ============================================================

export function escHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatCena(cena, jednostka) {
  if (cena == null || cena === '') return '—';
  return `${Number(cena).toFixed(2).replace('.', ',')} zł/${jednostka || 'kg'}`;
}

export function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ============================================================
// START
// ============================================================

init();
