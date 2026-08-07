# Aturan Sistem Absensi Digital (NFC) Madrasah Inovatif

Dokumen ini merangkum logika, aturan, dan batasan jam absensi yang tertanam di dalam aplikasi NFC Scanner versi terbaru (Web/React + Supabase).

## 1. Aturan Jam Absensi (Waktu Operasional)

Sistem menggunakan format jam desimal (contoh: 06:30 dibaca 6.5) untuk melakukan perhitungan waktu secara presisi.

### 🌅 A. Sebelum Waktu Absen (00:00 - 05:59)
- **Status:** Ditolak ❌
- **Keterangan:** Jika ada murid atau guru yang melakukan tap kartu sebelum jam 06:00 pagi, sistem akan menolak akses dengan pesan peringatan **"Belum waktunya absen!"**.

### 🟢 B. Jam Datang Normal (06:00 - 07:00)
- **Status:** Diterima (Datang) ✅
- **Keterangan:** Tap pertama pada rentang waktu ini akan dicatat sebagai **Absen Datang**. Layar akan menampilkan warna hijau.
- **Anti-Spam (Tap Dua Kali):** Jika orang yang sama melakukan tap lagi pada jam ini, sistem akan menolaknya dengan pesan **"Sudah absen DATANG!"** untuk mencegah duplikasi data.

### 🔴 C. Jam Terlambat (07:01 - Batas Pulang)
- **Status:** Diterima (Terlambat) ⚠️
- **Keterangan:** Sesuai kebijakan sekolah, siapa pun yang baru absen di rentang waktu ini akan tetap dicatat oleh sistem, namun dengan status **"TERLAMBAT"**. Layar akan menampilkan warna kuning/oranye.
- **Anti-Spam:** Jika sudah absen Datang atau Terlambat sebelumnya, tap kedua akan ditolak dengan pesan **"Sudah absen DATANG!"**.

### 🔵 D. Jam Pulang (Batas Pulang - 23:59)
- **Status:** Diterima (Pulang) ✅
- **Keterangan:** Tap kartu akan dicatat sebagai **Absen Pulang**.
- **Anti-Spam:** Jika tap dua kali pada rentang waktu pulang, akan ditolak dengan pesan **"Sudah absen PULANG!"**.

---

## 2. Batasan Waktu Pulang & Hari Libur

Sistem membedakan waktu kepulangan antara Guru dan Murid, serta memberlakukan aturan khusus untuk hari Jumat dan hari libur.

### Batas Jam Pulang (Sistem akan beralih ke mode Pulang setelah jam ini):
* **Murid:** Jam **09:00** pagi ke atas (dianggap sudah waktunya pulang).
* **Guru (Senin - Kamis & Sabtu):** Jam **12:00** siang ke atas.
* **Guru (Jumat Khusus):** Jam **10:30** pagi ke atas.

### Aturan Hari Libur (Minggu):
* **Layar Blackout:** Pada hari Minggu, layar akan otomatis masuk ke mode *Blackout* (Layar Hitam Total) setelah 30 detik tidak disentuh, untuk menghemat layar tablet.
* **Guru Libur:** Jika guru tap pada hari Minggu, sistem akan langsung menolaknya dengan peringatan **"Hari Minggu Libur!"**.

---

## 3. Fitur Keamanan & Sinkronisasi (Offline First)

* **Antrean Latar Belakang (Sync Queue):** Ketika kartu di-tap, sistem tidak akan macet menunggu respons server. Aplikasi akan langsung memproses hasil (hijau/merah), lalu data akan dimasukkan ke "Antrean" dan dikirimkan secara otomatis ke *database* (Supabase) di latar belakang setiap **5 detik**.
* **Proteksi Tembakan Ganda (Debounce):** Jika sebuah kartu yang sama terus-terusan menempel pada alat NFC *scanner*, sistem akan mengabaikan input tersebut jika belum lewat 4 detik dari ketukan pertama.
* **Mode Redup (Dimmer):** Jika tidak ada yang men-tap kartu atau menyentuh layar selama 30 detik pada jam kerja, aplikasi akan menurunkan kecerahan layar (*overlay* hitam 70%). Layar akan langsung menyala terang ketika seseorang men-tap kartunya atau layar disentuh.
* **Kunci Admin (Admin Lock):** Halaman rekapitulasi data dan tabel (`/admin`) hanya bisa diakses dengan memasukkan kode PIN rahasia (`123456`) untuk mencegah murid mengotak-atik data.

---

## 4. Status Tampilan pada Panel Admin

Pada halaman Admin, sistem merangkum ketukan (tap) menjadi profil status kehadiran:
* **Hadir Tepat Waktu:** Terdapat waktu Datang (06:00 - 07:00).
* **Terlambat:** Terdapat waktu Datang (07:01 - Batas Pulang). Dilabeli dengan warna khusus.
* **Belum Tap Pulang:** Terdapat waktu Datang, namun waktu Pulang kosong (murid/guru pulang mendahului atau lupa tap).
* **Tidak Tap Absen:** Tidak ditemukan log waktu Datang maupun Pulang sama sekali pada hari tersebut.

---

## 5. Manajemen Data Master (Baru)

Sistem telah dilengkapi dengan fitur pengelolaan massal untuk mempermudah operasional di akhir/awal tahun ajaran:
* **Hapus Massal:** Anda dapat mencentang puluhan/ratusan nama murid sekaligus untuk dihapus (misalnya untuk murid yang sudah lulus).
* **Upload CSV (Pintar / Upsert):**
  * Fitur ini tidak hanya digunakan untuk mengunggah murid baru, tapi juga untuk menaikkan kelas.
  * **Sistem Upsert (Update & Insert):** Jika dalam file CSV terdapat UID Kartu yang **sudah ada**, sistem akan secara cerdas menimpa/memperbarui (*update*) data namanya dan kelasnya ke kelas yang baru. Jika UID Kartu **belum ada**, data tersebut akan ditambahkan sebagai murid/guru baru (*insert*).
