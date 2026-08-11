import { listProducts, saveProduct, removeProduct } from '../services/data-service.js?v=2.1.1';
import { PRODUCT_CATEGORIES, KARATS } from '../core/constants.js?v=2.1.1';
import { canManage } from '../core/state.js?v=2.1.1';
import { formatRupiah, formatNumber, normalizeText, compressImageForFirestore, downloadCSV, getErrorMessage, escapeHTML } from '../core/utils.js?v=2.1.1';
import { pageLoading, tableEmpty, badge, openModal, closeModal, confirmDialog, toast, setButtonLoading, attachCurrencyInput, getCurrencyValue } from '../core/ui.js?v=2.1.1';

let products = [];
let filtered = [];

export async function renderProducts(container) {
  container.innerHTML = `<section class="page">${pageLoading('Memuat katalog, stok, dan foto produk…')}</section>`;
  products = await listProducts();
  filtered = [...products];
  draw(container);
}

function draw(container) {
  const manager = canManage();
  container.innerHTML = `
    <section class="page">
      <header class="page-head"><div><span class="eyebrow">Master Persediaan</span><h2>Produk & Stok</h2><p>Kelola data perhiasan, foto, kadar, berat, harga, dan stok minimum.</p></div><div class="page-actions"><button class="button button--outline" id="export-products">⇩ Ekspor CSV</button>${manager ? '<button class="button button--gold" id="add-product">＋ Tambah Produk</button>' : ''}</div></header>
      <article class="card"><div class="toolbar"><div class="toolbar__left"><div class="search-box"><span>⌕</span><input class="search-input" id="product-search" placeholder="Cari nama, SKU, atau barcode…"></div><select class="filter-select" id="category-filter"><option value="">Semua Kategori</option>${PRODUCT_CATEGORIES.map(item => `<option>${item}</option>`).join('')}</select><select class="filter-select" id="stock-filter"><option value="">Semua Stok</option><option value="low">Stok Menipis</option><option value="empty">Stok Habis</option></select></div><div class="toolbar__right"><span class="badge badge--neutral" id="product-count">${filtered.length} produk</span></div></div><div id="product-table">${productTable(manager)}</div></article>
    </section>`;
  container.querySelector('#product-search').addEventListener('input', applyFilter);
  container.querySelector('#category-filter').addEventListener('change', applyFilter);
  container.querySelector('#stock-filter').addEventListener('change', applyFilter);
  container.querySelector('#export-products').addEventListener('click', exportProducts);
  if (manager) container.querySelector('#add-product').addEventListener('click', () => openProductForm(container));
  bindTableActions(container, manager);
}

function productTable(manager) {
  if (!filtered.length) return tableEmpty('Produk tidak ditemukan.');
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Produk</th><th>Kategori</th><th>Kadar</th><th>Berat/Item</th><th>Stok</th><th>Harga Jual</th><th>Status</th><th></th></tr></thead><tbody>${filtered.map(product => {
    const low = Number(product.stockQty) <= Number(product.minStock || 0);
    return `<tr><td><div class="table-primary">${product.imageUrl ? `<img class="product-thumb" src="${product.imageUrl}" alt="Foto ${escapeHTML(product.name)}">` : `<div class="product-thumb">${escapeHTML(product.name.slice(0,2).toUpperCase())}</div>`}<div><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.sku)}${product.barcode ? ` • ${escapeHTML(product.barcode)}` : ''}${product.imageSource === 'firestore' ? ' • Foto Firebase' : ''}</small></div></div></td><td>${escapeHTML(product.category || '—')}</td><td>${product.karat ? `${product.karat}K` : '—'}</td><td>${formatNumber(product.weightPerItem)} gr</td><td><strong>${formatNumber(product.stockQty)}</strong><small style="display:block;color:var(--muted)">${formatNumber(product.stockWeightGrams)} gr</small></td><td>${product.priceMode === 'gold_rate' ? badge('Ikut harga emas','info') : formatRupiah(product.sellingPrice)}</td><td>${product.active === false ? badge('Nonaktif','neutral') : low ? badge(Number(product.stockQty) <= 0 ? 'Habis' : 'Menipis', Number(product.stockQty) <= 0 ? 'danger':'warning') : badge('Tersedia','success')}</td><td><div class="table-actions">${manager ? `<button class="button button--outline button--sm" data-edit="${product.id}">Edit</button><button class="button button--danger button--sm" data-delete="${product.id}">Hapus</button>` : '<span class="badge badge--neutral">Lihat saja</span>'}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function applyFilter(event) {
  const page = event.currentTarget.closest('.page');
  const search = normalizeText(page.querySelector('#product-search').value);
  const category = page.querySelector('#category-filter').value;
  const stock = page.querySelector('#stock-filter').value;
  filtered = products.filter(product => {
    const text = normalizeText(`${product.name} ${product.sku} ${product.barcode || ''}`);
    const stockQty = Number(product.stockQty) || 0;
    const low = stockQty <= Number(product.minStock || 0);
    return (!search || text.includes(search)) && (!category || product.category === category) && (!stock || (stock === 'low' && low && stockQty > 0) || (stock === 'empty' && stockQty <= 0));
  });
  page.querySelector('#product-table').innerHTML = productTable(canManage());
  page.querySelector('#product-count').textContent = `${filtered.length} produk`;
  bindTableActions(page.closest('#page-content') || document, canManage());
}

function bindTableActions(container, manager) {
  if (!manager) return;
  container.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => openProductForm(container, products.find(item => item.id === button.dataset.edit))));
  container.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => {
    const product = products.find(item => item.id === button.dataset.delete);
    if (!await confirmDialog({ title:'Hapus Produk', message:`Hapus ${product.name}? Foto produk juga akan dihapus dari Firebase. Riwayat transaksi lama tetap tersimpan.`, confirmText:'Hapus Produk', danger:true })) return;
    try { await removeProduct(product); toast('Produk dan fotonya berhasil dihapus.'); await renderProducts(document.getElementById('page-content')); } catch (error) { toast(getErrorMessage(error), 'error'); }
  }));
}

function photoEditor(product) {
  const hasImage = Boolean(product?.imageUrl);
  return `<div class="field field--full">
    <label>Foto Produk</label>
    <div class="firebase-photo-editor">
      <div class="firebase-photo-preview" id="product-image-preview">${hasImage ? `<img src="${product.imageUrl}" alt="Foto produk saat ini">` : '<span>Belum ada foto</span>'}</div>
      <div class="firebase-photo-controls">
        <input type="file" id="product-image" accept="image/*" capture="environment">
        <small>Foto otomatis dikompresi lalu disimpan langsung di <strong>Firebase Firestore</strong>. Cloud Storage tidak diperlukan.</small>
        ${hasImage ? '<label class="firebase-photo-remove"><input type="checkbox" id="remove-product-image"> Hapus foto saat produk disimpan</label>' : ''}
      </div>
    </div>
  </div>`;
}

function openProductForm(container, product = null) {
  const isEdit = Boolean(product);
  openModal({
    title: isEdit ? 'Edit Produk' : 'Tambah Produk', size:'lg',
    content:`<form id="product-form"><div class="form-grid form-grid--3">
      ${photoEditor(product)}
      <div class="field"><label>Nama Produk *</label><input name="name" required value="${escapeHTML(product?.name || '')}" placeholder="Contoh: Cincin Berlian 22K"></div>
      <div class="field"><label>SKU</label><input name="sku" value="${escapeHTML(product?.sku || '')}" placeholder="Otomatis bila kosong"></div>
      <div class="field"><label>Barcode</label><input name="barcode" value="${escapeHTML(product?.barcode || '')}"></div>
      <div class="field"><label>Kategori *</label><select name="category" required>${PRODUCT_CATEGORIES.map(item => `<option ${product?.category===item?'selected':''}>${item}</option>`).join('')}</select></div>
      <div class="field"><label>Kadar Emas</label><select name="karat"><option value="0">Non-emas / tidak ditentukan</option>${KARATS.map(k => `<option value="${k}" ${Number(product?.karat)===k?'selected':''}>${k} Karat</option>`).join('')}</select></div>
      <div class="field"><label>Kemurnian (%)</label><input type="number" step="0.01" name="purity" value="${product?.purity || ''}" placeholder="91.67"></div>
      <div class="field"><label>Satuan Stok</label><select name="unitType"><option value="item" ${product?.unitType!=='gram'?'selected':''}>Per item</option><option value="gram" ${product?.unitType==='gram'?'selected':''}>Per gram</option></select></div>
      <div class="field"><label>Berat per Item (gram)</label><input type="number" step="0.001" name="weightPerItem" value="${product?.weightPerItem || ''}"></div>
      <div class="field"><label>Jumlah Stok (item)</label><input type="number" min="0" step="1" name="stockQty" value="${product?.stockQty ?? 0}"><small>Untuk satuan per item, isi jumlah barang. Untuk satuan per gram, utamakan Total Berat Stok.</small></div>
      <div class="field"><label>Total Berat Stok (gram)</label><input type="number" step="0.001" name="stockWeightGrams" value="${product?.stockWeightGrams ?? 0}"></div>
      <div class="field"><label>Stok Minimum</label><input type="number" step="0.001" name="minStock" value="${product?.minStock ?? 1}"></div>
      <div class="field"><label>Mode Harga</label><select name="priceMode" id="price-mode"><option value="fixed" ${product?.priceMode!=='gold_rate'?'selected':''}>Harga tetap per item</option><option value="gold_rate" ${product?.priceMode==='gold_rate'?'selected':''}>Harga emas per gram</option></select></div>
      <div class="field"><label>Harga Modal</label><input class="currency-input" name="costPrice" value="${product?.costPrice ? new Intl.NumberFormat('id-ID').format(product.costPrice):''}" data-value="${product?.costPrice || 0}"></div>
      <div class="field"><label>Harga Jual Tetap</label><input class="currency-input" name="sellingPrice" value="${product?.sellingPrice ? new Intl.NumberFormat('id-ID').format(product.sellingPrice):''}" data-value="${product?.sellingPrice || 0}"></div>
      <div class="field"><label>Ongkos / Gram</label><input class="currency-input" name="laborCost" value="${product?.laborCost ? new Intl.NumberFormat('id-ID').format(product.laborCost):''}" data-value="${product?.laborCost || 0}"></div>
      <div class="field field--full"><label>Catatan</label><textarea name="notes">${escapeHTML(product?.notes || '')}</textarea></div>
      <div class="field field--full"><div class="switch-row"><div><strong>Produk Aktif</strong><small style="display:block">Produk aktif tampil pada halaman kasir.</small></div><label class="switch"><input type="checkbox" name="active" ${product?.active !== false ? 'checked':''}><span></span></label></div></div>
    </div><div style="display:flex;justify-content:flex-end;gap:9px;margin-top:20px"><button class="button button--ghost" type="button" data-modal-close>Batal</button><button class="button button--gold" type="submit">Simpan Produk</button></div></form>`
  });

  const form = document.getElementById('product-form');
  const imageInput = form.querySelector('#product-image');
  const preview = form.querySelector('#product-image-preview');
  const removeImage = form.querySelector('#remove-product-image');
  let previewUrl = '';

  form.querySelectorAll('.currency-input').forEach(attachCurrencyInput);
  form.querySelector('[data-modal-close]').addEventListener('click', closeModal);

  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${previewUrl}" alt="Preview foto baru">`;
    if (removeImage) removeImage.checked = false;
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('[type=submit]');
    setButtonLoading(submit, true, 'Menyimpan foto & produk…');
    try {
      const fd = new FormData(form);
      const file = imageInput.files[0];
      let imageChange = null;

      if (file) {
        toast('Mengompresi foto untuk Firebase…', 'info', 1800);
        const image = await compressImageForFirestore(file);
        imageChange = { action: 'replace', ...image };
      } else if (removeImage?.checked) {
        imageChange = { action: 'delete' };
      }

      const stockQty = Number(fd.get('stockQty')) || 0;
      const weightPerItem = Number(fd.get('weightPerItem')) || 0;
      await saveProduct({
        name:fd.get('name'), sku:fd.get('sku'), barcode:fd.get('barcode'), category:fd.get('category'), karat:fd.get('karat'), purity:fd.get('purity'), unitType:fd.get('unitType'),
        weightPerItem, stockQty, stockWeightGrams:Number(fd.get('stockWeightGrams')) || stockQty*weightPerItem, minStock:fd.get('minStock'), priceMode:fd.get('priceMode'),
        costPrice:getCurrencyValue(form.elements.costPrice), sellingPrice:getCurrencyValue(form.elements.sellingPrice), laborCost:getCurrencyValue(form.elements.laborCost),
        notes:fd.get('notes'), active:form.elements.active.checked, photoStorage: product?.photoStorage || undefined
      }, product?.id || null, imageChange);

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      closeModal();
      toast(file ? 'Produk dan foto berhasil disimpan di Firebase.' : (isEdit ? 'Produk diperbarui.' : 'Produk berhasil ditambahkan.'));
      await renderProducts(document.getElementById('page-content'));
    } catch (error) {
      toast(getErrorMessage(error),'error', 6500);
      setButtonLoading(submit,false);
    }
  });
}

function exportProducts() {
  downloadCSV(`produk-toko-emas-${new Date().toISOString().slice(0,10)}.csv`, filtered.map(item => ({ SKU:item.sku, Nama:item.name, Kategori:item.category, Karat:item.karat, 'Berat/Item':item.weightPerItem, 'Jumlah Stok':item.stockQty, 'Berat Stok':item.stockWeightGrams, 'Harga Modal':item.costPrice, 'Harga Jual':item.sellingPrice, 'Mode Harga':item.priceMode, Status:item.active===false?'Nonaktif':'Aktif' })));
}
