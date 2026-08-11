export const APP_NAME = 'Toko Emas Hidayah';
export const APP_VERSION = '2.1.2';

export const ROLES = {
  owner: { label: 'Pemilik', level: 100 },
  admin: { label: 'Administrator', level: 80 },
  cashier: { label: 'Kasir', level: 50 },
  auditor: { label: 'Auditor', level: 30 }
};

export const KARATS = [24, 23, 22, 21, 20, 18, 17, 16, 14, 10, 9, 8];
export const PRODUCT_CATEGORIES = ['Cincin', 'Kalung', 'Gelang', 'Anting', 'Liontin', 'Logam Mulia', 'Koin Emas', 'Emas Batangan', 'Lainnya'];
export const PAYMENT_METHODS = ['Tunai', 'Transfer Bank', 'QRIS', 'Kartu Debit', 'Kartu Kredit', 'Campuran'];
export const EXPENSE_CATEGORIES = ['Operasional', 'Gaji', 'Listrik & Internet', 'Sewa', 'Perawatan', 'Transportasi', 'Promosi', 'Pajak', 'Lainnya'];

export const NAV_ITEMS = [
  { route: 'dashboard', label: 'Dashboard', icon: '◈', roles: ['owner','admin','cashier','auditor'] },
  { route: 'pos', label: 'Kasir / POS', icon: '▣', roles: ['owner','admin','cashier'] },
  { route: 'products', label: 'Produk & Stok', icon: '◇', roles: ['owner','admin','cashier','auditor'] },
  { route: 'inventory', label: 'Mutasi Stok', icon: '⇄', roles: ['owner','admin','cashier','auditor'] },
  { route: 'purchases', label: 'Pembelian', icon: '↓', roles: ['owner','admin','auditor'] },
  { route: 'buyback', label: 'Buyback Emas', icon: '↺', roles: ['owner','admin','cashier','auditor'] },
  { route: 'contacts', label: 'Relasi', icon: '◎', roles: ['owner','admin','cashier','auditor'] },
  { route: 'expenses', label: 'Pengeluaran', icon: '−', roles: ['owner','admin','cashier','auditor'] },
  { route: 'reports', label: 'Laporan', icon: '▤', roles: ['owner','admin','auditor'] },
  { route: 'prices', label: 'Harga Emas', icon: '◆', roles: ['owner','admin','cashier','auditor'] },
  { route: 'users', label: 'Pengguna', icon: '♙', roles: ['owner','admin'] },
  { route: 'settings', label: 'Pengaturan', icon: '⚙', roles: ['owner','admin'] }
];

export const DEFAULT_GOLD_RATES = {
  24: { sell: 1800000, buy: 1700000 },
  23: { sell: 1725000, buy: 1625000 },
  22: { sell: 1650000, buy: 1550000 },
  21: { sell: 1575000, buy: 1475000 },
  20: { sell: 1500000, buy: 1400000 },
  18: { sell: 1350000, buy: 1250000 },
  17: { sell: 1275000, buy: 1175000 },
  16: { sell: 1200000, buy: 1100000 },
  14: { sell: 1050000, buy: 950000 },
  10: { sell: 750000, buy: 650000 },
  9: { sell: 675000, buy: 575000 },
  8: { sell: 600000, buy: 500000 }
};
