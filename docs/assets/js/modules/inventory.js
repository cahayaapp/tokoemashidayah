import { listInventoryMovements, listProducts, adjustStock } from '../services/data-service.js?v=2.1.2';
import { canManage } from '../core/state.js?v=2.1.2';
import { formatDateTime, formatNumber, dateInputValue, downloadCSV, normalizeText, escapeHTML, getErrorMessage } from '../core/utils.js?v=2.1.2';
import { pageLoading, tableEmpty, badge, openModal, closeModal, toast, setButtonLoading } from '../core/ui.js?v=2.1.2';

let movements = [];
let products = [];

export async function renderInventory(container) {
  container.innerHTML = `<section class="page">${pageLoading('Memuat riwayat stok…')}</section>`;
  const end = new Date(); const start = new Date(); start.setDate(start.getDate()-30); start.setHours(0,0,0,0);
  [movements, products] = await Promise.all([listInventoryMovements({start,end,max:1500}), listProducts()]);
  draw(container);
}

function draw(container) {
  container.innerHTML = `<section class="page"><header class="page-head"><div><span class="eyebrow">Jejak Persediaan</span><h2>Mutasi Stok</h2><p>Riwayat masuk, keluar, dan penyesuaian persediaan yang tidak dapat diubah.</p></div><div class="page-actions"><button class="button button--outline" id="export-movement">⇩ Ekspor CSV</button>${canManage()?'<button class="button button--gold" id="adjust-stock">± Penyesuaian Stok</button>':''}</div></header><article class="card"><div class="toolbar"><div class="toolbar__left"><div class="search-box"><span>⌕</span><input class="search-input" id="movement-search" placeholder="Cari produk atau nomor referensi…"></div><select class="filter-select" id="movement-type"><option value="">Semua Mutasi</option><option value="SALE_OUT">Penjualan Keluar</option><option value="PURCHASE_IN">Pembelian Masuk</option><option value="BUYBACK_IN">Buyback Masuk</option><option value="VOID_RETURN">Pembatalan Kembali</option><option value="ADJUSTMENT">Penyesuaian</option></select></div><div class="toolbar__right"><span class="badge badge--neutral">30 hari terakhir</span></div></div><div id="movement-table">${movementTable(movements)}</div></article></section>`;
  const apply = () => {
    const q = normalizeText(container.querySelector('#movement-search').value);
    const type = container.querySelector('#movement-type').value;
    const filtered = movements.filter(item => (!q || normalizeText(`${item.productName} ${item.referenceNo} ${item.note}`).includes(q)) && (!type || item.type===type));
    container.querySelector('#movement-table').innerHTML = movementTable(filtered);
  };
  container.querySelector('#movement-search').addEventListener('input',apply);
  container.querySelector('#movement-type').addEventListener('change',apply);
  container.querySelector('#adjust-stock')?.addEventListener('click', openAdjustmentForm);
  container.querySelector('#export-movement').addEventListener('click',() => downloadCSV(`mutasi-stok-${dateInputValue()}.csv`, movements.map(item => ({Tanggal:formatDateTime(item.createdAt),Jenis:typeLabel(item.type),Produk:item.productName,Referensi:item.referenceNo,'Perubahan Qty':item.qtyDelta,'Perubahan Berat':item.weightDelta,'Saldo Qty':item.balanceQty,'Saldo Berat':item.balanceWeight,Catatan:item.note,Petugas:item.createdByName}))));
}

function movementTable(items) {
  if (!items.length) return tableEmpty('Belum ada mutasi stok.');
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Waktu</th><th>Jenis</th><th>Produk</th><th>Referensi</th><th>Qty</th><th>Berat</th><th>Saldo</th><th>Petugas</th></tr></thead><tbody>${items.map(item => `<tr><td>${formatDateTime(item.createdAt)}</td><td>${badge(typeLabel(item.type), item.type==='SALE_OUT'?'danger':item.type==='PURCHASE_IN'?'success':item.type==='ADJUSTMENT'?'warning':'info')}</td><td><strong>${escapeHTML(item.productName || '—')}</strong><small style="display:block;color:var(--muted)">${escapeHTML(item.note || '')}</small></td><td>${escapeHTML(item.referenceNo || '—')}</td><td><strong>${Number(item.qtyDelta)>0?'+':''}${formatNumber(item.qtyDelta)}</strong></td><td><strong>${Number(item.weightDelta)>0?'+':''}${formatNumber(item.weightDelta)} gr</strong></td><td>${formatNumber(item.balanceQty)} / ${formatNumber(item.balanceWeight)} gr</td><td>${escapeHTML(item.createdByName || '—')}</td></tr>`).join('')}</tbody></table></div>`;
}

function typeLabel(type){return ({SALE_OUT:'Penjualan',PURCHASE_IN:'Pembelian',BUYBACK_IN:'Buyback',VOID_RETURN:'Pembatalan',ADJUSTMENT:'Penyesuaian'}[type]||type||'Lainnya')}

function openAdjustmentForm(){
  openModal({title:'Penyesuaian Stok',content:`<form id="adjustment-form"><div class="notice notice--warning" style="margin-bottom:14px"><strong>Gunakan dengan hati-hati.</strong><span>Masukkan angka positif untuk menambah atau angka negatif untuk mengurangi stok.</span></div><div class="form-grid"><div class="field field--full"><label>Produk *</label><select name="productId" required><option value="">Pilih produk…</option>${products.map(item=>`<option value="${item.id}">${escapeHTML(item.name)} • stok ${formatNumber(item.stockQty)} / ${formatNumber(item.stockWeightGrams)} gr</option>`).join('')}</select></div><div class="field"><label>Perubahan Jumlah</label><input type="number" step="0.001" name="qtyDelta" value="0"></div><div class="field"><label>Perubahan Berat (gr)</label><input type="number" step="0.001" name="weightDelta" value="0"></div><div class="field field--full"><label>Alasan *</label><textarea name="note" required placeholder="Contoh: Hasil stok opname, selisih timbangan, barang rusak"></textarea></div></div><div style="display:flex;justify-content:flex-end;gap:9px;margin-top:18px"><button type="button" class="button button--ghost" data-modal-close>Batal</button><button type="submit" class="button button--gold">Simpan Penyesuaian</button></div></form>`});
  const form=document.getElementById('adjustment-form');form.querySelector('[data-modal-close]').addEventListener('click',closeModal);
  form.addEventListener('submit',async event=>{event.preventDefault();const qtyDelta=Number(form.elements.qtyDelta.value)||0;const weightDelta=Number(form.elements.weightDelta.value)||0;if(qtyDelta===0&&weightDelta===0)return toast('Masukkan perubahan jumlah atau berat.','warning');const button=form.querySelector('[type=submit]');setButtonLoading(button,true,'Menyimpan…');try{await adjustStock({productId:form.elements.productId.value,qtyDelta,weightDelta,note:form.elements.note.value});closeModal();toast('Penyesuaian stok berhasil dicatat.');await renderInventory(document.getElementById('page-content'))}catch(error){toast(getErrorMessage(error),'error');setButtonLoading(button,false)}})
}
