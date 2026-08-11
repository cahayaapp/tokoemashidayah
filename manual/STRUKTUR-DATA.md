# Struktur Data Cloud Firestore

## `users/{uid}`
Profil akses aplikasi.

Field penting: `name`, `email`, `role`, `active`, `phone`, `createdAt`, `updatedAt`.

## `settings/store`
Identitas dan konfigurasi toko.

Field penting: `ownerUid`, `name`, `tagline`, `phone`, `whatsapp`, `address`, `city`, `receiptFooter`, `taxPercent`, `lowStockDefault`.

## `settings/goldPrices`
Harga jual dan beli per gram menurut kadar.

```json
{
  "rates": {
    "24": { "sell": 1800000, "buy": 1700000 },
    "22": { "sell": 1650000, "buy": 1550000 }
  }
}
```

## `products/{productId}`
Master produk dan saldo persediaan.

Field penting: `sku`, `barcode`, `name`, `category`, `karat`, `purity`, `unitType`, `priceMode`, `sellingPrice`, `costPrice`, `laborCost`, `weightPerItem`, `stockQty`, `stockWeightGrams`, `minStock`, `hasImage`, `photoStorage`, `active`.

### `productImages/{productId}`
Foto produk terkompresi yang disimpan langsung di Cloud Firestore. ID dokumen sama dengan ID produk. Field: `productId`, `dataUrl`, `mimeType`, `sizeBytes`, `width`, `height`, `updatedAt`, `updatedBy`.

## `sales/{saleId}`
Transaksi penjualan dan snapshot rincian produk.

Field penting: `invoiceNo`, `customerId`, `customerName`, `lines`, `subtotal`, `discount`, `tax`, `grandTotal`, `paidAmount`, `changeAmount`, `paymentMethod`, `status`, `createdBy`, `createdAt`.

## `purchases/{purchaseId}`
Pembelian persediaan dari pemasok.

Field penting: `purchaseNo`, `supplierId`, `supplierName`, `lines`, `total`, `paymentStatus`, `createdBy`, `createdAt`.

## `buybacks/{buybackId}`
Pembelian kembali emas pelanggan.

Field penting: `buybackNo`, `customerName`, `itemDescription`, `karat`, `grossWeight`, `deductionWeight`, `netWeight`, `buyRate`, `serviceDeduction`, `totalPayout`, `createdAt`.

## `goldStock/{karat}K`
Akumulasi stok emas bekas berdasarkan kadar.

Field penting: `karat`, `weightGrams`, `bookValue`, `updatedAt`.

## `inventoryMovements/{movementId}`
Jejak stok yang bersifat append-only.

Jenis: `SALE_OUT`, `PURCHASE_IN`, `BUYBACK_IN`, `VOID_RETURN`.

## `customers/{customerId}` dan `suppliers/{supplierId}`
Data relasi toko.

## `expenses/{expenseId}`
Pengeluaran toko.

## `auditLogs/{logId}`
Jejak aktivitas penting pengguna. Tidak dapat diubah atau dihapus dari aplikasi.
