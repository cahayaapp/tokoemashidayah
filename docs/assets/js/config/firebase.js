import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { initializeFirestore } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyAjCSFqIftCFgLtdS0LhzsbmtFbt9ZvESU',
  authDomain: 'tokoemas-79e07.firebaseapp.com',
  projectId: 'tokoemas-79e07',
  storageBucket: 'tokoemas-79e07.firebasestorage.app',
  messagingSenderId: '54027991407',
  appId: '1:54027991407:web:a323d26ee458c19f1d509a',
  measurementId: 'G-VXDWQZCRBV'
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false
});

setPersistence(auth, browserLocalPersistence).catch(error => console.warn('Auth persistence:', error));
