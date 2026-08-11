import { db } from '../config/firebase.js?v=2.1.0';
import { state } from '../core/state.js?v=2.1.0';
import { generateCode, monthStart, monthEnd, dayStart, dayEnd } from '../core/utils.js?v=2.1.0';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, Timestamp, writeBatch, runTransaction, deleteField
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject);
  if (value && typeof value === 'object' && !(value instanceof Date) && typeof value.toDate !== 'function') {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, cleanObject(item)]));
  }
  return value;
}

function mapSnapshot(snapshot) { return snapshot.docs.map(item => ({ id: item.id, ...item.data() })); }
function actor() { return { createdBy: state.user?.uid || '', createdByName: state.profile?.name || state.user?.email || 'Pengguna' }; }
function auditPayload(action, entity, entityId, detail = '') {
  return { actorUid: state.user.uid, actorName: state.profile?.name || state.user.email, action, entity, entityId, detail, createdAt: serverTimestamp() };
}

export async function getStoreSettings() {
  const snap = await getDoc(doc(db, 'settings', 'store'));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveStoreSettings(data) {
  await setDoc(doc(db, 'settings', 'store'), cleanObject({ ...data, ownerUid: data.ownerUid || state.store?.ownerUid || state.user.uid, updatedAt: serverTimestamp(), updatedBy: state.user.uid }), { merge: true });
  await addDoc(collection(db, 'auditLogs'), auditPayload('UPDATE', 'settings', 'store', 'Memperbarui profil toko'));
}

export async function getGoldRates() {
  const snap = await getDoc(doc(db, 'settings', 'goldPrices'));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveGoldRates(rates) {
  await setDoc(doc(db, 'settings', 'goldPrices'), { ownerUid: state.store?.ownerUid || state.user.uid, rates: cleanObject(rates), updatedAt: serverTimestamp(), updatedBy: state.user.uid }, { merge: true });
  await addDoc(collection(db, 'auditLogs'), auditPayload('UPDATE', 'settings', 'goldPrices', 'Memperbarui harga emas'));
}

export async function listProducts({ activeOnly = false } = {}) {
  const constraints = activeOnly ? [where('active', '==', true), orderBy('name', 'asc'), limit(1000)] : [orderBy('name', 'asc'), limit(1000)];
  const [productSnap, imageSnap] = await Promise.all([
    getDocs(query(collection(db, 'products'), ...constraints)),
    getDocs(query(collection(db, 'productImages'), limit(1000)))
  ]);
  const images = new Map(imageSnap.docs.map(item => [item.id, item.data()]));
  return mapSnapshot(productSnap).map(product => {
    const image = images.get(product.id);
    return {
      ...product,
      imageUrl: image?.dataUrl || product.imageUrl || '',
      imageSource: image?.dataUrl ? 'firestore' : (product.imageUrl ? 'legacy' : ''),
      imageSizeBytes: Number(image?.sizeBytes) || 0
    };
  });
}

export async function getProduct(id) {
  const [productSnap, imageSnap] = await Promise.all([
    getDoc(doc(db, 'products', id)),
    getDoc(doc(db, 'productImages', id))
  ]);
  if (!productSnap.exists()) return null;
  const product = { id: productSnap.id, ...productSnap.data() };
  const image = imageSnap.exists() ? imageSnap.data() : null;
  return {
    ...product,
    imageUrl: image?.dataUrl || product.imageUrl || '',
    imageSource: image?.dataUrl ? 'firestore' : (product.imageUrl ? 'legacy' : ''),
    imageSizeBytes: Number(image?.sizeBytes) || 0
  };
}

export async function saveProduct(data, id = null, imageChange = null) {
  const productRef = id ? doc(db, 'products', id) : doc(collection(db, 'products'));
  const imageRef = doc(db, 'productImages', productRef.id);
  const payload = cleanObject({
    sku: data.sku || generateCode('SKU'), barcode: data.barcode || '', name: data.name, category: data.category,
    karat: Number(data.karat) || 0, purity: Number(data.purity) || 0, unitType: data.unitType || 'item',
    priceMode: data.priceMode || 'fixed', sellingPrice: Number(data.sellingPrice) || 0, costPrice: Number(data.costPrice) || 0,
    weightPerItem: Number(data.weightPerItem) || 0, stockQty: Number(data.stockQty) || 0,
    stockWeightGrams: Number(data.stockWeightGrams) || 0, minStock: Number(data.minStock) || 0,
    laborCost: Number(data.laborCost) || 0,
    notes: data.notes || '', active: data.active !== false, updatedAt: serverTimestamp(), updatedBy: state.user.uid,
    photoStorage: imageChange?.action === 'replace' ? 'firestore' : (data.photoStorage || undefined)
  });
  // URL/path Storage lama tidak lagi digunakan pada versi Firestore-only.
  delete payload.imageUrl;
  delete payload.imagePath;
  if (!id) Object.assign(payload, { createdAt: serverTimestamp(), ...actor() });

  const batch = writeBatch(db);
  batch.set(productRef, payload, { merge: true });

  if (imageChange?.action === 'replace') {
    batch.set(imageRef, cleanObject({
      productId: productRef.id,
      dataUrl: imageChange.dataUrl,
      mimeType: imageChange.mimeType || 'image/jpeg',
      sizeBytes: Number(imageChange.sizeBytes) || 0,
      width: Number(imageChange.width) || 0,
      height: Number(imageChange.height) || 0,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.uid
    }));
    batch.set(productRef, { hasImage: true, photoStorage: 'firestore', imageUrl: deleteField(), imagePath: deleteField() }, { merge: true });
  } else if (imageChange?.action === 'delete') {
    batch.delete(imageRef);
    batch.set(productRef, { hasImage: false, photoStorage: 'firestore', imageUrl: deleteField(), imagePath: deleteField() }, { merge: true });
  } else if (!id) {
    batch.set(productRef, { hasImage: false, photoStorage: 'firestore', imageUrl: deleteField(), imagePath: deleteField() }, { merge: true });
  }

  const auditRef = doc(collection(db, 'auditLogs'));
  batch.set(auditRef, auditPayload(id ? 'UPDATE' : 'CREATE', 'product', productRef.id, data.name));
  await batch.commit();
  return productRef.id;
}

export async function removeProduct(product) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'products', product.id));
  batch.delete(doc(db, 'productImages', product.id));
  batch.set(doc(collection(db, 'auditLogs')), auditPayload('DELETE', 'product', product.id, product.name));
  await batch.commit();
}

async function listSimple(name) {
  return mapSnapshot(await getDocs(query(collection(db, name), orderBy('name', 'asc'), limit(1000))));
}

export const listCustomers = () => listSimple('customers');
export const listSuppliers = () => listSimple('suppliers');

export async function saveContact(type, data, id = null) {
  const collectionName = type === 'supplier' ? 'suppliers' : 'customers';
  const target = id ? doc(db, collectionName, id) : doc(collection(db, collectionName));
  const payload = cleanObject({ name: data.name, phone: data.phone || '', email: data.email || '', address: data.address || '', identityNo: data.identityNo || '', notes: data.notes || '', updatedAt: serverTimestamp(), updatedBy: state.user.uid });
  if (!id) Object.assign(payload, { createdAt: serverTimestamp(), ...actor() });
  const batch = writeBatch(db);
  batch.set(target, payload, { merge: true });
  batch.set(doc(collection(db, 'auditLogs')), auditPayload(id ? 'UPDATE' : 'CREATE', type, target.id, data.name));
  await batch.commit();
  return target.id;
}

export async function removeContact(type, item) {
  const collectionName = type === 'supplier' ? 'suppliers' : 'customers';
  const batch = writeBatch(db);
  batch.delete(doc(db, collectionName, item.id));
  batch.set(doc(collection(db, 'auditLogs')), auditPayload('DELETE', type, item.id, item.name));
  await batch.commit();
}


export async function adjustStock(data) {
  const productRef = doc(db, 'products', data.productId);
  await runTransaction(db, async transaction => {
    const snap = await transaction.get(productRef);
    if (!snap.exists()) throw new Error('Produk tidak ditemukan.');
    const product = snap.data();
    const nextQty = (Number(product.stockQty) || 0) + (Number(data.qtyDelta) || 0);
    const nextWeight = (Number(product.stockWeightGrams) || 0) + (Number(data.weightDelta) || 0);
    if (nextQty < 0 || nextWeight < 0) throw new Error('Penyesuaian membuat stok menjadi negatif.');
    transaction.update(productRef, { stockQty: nextQty, stockWeightGrams: nextWeight, updatedAt: serverTimestamp(), updatedBy: state.user.uid });
    transaction.set(doc(collection(db, 'inventoryMovements')), cleanObject({
      code: generateCode('STK'), type: 'ADJUSTMENT', productId: data.productId, productName: product.name,
      referenceId: '', referenceNo: data.referenceNo || generateCode('SO'), qtyDelta: Number(data.qtyDelta) || 0,
      weightDelta: Number(data.weightDelta) || 0, balanceQty: nextQty, balanceWeight: nextWeight,
      note: data.note || 'Penyesuaian stok', ...actor(), createdAt: serverTimestamp()
    }));
    transaction.set(doc(collection(db, 'auditLogs')), auditPayload('ADJUST', 'product', data.productId, `${product.name} • ${data.note || ''}`));
  });
}

export async function createSale(data) {
  const saleRef = doc(collection(db, 'sales'));
  const invoiceNo = data.invoiceNo || generateCode('INV');
  await runTransaction(db, async transaction => {
    const productDocs = [];
    for (const line of data.lines) {
      const productRef = doc(db, 'products', line.productId);
      const snap = await transaction.get(productRef);
      if (!snap.exists()) throw new Error(`Produk ${line.name} tidak ditemukan.`);
      productDocs.push({ ref: productRef, snap, line });
    }
    for (const { ref: productRef, snap, line } of productDocs) {
      const product = snap.data();
      const currentQty = Number(product.stockQty) || 0;
      const currentWeight = Number(product.stockWeightGrams) || 0;
      const qty = Number(line.qty) || 0;
      const weight = Number(line.weightGrams) || 0;
      if (qty > currentQty + 0.0001) throw new Error(`Stok ${line.name} tidak mencukupi.`);
      if (weight > 0 && currentWeight > 0 && weight > currentWeight + 0.0001) throw new Error(`Berat stok ${line.name} tidak mencukupi.`);
      transaction.update(productRef, { stockQty: Math.max(0, currentQty - qty), stockWeightGrams: Math.max(0, currentWeight - weight), updatedAt: serverTimestamp(), updatedBy: state.user.uid });
      transaction.set(doc(collection(db, 'inventoryMovements')), cleanObject({
        code: generateCode('STK'), type: 'SALE_OUT', productId: line.productId, productName: line.name,
        referenceId: saleRef.id, referenceNo: invoiceNo, qtyDelta: -qty, weightDelta: -weight,
        balanceQty: Math.max(0, currentQty - qty), balanceWeight: Math.max(0, currentWeight - weight),
        note: `Penjualan ${invoiceNo}`, ...actor(), createdAt: serverTimestamp()
      }));
    }
    transaction.set(saleRef, cleanObject({
      invoiceNo, customerId: data.customerId || '', customerName: data.customerName || 'Pelanggan Umum',
      customerPhone: data.customerPhone || '', lines: data.lines, subtotal: Number(data.subtotal) || 0,
      discount: Number(data.discount) || 0, tax: Number(data.tax) || 0, grandTotal: Number(data.grandTotal) || 0,
      paidAmount: Number(data.paidAmount) || 0, changeAmount: Number(data.changeAmount) || 0,
      paymentMethod: data.paymentMethod || 'Tunai', notes: data.notes || '', status: 'completed',
      ...actor(), createdAt: serverTimestamp()
    }));
    transaction.set(doc(collection(db, 'auditLogs')), auditPayload('CREATE', 'sale', saleRef.id, `${invoiceNo} • ${data.grandTotal}`));
  });
  return { id: saleRef.id, invoiceNo };
}

export async function voidSale(saleId, reason = '') {
  await runTransaction(db, async transaction => {
    const saleRef = doc(db, 'sales', saleId);
    const saleSnap = await transaction.get(saleRef);
    if (!saleSnap.exists()) throw new Error('Transaksi tidak ditemukan.');
    const sale = saleSnap.data();
    if (sale.status === 'void') throw new Error('Transaksi sudah dibatalkan.');
    const productDocs = [];
    for (const line of sale.lines || []) {
      const productRef = doc(db, 'products', line.productId);
      const snap = await transaction.get(productRef);
      if (snap.exists()) productDocs.push({ ref: productRef, snap, line });
    }
    for (const { ref: productRef, snap, line } of productDocs) {
      const product = snap.data();
      const nextQty = (Number(product.stockQty) || 0) + (Number(line.qty) || 0);
      const nextWeight = (Number(product.stockWeightGrams) || 0) + (Number(line.weightGrams) || 0);
      transaction.update(productRef, { stockQty: nextQty, stockWeightGrams: nextWeight, updatedAt: serverTimestamp(), updatedBy: state.user.uid });
      transaction.set(doc(collection(db, 'inventoryMovements')), cleanObject({
        code: generateCode('STK'), type: 'VOID_RETURN', productId: line.productId, productName: line.name,
        referenceId: saleId, referenceNo: sale.invoiceNo, qtyDelta: Number(line.qty) || 0, weightDelta: Number(line.weightGrams) || 0,
        balanceQty: nextQty, balanceWeight: nextWeight, note: `Pembatalan: ${reason}`, ...actor(), createdAt: serverTimestamp()
      }));
    }
    transaction.update(saleRef, { status: 'void', voidReason: reason, voidedAt: serverTimestamp(), voidedBy: state.user.uid, voidedByName: state.profile?.name || '' });
    transaction.set(doc(collection(db, 'auditLogs')), auditPayload('VOID', 'sale', saleId, `${sale.invoiceNo} • ${reason}`));
  });
}

export async function createPurchase(data) {
  const purchaseRef = doc(collection(db, 'purchases'));
  const purchaseNo = data.purchaseNo || generateCode('BELI');
  await runTransaction(db, async transaction => {
    const productDocs = [];
    for (const line of data.lines) {
      const productRef = doc(db, 'products', line.productId);
      const snap = await transaction.get(productRef);
      if (!snap.exists()) throw new Error(`Produk ${line.name} tidak ditemukan.`);
      productDocs.push({ ref: productRef, snap, line });
    }
    for (const { ref: productRef, snap, line } of productDocs) {
      const product = snap.data();
      const nextQty = (Number(product.stockQty) || 0) + (Number(line.qty) || 0);
      const nextWeight = (Number(product.stockWeightGrams) || 0) + (Number(line.weightGrams) || 0);
      transaction.update(productRef, { stockQty: nextQty, stockWeightGrams: nextWeight, costPrice: Number(line.costPrice) || Number(product.costPrice) || 0, updatedAt: serverTimestamp(), updatedBy: state.user.uid });
      transaction.set(doc(collection(db, 'inventoryMovements')), cleanObject({
        code: generateCode('STK'), type: 'PURCHASE_IN', productId: line.productId, productName: line.name,
        referenceId: purchaseRef.id, referenceNo: purchaseNo, qtyDelta: Number(line.qty) || 0, weightDelta: Number(line.weightGrams) || 0,
        balanceQty: nextQty, balanceWeight: nextWeight, note: `Pembelian ${purchaseNo}`, ...actor(), createdAt: serverTimestamp()
      }));
    }
    transaction.set(purchaseRef, cleanObject({ purchaseNo, supplierId: data.supplierId || '', supplierName: data.supplierName || '', lines: data.lines, total: Number(data.total) || 0, paymentStatus: data.paymentStatus || 'Lunas', notes: data.notes || '', ...actor(), createdAt: serverTimestamp() }));
    transaction.set(doc(collection(db, 'auditLogs')), auditPayload('CREATE', 'purchase', purchaseRef.id, `${purchaseNo} • ${data.total}`));
  });
  return { id: purchaseRef.id, purchaseNo };
}

export async function createBuyback(data) {
  const buybackRef = doc(collection(db, 'buybacks'));
  const buybackNo = data.buybackNo || generateCode('BB');
  const stockRef = doc(db, 'goldStock', `${Number(data.karat)}K`);
  await runTransaction(db, async transaction => {
    const stockSnap = await transaction.get(stockRef);
    const old = stockSnap.exists() ? stockSnap.data() : {};
    const nextWeight = (Number(old.weightGrams) || 0) + (Number(data.netWeight) || 0);
    const nextValue = (Number(old.bookValue) || 0) + (Number(data.totalPayout) || 0);
    transaction.set(stockRef, { karat: Number(data.karat), weightGrams: nextWeight, bookValue: nextValue, updatedAt: serverTimestamp(), updatedBy: state.user.uid }, { merge: true });
    transaction.set(buybackRef, cleanObject({
      buybackNo, customerId: data.customerId || '', customerName: data.customerName || '', customerPhone: data.customerPhone || '',
      itemDescription: data.itemDescription || '', karat: Number(data.karat), grossWeight: Number(data.grossWeight) || 0,
      deductionWeight: Number(data.deductionWeight) || 0, netWeight: Number(data.netWeight) || 0,
      buyRate: Number(data.buyRate) || 0, serviceDeduction: Number(data.serviceDeduction) || 0,
      totalPayout: Number(data.totalPayout) || 0, paymentMethod: data.paymentMethod || 'Tunai', notes: data.notes || '',
      ...actor(), createdAt: serverTimestamp()
    }));
    transaction.set(doc(collection(db, 'inventoryMovements')), cleanObject({
      code: generateCode('STK'), type: 'BUYBACK_IN', productId: '', productName: `Emas bekas ${data.karat}K`,
      referenceId: buybackRef.id, referenceNo: buybackNo, qtyDelta: 0, weightDelta: Number(data.netWeight) || 0,
      balanceQty: 0, balanceWeight: nextWeight, note: data.itemDescription || 'Buyback emas', ...actor(), createdAt: serverTimestamp()
    }));
    transaction.set(doc(collection(db, 'auditLogs')), auditPayload('CREATE', 'buyback', buybackRef.id, `${buybackNo} • ${data.totalPayout}`));
  });
  return { id: buybackRef.id, buybackNo };
}

export async function createExpense(data) {
  const expenseRef = doc(collection(db, 'expenses'));
  const batch = writeBatch(db);
  batch.set(expenseRef, cleanObject({ expenseNo: data.expenseNo || generateCode('BYA'), category: data.category, description: data.description, amount: Number(data.amount) || 0, paymentMethod: data.paymentMethod || 'Tunai', expenseDate: Timestamp.fromDate(data.expenseDate || new Date()), notes: data.notes || '', ...actor(), createdAt: serverTimestamp() }));
  batch.set(doc(collection(db, 'auditLogs')), auditPayload('CREATE', 'expense', expenseRef.id, `${data.description} • ${data.amount}`));
  await batch.commit();
  return expenseRef.id;
}

export async function removeExpense(item) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'expenses', item.id));
  batch.set(doc(collection(db, 'auditLogs')), auditPayload('DELETE', 'expense', item.id, item.description));
  await batch.commit();
}

async function listByDateRange(collectionName, field, start, end, max = 1000) {
  const constraints = [];
  if (start) constraints.push(where(field, '>=', Timestamp.fromDate(start)));
  if (end) constraints.push(where(field, '<=', Timestamp.fromDate(end)));
  constraints.push(orderBy(field, 'desc'), limit(max));
  return mapSnapshot(await getDocs(query(collection(db, collectionName), ...constraints)));
}

export const listSales = ({ start = monthStart(), end = monthEnd(), max = 1000 } = {}) => listByDateRange('sales', 'createdAt', start, end, max);
export const listPurchases = ({ start = monthStart(), end = monthEnd(), max = 1000 } = {}) => listByDateRange('purchases', 'createdAt', start, end, max);
export const listBuybacks = ({ start = monthStart(), end = monthEnd(), max = 1000 } = {}) => listByDateRange('buybacks', 'createdAt', start, end, max);
export const listExpenses = ({ start = monthStart(), end = monthEnd(), max = 1000 } = {}) => listByDateRange('expenses', 'expenseDate', start, end, max);
export const listInventoryMovements = ({ start = monthStart(), end = monthEnd(), max = 1000 } = {}) => listByDateRange('inventoryMovements', 'createdAt', start, end, max);
export const listAuditLogs = ({ start = monthStart(), end = monthEnd(), max = 300 } = {}) => listByDateRange('auditLogs', 'createdAt', start, end, max);

export async function listGoldStock() {
  return mapSnapshot(await getDocs(query(collection(db, 'goldStock'), orderBy('karat', 'desc'))));
}

export async function getDashboardData() {
  const now = new Date();
  const weekStart = dayStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  const [todaySales, weekSales, monthSales, monthExpenses, products, movements] = await Promise.all([
    listSales({ start: dayStart(now), end: dayEnd(now), max: 300 }),
    listSales({ start: weekStart, end: dayEnd(now), max: 1000 }),
    listSales({ start: monthStart(now), end: monthEnd(now), max: 2000 }),
    listExpenses({ start: monthStart(now), end: monthEnd(now), max: 1000 }),
    listProducts(),
    listInventoryMovements({ start: weekStart, end: dayEnd(now), max: 200 })
  ]);
  return { todaySales, weekSales, monthSales, monthExpenses, products, movements };
}
