// ============================================================
// AUTHENTICATION MODULE
// Google Sign-In via Firebase Auth
// ============================================================

import { auth } from './firebase-config.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const provider = new GoogleAuthProvider();
// Zawsze pokazuj ekran wyboru konta Google
provider.setCustomParameters({ prompt: 'select_account' });

/**
 * Logowanie przez Google — otwiera popup
 */
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

/**
 * Wylogowanie
 */
export async function signOutUser() {
  return signOut(auth);
}

/**
 * Obserwator zmiany stanu auth. Zwraca funkcję unsubscribe.
 * @param {function} callback - wywołana z (user | null)
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Aktualnie zalogowany użytkownik (synchronicznie)
 */
export function getCurrentUser() {
  return auth.currentUser;
}
