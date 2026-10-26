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

8. **📈 Menu Engineering & Food Cost**
   - Filter periode (hari ini, 7 hari terakhir, bulan ini/sebelumnya, rentang kustom) dan filter menu; hasil juga dibandingkan dengan periode sebelumnya yang setara.
   - Tabel profitabilitas menyajikan unit, penjualan bersih setelah alokasi komisi platform, HPP aktual/estimasi per porsi dan total, kontribusi laba kotor, Food Cost %, porsi kontribusi penjualan, dan perubahan kontribusi.
   - Klasifikasi STAR/PLOWHORSE/PUZZLE/DOG memakai unit terjual dan kontribusi per porsi. Batas popularitas adalah 70% rata-rata unit per menu; batas profitabilitas adalah rata-rata tertimbang kontribusi per porsi. Klasifikasi ditahan jika data periode belum mencapai 10 porsi terjual dan 2 menu dengan HPP terhitung.
   - Scatter plot menampilkan popularitas terhadap margin dengan tooltip angka dan garis batas klasifikasi; rekomendasi hanya muncul saat data memadai.
   - Panel SIMULASI memungkinkan pemilik mengubah harga alternatif dan target Food Cost untuk melihat Food Cost, laba kotor per porsi, serta harga target. Target analisis tersimpan lokal di perangkat; simulasi tidak mengubah harga aktual, resep, stok, atau jurnal.
   - Food Cost menggunakan HPP per porsi dibanding harga item historis sebelum komisi; kontribusi laba memakai penjualan bersih setelah komisi. Biaya batch aktual dipakai bila tersedia, dengan estimasi resep FIFO sebagai fallback. Skema menu saat ini tidak memiliki kategori, jadi filter kategori tidak disediakan.
   - Migrasi contoh menu lama menyediakan resep dan transaksi historis contoh; modul analisis tidak membuat transaksi dummy baru. Menu yang dinonaktifkan tetap bisa muncul bila memiliki penjualan historis.

9. **🖨️ Ekspor & Cetak Dokumen Resmi**
   - **Cetak PDF:** Layout khusus pencetakan dokumen formal (otomatis menghilangkan elemen antarmuka seperti sidebar dan tombol saat dicetak).
   - **Download Excel (.csv):** Mengunduh seluruh riwayat *Audit Trail* ke dalam format CSV untuk analisis lanjutan menggunakan Spreadsheet.

## ✨ Antarmuka Enterprise

- Navigasi sidebar merah tomat dengan ikon konsisten, menu terkelompok (Dashboard, Operasional, Persediaan, Keuangan), penanda halaman aktif, breadcrumb dinamis, tanggal/waktu lokal, dan status koneksi Supabase.
- Executive Dashboard menyediakan filter hari ini, tujuh hari, bulan ini, bulan sebelumnya, dan rentang kustom; KPI penjualan, HPP, laba kotor/bersih, persediaan, serta utang dilengkapi perbandingan periode sebelumnya jika tersedia.
- Grafik dashboard menampilkan tren penjualan dan profitabilitas harian, penjualan per menu, serta biaya per kategori. Peringatan merangkum stok minimum, batch yang mendekati kedaluwarsa, kewajiban belum dibayar, dan penurunan penjualan/margin.
- Saldo kas/bank dan piutang marketplace ditandai tidak tersedia selama data saldo awal atau settlement belum dicatat oleh sistem; keduanya tidak ditampilkan sebagai angka nol atau estimasi yang seolah-olah pasti.
- Aksi cepat mengarahkan pengguna ke kasir, pembelian, pencatatan biaya, resep, stok opname, dan laporan keuangan.
- POS menampilkan kartu menu yang dapat dicari, keranjang dengan kontrol kuantitas, hitung kembalian tunai, konfirmasi transaksi, serta struk cetak/PDF. Riwayat transaksi mendukung pencarian nomor, tanggal, metode pembayaran, dan detail. Uang diterima hanya untuk hitung kembalian di layar dan tidak disimpan karena kolom transaksi belum tersedia.
- Menu tidak tersedia ditandai dan tidak dapat dimasukkan ke keranjang. Skema saat ini tidak menyediakan kategori/gambar produk maupun status transaksi selain transaksi tersimpan, sehingga POS tidak mengada-adakan filter tersebut.
- Jurnal Umum dan Buku Besar merangkum transaksi tersimpan menjadi baris debit-kredit untuk penjualan, HPP, pembelian persediaan, biaya, pelunasan utang, food waste, dan penyesuaian stok. Tersedia filter akun/periode, ekspor CSV, serta neraca saldo mutasi; laporan laba rugi dan arus kas tetap menggunakan sumber transaksi yang sama.
- Neraca saldo mutasi bukan neraca posisi keuangan: saldo awal akun/modal serta penerimaan settlement marketplace belum dicatat pada skema, dan mutasi stok/pembayaran historis yang metode pembayarannya tidak diketahui dipisahkan sebagai akun penyeimbang.
- Ringkasan KPI untuk nilai persediaan, HPP hari ini, dan penjualan hari ini; indikator restock dan kedaluwarsa ditampilkan sebagai banner peringatan.
- Komponen kartu, tabel, badge, input, dan tombol menggunakan gaya responsif; tabel lebar dapat digulir secara horizontal pada layar kecil, dengan fokus aksesibel serta dukungan pengurangan animasi.
- Toast non-blocking memberi konfirmasi untuk aksi penting, termasuk penambahan item kasir dan penyimpanan transaksi.

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
5. Untuk database Supabase yang sudah memiliki skema dan data awal aplikasi, jalankan migrasi SQL di folder `Backend` sesuai urutan: `point_of_sale.sql`, `financial_reports.sql`, `suppliers_and_spoilage.sql`, `multi_payment.sql`, `food_waste_stocktake.sql`, `batch_fifo.sql`, `menu_engineering_sample_menus.sql`, lalu `menu_selection_cleanup.sql`. Migrasi batch mengaktifkan pelacakan FIFO; migrasi menu menambahkan lima menu contoh dan resepnya, serta mencatat 25 porsi penjualan dummy tunai melalui RPC kasir. Penjualan sampel memengaruhi pendapatan, biaya HPP, dan stok, serta ditandai agar tidak dibuat ulang jika migrasi menu dijalankan lagi. Migrasi terakhir menonaktifkan tiga menu awal dari pilihan kasir/resep tanpa menghapus transaksi atau data historisnya. Menu contoh membutuhkan bahan dari `seed.sql` dan fungsi kasir dari `multi_payment.sql`. Stok yang sudah ada akan dimasukkan ke batch pembukaan dengan biaya unit rata-rata saat migrasi batch dijalankan.

---
*Dibuat untuk memenuhi tugas Ujian Tengah Semester (UTS) / Evaluasi Proyek Mata Kuliah Sistem Informasi Akuntansi.*
