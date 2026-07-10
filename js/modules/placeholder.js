// ============================================================
// PLACEHOLDER MODULE
// Wyświetla stronę "W budowie" dla modułów jeszcze niezaimplementowanych
// ============================================================

const MODULE_INFO = {
  dashboard:   { icon: '📊', name: 'Pulpit',               etap: '2', opis: 'Przegląd aktualnej szarży, szybkie akcje i kluczowe statystyki.' },
  szarze:      { icon: '📋', name: 'Szarże',               etap: '2', opis: 'Zarządzanie szarżami produkcyjnymi — tworzenie, fazy, archiwizacja.' },
  klienci:     { icon: '👥', name: 'Klienci',              etap: '2', opis: 'Kartoteka klientów, historia zamówień, flaga dostawy.' },
  zamowienia:  { icon: '📝', name: 'Zamówienia',           etap: '2', opis: 'Zbieranie zamówień, edycja, lista dostaw.' },
  produkcja:   { icon: '🏭', name: 'Planowanie Produkcji', etap: '3', opis: 'Automatyczna lista produkcji, zakupy surowców, receptury.' },
  sprzedaz:    { icon: '💰', name: 'Sprzedaż',             etap: '3', opis: 'Wydawanie towarów, korekta wagi, rejestracja płatności.' },
  raporty:     { icon: '📈', name: 'Raporty',              etap: '4', opis: 'Podsumowanie szarży, koszty, marża i porównanie wyników.' },
};

/**
 * Montuje ekran placeholder w podanym kontenerze.
 * @param {HTMLElement} container
 * @param {string} moduleKey
 */
export function mountPlaceholder(container, moduleKey) {
  const info = MODULE_INFO[moduleKey] || {
    icon: '🚧', name: moduleKey, etap: '?', opis: 'Moduł w przygotowaniu.'
  };

  container.innerHTML = `
    <div class="placeholder-page">
      <div class="placeholder-icon">${info.icon}</div>
      <span class="placeholder-badge">⚙️ Etap ${info.etap} — W przygotowaniu</span>
      <h1 class="placeholder-title">${info.name}</h1>
      <p class="placeholder-text">${info.opis}</p>
      <p class="placeholder-text" style="font-size: var(--text-sm); margin-top: var(--sp-2);">
        Ten moduł zostanie wdrożony wkrótce.
      </p>
    </div>
  `;

  return null; // No cleanup needed
}
