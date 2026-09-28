const SUPABASE_URL = "https://llpcuhsotoadmljeryhz.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_qEmqkUCuZgmTBmwTSLMvNg_1mVAjU9p"; 
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const formatRp = (num) => Number(num).toLocaleString('id-ID');

// Variabel Global untuk menyimpan instance ChartJS agar bisa di-update
let inventoryChartInstance = null;

function switchPage(pageId, element) {
    document.querySelectorAll('.page-section').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
    element.classList.add('active');
}

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

async function loadSuppliersAndMenus() {
    const { data: suppliers } = await supabaseClient.from('suppliers').select('*');
    const { data: menus } = await supabaseClient.from('menu_items').select('*');
    
    let supHTML = '<option value="">-- Pilih Supplier --</option>';
    if(suppliers) suppliers.forEach(s => supHTML += `<option value="${s.id}">${s.name}</option>`);
    document.getElementById('supplier_id').innerHTML = supHTML;

    let menuHTML = '<option value="">-- Pilih Menu Pizza --</option>';
    if(menus) menus.forEach(m => menuHTML += `<option value="${m.id}">${m.name}</option>`);
    document.getElementById('menu_item_id').innerHTML = menuHTML;
}

function renderChart(labels, dataValues) {
    const ctx = document.getElementById('inventoryChart').getContext('2d');
    
    // Hapus chart lama sebelum membuat yang baru agar tidak bertumpuk
    if (inventoryChartInstance) {
        inventoryChartInstance.destroy();
    }

    inventoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'Nilai Aset (Rp)',
                data: dataValues,
                backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, font: {family: "'Plus Jakarta Sans'"} } }
            },
            cutout: '65%' // Membuat lubang di tengah donat
        }
    });
}

async function loadInventory() {
    const { data, error } = await supabaseClient.from('ingredients').select('*').order('id');
    if (error) return console.error(error);

    let totalAssetRupiah = 0;
    const tableBody = document.getElementById('inventory-table');
    const selectIngredient = document.getElementById('ingredient_id');
    const filterSelect = document.getElementById('filter-ingredient');
    
    let chartLabels = [];
    let chartData = [];

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

        // Kumpulkan data untuk ChartJS (hanya yang nilainya lebih dari 0)
        if(totalValue > 0) {
            chartLabels.push(item.name);
            chartData.push(totalValue);
        }

        const isCritical = Number(item.stock_qty) <= Number(item.min_stock);
        if (isCritical) {
            hasAlerts = true;
            alertList.innerHTML += `<li>Stok <b>${item.name}</b> tersisa ${item.stock_qty} ${item.unit}. Segera Restock!</li>`;
        }
        const qtyStyle = isCritical ? 'class="text-danger"' : '';

        tableBody.innerHTML += `
            <tr>
                <td><b>${item.name}</b></td>
                <td ${qtyStyle}>${item.stock_qty} ${item.unit}</td>
                <td>${item.min_stock} ${item.unit}</td>
                <td><b>Rp ${formatRp(totalValue)}</b></td>
            </tr>
        `;
        
        selectIngredient.innerHTML += `<option value="${item.id}" data-price="${item.unit_price}">${item.name} (Sisa: ${item.stock_qty})</option>`;
        filterSelect.innerHTML += `<option value="${item.id}">Buku Besar: ${item.name}</option>`;
    });

    document.getElementById('total-asset-value').innerText = `Rp ${formatRp(totalAssetRupiah)}`;
    if (hasAlerts) alertContainer.classList.remove('hidden'); else alertContainer.classList.add('hidden');
    
    // Panggil fungsi render chart
    renderChart(chartLabels, chartData);
}

async function loadJournalAndAnalysis(filterIngredientId = '') {
    let query = supabaseClient.from('inventory_logs')
        .select('*, ingredients(name), suppliers(name), menu_items(name)')
        .order('created_at', { ascending: false });

    if (filterIngredientId !== '') query = query.eq('ingredient_id', filterIngredientId);

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
        
        const supplierName = log.suppliers ? `dari ${log.suppliers.name}` : '';
        const menuName = log.menu_items ? `untuk ${log.menu_items.name}` : '';
        
        // Pembuatan Baris Tabel dengan Badge Visual
        if (log.type === 'IN') {
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td><span class="badge badge-in">IN</span></td>
                    <td><b>Persediaan (${log.ingredients.name})</b> - Masuk ${log.qty} ${supplierName}<br><div class="acc-kredit">Kas / Utang Dagang</div></td>
                    <td>Rp ${formatRp(totalVal)}<br>-</td>
                    <td>-<br>Rp ${formatRp(totalVal)}</td>
                </tr>
            `;
        } else {
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td><span class="badge badge-out">OUT</span></td>
                    <td><b>HPP (Beban Pokok)</b> - Dipakai ${log.qty} ${menuName}<br><div class="acc-kredit">Persediaan (${log.ingredients.name})</div></td>
                    <td>Rp ${formatRp(totalVal)}<br>-</td>
                    <td>-<br>Rp ${formatRp(totalVal)}</td>
                </tr>
            `;
            if (logDateObj.toDateString() === dateToday) todayHppTotal += totalVal;
        }
    });
    
    if (filterIngredientId === '') document.getElementById('today-usage-value').innerText = `Rp ${formatRp(todayHppTotal)}`;
}

function applyLedgerFilter() {
    loadJournalAndAnalysis(document.getElementById('filter-ingredient').value);
}

document.getElementById('transaction-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectEl = document.getElementById('ingredient_id');
    const ingredient_id = selectEl.value;
    const unit_price = selectEl.options[selectEl.selectedIndex].dataset.price;
    const type = document.getElementById('type').value;
    const qty = parseFloat(document.getElementById('qty').value);
    
    const supplier_id = document.getElementById('supplier_id').value || null;
    const menu_item_id = document.getElementById('menu_item_id').value || null;

    if (type === 'IN' && !supplier_id) return alert("Pilih Supplier terlebih dahulu!");
    if (type === 'OUT' && !menu_item_id) return alert("Pilih Menu Pizza terlebih dahulu!");

    const btn = document.querySelector('button[type="submit"]');
    btn.innerHTML = "⏳ Menyimpan..."; btn.disabled = true;

    await supabaseClient.from('inventory_logs').insert([{
        ingredient_id, supplier_id, menu_item_id, type, qty, unit_price_at_time: unit_price
    }]);

    const { data: currentItem } = await supabaseClient.from('ingredients').select('stock_qty').eq('id', ingredient_id).single();
    let newStock = type === 'IN' ? Number(currentItem.stock_qty) + qty : Number(currentItem.stock_qty) - qty;
    await supabaseClient.from('ingredients').update({ stock_qty: newStock }).eq('id', ingredient_id);

    alert("✅ Transaksi Jurnal Berhasil Disimpan!");
    document.getElementById('transaction-form').reset();
    toggleDynamicFields(); 
    btn.innerHTML = "💾 Simpan Jurnal & Update Stok"; btn.disabled = false;
    
    loadInventory(); 
    loadJournalAndAnalysis(document.getElementById('filter-ingredient').value);
    switchPage('page-jurnal', document.querySelectorAll('.sidebar-menu li')[2]);
});

function downloadExcel() {
    let csvContent = "data:text/csv;charset=utf-8,Tanggal,Tipe,Keterangan & Akun,Debit,Kredit\n";
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
    link.download = "Laporan_Jurnal_PizzaCraft.csv";
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// Inisialisasi awal saat web dibuka
loadSuppliersAndMenus();
loadInventory();
loadJournalAndAnalysis();