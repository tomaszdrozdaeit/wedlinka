// ============================================================
// FIREBASE CONFIGURATION
// Wedlinka — System zarządzania masarnią
// ============================================================

import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth }        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCJmD_lKFBun6gRYEYVSEhzUnznJ4uFELs",
  authDomain:        "wedlinka-app.firebaseapp.com",
  projectId:         "wedlinka-app",
  storageBucket:     "wedlinka-app.firebasestorage.app",
  messagingSenderId: "291213409116",
  appId:             "1:291213409116:web:1d9fc8c2922a32304fdf99",
  measurementId:     "G-CWMB3FT1ZF"
};

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
