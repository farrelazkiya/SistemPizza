[read_me_file.md](https://github.com/user-attachments/files/33330932/read_me_file.md)
# 🍕 Pizza Craft - ERP & Accounting System

![GitHub Pages](https://img.shields.io/badge/Deployed-GitHub%20Pages-success?style=for-the-badge&logo=github)
![Supabase](https://img.shields.io/badge/Database-Supabase-20B2AA?style=for-the-badge&logo=supabase)
![HTML/CSS/JS](https://img.shields.io/badge/Tech-Vanilla%20Web-orange?style=for-the-badge)

Aplikasi Web **Enterprise Resource Planning (ERP) & Sistem Informasi Akuntansi** sederhana berbasis web yang dirancang untuk mengelola persediaan bahan baku (*inventory*), melacak mutasi stok (metode perpetual), dan menghitung Harga Pokok Penjualan (HPP) secara otomatis untuk bisnis *Pizza Craft*.

Proyek ini dibangun sebagai bagian dari penugasan **Sistem Informasi Akuntansi (SIA)**, dengan fokus pada penerapan *Internal Control* (Pengendalian Internal), kelengkapan *Audit Trail* (Jejak Audit), dan Pelaporan Keuangan.

---

## 🔗 Live Demo
Aplikasi ini sudah di-*deploy* dan dapat diakses secara langsung melalui GitHub Pages:
**👉 [Buka Aplikasi Pizza Craft](https://farrelazkiya.github.io/SistemPizza/)**

---

## ✨ Fitur Utama (Core Features)

Sistem ini tidak hanya mencatat data, tetapi juga memiliki fungsi analitik dan pengamanan standar akuntansi:

1. **📊 Dashboard & Komposisi Aset (Visualized)**
   - Menampilkan total nilai aset persediaan secara *real-time* dalam Rupiah.
   - Analisis komposisi nilai persediaan menggunakan grafik visual interaktif (Doughnut Chart via Chart.js).
   - Menghitung akumulasi pemakaian bahan baku (HPP) pada hari ini.

2. **⚠️ Peringatan Dini Stok Kritis (Early Warning System)**
   - Sistem otomatis mendeteksi jika sisa stok menyentuh atau berada di bawah batas minimum (*Min. Stock*).
   - Memberikan notifikasi peringatan (*red flag*) untuk segera melakukan pemesanan ulang (*Restock*) kepada bagian *Purchasing*.

3. **📝 Pencatatan Jurnal Mutasi & *Audit Trail***
   - Formulir input mutasi barang yang menerapkan *traceability* dokumen sumber.
   - **Barang Masuk (IN):** Wajib menautkan entitas **Supplier** (Bukti Pembelian/Nota).
   - **Barang Keluar (OUT):** Wajib menautkan entitas **Menu Pizza** (Bukti Produksi/Pemakaian).
   - Mencegah fraud persediaan dengan memastikan tidak ada barang yang keluar/masuk tanpa keterangan pihak terkait.

4. **📖 Buku Besar Pembantu Persediaan (*Subsidiary Ledger*)**
   - Laporan Jurnal Umum otomatis menggunakan **Metode Perpetual**.
   - Dilengkapi filter *dropdown* untuk mengisolasi mutasi dan melihat pergerakan/saldo pada satu jenis bahan baku spesifik (Buku Besar Pembantu).
   - Label visual/Badge khusus (IN/OUT) untuk memudahkan auditor membaca pergerakan barang.

5. **🖨️ Ekspor & Cetak Dokumen Resmi**
   - **Cetak PDF:** Layout khusus pencetakan dokumen formal (otomatis menghilangkan elemen antarmuka seperti sidebar dan tombol saat dicetak).
   - **Download Excel (.csv):** Mengunduh seluruh riwayat *Audit Trail* ke dalam format CSV untuk analisis lanjutan menggunakan Spreadsheet.

---

## 🛠️ Teknologi yang Digunakan (*Tech Stack*)

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (Arsitektur file terpisah standar).
- **Backend / Database:** [Supabase](https://supabase.com/) (PostgreSQL-as-a-Service) terintegrasi langsung via CDN.
- **Data Visualization:** [Chart.js](https://www.chartjs.org/) CDN.
- **Deployment:** GitHub Pages.

---

## 🗄️ Skema Database (Relational Model)

Database dirancang dengan konsep *Relational Database Management System* (RDBMS) yang saling terhubung untuk mencegah data ganda dan menjaga integritas pencatatan. Terdapat 5 tabel utama:

1. `categories`: Tabel master kategori bahan baku.
2. `suppliers`: Tabel pihak ketiga (pemasok) untuk *audit trail* barang masuk.
3. `menu_items`: Tabel produk akhir untuk *audit trail* pembebanan HPP.
4. `ingredients`: Tabel master kartu stok (menyimpan sisa kuantitas aktual, harga unit, dan batas minimum).
5. `inventory_logs`: Tabel riwayat jurnal persediaan yang merekam setiap transaksi secara permanen (*immutable*).

---

## 🚀 Cara Menjalankan Secara Lokal (Local Setup)

Jika ingin mengembangkan atau menjalankan aplikasi ini di komputer lokal:

1. *Clone* repositori ini:
   ```bash
   git clone https://github.com/farrelazkiya/SistemPizza.git
   ```
2. Buka folder `SistemPizza` di *code editor* pilihanmu (misalnya VS Code).
3. Karena aplikasi ini menggunakan Vanilla JS dengan CDN Supabase, kamu cukup membuka file `index.html` menggunakan *browser* (direkomendasikan menggunakan ekstensi **Live Server** di VS Code).
4. *Catatan:* Konfigurasi URL dan API Key Supabase sudah diinisialisasi secara statis di dalam file `app.js` menggunakan *Anon Key*.

---
*Dibuat untuk memenuhi tugas Ujian Tengah Semester (UTS) / Evaluasi Proyek Mata Kuliah Sistem Informasi Akuntansi.*
