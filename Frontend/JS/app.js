// 1. KONEKSI SUPABASE (JANGAN LUPA ISI URL & KEY KAMU!)
const SUPABASE_URL = "https://llpcuhsotoadmljeryhz.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_qEmqkUCuZgmTBmwTSLMvNg_1mVAjU9p"; 
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const formatRp = (num) => Number(num).toLocaleString('id-ID');

// NAVIGASI SIDEBAR SPA
function switchPage(pageId, element) {
    document.querySelectorAll('.page-section').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
    element.classList.add('active');
}

// FITUR 1: LOGIKA FORM DINAMIS (AUDIT TRAIL)
function toggleDynamicFields() {
    const type = document.getElementById('type').value;
    if (type === 'IN') {
        document.getElementById('group-supplier').classList.remove('hidden');
        document.getElementById('group-menu').classList.add('hidden');
    } else {
        document.getElementById('group-supplier').classList.add('hidden');
        document.getElementById('group-menu').classList.remove('hidden');
    }
}

// LOAD DATA SUPPLIER & MENU (UNTUK DROPDOWN)
async function loadSuppliersAndMenus() {
    const { data: suppliers } = await supabaseClient.from('suppliers').select('*');
    const { data: menus } = await supabaseClient.from('menu_items').select('*');
    
    let supHTML = '<option value="">-- Pilih Supplier --</option>';
    suppliers.forEach(s => supHTML += `<option value="${s.id}">${s.name}</option>`);
    document.getElementById('supplier_id').innerHTML = supHTML;

    let menuHTML = '<option value="">-- Pilih Menu Pizza --</option>';
    menus.forEach(m => menuHTML += `<option value="${m.id}">${m.name}</option>`);
    document.getElementById('menu_item_id').innerHTML = menuHTML;
}

// 2 & 3: LOAD KARTU STOK, PERINGATAN DINI, & DROPDOWN FILTER
async function loadInventory() {
    const { data, error } = await supabaseClient.from('ingredients').select('*').order('id');
    if (error) return console.error(error);

    let totalAssetRupiah = 0;
    const tableBody = document.getElementById('inventory-table');
    const selectIngredient = document.getElementById('ingredient_id');
    const filterSelect = document.getElementById('filter-ingredient');
    
    // Fitur 2: Variabel Peringatan Dini
    const alertContainer = document.getElementById('alert-container');
    const alertList = document.getElementById('alert-list');
    alertList.innerHTML = '';
    let hasAlerts = false;
    
    tableBody.innerHTML = '';
    selectIngredient.innerHTML = '<option value="">-- Pilih Bahan Baku --</option>';
    filterSelect.innerHTML = '<option value="">Semua Bahan (Jurnal Umum)</option>';

    data.forEach(item => {
        const totalValue = Number(item.stock_qty) * Number(item.unit_price);
        totalAssetRupiah += totalValue;

        // Cek Peringatan Dini (Jika Stok <= Batas Min)
        const isCritical = Number(item.stock_qty) <= Number(item.min_stock);
        if (isCritical) {
            hasAlerts = true;
            alertList.innerHTML += `<li>Stok <b>${item.name}</b> tersisa ${item.stock_qty} ${item.unit} (Batas Min: ${item.min_stock}). Segera Restock!</li>`;
        }
        const qtyStyle = isCritical ? 'class="text-danger"' : '';

        // Isi Tabel Dashboard
        tableBody.innerHTML += `
            <tr>
                <td><b>${item.name}</b></td>
                <td ${qtyStyle}>${item.stock_qty} ${item.unit}</td>
                <td>${item.min_stock} ${item.unit}</td>
                <td><b>Rp ${formatRp(totalValue)}</b></td>
            </tr>
        `;
        
        // Isi Dropdown Form Transaksi & Filter Jurnal
        selectIngredient.innerHTML += `<option value="${item.id}" data-price="${item.unit_price}">${item.name} (Sisa: ${item.stock_qty})</option>`;
        filterSelect.innerHTML += `<option value="${item.id}">Buku Besar Pembantu: ${item.name}</option>`;
    });

    document.getElementById('total-asset-value').innerText = `Rp ${formatRp(totalAssetRupiah)}`;
    
    // Tampilkan panel merah jika ada stok kritis
    if (hasAlerts) alertContainer.classList.remove('hidden');
    else alertContainer.classList.add('hidden');
}

// 4. BUKU BESAR PEMBANTU (MENDUKUNG FILTER)
async function loadJournalAndAnalysis(filterIngredientId = '') {
    // Tarik data dengan relasi tabel lengkap (Fitur 1 Audit)
    let query = supabaseClient.from('inventory_logs')
        .select('*, ingredients(name), suppliers(name), menu_items(name)')
        .order('created_at', { ascending: false });

    // Fitur 3: Terapkan Filter Jika Ada
    if (filterIngredientId !== '') {
        query = query.eq('ingredient_id', filterIngredientId);
    }

    const { data: logs, error } = await query;
    if (error) return console.error(error);

    const journalBody = document.getElementById('journal-table');
    journalBody.innerHTML = '';
    let todayHppTotal = 0;
    const dateToday = new Date().toDateString();

    logs.forEach(log => {
        const logDateObj = new Date(log.created_at);
        const dateStr = logDateObj.toLocaleDateString('id-ID');
        const totalVal = log.qty * log.unit_price_at_time;
        
        // Audit Trail Penjelasan
        const supplierName = log.suppliers ? `dari ${log.suppliers.name}` : '';
        const menuName = log.menu_items ? `untuk ${log.menu_items.name}` : '';

        if (log.type === 'IN') {
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td><b>Persediaan (${log.ingredients.name})</b> - Masuk ${log.qty} ${supplierName}<br><div class="acc-kredit">Kas / Utang Dagang</div></td>
                    <td>Rp ${formatRp(totalVal)}<br>-</td>
                    <td>-<br>Rp ${formatRp(totalVal)}</td>
                </tr>
            `;
        } else {
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td><b>HPP (Beban Pokok)</b> - Dipakai ${log.qty} ${menuName}<br><div class="acc-kredit">Persediaan (${log.ingredients.name})</div></td>
                    <td>Rp ${formatRp(totalVal)}<br>-</td>
                    <td>-<br>Rp ${formatRp(totalVal)}</td>
                </tr>
            `;
            // Kalkulasi HPP Hari Ini (Hanya transaksi OUT)
            if (logDateObj.toDateString() === dateToday) {
                todayHppTotal += totalVal;
            }
        }
    });
    
    // Total HPP Hari ini hanya berubah kalau sedang lihat SEMUA jurnal
    if (filterIngredientId === '') {
        document.getElementById('today-usage-value').innerText = `Rp ${formatRp(todayHppTotal)}`;
    }
}

// Pemicu Filter Dropdown
function applyLedgerFilter() {
    const filterId = document.getElementById('filter-ingredient').value;
    loadJournalAndAnalysis(filterId);
}

// 5. SIMPAN TRANSAKSI DENGAN DOKUMEN SUMBER
document.getElementById('transaction-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectEl = document.getElementById('ingredient_id');
    const ingredient_id = selectEl.value;
    const unit_price = selectEl.options[selectEl.selectedIndex].dataset.price;
    const type = document.getElementById('type').value;
    const qty = parseFloat(document.getElementById('qty').value);
    
    // Ambil ID Supplier / Menu
    const supplier_id = document.getElementById('supplier_id').value || null;
    const menu_item_id = document.getElementById('menu_item_id').value || null;

    // Validasi Audit Trail
    if (type === 'IN' && !supplier_id) return alert("Pilih Supplier terlebih dahulu!");
    if (type === 'OUT' && !menu_item_id) return alert("Pilih Menu Pizza terlebih dahulu!");

    // Insert ke Database
    await supabaseClient.from('inventory_logs').insert([{
        ingredient_id: ingredient_id, 
        supplier_id: supplier_id,
        menu_item_id: menu_item_id,
        type: type, 
        qty: qty, 
        unit_price_at_time: unit_price
    }]);

    // Update Master Stok
    const { data: currentItem } = await supabaseClient.from('ingredients').select('stock_qty').eq('id', ingredient_id).single();
    let newStock = type === 'IN' ? Number(currentItem.stock_qty) + qty : Number(currentItem.stock_qty) - qty;
    await supabaseClient.from('ingredients').update({ stock_qty: newStock }).eq('id', ingredient_id);

    alert("Transaksi Jurnal dan Dokumen Sumber Berhasil Disimpan!");
    document.getElementById('transaction-form').reset();
    toggleDynamicFields(); // Kembalikan form ke asal
    
    loadInventory(); 
    loadJournalAndAnalysis(document.getElementById('filter-ingredient').value);
    
    // Pindah otomatis ke halaman Jurnal
    switchPage('page-jurnal', document.querySelectorAll('.sidebar-menu li')[2]);
});

// DOWNLOAD EXCEL
function downloadExcel() {
    let csvContent = "data:text/csv;charset=utf-8,Tanggal,Keterangan & Dokumen Sumber,Debit,Kredit\n";
    document.querySelectorAll("#journal-table tr").forEach(row => {
        let cols = row.querySelectorAll("td");
        if(cols.length > 0) {
            let rowData = [];
            cols.forEach(col => rowData.push(`"${col.innerText.replace(/\n/g, ' - ').replace(/"/g, '""')}"`));
            csvContent += rowData.join(",") + "\n";
        }
    });
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = "Audit_Trail_Jurnal_PizzaCraft.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Inisialisasi Aplikasi Saat Web Dibuka
loadSuppliersAndMenus();
loadInventory();
loadJournalAndAnalysis();