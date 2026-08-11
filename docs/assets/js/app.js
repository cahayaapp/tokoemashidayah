import { observeSession, login, logout, registerInitialOwner, completeInitialOwnerProfile } from './services/auth-service.js?v=2.1.2';
import { setSession, clearSession, state } from './core/state.js?v=2.1.2';
import { NAV_ITEMS, ROLES, APP_VERSION } from './core/constants.js?v=2.1.2';
import { toast, setButtonLoading } from './core/ui.js?v=2.1.2';
import { getErrorMessage, escapeHTML } from './core/utils.js?v=2.1.2';
import { renderDashboard } from './modules/dashboard.js?v=2.1.2';
import { renderPOS } from './modules/pos.js?v=2.1.2';
import { renderProducts } from './modules/products.js?v=2.1.2';
import { renderInventory } from './modules/inventory.js?v=2.1.2';
import { renderPurchases } from './modules/purchases.js?v=2.1.2';
import { renderBuyback } from './modules/buyback.js?v=2.1.2';
import { renderContacts } from './modules/contacts.js?v=2.1.2';
import { renderExpenses } from './modules/expenses.js?v=2.1.2';
import { renderReports } from './modules/reports.js?v=2.1.2';
import { renderPrices } from './modules/prices.js?v=2.1.2';
import { renderUsers } from './modules/users.js?v=2.1.2';
import { renderSettings } from './modules/settings.js?v=2.1.2';

const appRoot = document.getElementById('app');
const routeHandlers = {
  dashboard: renderDashboard,
  pos: renderPOS,
  products: renderProducts,
  inventory: renderInventory,
  purchases: renderPurchases,
  buyback: renderBuyback,
  contacts: renderContacts,
  expenses: renderExpenses,
  reports: renderReports,
  prices: renderPrices,
  users: renderUsers,
  settings: renderSettings
};

let sessionResolved = false;
const startupTimer = window.setTimeout(() => {
  if (sessionResolved) return;
  renderStartupFailure('Koneksi ke Firebase terlalu lama. Periksa internet, lalu muat ulang aplikasi.');
}, 15000);

observeSession(session => {
  sessionResolved = true;
  window.clearTimeout(startupTimer);
  if (!session.user) {
    clearSession();
    renderAuth();
    return;
  }
  if (session.error) {
    setSession(session);
    renderAccessIssue(`${getErrorMessage(session.error)} Pastikan aturan Firestore versi terbaru sudah dipasang.`);
    return;
  }
  if (!session.profile || !session.store) {
    setSession(session);
    renderProfileRecovery(session.user, session.profile);
    return;
  }
  if (session.profile.active === false) {
    setSession(session);
    renderAccessIssue('Akun Anda sedang dinonaktifkan. Hubungi Pemilik atau Administrator toko.');
    return;
  }
  setSession(session);
  renderShell();
});

window.addEventListener('hashchange', () => {
  if (state.user && state.profile?.active) navigate();
});

function renderStartupFailure(message) {
  appRoot.innerHTML = `<main class="splash-screen"><section class="auth-card" style="color:var(--ink);text-align:center;max-width:560px"><div class="brand-mark brand-mark--large" style="margin:auto">TH</div><h2 style="font-family:Manrope;margin:22px 0 8px">Aplikasi Belum Terhubung</h2><p style="color:var(--muted);line-height:1.7">${escapeHTML(message)}</p><button class="button button--gold button--block" id="startup-reload" style="margin-top:16px">Muat Ulang</button></section></main>`;
  appRoot.querySelector('#startup-reload')?.addEventListener('click', () => location.reload());
}

function renderAuth() {
  appRoot.innerHTML = `
    <main class="auth-shell">
      <section class="auth-showcase">
        <div class="auth-brand"><div class="brand-mark">TH</div><div><strong>Toko Emas Hidayah</strong><span>Gold Retail Management System</span></div></div>
        <div class="auth-copy"><span class="eyebrow">Aplikasi Toko Emas Modern</span><h1>Presisi dalam stok. Transparan dalam transaksi.</h1><p>Satu sistem untuk kasir, harga emas, pembelian, buyback, pelanggan, pemasok, laporan, dan pengawasan aktivitas toko.</p></div>
        <div class="auth-features"><div class="auth-feature"><b>POS Responsif</b><span>Nyaman dipakai dari laptop, tablet, maupun HP.</span></div><div class="auth-feature"><b>Stok Berlapis</b><span>Pantau jumlah item sekaligus berat gram.</span></div><div class="auth-feature"><b>Audit Aman</b><span>Jejak aktivitas dan akses berbasis peran.</span></div></div>
      </section>
      <section class="auth-panel"><div class="auth-card"><div class="auth-card__head"><span class="eyebrow">Selamat Datang</span><h2>Akses Sistem Toko</h2><p>Masuk dengan akun yang telah didaftarkan.</p></div><div class="auth-tabs"><button class="auth-tab is-active" data-auth-tab="login">Masuk</button><button class="auth-tab" data-auth-tab="setup">Aktivasi Awal</button></div><div id="auth-form-host"></div><div class="auth-footer">Toko Emas Hidayah • Versi ${APP_VERSION}</div></div></section>
    </main>`;
  appRoot.querySelectorAll('[data-auth-tab]').forEach(button => button.addEventListener('click', () => {
    appRoot.querySelectorAll('[data-auth-tab]').forEach(item => item.classList.toggle('is-active', item === button));
    button.dataset.authTab === 'login' ? renderLoginForm() : renderSetupForm();
  }));
  renderLoginForm();
}

function renderLoginForm() {
  const host = document.getElementById('auth-form-host');
  host.innerHTML = `<form id="login-form"><div class="field"><label>Email</label><input type="email" name="email" autocomplete="email" required placeholder="nama@toko.com"></div><div class="field" style="margin-top:14px"><label>Kata Sandi</label><input type="password" name="password" autocomplete="current-password" required placeholder="••••••••"></div><button class="button button--gold button--block" type="submit" style="margin-top:20px">Masuk ke Aplikasi</button></form>`;
  const form = host.querySelector('#login-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]');
    setButtonLoading(button, true, 'Memeriksa akun…');
    try { await login(form.elements.email.value, form.elements.password.value); }
    catch (error) { toast(getErrorMessage(error), 'error'); setButtonLoading(button, false); }
  });
}

function renderSetupForm() {
  const host = document.getElementById('auth-form-host');
  host.innerHTML = `<div class="auth-note" style="margin-bottom:16px">Gunakan hanya satu kali untuk membuat akun Pemilik pertama. Setelah toko aktif, buat akun lain melalui menu Pengguna.</div><form id="setup-form"><div class="form-grid"><div class="field field--full"><label>Nama Pemilik *</label><input name="name" required></div><div class="field field--full"><label>Nama Toko *</label><input name="storeName" required value="Toko Emas Hidayah"></div><div class="field"><label>Telepon</label><input name="phone"></div><div class="field"><label>Email Login *</label><input type="email" name="email" required></div><div class="field field--full"><label>Alamat Toko</label><textarea name="address"></textarea></div><div class="field"><label>Kata Sandi *</label><input type="password" name="password" minlength="6" required></div><div class="field"><label>Ulangi Kata Sandi *</label><input type="password" name="confirmPassword" minlength="6" required></div></div><button class="button button--gold button--block" type="submit" style="margin-top:20px">Aktifkan Toko</button></form>`;
  const form = host.querySelector('#setup-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.elements.password.value !== form.elements.confirmPassword.value) return toast('Konfirmasi kata sandi tidak sama.', 'warning');
    const button = form.querySelector('[type=submit]');
    setButtonLoading(button, true, 'Mengaktifkan…');
    try {
      await registerInitialOwner({ name:form.elements.name.value, storeName:form.elements.storeName.value, phone:form.elements.phone.value, email:form.elements.email.value, address:form.elements.address.value, password:form.elements.password.value });
      toast('Aktivasi berhasil. Selamat datang!');
    } catch (error) {
      toast(`${getErrorMessage(error)} Akun yang sempat dibuat tidak akan dihapus; gunakan halaman Masuk untuk melanjutkan aktivasi.`, 'error', 7500);
      setButtonLoading(button, false);
    }
  });
}

function renderProfileRecovery(user, profile = null) {
  const existingName = profile?.name || '';
  const heading = profile ? 'Selesaikan Pengaturan Toko' : 'Selesaikan Aktivasi Pemilik';
  const description = profile
    ? 'Profil Pemilik sudah ada, tetapi konfigurasi toko belum selesai. Lengkapi data berikut untuk masuk ke dashboard.'
    : 'Akun login sudah terbentuk, tetapi profil toko belum selesai dibuat. Lengkapi data berikut tanpa membuat akun baru.';

  appRoot.innerHTML = `<main class="splash-screen"><section class="auth-card" style="color:var(--ink);max-width:620px;width:min(92vw,620px)"><div style="text-align:center"><div class="brand-mark brand-mark--large" style="margin:auto">TH</div><h2 style="font-family:Manrope;margin:22px 0 8px">${heading}</h2><p style="color:var(--muted);line-height:1.7">${description}</p></div><form id="recovery-form" style="margin-top:20px"><div class="form-grid"><div class="field field--full"><label>Email Login</label><input value="${escapeHTML(user?.email || '')}" readonly></div><div class="field field--full"><label>Nama Pemilik *</label><input name="name" required value="${escapeHTML(existingName)}"></div><div class="field field--full"><label>Nama Toko *</label><input name="storeName" required value="Toko Emas Hidayah"></div><div class="field"><label>Telepon</label><input name="phone" value="${escapeHTML(profile?.phone || '')}"></div><div class="field field--full"><label>Alamat Toko</label><textarea name="address"></textarea></div></div><button class="button button--gold button--block" type="submit" style="margin-top:18px">Selesaikan Aktivasi</button><button class="button button--dark button--block" type="button" id="recovery-logout" style="margin-top:10px">Keluar dari Akun</button></form><div class="auth-note" style="margin-top:16px">Apabila toko sudah aktif dan akun ini adalah akun staf, minta Pemilik atau Administrator mendaftarkan akun melalui menu Pengguna.</div></section></main>`;

  const form = appRoot.querySelector('#recovery-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]');
    setButtonLoading(button, true, 'Menyelesaikan…');
    try {
      await completeInitialOwnerProfile({
        name: form.elements.name.value,
        storeName: form.elements.storeName.value,
        phone: form.elements.phone.value,
        address: form.elements.address.value
      });
      toast('Aktivasi berhasil. Memuat dashboard…');
      window.setTimeout(() => location.reload(), 600);
    } catch (activationError) {
      toast(getErrorMessage(activationError), 'error', 7000);
      setButtonLoading(button, false);
    }
  });

  appRoot.querySelector('#recovery-logout').addEventListener('click', logout);
}

function renderAccessIssue(message) {
  appRoot.innerHTML = `<main class="splash-screen"><section class="auth-card" style="color:var(--ink);text-align:center"><div class="brand-mark brand-mark--large" style="margin:auto">TH</div><h2 style="font-family:Manrope;margin:22px 0 8px">Akses Belum Tersedia</h2><p style="color:var(--muted);line-height:1.7">${escapeHTML(message)}</p><button class="button button--dark button--block" id="issue-logout" style="margin-top:14px">Keluar dari Akun</button></section></main>`;
  appRoot.querySelector('#issue-logout').addEventListener('click', logout);
}

function renderShell() {
  const allowedNav = NAV_ITEMS.filter(item => item.roles.includes(state.profile.role));
  const mobileRoutes = ['dashboard','pos','products','buyback','reports'].filter(route => allowedNav.some(item => item.route === route));
  while (mobileRoutes.length < 5) {
    const next = allowedNav.find(item => !mobileRoutes.includes(item.route));
    if (!next) break;
    mobileRoutes.push(next.route);
  }
  appRoot.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar__brand"><div class="brand-mark">TH</div><div><strong>${escapeHTML(state.store?.name || 'Toko Emas Hidayah')}</strong><small>${escapeHTML(state.store?.tagline || 'Gold Retail System')}</small></div></div>
        <nav class="sidebar__nav">${allowedNav.map(item => `<a class="nav-link" href="#${item.route}" data-nav-route="${item.route}"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></a>`).join('')}</nav>
        <div class="sidebar__footer"><div class="sidebar__user"><div class="avatar">${escapeHTML((state.profile.name || state.user.email).slice(0,2).toUpperCase())}</div><div><strong>${escapeHTML(state.profile.name || state.user.email)}</strong><small>${ROLES[state.profile.role]?.label || state.profile.role}</small></div></div><button class="button sidebar__logout" id="logout-button">Keluar</button></div>
      </aside>
      <main class="main"><header class="topbar"><div style="display:flex;align-items:center;gap:12px"><button class="icon-button menu-button" id="menu-button">☰</button><div class="topbar__title"><h1 id="topbar-title">Dashboard</h1><span id="topbar-subtitle">${new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span></div></div><div class="topbar__right"><div class="live-pill">Firebase Terhubung</div><a class="icon-button" href="#pos" title="Transaksi baru">＋</a></div></header><div id="page-content"></div></main>
      <nav class="mobile-nav">${mobileRoutes.map(route => { const item = allowedNav.find(nav => nav.route === route); return `<a href="#${route}" data-mobile-route="${route}"><b>${item.icon}</b><span>${item.label.split(' ')[0]}</span></a>`; }).join('')}</nav>
    </div>`;
  appRoot.querySelector('#logout-button').addEventListener('click', logout);
  appRoot.querySelector('#menu-button').addEventListener('click', () => appRoot.querySelector('#sidebar').classList.toggle('is-open'));
  appRoot.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => appRoot.querySelector('#sidebar').classList.remove('is-open')));
  navigate();
}

async function navigate() {
  const allowedNav = NAV_ITEMS.filter(item => item.roles.includes(state.profile.role));
  let route = location.hash.replace(/^#/, '') || 'dashboard';
  if (!allowedNav.some(item => item.route === route)) route = 'dashboard';
  if (location.hash !== `#${route}`) history.replaceState(null, '', `#${route}`);
  state.currentRoute = route;
  if (typeof state.routeCleanup === 'function') state.routeCleanup();
  state.routeCleanup = null;
  appRoot.querySelectorAll('[data-nav-route]').forEach(link => link.classList.toggle('is-active', link.dataset.navRoute === route));
  appRoot.querySelectorAll('[data-mobile-route]').forEach(link => link.classList.toggle('is-active', link.dataset.mobileRoute === route));
  const item = allowedNav.find(nav => nav.route === route);
  const title = appRoot.querySelector('#topbar-title');
  if (title) title.textContent = item?.label || 'Dashboard';
  const container = document.getElementById('page-content');
  if (!container) return;
  container.scrollIntoView({ block:'start' });
  try {
    await routeHandlers[route](container);
  } catch (error) {
    console.error(error);
    container.innerHTML = `<section class="page"><div class="notice notice--danger"><strong>Halaman gagal dimuat.</strong><span>${escapeHTML(getErrorMessage(error))}</span></div></section>`;
    toast(getErrorMessage(error), 'error');
  }
}
