import { escapeHTML } from './utils.js?v=2.1.4';

export function toast(message, type = 'success', duration = 3200) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = document.createElement('div');
  node.className = `toast toast--${type}`;
  node.innerHTML = `<span class="toast__dot"></span><div>${escapeHTML(message)}</div>`;
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-visible'));
  setTimeout(() => {
    node.classList.remove('is-visible');
    setTimeout(() => node.remove(), 250);
  }, duration);
}

export function setButtonLoading(button, loading, text = 'Memproses…') {
  if (!button) return;
  if (loading) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span>${escapeHTML(text)}`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.original || button.innerHTML;
  }
}

export function openModal({ title = '', content = '', size = 'md', actions = '' }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-modal-close>
      <section class="modal modal--${size}" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}" data-modal-panel>
        <header class="modal__header"><div><span class="eyebrow">Toko Emas Hidayah</span><h2>${escapeHTML(title)}</h2></div><button class="icon-button" type="button" aria-label="Tutup" data-modal-close>×</button></header>
        <div class="modal__body">${content}</div>
        ${actions ? `<footer class="modal__footer">${actions}</footer>` : ''}
      </section>
    </div>`;
  const backdrop = root.querySelector('.modal-backdrop');
  requestAnimationFrame(() => backdrop.classList.add('is-open'));
  backdrop.addEventListener('click', event => {
    if (event.target.matches('[data-modal-close]')) closeModal();
  });
  document.addEventListener('keydown', modalEscapeHandler);
  return root.querySelector('[data-modal-panel]');
}

function modalEscapeHandler(event) { if (event.key === 'Escape') closeModal(); }

export function closeModal() {
  const backdrop = document.querySelector('.modal-backdrop');
  document.removeEventListener('keydown', modalEscapeHandler);
  if (!backdrop) return;
  backdrop.classList.remove('is-open');
  setTimeout(() => { const root = document.getElementById('modal-root'); if (root) root.innerHTML = ''; }, 180);
}

export function confirmDialog({ title = 'Konfirmasi', message, confirmText = 'Ya, lanjutkan', danger = false }) {
  return new Promise(resolve => {
    openModal({
      title,
      content: `<div class="confirm-copy"><div class="confirm-icon ${danger ? 'confirm-icon--danger' : ''}">${danger ? '!' : '?'}</div><p>${escapeHTML(message)}</p></div>`,
      actions: `<button class="button button--ghost" data-cancel>Batal</button><button class="button ${danger ? 'button--danger' : 'button--gold'}" data-confirm>${escapeHTML(confirmText)}</button>`
    });
    const root = document.getElementById('modal-root');
    root.querySelector('[data-cancel]').addEventListener('click', () => { closeModal(); resolve(false); });
    root.querySelector('[data-confirm]').addEventListener('click', () => { closeModal(); resolve(true); });
  });
}

export function tableEmpty(message = 'Belum ada data.') {
  return `<div class="empty-state"><div class="empty-state__icon">◇</div><strong>${escapeHTML(message)}</strong><span>Data akan muncul di sini setelah ditambahkan.</span></div>`;
}

export function pageLoading(message = 'Memuat data…') {
  return `<div class="page-loading"><span class="spinner spinner--large"></span><p>${escapeHTML(message)}</p></div>`;
}

export function badge(text, tone = 'neutral') { return `<span class="badge badge--${tone}">${escapeHTML(text)}</span>`; }

export function renderStatCard({ label, value, note = '', icon = '◆', tone = 'gold' }) {
  return `<article class="stat-card stat-card--${tone}"><div class="stat-card__top"><span>${escapeHTML(label)}</span><i>${icon}</i></div><strong>${value}</strong><small>${escapeHTML(note)}</small></article>`;
}

export function attachCurrencyInput(input) {
  input.addEventListener('input', () => {
    const raw = input.value.replace(/\D/g, '');
    input.dataset.value = raw;
    input.value = raw ? new Intl.NumberFormat('id-ID').format(Number(raw)) : '';
  });
}

export function getCurrencyValue(input) { return Number(input?.dataset?.value || input?.value?.replace(/\D/g, '') || 0); }
