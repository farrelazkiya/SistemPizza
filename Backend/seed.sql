-- 1. Insert Kategori
insert into categories (name) values
('Adonan & Tepung'),
('Keju & Olahan Susu'),
('Saus & Bumbu'),
('Daging & Topping')
on conflict (name) do nothing;

-- 2. Insert Supplier
insert into suppliers (name, phone, address) values
('PT Tepung Nusantara', '08111222333', 'Kawasan Industri Candi, Semarang'),
('CV Susu Segar (Dairy)', '08222333444', 'Ungaran Barat'),
('Makmur Meat Supplier', '08333444555', 'Pedurungan, Semarang')
on conflict (name) do nothing;

-- 3. Insert Menu Pizza
insert into menu_items (name, selling_price) values
('Pizza Margherita (Loyang Sedang)', 65000),
('Pizza Meat Lover (Loyang Besar)', 110000),
('Pizza Pepperoni (Loyang Sedang)', 85000)
on conflict (name) do nothing;

-- 4. Insert Bahan Baku
-- Disertai Harga Beli (Unit Price) untuk valuasi persediaan Rupiah
insert into ingredients (category_id, name, stock_qty, unit, min_stock, unit_price) values
(1, 'Tepung Terigu Protein Tinggi', 50.0, 'Kg', 15.0, 12000), -- Rp 12.000 / kg
(2, 'Keju Mozzarella Shredded', 15.0, 'Kg', 5.0, 95000),     -- Rp 95.000 / kg
(3, 'Saus Tomat Pizza Base', 20.0, 'Liter', 5.0, 35000),      -- Rp 35.000 / liter
(4, 'Pepperoni Sapi Iris', 8.0, 'Kg', 3.0, 145000)            -- Rp 145.000 / kg
on conflict (name) do nothing;

-- 5. Insert Riwayat Transaksi (Jurnal Persediaan Awal)
-- Menggunakan simulasi barang masuk dari Supplier
insert into inventory_logs (ingredient_id, supplier_id, type, qty, unit_price_at_time, notes) values
(1, 1, 'IN', 50.0, 12000, 'Pembelian stok awal bulan (Nota INV-01)'),
(2, 2, 'IN', 15.0, 95000, 'Pembelian stok keju awal (Nota INV-02)'),
(3, 3, 'IN', 20.0, 35000, 'Restock saus tomat (Nota INV-03)'),
(4, 3, 'IN', 8.0, 145000, 'Beli pepperoni sapi segar (Nota INV-04)');