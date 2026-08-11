import { listProducts, listSuppliers, listPurchases, createPurchase } from '../services/data-service.js?v=2.1.2';
import { formatRupiah, formatDateTime, formatNumber, sum, getErrorMessage, escapeHTML } from '../core/utils.js?v=2.1.2';
import { pageLoading, tableEmpty, openModal, closeModal, toast, setButtonLoading } from '../core/ui.js?v=2.1.2';

let products = [];
let suppliers = [];
let purchases = [];

export async function renderPurchases(container) {
  container.innerHTML = `<section class="page">${pageLoading('Memuat pembelian…')}</section>`;
  [products, suppliers, purchases] = await Promise.all([listProducts(), listSuppliers(), listPurchases()]);
  draw(container);
}

function draw(container) {
  const total = sum(purchases, item => item.total);
  container.innerHTML = `
    <section class="page">
      <header class="page-head"><div><span class="eyebrow">Pengadaan Persediaan</span><h2>Pembelian dari Pemasok</h2><p>Catat barang masuk dan perbarui stok dalam satu transaksi.</p></div><div class="page-actions"><button class="button button--gold" id="add-purchase">＋ Pembelian Baru</button></div></header>
      <div class="stats-grid">
        <article class="stat-card"><div class="stat-card__top"><span>Total Pembelian Bulan Ini</span><i>↓</i></div><strong>${formatRupiah(total)}</strong><small>${purchases.length} dokumen pembelian</small></article>
        <article class="stat-card stat-card--green"><div class="stat-card__top"><span>Item Masuk</span><i>＋</i></div><strong>${formatNumber(sum(purchases, p => sum(p.lines || [], l => l.qty)))}</strong><small>${formatNumber(sum(purchases, p => sum(p.lines || [], l => l.weightGrams)))} gram</small></article>
      </div>
      <article class="card"><div class="card__body card__body--flush">${purchaseTable()}</div></article>
    </section>`;
  container.querySelector('#add-purchase').addEventListener('click', openPurchaseForm);
}

function purchaseTable() {
  if (!purchases.length) return tableEmpty('Belum ada pembelian bulan ini.');
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Waktu</th><th>Nomor</th><th>Pemasok</th><th>Rincian</th><th>Status</th><th>Total</th><th>Petugas</th></tr></thead><tbody>${purchases.map(item => `<tr><td>${formatDateTime(item.createdAt)}</td><td><strong>${escapeHTML(item.purchaseNo)}</strong></td><td>${escapeHTML(item.supplierName || '—')}</td><td>${(item.lines || []).length} produk • ${formatNumber(sum(item.lines || [], line => line.weightGrams))} gr</td><td><span class="badge ${item.paymentStatus === 'Lunas' ? 'badge--success' : 'badge--warning'}">${escapeHTML(item.paymentStatus || '—')}</span></td><td><strong>${formatRupiah(item.total)}</strong></td><td>${escapeHTML(item.createdByName || '—')}</td></tr>`).join('')}</tbody></table></div>`;
}

function openPurchaseForm() {
  let lines = [];
  openModal({
    title:'Pembelian Baru', size:'xl',
    content:`<form id="purchase-form">
      <div class="form-grid">
        <div class="field"><label>Pemasok</label><select name="supplierId"><option value="">Tanpa pemasok</option>${suppliers.map(item => `<option value="${item.id}" data-name="${escapeHTML(item.name)}">${escapeHTML(item.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Status Pembayaran</label><select name="paymentStatus"><option>Lunas</option><option>Belum Lunas</option><option>Termin</option></select></div>
        <div class="field field--full"><label>Catatan</label><textarea name="notes"></textarea></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card__head"><div><h3>Rincian Barang Masuk</h3><p>Pilih produk lalu tambahkan ke dokumen pembelian.</p></div></div>
        <div class="card__body" style="padding-top:0"><div class="field-row"><div class="field" style="flex:1"><label>Produk</label><select id="purchase-product-select"><option value="">Pilih produk…</option>${products.map(item => `<option value="${item.id}">${escapeHTML(item.name)} • ${escapeHTML(item.sku || '')}</option>`).join('')}</select></div><button type="button" class="button button--outline" id="add-purchase-line">＋ Tambahkan</button></div></div>
        <div id="purchase-lines"></div>
      </div>
      <div class="summary-row summary-row--total" style="margin-top:14px"><span>Total Pembelian</span><strong id="purchase-total">${formatRupiah(0)}</strong></div>
      <div style="display:flex;justify-content:flex-end;gap:9px;margin-top:18px"><button type="button" class="button button--ghost" data-modal-close>Batal</button><button type="submit" class="button button--gold">Simpan Pembelian</button></div>
    </form>`
  });
  const form = document.getElementById('purchase-form');
  const lineHost = form.querySelector('#purchase-lines');
  const totalHost = form.querySelector('#purchase-total');
  const select = form.querySelector('#purchase-product-select');
  form.querySelector('[data-modal-close]').addEventListener('click', closeModal);

  function renderLines() {
    lineHost.innerHTML = lines.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Produk</th><th>Qty</th><th>Berat (gr)</th><th>Modal/Unit</th><th>Subtotal</th><th></th></tr></thead><tbody>${lines.map((line,index) => `<tr><td><strong>${escapeHTML(line.name)}</strong><small style="display:block;color:var(--muted)">${escapeHTML(line.sku || '')}</small></td><td><input class="filter-select" style="width:90px" type="number" step="0.001" min="0" value="${line.qty}" data-purchase-qty="${index}"></td><td><input class="filter-select" style="width:110px" type="number" step="0.001" min="0" value="${line.weightGrams}" data-purchase-weight="${index}"></td><td><input class="filter-select" style="width:145px" type="number" step="1000" min="0" value="${line.costPrice}" data-purchase-cost="${index}"></td><td><strong>${formatRupiah(line.subtotal)}</strong></td><td><button type="button" class="button button--danger button--sm" data-remove-purchase="${index}">×</button></td></tr>`).join('')}</tbody></table></div>` : tableEmpty('Tambahkan produk yang dibeli.');
    totalHost.textContent = formatRupiah(sum(lines, line => line.subtotal));
    lineHost.querySelectorAll('[data-purchase-qty]').forEach(input => input.addEventListener('change', () => updateLine(Number(input.dataset.purchaseQty), 'qty', input.value)));
    lineHost.querySelectorAll('[data-purchase-weight]').forEach(input => input.addEventListener('change', () => updateLine(Number(input.dataset.purchaseWeight), 'weightGrams', input.value)));
    lineHost.querySelectorAll('[data-purchase-cost]').forEach(input => input.addEventListener('change', () => updateLine(Number(input.dataset.purchaseCost), 'costPrice', input.value)));
    lineHost.querySelectorAll('[data-remove-purchase]').forEach(button => button.addEventListener('click', () => { lines.splice(Number(button.dataset.removePurchase), 1); renderLines(); }));
  }

  function updateLine(index, key, value) {
    lines[index][key] = Number(value) || 0;
    lines[index].subtotal = lines[index].costPrice * (lines[index].priceBasis === 'gram' ? lines[index].weightGrams : lines[index].qty);
    renderLines();
  }

  form.querySelector('#add-purchase-line').addEventListener('click', () => {
    const product = products.find(item => item.id === select.value);
    if (!product) return toast('Pilih produk terlebih dahulu.', 'warning');
    const existing = lines.find(line => line.productId === product.id);
    if (existing) {
      existing.qty += 1;
      existing.weightGrams += Number(product.weightPerItem || 0);
      existing.subtotal = existing.costPrice * (existing.priceBasis === 'gram' ? existing.weightGrams : existing.qty);
    } else {
      const line = {
        productId:product.id, name:product.name, sku:product.sku || '', qty:1,
        weightGrams:Number(product.weightPerItem || 0), costPrice:Number(product.costPrice || 0),
        priceBasis:product.priceMode === 'gold_rate' ? 'gram' : 'item'
      };
      line.subtotal = line.costPrice * (line.priceBasis === 'gram' ? line.weightGrams : line.qty);
      lines.push(line);
    }
    select.value = '';
    renderLines();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!lines.length) return toast('Tambahkan minimal satu produk.', 'warning');
    const button = form.querySelector('[type=submit]');
    setButtonLoading(button, true, 'Menyimpan…');
    try {
      const option = form.elements.supplierId.selectedOptions[0];
      const total = sum(lines, line => line.subtotal);
      await createPurchase({
        supplierId:form.elements.supplierId.value, supplierName:option?.dataset.name || '',
        paymentStatus:form.elements.paymentStatus.value, notes:form.elements.notes.value, total, lines
      });
      closeModal(); toast('Pembelian tersimpan dan stok telah diperbarui.');
      await renderPurchases(document.getElementById('page-content'));
    } catch (error) { toast(getErrorMessage(error), 'error'); setButtonLoading(button, false); }
  });
  renderLines();
}
