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
   - **Barang Masuk (IN):** Setiap bahan memiliki tiga pilihan supplier terkait dengan harga tetap yang berbeda; pilihan supplier dan harga otomatis menyesuaikan bahan yang dipilih.
   - **Barang Keluar (OUT):** Mutasi manual hanya untuk bahan basi/kedaluwarsa dan wajib menyertakan alasan. Pemakaian produksi tetap dicatat otomatis dari resep saat penjualan.
   - Validasi database mencegah stok keluar melebihi stok yang tersedia.

4. **📖 Buku Besar Pembantu Persediaan (*Subsidiary Ledger*)**
   - Laporan Jurnal Umum otomatis menggunakan **Metode Perpetual**.
   - Dilengkapi filter *dropdown* untuk mengisolasi mutasi dan melihat pergerakan/saldo pada satu jenis bahan baku spesifik (Buku Besar Pembantu).
   - Label visual/Badge khusus (IN/OUT) untuk memudahkan auditor membaca pergerakan barang.

5. **🛒 Kasir Multi-Payment**
   - Mendukung Tunai, QRIS/Bank Transfer, GoFood, dan GrabFood.
   - GoFood dan GrabFood otomatis dikenakan komisi platform 20%, dicatat sebagai beban; sisa penjualan dicatat sebagai piutang platform.
   - Jurnal penjualan menyimpan metode pembayaran dan komisi, serta menampilkan akun debit/kredit.

6. **♻️ Food Waste & Stok Opname**
   - Mencatat bahan kedaluwarsa, jatuh, atau adonan gagal sebagai beban kerusakan persediaan.
   - Form stok opname membandingkan stok sistem dengan hitung fisik dan membuat jurnal penyesuaian selisih lebih/kurang.
   - Penyesuaian dilakukan secara atomik di database; stok yang berubah sejak form dimuat harus dimuat ulang sebelum disimpan.

7. **📦 Batch Tracking & FIFO**
   - Catat nomor batch, tanggal kedaluwarsa, dan biaya beli per unit saat stok masuk.
   - Dashboard memberi peringatan untuk batch yang sudah kedaluwarsa atau akan kedaluwarsa dalam tiga hari.
   - Penjualan dan pengeluaran persediaan memakai batch dengan tanggal kedaluwarsa terdekat terlebih dahulu (FEFO); jika tanggal sama atau tidak tersedia, gunakan batch yang diterima lebih dahulu.
   - HPP dihitung dari biaya aktual batch yang terpakai, dan alokasi batch tersimpan sebagai jejak audit.

8. **🖨️ Ekspor & Cetak Dokumen Resmi**
   - **Cetak PDF:** Layout khusus pencetakan dokumen formal (otomatis menghilangkan elemen antarmuka seperti sidebar dan tombol saat dicetak).
   - **Download Excel (.csv):** Mengunduh seluruh riwayat *Audit Trail* ke dalam format CSV untuk analisis lanjutan menggunakan Spreadsheet.

---

## 🛠️ Teknologi yang Digunakan (*Tech Stack*)

- **Frontend:** HTML5, CSS3, Tailwind CSS via CDN, Vanilla JavaScript (Arsitektur file terpisah standar).
- **Backend / Database:** [Supabase](https://supabase.com/) (PostgreSQL-as-a-Service) terintegrasi langsung via CDN.
- **Data Visualization:** [Chart.js](https://www.chartjs.org/) CDN.
- **Deployment:** GitHub Pages.

---

## 🗄️ Skema Database (Relational Model)

Database dirancang dengan konsep *Relational Database Management System* (RDBMS) yang saling terhubung untuk mencegah data ganda dan menjaga integritas pencatatan. Selain tabel master dan persediaan, fitur aplikasi menggunakan:

1. `categories`: Tabel master kategori bahan baku.
2. `suppliers`: Tabel pihak ketiga (pemasok) untuk *audit trail* barang masuk.
3. `menu_items`: Tabel produk akhir untuk *audit trail* pembebanan HPP.
4. `ingredients`: Tabel master kartu stok (menyimpan sisa kuantitas aktual, harga unit, dan batas minimum).
5. `inventory_logs`: Tabel riwayat jurnal persediaan yang merekam setiap transaksi secara permanen (*immutable*).
6. `supplier_ingredients`: Daftar bahan yang dipasok beserta harga tetap per supplier.
7. `menu_recipes`, `sales`, dan `sale_items`: Resep, transaksi kasir, dan rincian penjualan.
8. `operating_expenses`: Catatan biaya operasional dan status pembayarannya.
9. `inventory_batches` dan `inventory_batch_consumptions`: Saldo tiap batch, biaya per unit, tanggal kedaluwarsa, dan rincian pemakaian berdasarkan FEFO/FIFO.

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
5. Untuk database Supabase yang sudah memiliki skema dan data awal aplikasi, jalankan migrasi SQL di folder `Backend` sesuai urutan: `point_of_sale.sql`, `financial_reports.sql`, `suppliers_and_spoilage.sql`, `multi_payment.sql`, `food_waste_stocktake.sql`, lalu `batch_fifo.sql`. Migrasi terakhir mengaktifkan pelacakan batch, peringatan kedaluwarsa, dan HPP berbasis FIFO/FEFO. Stok yang sudah ada akan dimasukkan ke batch pembukaan dengan biaya unit rata-rata saat migrasi dijalankan.

---
*Dibuat untuk memenuhi tugas Ujian Tengah Semester (UTS) / Evaluasi Proyek Mata Kuliah Sistem Informasi Akuntansi.*
