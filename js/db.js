// ============================================================
// DATABASE MODULE — Firestore CRUD operations
// Wedlinka — System zarządzania masarnią
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, doc,
  addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, where,
  serverTimestamp, getDoc, getDocs,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ============================================================
// PRODUKTY (Products)
// Publiczny odczyt (cennik) — zapis wymaga auth
// ============================================================

/**
 * Nasłuchuje listy produktów w czasie rzeczywistym.
 * Sortowanie client-side (unikamy potrzeby composite index).
 * @returns {function} unsubscribe
 */
export function listenProdukty(callback) {
  const q = query(collection(db, 'produkty'));
  return onSnapshot(q,
    (snapshot) => {
      const items = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
          const katCmp = (a.kategoria || '').localeCompare(b.kategoria || '', 'pl');
          return katCmp !== 0 ? katCmp : (a.nazwa || '').localeCompare(b.nazwa || '', 'pl');
        });
      callback(items, null);
    },
    (error) => callback(null, error)
  );
}

export async function addProdukt(data) {
  return addDoc(collection(db, 'produkty'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateProdukt(id, data) {
  return updateDoc(doc(db, 'produkty', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProdukt(id) {
  return deleteDoc(doc(db, 'produkty', id));
}

// ============================================================
// KLIENCI (Clients) — Etap 2
// ============================================================

export function listenKlienci(callback) {
  const q = query(collection(db, 'klienci'));
  return onSnapshot(q,
    (snapshot) => {
      const items = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (a.nazwisko || '').localeCompare(b.nazwisko || '', 'pl'));
      callback(items, null);
    },
    (error) => callback(null, error)
  );
}

export async function addKlient(data) {
  return addDoc(collection(db, 'klienci'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateKlient(id, data) {
  return updateDoc(doc(db, 'klienci', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteKlient(id) {
  return deleteDoc(doc(db, 'klienci', id));
}

// ============================================================
// SZARZE (Production Batches) — Etap 2
// ============================================================

export function listenSzarze(callback) {
  const q = query(collection(db, 'szarze'), orderBy('createdAt', 'desc'));
  return onSnapshot(q,
    (snapshot) => {
      const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      callback(items, null);
    },
    (error) => callback(null, error)
  );
}

export async function addSzarza(data) {
  return addDoc(collection(db, 'szarze'), {
    ...data,
    faza: 'zbieranie',     // zbieranie | planowanie | produkcja | sprzedaz | rozliczenie
    zarchiwizowana: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateSzarza(id, data) {
  return updateDoc(doc(db, 'szarze', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function getSzarza(id) {
  const snap = await getDoc(doc(db, 'szarze', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ============================================================
// ZAMÓWIENIA (Orders) — Etap 2
// ============================================================

export function listenZamowienia(szarzaId, callback) {
  const q = query(
    collection(db, 'zamowienia'),
    where('szarzaId', '==', szarzaId)
  );
  return onSnapshot(q,
    (snapshot) => {
      const items = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (a.klientNazwisko || '').localeCompare(b.klientNazwisko || '', 'pl'));
      callback(items, null);
    },
    (error) => callback(null, error)
  );
}

export async function addZamowienie(data) {
  return addDoc(collection(db, 'zamowienia'), {
    ...data,
    status: 'oczekuje',   // oczekuje | wydano | anulowano
    spoznione: false,     // czy wpłynęło po planowanym zamknięciu zbierania
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateZamowienie(id, data) {
  return updateDoc(doc(db, 'zamowienia', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteZamowienie(id) {
  return deleteDoc(doc(db, 'zamowienia', id));
}

// ============================================================
// RAPORTY / KOSZTY — Etap 4
// ============================================================

export async function addKoszty(szarzaId, data) {
  return addDoc(collection(db, 'koszty'), {
    szarzaId,
    ...data,
    createdAt: serverTimestamp(),
  });
}

export function listenKoszty(szarzaId, callback) {
  const q = query(collection(db, 'koszty'), where('szarzaId', '==', szarzaId));
  return onSnapshot(q,
    (snapshot) => callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })), null),
    (error) => callback(null, error)
  );
}
