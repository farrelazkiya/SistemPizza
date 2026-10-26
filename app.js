const SUPABASE_URL = "https://llpcuhsotoadmljeryhz.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_qEmqkUCuZgmTBmwTSLMvNg_1mVAjU9p"; 
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const formatRp = (num) => Number(num).toLocaleString('id-ID');

// Variabel Global untuk menyimpan instance ChartJS agar bisa di-update
let inventoryChartInstance = null;
let menuItems = [];
let posCart = [];

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

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
    const { data: suppliers, error: supplierError } = await supabaseClient.from('suppliers').select('*');
    const { data: menus, error: menuError } = await supabaseClient.from('menu_items').select('*');
    if (supplierError) {
        console.error('Gagal memuat supplier:', supplierError);
        document.getElementById('supplier_id').innerHTML = '<option value="">Gagal memuat supplier</option>';
    }
    
    let supHTML = '<option value="">-- Pilih Supplier --</option>';
    if (suppliers && !supplierError) suppliers.forEach(s => supHTML += `<option value="${s.id}">${s.name}</option>`);
    if (!supplierError) document.getElementById('supplier_id').innerHTML = supHTML;

    if (menuError) {
        console.error('Gagal memuat menu:', menuError);
        document.getElementById('menu_item_id').innerHTML = '<option value="">Gagal memuat menu</option>';
        document.getElementById('pos-menu-select').innerHTML = '<option value="">Gagal memuat menu</option>';
        document.getElementById('recipe-menu-select').innerHTML = '<option value="">Gagal memuat menu</option>';
        alert(`Gagal memuat menu: ${menuError.message}`);
        return;
    }

    let menuHTML = '<option value="">-- Pilih Menu Pizza --</option>';
    if (menus) menus.forEach(m => menuHTML += `<option value="${m.id}">${m.name}</option>`);
    document.getElementById('menu_item_id').innerHTML = menuHTML;

    menuItems = menus || [];
    const posMenuSelect = document.getElementById('pos-menu-select');
    const recipeMenuSelect = document.getElementById('recipe-menu-select');
    const menuOptions = menuItems.map(menu =>
        `<option value="${menu.id}">${escapeHtml(menu.name)} - Rp ${formatRp(menu.selling_price)}</option>`
    ).join('');
    posMenuSelect.innerHTML = `<option value="">-- Pilih Menu Pizza --</option>${menuOptions}`;
    recipeMenuSelect.innerHTML = `<option value="">-- Pilih Menu Pizza --</option>${menuOptions}`;

    const ingredientSelect = document.getElementById('recipe-ingredient-select');
    const { data: ingredients, error } = await supabaseClient.from('ingredients').select('id, name, unit').order('name');
    if (error) {
        ingredientSelect.innerHTML = '<option value="">Gagal memuat bahan baku</option>';
        console.error('Gagal memuat bahan resep:', error);
        alert(`Gagal memuat bahan resep: ${error.message}`);
        return;
    }
    ingredientSelect.innerHTML = '<option value="">-- Pilih Bahan Baku --</option>' +
        (ingredients || []).map(ingredient =>
            `<option value="${ingredient.id}">${escapeHtml(ingredient.name)} (${escapeHtml(ingredient.unit)})</option>`
        ).join('');
}

function renderPosCart() {
    const cartBody = document.getElementById('pos-cart-table');
    const total = posCart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);
    document.getElementById('pos-total').innerText = `Rp ${formatRp(total)}`;
    document.getElementById('pos-checkout-button').disabled = posCart.length === 0;

    if (posCart.length === 0) {
        cartBody.innerHTML = '<tr><td colspan="5">Keranjang masih kosong.</td></tr>';
        return;
    }

    cartBody.innerHTML = posCart.map((item, index) => `
        <tr>
            <td>${escapeHtml(item.name)}</td>
            <td>Rp ${formatRp(item.selling_price)}</td>
            <td>${item.quantity}</td>
            <td>Rp ${formatRp(item.selling_price * item.quantity)}</td>
            <td><button type="button" class="btn btn-remove" data-cart-index="${index}">Hapus</button></td>
        </tr>
    `).join('');
}

async function loadMenuRecipe() {
    const menuId = document.getElementById('recipe-menu-select').value;
    const recipeBody = document.getElementById('recipe-table');
    if (!menuId) {
        recipeBody.innerHTML = '<tr><td colspan="3">Pilih menu untuk melihat resep.</td></tr>';
        return;
    }

    recipeBody.innerHTML = '<tr><td colspan="3">Memuat resep...</td></tr>';
    const { data: recipe, error } = await supabaseClient
        .from('menu_recipes')
        .select('ingredient_id, qty_per_menu, ingredients(name, unit)')
        .eq('menu_item_id', menuId)
        .order('ingredient_id');

    if (error) {
        recipeBody.innerHTML = '<tr><td colspan="3">Gagal memuat resep.</td></tr>';
        console.error('Gagal memuat resep:', error);
        alert(`Gagal memuat resep: ${error.message}`);
        return;
    }
    if (recipe.length === 0) {
        recipeBody.innerHTML = '<tr><td colspan="3">Belum ada bahan untuk menu ini.</td></tr>';
        return;
    }

    recipeBody.innerHTML = recipe.map(item => `
        <tr>
            <td>${escapeHtml(item.ingredients.name)}</td>
            <td>${item.qty_per_menu} ${escapeHtml(item.ingredients.unit)}</td>
            <td><button type="button" class="btn btn-remove" data-recipe-ingredient="${item.ingredient_id}">Hapus</button></td>
        </tr>
    `).join('');
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
    const ingredientId = Number(selectEl.value);
    const type = document.getElementById('type').value;
    const qty = Number(document.getElementById('qty').value);
    
    const supplierId = document.getElementById('supplier_id').value || null;
    const menuItemId = document.getElementById('menu_item_id').value || null;

    if (!ingredientId || !Number.isFinite(qty) || qty <= 0) return alert("Pilih bahan dan masukkan kuantitas yang valid!");
    if (type === 'IN' && !supplierId) return alert("Pilih Supplier terlebih dahulu!");
    if (type === 'OUT' && !menuItemId) return alert("Pilih Menu Pizza terlebih dahulu!");

    const button = document.querySelector('#transaction-form button[type="submit"]');
    button.innerText = "⏳ Menyimpan...";
    button.disabled = true;
    try {
        const { error } = await supabaseClient.rpc('record_inventory_movement', {
            p_ingredient_id: ingredientId,
            p_type: type,
            p_qty: qty,
            p_supplier_id: supplierId ? Number(supplierId) : null,
            p_menu_item_id: menuItemId ? Number(menuItemId) : null
        });
        if (error) throw error;

        alert("✅ Transaksi Jurnal Berhasil Disimpan!");
        document.getElementById('transaction-form').reset();
        toggleDynamicFields();
        await Promise.all([
            loadInventory(),
            loadJournalAndAnalysis(document.getElementById('filter-ingredient').value)
        ]);
        switchPage('page-jurnal', document.querySelector('.sidebar-menu li[onclick*="page-jurnal"]'));
    } catch (error) {
        console.error('Gagal menyimpan mutasi stok:', error);
        alert(`Transaksi gagal disimpan: ${error.message}`);
    } finally {
        button.innerText = "💾 Simpan Jurnal & Update Stok";
        button.disabled = false;
    }
});

document.getElementById('pos-add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const menuId = Number(document.getElementById('pos-menu-select').value);
    const quantity = Number(document.getElementById('pos-quantity').value);
    const menu = menuItems.find(item => Number(item.id) === menuId);

    if (!menu || !Number.isInteger(quantity) || quantity < 1) {
        alert('Pilih menu dan masukkan jumlah porsi yang valid.');
        return;
    }

    const existingItem = posCart.find(item => Number(item.id) === menuId);
    if (existingItem) existingItem.quantity += quantity;
    else posCart.push({
        id: menu.id,
        name: menu.name,
        selling_price: Number(menu.selling_price),
        quantity
    });

    document.getElementById('pos-quantity').value = '1';
    renderPosCart();
});

document.getElementById('pos-cart-table').addEventListener('click', (e) => {
    const button = e.target.closest('[data-cart-index]');
    if (!button) return;
    posCart.splice(Number(button.dataset.cartIndex), 1);
    renderPosCart();
});

document.getElementById('pos-checkout-button').addEventListener('click', async (e) => {
    if (posCart.length === 0) return;
    const total = posCart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);
    if (!window.confirm(`Simpan penjualan dengan total Rp ${formatRp(total)}?`)) return;

    const button = e.currentTarget;
    button.disabled = true;
    button.innerText = '⏳ Menyimpan...';
    try {
        const { data: saleId, error } = await supabaseClient.rpc('create_sale', {
            p_items: posCart.map(item => ({
                menu_item_id: item.id,
                quantity: item.quantity
            }))
        });
        if (error) throw error;

        posCart = [];
        renderPosCart();
        await Promise.all([
            loadInventory(),
            loadJournalAndAnalysis(document.getElementById('filter-ingredient').value)
        ]);
        alert(`Penjualan #${saleId} berhasil disimpan dan stok resep telah diperbarui.`);
    } catch (error) {
        console.error('Gagal menyimpan penjualan:', error);
        alert(`Penjualan gagal disimpan: ${error.message}`);
    } finally {
        button.innerText = '✅ Simpan Penjualan';
        button.disabled = posCart.length === 0;
    }
});

document.getElementById('recipe-menu-select').addEventListener('change', loadMenuRecipe);

document.getElementById('recipe-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const menuId = document.getElementById('recipe-menu-select').value;
    const ingredientId = document.getElementById('recipe-ingredient-select').value;
    const quantity = Number(document.getElementById('recipe-quantity').value);
    if (!menuId || !ingredientId || !Number.isFinite(quantity) || quantity <= 0) {
        alert('Pilih menu, bahan baku, dan takaran yang valid.');
        return;
    }

    const button = e.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        const { error } = await supabaseClient.from('menu_recipes').upsert({
            menu_item_id: Number(menuId),
            ingredient_id: Number(ingredientId),
            qty_per_menu: quantity
        }, { onConflict: 'menu_item_id,ingredient_id' });
        if (error) throw error;
        document.getElementById('recipe-quantity').value = '';
        await loadMenuRecipe();
    } catch (error) {
        console.error('Gagal menyimpan bahan resep:', error);
        alert(`Gagal menyimpan bahan resep: ${error.message}`);
    } finally {
        button.disabled = false;
    }
});

document.getElementById('recipe-table').addEventListener('click', async (e) => {
    const button = e.target.closest('[data-recipe-ingredient]');
    if (!button) return;
    const menuId = document.getElementById('recipe-menu-select').value;
    if (!window.confirm('Hapus bahan ini dari resep?')) return;

    button.disabled = true;
    try {
        const { error } = await supabaseClient.from('menu_recipes').delete()
            .eq('menu_item_id', Number(menuId))
            .eq('ingredient_id', Number(button.dataset.recipeIngredient));
        if (error) throw error;
        await loadMenuRecipe();
    } catch (error) {
        console.error('Gagal menghapus bahan resep:', error);
        alert(`Gagal menghapus bahan resep: ${error.message}`);
        button.disabled = false;
    }
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
renderPosCart();