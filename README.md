# Toko Emas Hidayah — GitHub Pages + Firebase

Versi: 2.1.2

Paket ini memakai:

- GitHub Pages untuk menayangkan kode web app.
- Firebase Authentication untuk login.
- Cloud Firestore untuk seluruh data toko.
- Foto produk juga disimpan di Cloud Firestore setelah dikompresi otomatis.
- Firebase Hosting dan Cloud Storage tidak dipakai.

## Perubahan utama v2.1.2

Fitur foto produk dirombak total. Versi lama mencoba mengunggah foto ke Cloud Storage. Karena project Firebase pada paket Spark tidak dapat memakai Cloud Storage, foto gagal tersimpan. Versi 2.1.2 tidak bergantung pada Cloud Storage lagi.

Saat Pemilik/Administrator memilih foto:

1. Browser mengecilkan dan mengompresi foto menjadi JPEG.
2. Hasil kompresi dibatasi sekitar 420 KB.
3. Foto disimpan pada koleksi `productImages` di Cloud Firestore.
4. Dokumen foto memakai ID yang sama dengan ID produk.
5. Foto otomatis dibaca kembali pada Produk & Stok dan halaman Kasir.
6. Menghapus produk ikut menghapus foto Firebase-nya.
7. Pada Edit Produk tersedia opsi untuk mengganti atau menghapus foto.

## Struktur Firebase foto

- `products/{productId}` — data produk dan stok.
- `productImages/{productId}` — foto terkompresi dan metadata foto.

Field foto utama: `dataUrl`, `mimeType`, `sizeBytes`, `width`, `height`, `updatedAt`, `updatedBy`.

## Pasang rules dan indeks Firebase v2.1.2

Buka Terminal pada folder paket ini, lalu jalankan:

```bash
npx firebase-tools@latest use tokoemas-79e07
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes
```

Jangan menambahkan `hosting` atau `storage`.

## Upload aplikasi ke GitHub

Upload/replace isi paket ini pada repository Toko Emas Hidayah. Folder `docs` harus tetap bernama `docs`.

GitHub repository:

- Settings → Pages
- Source: Deploy from a branch
- Branch: `main`
- Folder: `/docs`

Setelah GitHub Pages selesai membangun ulang, lakukan hard refresh atau buka URL dengan query versi baru, misalnya `?v=210`.

## Pengujian foto

1. Login sebagai Pemilik atau Administrator.
2. Buka Produk & Stok.
3. Klik Tambah Produk atau Edit.
4. Pilih foto dari laptop/HP.
5. Preview harus langsung tampil.
6. Klik Simpan Produk.
7. Setelah daftar produk dimuat ulang, foto harus tetap tampil.
8. Di Firebase Console → Firestore Database → Data harus muncul koleksi `productImages`.

## Catatan kapasitas

Cloud Firestore membatasi ukuran satu dokumen sekitar 1 MiB. Karena itu aplikasi mengompresi setiap foto secara otomatis dan rules menolak foto hasil kompresi yang terlalu besar. Foto produk sebaiknya berupa satu objek perhiasan dengan crop yang cukup dekat agar tetap tajam tetapi hemat data.


## Perbaikan v2.1.2 — Kasir & Stok
- Pemilihan produk stok 1 item tidak lagi membingungkan: produk pertama masuk ke keranjang dan notifikasi sukses tampil.
- Klik ulang produk yang stoknya sudah maksimum menampilkan penjelasan bahwa produk sudah ada di keranjang.
- Produk satuan gram divalidasi berdasarkan berat stok, bukan jumlah item.
- Transaksi satuan gram mengurangi berat stok secara benar.
- Validasi stok item dan berat dibuat konsisten antara POS dan transaksi Firestore.
