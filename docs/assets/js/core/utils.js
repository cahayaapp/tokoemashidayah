export const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
export const numberID = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });

export function formatRupiah(value) { return rupiah.format(Number(value) || 0); }
export function formatNumber(value, max = 3) { return new Intl.NumberFormat('id-ID', { maximumFractionDigits: max }).format(Number(value) || 0); }
export function formatGram(value) { return `${formatNumber(value, 3)} gr`; }
export function toNumber(value) { return Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0; }
export function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value, options = {}) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', ...options });
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dateInputValue(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}

export function monthStart(date = new Date()) { return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0); }
export function monthEnd(date = new Date()) { return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999); }
export function dayStart(date = new Date()) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0); }
export function dayEnd(date = new Date()) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999); }

export function generateCode(prefix = 'TRX') {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  const stamp = `${String(now.getFullYear()).slice(-2)}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

export function normalizeText(value = '') {
  return String(value).toLocaleLowerCase('id-ID').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function debounce(fn, wait = 250) {
  let timeout;
  return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => fn(...args), wait); };
}

export function sum(items, selector = item => item) {
  return items.reduce((total, item) => total + (Number(selector(item)) || 0), 0);
}

export function downloadCSV(filename, rows) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const encode = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(encode).join(','), ...rows.map(row => headers.map(key => encode(row[key])).join(','))].join('\n');
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gagal memproses gambar.')), 'image/jpeg', quality);
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca gambar.'));
    reader.readAsDataURL(blob);
  });
}

async function loadImageForCanvas(file) {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw(ctx, width, height) { ctx.drawImage(bitmap, 0, 0, width, height); },
        close() { bitmap.close(); }
      };
    } catch (_) {}
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Format gambar tidak dapat dibaca.'));
      img.src = url;
    });
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      draw(ctx, width, height) { ctx.drawImage(image, 0, 0, width, height); },
      close() { URL.revokeObjectURL(url); }
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function compressImage(file, maxWidth = 1200, quality = 0.82) {
  if (!file?.type?.startsWith('image/')) throw new Error('File harus berupa gambar.');
  const source = await loadImageForCanvas(file);
  try {
    const scale = Math.min(1, maxWidth / source.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    source.draw(ctx, canvas.width, canvas.height);
    return await canvasToJpegBlob(canvas, quality);
  } finally {
    source.close();
  }
}

// Foto produk disimpan langsung di Cloud Firestore, bukan Cloud Storage.
// Target ukuran dibuat kecil agar aman di bawah batas maksimum dokumen Firestore 1 MiB.
export async function compressImageForFirestore(file, options = {}) {
  if (!file?.type?.startsWith('image/')) throw new Error('File harus berupa gambar JPG, PNG, HEIC, atau WebP yang dapat dibaca browser.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Ukuran foto asli terlalu besar. Maksimal 20 MB.');

  const maxBytes = Number(options.maxBytes) || 420000;
  const maxDimension = Number(options.maxDimension) || 900;
  const minDimension = 420;
  const source = await loadImageForCanvas(file);

  try {
    let dimension = Math.min(maxDimension, Math.max(source.width, source.height));
    let bestBlob = null;
    let bestWidth = 0;
    let bestHeight = 0;

    while (dimension >= minDimension) {
      const scale = Math.min(1, dimension / Math.max(source.width, source.height));
      const width = Math.max(1, Math.round(source.width * scale));
      const height = Math.max(1, Math.round(source.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      source.draw(ctx, width, height);

      for (const quality of [0.82, 0.74, 0.66, 0.58, 0.50]) {
        const blob = await canvasToJpegBlob(canvas, quality);
        bestBlob = blob;
        bestWidth = width;
        bestHeight = height;
        if (blob.size <= maxBytes) {
          const dataUrl = await blobToDataURL(blob);
          if (dataUrl.length > 650000) continue;
          return {
            dataUrl,
            mimeType: 'image/jpeg',
            sizeBytes: blob.size,
            width,
            height
          };
        }
      }
      dimension = Math.floor(dimension * 0.78);
    }

    if (!bestBlob) throw new Error('Foto gagal dikompresi.');
    const dataUrl = await blobToDataURL(bestBlob);
    if (dataUrl.length > 650000) throw new Error('Foto masih terlalu besar setelah dikompresi. Pilih foto lain atau crop lebih dekat.');
    return {
      dataUrl,
      mimeType: 'image/jpeg',
      sizeBytes: bestBlob.size,
      width: bestWidth,
      height: bestHeight
    };
  } finally {
    source.close();
  }
}

export function getErrorMessage(error) {
  const code = error?.code || '';
  const messages = {
    'auth/invalid-credential': 'Email atau kata sandi tidak benar.',
    'auth/user-disabled': 'Akun ini dinonaktifkan.',
    'auth/email-already-in-use': 'Email sudah terdaftar.',
    'auth/weak-password': 'Kata sandi minimal 6 karakter.',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi beberapa saat.',
    'auth/operation-not-allowed': 'Login Email/Kata Sandi belum diaktifkan di Firebase Authentication.',
    'auth/unauthorized-domain': 'Domain GitHub Pages belum ditambahkan ke Authorized domains Firebase.',
    'auth/network-request-failed': 'Koneksi ke Firebase terputus. Periksa internet lalu coba lagi.',
    'permission-denied': 'Akses ditolak oleh aturan keamanan Firebase.',
    'failed-precondition': 'Konfigurasi database belum lengkap atau memerlukan indeks Firestore.',
    'storage/unauthorized': 'Cloud Storage belum aktif atau akses ditolak.',
    'storage/bucket-not-found': 'Bucket Cloud Storage belum dibuat.'
  };
  return messages[code] || error?.message || 'Terjadi kesalahan yang tidak diketahui.';
}
