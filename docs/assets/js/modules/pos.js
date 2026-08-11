import { listProducts, listCustomers, createSale } from '../services/data-service.js?v=2.1.2';
import { state } from '../core/state.js?v=2.1.2';
import { PAYMENT_METHODS } from '../core/constants.js?v=2.1.2';
import { formatRupiah, formatNumber, normalizeText, sum, getErrorMessage, escapeHTML } from '../core/utils.js?v=2.1.2';
import { pageLoading, tableEmpty, openModal, closeModal, toast, setButtonLoading, attachCurrencyInput, getCurrencyValue } from '../core/ui.js?v=2.1.2';

let catalog = [];
let customers = [];
let cart = [];
let search = '';
let category = '';

export async function renderPOS(container) {
  container.innerHTML = `<section class="page">${pageLoading('Menyiapkan kasir…')}</section>`;
  [catalog, customers] = await Promise.all([listProducts({ activeOnly:true }), listCustomers()]);
  draw(container);
}

function draw(container) {
  const categories = [...new Set(catalog.map(item => item.category).filter(Boolean))];
  container.innerHTML = `
    <section class="page">
      <header class="page-head"><div><span class="eyebrow">Point of Sale</span><h2>Kasir Toko Emas</h2><p>Pilih produk, sesuaikan berat dan harga, lalu selesaikan pembayaran.</p></div><div class="page-actions"><span class="badge badge--success">Kasir: ${escapeHTML(state.profile?.name || '')}</span></div></header>
      <div class="pos-layout">
        <article class="card product-browser"><div class="toolbar"><div class="toolbar__left"><div class="search-box"><span>⌕</span><input class="search-input" id="pos-search" placeholder="Cari nama, SKU, atau scan barcode…" autofocus></div><select class="filter-select" id="pos-category"><option value="">Semua Kategori</option>${categories.map(item => `<option>${escapeHTML(item)}</option>`).join('')}</select></div><div class="toolbar__right"><span class="badge badge--neutral">${catalog.filter(productIsAvailable).length} tersedia</span></div></div><div id="pos-products">${renderProductGrid()}</div></article>
        <article class="card cart-panel" id="cart-panel">${renderCart()}</article>
      </div>
    </section>`;
  container.querySelector('#pos-search').addEventListener('input', event => { search = normalizeText(event.target.value); container.querySelector('#pos-products').innerHTML = renderProductGrid(); bindProductCards(container); });
  container.querySelector('#pos-category').addEventListener('change', event => { category = event.target.value; container.querySelector('#pos-products').innerHTML = renderProductGrid(); bindProductCards(container); });
  bindProductCards(container); bindCart(container);
}

function getSellRate(product) {
  return Number(state.goldRates?.rates?.[product.karat]?.sell || state.goldRates?.rates?.[String(product.karat)]?.sell || 0) + Number(product.laborCost || 0);
}

function getProductPrice(product) { return product.priceMode === 'gold_rate' ? getSellRate(product) : Number(product.sellingPrice || 0); }

function isGramProduct(product) { return product?.unitType === 'gram'; }
function productStockQty(product) { return Math.max(0, Number(product?.stockQty) || 0); }
function productStockWeight(product) {
  const storedWeight = Math.max(0, Number(product?.stockWeightGrams) || 0);
  if (storedWeight > 0) return storedWeight;
  return isGramProduct(product) ? productStockQty(product) : 0;
}
function productIsAvailable(product) {
  return isGramProduct(product) ? productStockWeight(product) > 0 : productStockQty(product) >= 1;
}
function productStockLabel(product) {
  return isGramProduct(product)
    ? `Stok ${formatNumber(productStockWeight(product))} gr`
    : `Stok ${formatNumber(productStockQty(product))} item`;
}

function renderProductGrid() {
  const filtered = catalog.filter(product => {
    const haystack = normalizeText(`${product.name} ${product.sku} ${product.barcode || ''}`);
    return product.active !== false && productIsAvailable(product) && (!search || haystack.includes(search)) && (!category || product.category === category);
  });
  if (!filtered.length) return tableEmpty('Tidak ada produk yang cocok atau stok tersedia.');
  return `<div class="product-grid">${filtered.map(product => `<button class="product-card" data-add-product="${product.id}"><div class="product-card__image">${product.imageUrl ? `<img src="${product.imageUrl}" alt="">` : escapeHTML(product.name.slice(0,2).toUpperCase())}</div><h4>${escapeHTML(product.name)}</h4><small>${escapeHTML(product.sku)} • ${product.karat || '—'}K • ${formatNumber(product.weightPerItem)} gr</small><div class="product-card__meta"><span class="product-card__price">${product.priceMode === 'gold_rate' ? `${formatRupiah(getProductPrice(product))}/gr` : formatRupiah(product.sellingPrice)}</span><span class="badge badge--success">${productStockLabel(product)}</span></div></button>`).join('')}</div>`;
}

function bindProductCards(container) {
  container.querySelectorAll('[data-add-product]').forEach(button => button.addEventListener('click', () => {
    const product = catalog.find(item => item.id === button.dataset.addProduct);
    addToCart(product); refreshCart(container);
  }));
}

function addToCart(product) {
  if (!product || !productIsAvailable(product)) {
    toast('Stok produk ini sudah habis.', 'warning');
    return;
  }

  const gramMode = isGramProduct(product);
  const existing = cart.find(line => line.productId === product.id);
  if (existing) {
    if (gramMode) {
      toast(`${product.name} sudah ada di keranjang. Atur berat penjualan pada kolom gram.`, 'info', 2600);
      return;
    }
    const maxQty = productStockQty(product);
    if (existing.qty + 1 > maxQty + 0.0001) {
      toast(`${product.name} sudah ada di keranjang. Stok tersedia hanya ${formatNumber(maxQty)} item.`, 'warning', 3200);
      return;
    }
    existing.qty = round3(existing.qty + 1);
    existing.weightGrams = round3(existing.weightGrams + Number(product.weightPerItem || 0));
    recalcLine(existing);
    toast(`Jumlah ${product.name}: ${formatNumber(existing.qty)} item.`, 'success', 1400);
    return;
  }

  const stockWeight = productStockWeight(product);
  const suggestedWeight = gramMode
    ? round3(Math.min(stockWeight, Math.max(0.001, Number(product.weightPerItem) || 1)))
    : Number(product.weightPerItem || 0);
  const line = {
    productId: product.id, sku: product.sku, name: product.name, karat: product.karat || 0,
    unitType: gramMode ? 'gram' : 'item',
    qty: 1, weightGrams: suggestedWeight, unitPrice: getProductPrice(product),
    priceBasis: product.priceMode === 'gold_rate' ? 'gram' : 'item', stockQty: productStockQty(product),
    stockWeight, weightPerItem: Number(product.weightPerItem || 0),
    costPrice: Number(product.costPrice || 0)
  };
  recalcLine(line);
  cart.push(line);
  toast(`${product.name} ditambahkan ke keranjang.`, 'success', 1500);
}

function recalcLine(line) {
  line.subtotal = line.priceBasis === 'gram' ? Number(line.weightGrams) * Number(line.unitPrice) : Number(line.qty) * Number(line.unitPrice);
  line.estimatedCost = line.priceBasis === 'gram' ? Number(line.weightGrams) * Number(line.costPrice) : Number(line.qty) * Number(line.costPrice);
}

function round3(value) { return Math.round((Number(value) || 0) * 1000) / 1000; }
function cartSubtotal() { return sum(cart, line => line.subtotal); }

function renderCart() {
  const subtotal = cartSubtotal();
  return `<div class="card__head"><div><span class="eyebrow">Keranjang</span><h3>Transaksi Penjualan</h3><p>${cart.length} jenis produk</p></div>${cart.length ? '<button class="button button--danger button--sm" id="clear-cart">Kosongkan</button>' : ''}</div>
    ${cart.length ? `<div class="cart-lines">${cart.map((line,index) => {
      const gramMode = line.unitType === 'gram';
      const qtyControl = gramMode
        ? `<input type="number" value="1" disabled title="Produk berbasis gram — atur berat pada kolom berikutnya">`
        : `<input type="number" min="1" step="1" max="${line.stockQty}" value="${line.qty}" data-line-qty="${index}" title="Jumlah item">`;
      const weightMax = line.stockWeight > 0 ? ` max="${line.stockWeight}"` : '';
      const stockHint = gramMode
        ? `Stok ${formatNumber(line.stockWeight)} gr`
        : `Stok ${formatNumber(line.stockQty)} item${line.stockWeight > 0 ? ` • ${formatNumber(line.stockWeight)} gr` : ''}`;
      const summary = gramMode
        ? `${formatNumber(line.weightGrams)} gr`
        : `${formatNumber(line.qty)} item • ${formatNumber(line.weightGrams)} gr`;
      return `<div class="cart-line"><div class="cart-line__top"><div><strong>${escapeHTML(line.name)}</strong><small style="display:block;color:var(--muted)">${line.karat || '—'}K • ${line.priceBasis === 'gram' ? 'harga/gram':'harga/item'} • ${stockHint}</small></div><button data-remove-line="${index}" title="Hapus">×</button></div><div class="cart-line__controls">${qtyControl}<input type="number" min="0.001" step="0.001"${weightMax} value="${line.weightGrams}" data-line-weight="${index}" title="Berat gram"><input type="number" min="0" step="1000" value="${line.unitPrice}" data-line-price="${index}" title="Harga"></div><div class="summary-row"><span>${summary}</span><strong>${formatRupiah(line.subtotal)}</strong></div></div>`;
    }).join('')}</div><div class="cart-summary"><div class="summary-row"><span>Subtotal</span><strong>${formatRupiah(subtotal)}</strong></div><div class="summary-row"><span>Potongan & pajak</span><strong>Dihitung saat bayar</strong></div><div class="summary-row summary-row--total"><span>Estimasi Total</span><strong>${formatRupiah(subtotal)}</strong></div></div><div class="cart-checkout"><button class="button button--gold button--block" id="checkout">Bayar Sekarang →</button></div>` : tableEmpty('Keranjang masih kosong.')}`;
}

function refreshCart(container) {
  const panel = container.querySelector('#cart-panel');
  panel.innerHTML = renderCart(); bindCart(container);
}

function bindCart(container) {
  container.querySelector('#clear-cart')?.addEventListener('click', () => { cart = []; refreshCart(container); });
  container.querySelectorAll('[data-remove-line]').forEach(button => button.addEventListener('click', () => { cart.splice(Number(button.dataset.removeLine),1); refreshCart(container); }));
  container.querySelectorAll('[data-line-qty]').forEach(input => input.addEventListener('change', () => updateLine(container, Number(input.dataset.lineQty), 'qty', input.value)));
  container.querySelectorAll('[data-line-weight]').forEach(input => input.addEventListener('change', () => updateLine(container, Number(input.dataset.lineWeight), 'weightGrams', input.value)));
  container.querySelectorAll('[data-line-price]').forEach(input => input.addEventListener('change', () => updateLine(container, Number(input.dataset.linePrice), 'unitPrice', input.value)));
  container.querySelector('#checkout')?.addEventListener('click', () => openCheckout(container));
}

function updateLine(container, index, field, value) {
  const line = cart[index];
  if (!line) return;
  const gramMode = line.unitType === 'gram';
  let numeric = Math.max(0, Number(value) || 0);

  if (field === 'qty') {
    if (gramMode) return refreshCart(container);
    numeric = Math.max(1, Math.floor(numeric));
    if (numeric > line.stockQty + 0.0001) {
      toast(`Stok tersedia hanya ${formatNumber(line.stockQty)} item.`, 'warning');
      return refreshCart(container);
    }
    line.qty = numeric;
    if (line.weightPerItem > 0) {
      const nextWeight = round3(line.qty * line.weightPerItem);
      if (line.stockWeight > 0 && nextWeight > line.stockWeight + 0.0001) {
        toast(`Berat stok tersedia hanya ${formatNumber(line.stockWeight)} gr.`, 'warning');
        return refreshCart(container);
      }
      line.weightGrams = nextWeight;
    }
  } else if (field === 'weightGrams') {
    numeric = round3(Math.max(0.001, numeric));
    if (line.stockWeight > 0 && numeric > line.stockWeight + 0.0001) {
      toast(`Berat stok tersedia hanya ${formatNumber(line.stockWeight)} gr.`, 'warning');
      return refreshCart(container);
    }
    line.weightGrams = numeric;
  } else {
    line[field] = numeric;
  }

  recalcLine(line);
  refreshCart(container);
}

function openCheckout(container) {
  if (!cart.length) return;
  const subtotal = cartSubtotal();
  const taxPercent = Number(state.store?.taxPercent || 0);
  openModal({ title:'Pembayaran Penjualan', size:'lg', content:`<form id="checkout-form"><div class="form-grid">
    <div class="field field--full"><label>Pelanggan</label><select name="customerId" id="checkout-customer"><option value="">Pelanggan Umum</option>${customers.map(item => `<option value="${item.id}" data-name="${escapeHTML(item.name)}" data-phone="${escapeHTML(item.phone || '')}">${escapeHTML(item.name)}${item.phone ? ` • ${escapeHTML(item.phone)}`:''}</option>`).join('')}</select></div>
    <div class="field"><label>Metode Pembayaran</label><select name="paymentMethod">${PAYMENT_METHODS.map(item => `<option>${item}</option>`).join('')}</select></div>
    <div class="field"><label>Potongan</label><input class="currency-input" name="discount" data-value="0" value="0"></div>
    <div class="field"><label>Pajak (%)</label><input type="number" step="0.01" name="taxPercent" value="${taxPercent}"></div>
    <div class="field"><label>Jumlah Dibayar</label><input class="currency-input" name="paidAmount" data-value="${subtotal}" value="${new Intl.NumberFormat('id-ID').format(subtotal)}"></div>
    <div class="field field--full"><label>Catatan</label><textarea name="notes" placeholder="Nomor referensi transfer, permintaan pelanggan, dan lain-lain"></textarea></div>
  </div><div class="card" style="margin-top:18px"><div class="card__body"><div class="summary-row"><span>Subtotal</span><strong>${formatRupiah(subtotal)}</strong></div><div class="summary-row"><span>Potongan</span><strong id="checkout-discount">${formatRupiah(0)}</strong></div><div class="summary-row"><span>Pajak</span><strong id="checkout-tax">${formatRupiah(subtotal*taxPercent/100)}</strong></div><div class="summary-row summary-row--total"><span>Total</span><strong id="checkout-total">${formatRupiah(subtotal*(1+taxPercent/100))}</strong></div><div class="summary-row"><span>Kembalian</span><strong id="checkout-change">${formatRupiah(Math.max(0,subtotal-(subtotal*(1+taxPercent/100))))}</strong></div></div></div><div style="display:flex;justify-content:flex-end;gap:9px;margin-top:18px"><button class="button button--ghost" type="button" data-modal-close>Batal</button><button class="button button--gold" type="submit">Selesaikan Transaksi</button></div></form>` });
  const form = document.getElementById('checkout-form');
  form.querySelectorAll('.currency-input').forEach(attachCurrencyInput);
  form.querySelector('[data-modal-close]').addEventListener('click', closeModal);
  const recalc = () => {
    const discount = getCurrencyValue(form.elements.discount);
    const percent = Number(form.elements.taxPercent.value) || 0;
    const taxable = Math.max(0, subtotal-discount);
    const tax = taxable*percent/100;
    const total = taxable+tax;
    const paid = getCurrencyValue(form.elements.paidAmount);
    form.querySelector('#checkout-discount').textContent = formatRupiah(discount);
    form.querySelector('#checkout-tax').textContent = formatRupiah(tax);
    form.querySelector('#checkout-total').textContent = formatRupiah(total);
    form.querySelector('#checkout-change').textContent = formatRupiah(Math.max(0,paid-total));
    return { discount, tax, total, paid };
  };
  ['discount','paidAmount','taxPercent'].forEach(name => form.elements[name].addEventListener('input', recalc));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = recalc();
    if (values.paid < values.total) return toast('Jumlah pembayaran masih kurang.', 'warning');
    const submit = form.querySelector('[type=submit]'); setButtonLoading(submit,true,'Menyimpan…');
    try {
      const selected = form.elements.customerId.selectedOptions[0];
      const saleData = {
        customerId:form.elements.customerId.value, customerName:selected?.dataset.name || 'Pelanggan Umum', customerPhone:selected?.dataset.phone || '',
        lines:cart.map(line => ({ productId:line.productId, sku:line.sku, name:line.name, karat:line.karat, unitType:line.unitType || 'item', qty:line.qty, weightGrams:line.weightGrams, unitPrice:line.unitPrice, priceBasis:line.priceBasis, subtotal:line.subtotal, estimatedCost:line.estimatedCost })),
        subtotal, discount:values.discount, tax:values.tax, grandTotal:values.total, paidAmount:values.paid, changeAmount:Math.max(0,values.paid-values.total), paymentMethod:form.elements.paymentMethod.value, notes:form.elements.notes.value
      };
      const result = await createSale(saleData);
      closeModal();
      const receiptSale = { ...saleData, ...result, createdAt:new Date(), cashierName:state.profile?.name || '' };
      cart = []; catalog = await listProducts({activeOnly:true}); refreshCart(container); container.querySelector('#pos-products').innerHTML = renderProductGrid(); bindProductCards(container);
      toast(`Transaksi ${result.invoiceNo} berhasil.`); showReceipt(receiptSale);
    } catch (error) { toast(getErrorMessage(error),'error'); setButtonLoading(submit,false); }
  });
}

function showReceipt(sale) {
  openModal({ title:'Transaksi Berhasil', content:`${receiptHTML(sale)}<div style="display:flex;gap:9px;margin-top:18px"><button class="button button--outline button--block" data-modal-close>Tutup</button><button class="button button--gold button--block" id="print-receipt">Cetak Struk</button></div>` });
  document.getElementById('print-receipt').addEventListener('click',() => printReceipt(sale));
}

function receiptHTML(sale) {
  return `<div class="receipt"><div class="receipt__brand"><h2>${escapeHTML(state.store?.name || 'Toko Emas Hidayah')}</h2><div>${escapeHTML(state.store?.address || '')}</div><div>${escapeHTML(state.store?.phone || '')}</div></div><div class="receipt__meta">${escapeHTML(sale.invoiceNo)}<br>${new Date(sale.createdAt).toLocaleString('id-ID')}<br>Kasir: ${escapeHTML(sale.cashierName)}</div><table>${sale.lines.map(line => `<tr><td>${escapeHTML(line.name)}<br><small>${formatNumber(line.qty)} item • ${formatNumber(line.weightGrams)} gr × ${formatRupiah(line.unitPrice)}</small></td><td style="text-align:right">${formatRupiah(line.subtotal)}</td></tr>`).join('')}</table><div class="receipt__total"><div class="summary-row"><span>Subtotal</span><strong>${formatRupiah(sale.subtotal)}</strong></div><div class="summary-row"><span>Potongan</span><strong>${formatRupiah(sale.discount)}</strong></div><div class="summary-row"><span>Pajak</span><strong>${formatRupiah(sale.tax)}</strong></div><div class="summary-row"><span>Total</span><strong>${formatRupiah(sale.grandTotal)}</strong></div><div class="summary-row"><span>Bayar</span><strong>${formatRupiah(sale.paidAmount)}</strong></div><div class="summary-row"><span>Kembali</span><strong>${formatRupiah(sale.changeAmount)}</strong></div></div><div class="receipt__footer">${escapeHTML(state.store?.receiptFooter || 'Terima kasih atas kepercayaan Anda.')}<br>Barang yang telah dibeli mengikuti kebijakan toko.</div></div>`;
}

function printReceipt(sale) {
  const win = window.open('', '_blank', 'width=480,height=760');
  if (!win) return toast('Pop-up diblokir browser.', 'warning');
  win.document.write(`<!doctype html><html><head><title>${sale.invoiceNo}</title><style>body{font-family:monospace;color:#111;margin:0;padding:18px}.receipt{max-width:320px;margin:auto}.receipt__brand,.receipt__meta,.receipt__footer{text-align:center}.receipt__brand h2{margin:0}.receipt__meta{font-size:11px;margin:8px 0 18px}table{width:100%;font-size:11px;border-collapse:collapse}td{padding:5px 0;vertical-align:top}.summary-row{display:flex;justify-content:space-between;padding:3px 0}.receipt__total{border-top:1px dashed;margin-top:10px;padding-top:8px}.receipt__footer{font-size:10px;margin-top:18px}@page{size:80mm auto;margin:4mm}</style></head><body>${receiptHTML(sale)}<script>onload=()=>{print();setTimeout(()=>close(),400)}<\/script></body></html>`);
  win.document.close();
}
