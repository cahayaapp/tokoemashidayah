# Toko Emas Hidayah — GitHub Pages + Firebase

Versi: **2.1.4**

Paket produksi untuk toko yang **sudah aktif**.

- Web app: GitHub Pages / custom domain `tokoemashidayah.online`
- Login: Firebase Authentication (Email/Password)
- Data: Cloud Firestore
- Foto produk: Cloud Firestore (`productImages`), terkompresi JPEG
- Firebase Hosting dan Cloud Storage tidak diperlukan

## Perubahan v2.1.4

1. Menu **Aktivasi Awal dihapus total** dari halaman login.
2. Akun tanpa profil Firestore tidak lagi diarahkan ke aktivasi owner; akses ditolak dan harus didaftarkan oleh Pemilik/Administrator.
3. **Tambah Pengguna diperbaiki.** Akun staf dibuat melalui Firebase Auth REST API sehingga sesi Pemilik/Administrator tidak berpindah ke akun baru.
4. Bila pembuatan profil Firestore gagal setelah akun Auth terbentuk, aplikasi mencoba menghapus kembali akun Auth tersebut agar tidak meninggalkan akun yatim.
5. Profil Pemilik dikunci agar tidak dapat terdemote atau dinonaktifkan tanpa sengaja.
6. File `docs/CNAME` sudah berisi `tokoemashidayah.online` agar custom domain tidak hilang ketika paket diunggah ulang.

## Update GitHub

Upload/replace seluruh isi paket ke repository. GitHub Pages tetap memakai:

- Branch: `main`
- Folder: `/docs`
- Custom domain: `tokoemashidayah.online`

## WAJIB: deploy Firestore Rules baru

Dari folder paket ini jalankan:

```bash
npx firebase-tools@latest use tokoemas-79e07
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes
```

Jangan tambahkan `hosting` atau `storage`.

## Menambah pengguna

Masuk sebagai Pemilik/Administrator → **Pengguna → Tambah Pengguna** → isi nama, email, kata sandi awal, peran, telepon → **Buat Pengguna**.

Peran yang dapat dibuat:
- Administrator
- Kasir
- Auditor

Pengguna baru dapat langsung masuk menggunakan email dan kata sandi yang dibuat.

## Firebase Authentication

Pastikan Email/Password aktif dan domain berikut ada di Authorized domains:

`tokoemashidayah.online`


## Perbaikan v2.1.4
- Tombol **Tambah Pengguna** kini benar-benar membuka formulir pengguna baru.
- Email dapat diketik pada pengguna baru.
- Kolom **Kata Sandi Awal** tampil pada pembuatan pengguna baru.
- Form **Edit Pengguna** tetap mengunci email dan tidak menampilkan kata sandi, karena email/kredensial Auth bukan data profil biasa.
- Alur Aktivasi Awal tetap dihapus karena toko sudah aktif.
- Custom domain `tokoemashidayah.online` tetap dipertahankan melalui `docs/CNAME`.
