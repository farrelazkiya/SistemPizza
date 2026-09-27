// 1. KONEKSI SUPABASE (JANGAN LUPA ISI URL & KEY KAMU)
const SUPABASE_URL = "https://llpcuhsotoadmljeryhz.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_qEmqkUCuZgmTBmwTSLMvNg_1mVAjU9p"; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Fungsi Format Rupiah
const formatRp = (num) => Number(num).toLocaleString('id-ID');

// 2. FUNGSI LOAD KARTU STOK
async function loadInventory() {
    const { data, error } = await supabaseClient.from('ingredients').select('*').order('id');
    if (error) return console.error(error);

    let totalAssetRupiah = 0;
    const tableBody = document.getElementById('inventory-table');
    const selectIngredient = document.getElementById('ingredient_id');
    
    tableBody.innerHTML = '';
    selectIngredient.innerHTML = '<option value="">-- Pilih Bahan --</option>';

    data.forEach(item => {
        const totalValue = Number(item.stock_qty) * Number(item.unit_price);
        totalAssetRupiah += totalValue;

        tableBody.innerHTML += `
            <tr>
                <td><b>${item.name}</b></td>
                <td>${item.stock_qty} ${item.unit}</td>
                <td>Rp ${formatRp(item.unit_price)}</td>
                <td><b>Rp ${formatRp(totalValue)}</b></td>
            </tr>
        `;
        selectIngredient.innerHTML += `<option value="${item.id}" data-price="${item.unit_price}">${item.name} (Sisa: ${item.stock_qty})</option>`;
    });

    document.getElementById('total-asset-value').innerText = `Rp ${formatRp(totalAssetRupiah)}`;
}

// 3. FUNGSI BARU: LOAD BUKU JURNAL & ANALISIS HARIAN
async function loadJournalAndAnalysis() {
    // Ambil data log transaksi digabung dengan nama bahan baku
    const { data: logs, error } = await supabaseClient
        .from('inventory_logs')
        .select('*, ingredients(name)')
        .order('created_at', { ascending: false });

    if (error) return console.error(error);

    const journalBody = document.getElementById('journal-table');
    const usageList = document.getElementById('today-usage-list');
    journalBody.innerHTML = '';
    usageList.innerHTML = '';

    let todayHppTotal = 0;
    
    // Set Tanggal Hari Ini di Header Analisis
    const dateToday = new Date();
    const todayString = dateToday.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('today-date').innerText = todayString;

    logs.forEach(log => {
        const logDateObj = new Date(log.created_at);
        const dateStr = logDateObj.toLocaleDateString('id-ID');
        const totalVal = log.qty * log.unit_price_at_time;

        // --- A. LOGIKA BUKU JURNAL UMUM ---
        if (log.type === 'IN') {
            // Jurnal Pembelian Perpetual: Debit Persediaan, Kredit Kas
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td>
                        <b>Persediaan Bahan Baku</b> (${log.ingredients.name})<br>
                        <div class="acc-kredit">Kas / Utang Dagang</div>
                    </td>
                    <td>Rp ${formatRp(totalVal)}<br>-</td>
                    <td>-<br>Rp ${formatRp(totalVal)}</td>
                </tr>
            `;
        } else {
            // Jurnal Pemakaian HPP: Debit HPP, Kredit Persediaan
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td>
                        <b>Harga Pokok Penjualan (HPP)</b><br>
                        <div class="acc-kredit">Persediaan Bahan Baku (${log.ingredients.name})</div>
                    </td>
                    <td>Rp ${formatRp(totalVal)}<br>-</td>
                    <td>-<br>Rp ${formatRp(totalVal)}</td>
                </tr>
            `;
        }

        // --- B. LOGIKA ANALISIS HARI INI ---
        const isToday = logDateObj.toDateString() === dateToday.toDateString();
        
        if (isToday && log.type === 'OUT') {
            todayHppTotal += totalVal;
            usageList.innerHTML += `
                <li>
                    <span>${log.qty}x ${log.ingredients.name}</span>
                    <b>Rp ${formatRp(totalVal)}</b>
                </li>
            `;
        }
    });

    // Update Tampilan Analisis Harian
    document.getElementById('today-usage-value').innerText = `Rp ${formatRp(todayHppTotal)}`;
    if(todayHppTotal === 0) {
        usageList.innerHTML = '<li><i style="color:gray;">Belum ada bahan baku yang terpakai hari ini.</i></li>';
    }
}

// 4. FUNGSI SIMPAN TRANSAKSI
document.getElementById('transaction-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectEl = document.getElementById('ingredient_id');
    const ingredient_id = selectEl.value;
    const unit_price = selectEl.options[selectEl.selectedIndex].dataset.price;
    const type = document.getElementById('type').value;
    const qty = parseFloat(document.getElementById('qty').value);

    // Insert ke Jurnal Transaksi
    const { error: logError } = await supabaseClient.from('inventory_logs').insert([{
        ingredient_id: ingredient_id,
        type: type,
        qty: qty,
        unit_price_at_time: unit_price,
        notes: type === 'IN' ? 'Pembelian Restock' : 'Pemakaian Produksi'
    }]);

    if (logError) return alert("Gagal catat transaksi!");

    // Update stok
    const { data: currentItem } = await supabaseClient.from('ingredients').select('stock_qty').eq('id', ingredient_id).single();
    let newStock = type === 'IN' ? Number(currentItem.stock_qty) + qty : Number(currentItem.stock_qty) - qty;

    await supabaseClient.from('ingredients').update({ stock_qty: newStock }).eq('id', ingredient_id);

    alert("Transaksi berhasil dicatat ke Jurnal Umum & Saldo Aset diperbarui!");
    document.getElementById('transaction-form').reset();
    
    // Refresh semua tabel
    loadInventory(); 
    loadJournalAndAnalysis();
});

// Jalankan fungsi saat web pertama dibuka
loadInventory();
loadJournalAndAnalysis();