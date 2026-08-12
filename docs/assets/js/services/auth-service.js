import { firebaseConfig, auth, db } from '../config/firebase.js?v=2.1.4';
import { DEFAULT_GOLD_RATES } from '../core/constants.js?v=2.1.4';
import { state } from '../core/state.js?v=2.1.4';
import { getStoreSettings, getGoldRates } from './data-service.js?v=2.1.4';
import {
  signInWithEmailAndPassword, signOut as firebaseSignOut,
  onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  doc, getDoc, setDoc, collection, addDoc, serverTimestamp, getDocs, query, orderBy
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

let sessionSequence = 0;
const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
const STAFF_ROLES = new Set(['admin', 'cashier', 'auditor']);

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
}

export async function logout() {
  return firebaseSignOut(auth);
}

async function readProfileWithRetry(user, attempts = 2) {
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const snapshot = await getDoc(doc(db, 'users', user.uid));
      if (snapshot.exists()) return { id: snapshot.id, ...snapshot.data() };
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    if (index < attempts - 1) await wait(300);
  }
  if (lastError) throw lastError;
  return null;
}

export function observeSession(callback) {
  return onAuthStateChanged(auth, async user => {
    const sequence = ++sessionSequence;
    if (!user) {
      callback({ user: null, profile: null, store: null, goldRates: null });
      return;
    }

    try {
      const profile = await readProfileWithRetry(user, 2);
      if (sequence !== sessionSequence) return;

      if (!profile) {
        callback({ user, profile: null, store: null, goldRates: null });
        return;
      }

      if (profile.active === false) {
        callback({ user, profile, store: null, goldRates: null });
        return;
      }

      const [store, goldRates] = await Promise.all([
        getStoreSettings(),
        getGoldRates()
      ]);
      if (sequence !== sessionSequence) return;

      callback({
        user,
        profile,
        store,
        goldRates: goldRates || { rates: DEFAULT_GOLD_RATES }
      });
    } catch (error) {
      if (sequence !== sessionSequence) return;
      callback({ user, profile: null, store: null, goldRates: null, error });
    }
  });
}

function makeAuthError(rawMessage = '') {
  const raw = String(rawMessage || '').trim();
  const key = raw.split(' : ')[0].trim();
  const mapping = {
    EMAIL_EXISTS: ['auth/email-already-in-use', 'Email sudah terdaftar di Firebase Authentication. Jika ini sisa percobaan lama, hapus akun tersebut di Firebase Authentication → Users lalu coba lagi.'],
    OPERATION_NOT_ALLOWED: ['auth/operation-not-allowed', 'Login Email/Kata Sandi belum diaktifkan di Firebase Authentication.'],
    TOO_MANY_ATTEMPTS_TRY_LATER: ['auth/too-many-requests', 'Terlalu banyak percobaan. Coba lagi beberapa saat.'],
    WEAK_PASSWORD: ['auth/weak-password', 'Kata sandi minimal 6 karakter.'],
    PASSWORD_DOES_NOT_MEET_REQUIREMENTS: ['auth/weak-password', 'Kata sandi belum memenuhi kebijakan keamanan Firebase. Gunakan kata sandi yang lebih kuat.'],
    INVALID_EMAIL: ['auth/invalid-email', 'Format email tidak valid.'],
    PROJECT_NUMBER_MISMATCH: ['auth/configuration-not-found', 'Konfigurasi Firebase Authentication tidak cocok dengan project aplikasi.']
  };
  const [code, message] = mapping[key] || ['auth/account-creation-failed', raw || 'Akun pengguna gagal dibuat di Firebase Authentication.'];
  const error = new Error(message);
  error.code = code;
  return error;
}

async function authRestRequest(action, payload) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw makeAuthError(data?.error?.message || `HTTP_${response.status}`);
  return data;
}

export async function createStaffAccount({ name, email, password, role, phone = '' }) {
  if (!state.user || !['owner', 'admin'].includes(state.profile?.role)) {
    const error = new Error('Hanya Pemilik atau Administrator yang dapat menambah pengguna.');
    error.code = 'permission-denied';
    throw error;
  }

  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPhone = String(phone || '').trim();
  if (!cleanName) throw new Error('Nama pengguna wajib diisi.');
  if (!cleanEmail) throw new Error('Email pengguna wajib diisi.');
  if (!STAFF_ROLES.has(role)) throw new Error('Peran pengguna tidak valid.');
  if (String(password || '').length < 6) {
    const error = new Error('Kata sandi minimal 6 karakter.');
    error.code = 'auth/weak-password';
    throw error;
  }

  let authAccount = null;
  try {
    // Buat akun Auth lewat REST agar sesi Pemilik/Administrator yang sedang login
    // tidak pernah berpindah ke akun staf yang baru dibuat.
    authAccount = await authRestRequest('signUp', {
      email: cleanEmail,
      password,
      returnSecureToken: true
    });

    const userId = authAccount.localId;
    if (!userId) throw new Error('Firebase tidak mengembalikan UID pengguna baru.');

    await setDoc(doc(db, 'users', userId), {
      name: cleanName,
      email: cleanEmail,
      role,
      phone: cleanPhone,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: state.user.uid
    });

    await addDoc(collection(db, 'auditLogs'), {
      actorUid: state.user.uid,
      actorName: state.profile?.name || state.user.email,
      action: 'CREATE',
      entity: 'user',
      entityId: userId,
      detail: `${cleanName} • ${role}`,
      createdAt: serverTimestamp()
    }).catch(() => {});

    return userId;
  } catch (error) {
    // Bila akun Auth sudah terbentuk tetapi profil Firestore gagal dibuat,
    // hapus kembali akun Auth agar tidak meninggalkan akun yatim.
    if (authAccount?.idToken) {
      await authRestRequest('delete', { idToken: authAccount.idToken }).catch(() => {});
    }
    throw error;
  }
}

export async function listUsers() {
  const snapshot = await getDocs(query(collection(db, 'users'), orderBy('name', 'asc')));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function updateUserProfile(userId, data) {
  const current = await getDoc(doc(db, 'users', userId));
  if (!current.exists()) throw new Error('Profil pengguna tidak ditemukan.');
  const currentData = current.data();

  const payload = {
    name: String(data.name || '').trim(),
    phone: String(data.phone || '').trim(),
    updatedAt: serverTimestamp(),
    updatedBy: state.user.uid
  };

  // Peran Pemilik dikunci agar akun utama tidak dapat terdemote tanpa sengaja.
  if (currentData.role === 'owner') {
    payload.role = 'owner';
    payload.active = true;
  } else {
    payload.role = STAFF_ROLES.has(data.role) ? data.role : currentData.role;
    payload.active = data.active !== false;
  }

  await setDoc(doc(db, 'users', userId), payload, { merge: true });

  await addDoc(collection(db, 'auditLogs'), {
    actorUid: state.user.uid,
    actorName: state.profile?.name || state.user.email,
    action: 'UPDATE',
    entity: 'user',
    entityId: userId,
    detail: `${payload.name || ''} • ${payload.role || ''} • ${payload.active === false ? 'nonaktif' : 'aktif'}`,
    createdAt: serverTimestamp()
  }).catch(() => {});
}

export async function changeOwnPassword(currentPassword, newPassword) {
  const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
  await reauthenticateWithCredential(auth.currentUser, credential);
  await updatePassword(auth.currentUser, newPassword);
}
