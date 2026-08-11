import { firebaseConfig, auth, db } from '../config/firebase.js?v=2.1.0';
import { DEFAULT_GOLD_RATES } from '../core/constants.js?v=2.1.0';
import { state } from '../core/state.js?v=2.1.0';
import { getStoreSettings, getGoldRates } from './data-service.js?v=2.1.0';
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut,
  onAuthStateChanged, deleteUser, updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  doc, getDoc, setDoc, collection, addDoc, serverTimestamp, getDocs, query, orderBy
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

let bootstrapInProgress = false;
let sessionSequence = 0;
const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function logout() {
  return firebaseSignOut(auth);
}

async function readProfileWithRetry(user, attempts = 1) {
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
      const profile = await readProfileWithRetry(user, bootstrapInProgress ? 30 : 2);
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

function ownerProfilePayload(user, { name, phone = '' }) {
  return {
    name: name.trim(),
    email: user.email || '',
    role: 'owner',
    active: true,
    phone: phone.trim(),
    updatedAt: serverTimestamp()
  };
}

function storePayload(user, { storeName, phone = '', address = '' }) {
  return {
    ownerUid: user.uid,
    name: storeName.trim() || 'Toko Emas Hidayah',
    tagline: 'Terpercaya • Transparan • Berkah',
    phone: phone.trim(),
    whatsapp: phone.trim(),
    address: address.trim(),
    city: '',
    receiptFooter: 'Terima kasih atas kepercayaan Anda.',
    lowStockDefault: 2,
    taxPercent: 0,
    updatedAt: serverTimestamp()
  };
}

async function ensureInitialOwnerData({ user, name, storeName, phone = '', address = '' }) {
  if (!user) throw new Error('Sesi akun tidak ditemukan. Silakan masuk kembali.');
  if (!name?.trim()) throw new Error('Nama pemilik wajib diisi.');
  if (!storeName?.trim()) throw new Error('Nama toko wajib diisi.');

  const userRef = doc(db, 'users', user.uid);
  const profileSnapshot = await getDoc(userRef);

  if (!profileSnapshot.exists()) {
    await setDoc(userRef, {
      ...ownerProfilePayload(user, { name, phone }),
      createdAt: serverTimestamp()
    });
  } else {
    const existingProfile = profileSnapshot.data();
    if (existingProfile.role !== 'owner') {
      throw new Error('Akun ini bukan akun Pemilik. Hubungi Pemilik atau Administrator toko.');
    }
    await setDoc(userRef, ownerProfilePayload(user, { name, phone }), { merge: true });
  }

  const storeRef = doc(db, 'settings', 'store');
  const storeSnapshot = await getDoc(storeRef);
  if (!storeSnapshot.exists()) {
    await setDoc(storeRef, {
      ...storePayload(user, { storeName, phone, address }),
      createdAt: serverTimestamp()
    });
  } else if (storeSnapshot.data().ownerUid !== user.uid) {
    throw new Error('Toko sudah diaktifkan oleh akun Pemilik lain.');
  } else {
    await setDoc(storeRef, storePayload(user, { storeName, phone, address }), { merge: true });
  }

  const pricesRef = doc(db, 'settings', 'goldPrices');
  const pricesSnapshot = await getDoc(pricesRef);
  if (!pricesSnapshot.exists()) {
    await setDoc(pricesRef, {
      ownerUid: user.uid,
      rates: DEFAULT_GOLD_RATES,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid
    });
  }

  await addDoc(collection(db, 'auditLogs'), {
    actorUid: user.uid,
    actorName: name.trim(),
    action: 'BOOTSTRAP',
    entity: 'system',
    entityId: 'initial',
    detail: 'Aktivasi awal Toko Emas Hidayah',
    createdAt: serverTimestamp()
  }).catch(() => {});
}

export async function registerInitialOwner({ name, email, password, storeName, phone, address }) {
  bootstrapInProgress = true;
  let credential = null;
  try {
    credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await ensureInitialOwnerData({
      user: credential.user,
      name,
      storeName,
      phone,
      address
    });
    return credential.user;
  } catch (error) {
    // Akun sengaja tidak dihapus. Bila penulisan Firestore terhenti,
    // pengguna dapat masuk kembali dan menyelesaikan aktivasi dari layar pemulihan.
    throw error;
  } finally {
    bootstrapInProgress = false;
  }
}

export async function completeInitialOwnerProfile({ name, storeName, phone = '', address = '' }) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi akun telah berakhir. Silakan masuk kembali.');
  bootstrapInProgress = true;
  try {
    await ensureInitialOwnerData({ user, name, storeName, phone, address });
    return user;
  } finally {
    bootstrapInProgress = false;
  }
}

export async function createStaffAccount({ name, email, password, role, phone = '' }) {
  const secondaryApp = initializeApp(
    firebaseConfig,
    `staff-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const secondaryAuth = getAuth(secondaryApp);
  let credential;

  try {
    credential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
    await setDoc(doc(db, 'users', credential.user.uid), {
      name,
      email: email.trim(),
      role,
      phone,
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
      entityId: credential.user.uid,
      detail: `${name} • ${role}`,
      createdAt: serverTimestamp()
    });
    return credential.user.uid;
  } catch (error) {
    if (credential?.user) await deleteUser(credential.user).catch(() => {});
    throw error;
  } finally {
    await firebaseSignOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }
}

export async function listUsers() {
  const snapshot = await getDocs(query(collection(db, 'users'), orderBy('name', 'asc')));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function updateUserProfile(userId, data) {
  await setDoc(doc(db, 'users', userId), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: state.user.uid
  }, { merge: true });

  await addDoc(collection(db, 'auditLogs'), {
    actorUid: state.user.uid,
    actorName: state.profile?.name || state.user.email,
    action: 'UPDATE',
    entity: 'user',
    entityId: userId,
    detail: `${data.name || ''} • ${data.role || ''} • ${data.active === false ? 'nonaktif' : 'aktif'}`,
    createdAt: serverTimestamp()
  });
}

export async function changeOwnPassword(currentPassword, newPassword) {
  const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
  await reauthenticateWithCredential(auth.currentUser, credential);
  await updatePassword(auth.currentUser, newPassword);
}
