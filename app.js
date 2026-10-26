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
    const isPurchase = type === 'IN';
    document.getElementById('inventory-unit-price').required = isPurchase;
    document.getElementById('inventory-waste-reason').required = !isPurchase;
    if (type === 'IN') {
        document.getElementById('group-supplier').classList.remove('hidden');
        document.getElementById('group-payment').classList.remove('hidden');
        document.getElementById('group-purchase-price').classList.remove('hidden');
        document.getElementById('group-waste-reason').classList.add('hidden');
    } else {
        document.getElementById('group-supplier').classList.add('hidden');
        document.getElementById('group-payment').classList.add('hidden');
        document.getElementById('group-purchase-price').classList.add('hidden');
        document.getElementById('group-waste-reason').classList.remove('hidden');
    }
}

async function loadSuppliersAndMenus() {
    const { data: menus, error: menuError } = await supabaseClient.from('menu_items').select('*');
    if (menuError) {
        console.error('Gagal memuat menu:', menuError);
        document.getElementById('pos-menu-select').innerHTML = '<option value="">Gagal memuat menu</option>';
        document.getElementById('recipe-menu-select').innerHTML = '<option value="">Gagal memuat menu</option>';
        alert(`Gagal memuat menu: ${menuError.message}`);
        return;
    }

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

async function loadIngredientSuppliers() {
    const ingredientId = document.getElementById('ingredient_id').value;
    const supplierSelect = document.getElementById('supplier_id');
    const priceInput = document.getElementById('inventory-unit-price');
    supplierSelect.innerHTML = '<option value="">Memuat supplier...</option>';
    priceInput.value = '';
    if (!ingredientId) {
        supplierSelect.innerHTML = '<option value="">-- Pilih bahan baku dahulu --</option>';
        return;
    }

    const { data, error } = await supabaseClient
        .from('supplier_ingredients')
        .select('supplier_id, fixed_unit_price, suppliers(name)')
        .eq('ingredient_id', Number(ingredientId))
        .order('supplier_id');
    if (error) {
        supplierSelect.innerHTML = '<option value="">Gagal memuat supplier</option>';
        console.error('Gagal memuat supplier bahan:', error);
        alert(`Gagal memuat supplier bahan: ${error.message}`);
        return;
    }
    if (!data || data.length === 0) {
        supplierSelect.innerHTML = '<option value="">Supplier untuk bahan ini belum diatur</option>';
        return;
    }

    supplierSelect.innerHTML = '<option value="">-- Pilih Supplier --</option>' +
        data.map(item =>
            `<option value="${item.supplier_id}" data-price="${item.fixed_unit_price}">${escapeHtml(item.suppliers.name)} - Rp ${formatRp(item.fixed_unit_price)}</option>`
        ).join('');
    if (data.length === 1) {
        supplierSelect.value = String(data[0].supplier_id);
        priceInput.value = data[0].fixed_unit_price;
    }
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
            const paymentAccount = log.payment_method === 'CREDIT'
                ? 'Utang Dagang'
                : log.payment_method === 'CASH'
                    ? 'Kas'
                    : 'Kas / Utang Dagang (pembayaran belum diketahui)';
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td><span class="badge badge-in">IN</span></td>
                    <td><b>Persediaan (${log.ingredients.name})</b> - Masuk ${log.qty} ${supplierName}<br><div class="acc-kredit">${paymentAccount}</div></td>
                    <td>Rp ${formatRp(totalVal)}<br>-</td>
                    <td>-<br>Rp ${formatRp(totalVal)}</td>
                </tr>
            `;
        } else if (log.movement_reason === 'SPOILED') {
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td><span class="badge badge-out">RUSAK</span></td>
                    <td><b>Kerugian Persediaan Basi</b> - ${escapeHtml(log.notes || 'Barang basi / kedaluwarsa')}<br><div class="acc-kredit">Persediaan (${escapeHtml(log.ingredients.name)})</div></td>
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
    const paymentMethod = type === 'IN'
        ? document.getElementById('inventory-payment-method').value
        : null;
    const reason = type === 'OUT'
        ? document.getElementById('inventory-waste-reason').value.trim()
        : null;

    if (!ingredientId || !Number.isFinite(qty) || qty <= 0) return alert("Pilih bahan dan masukkan kuantitas yang valid!");
    if (type === 'IN' && !supplierId) return alert("Pilih Supplier terlebih dahulu!");
    if (type === 'OUT' && !reason) return alert("Masukkan alasan persediaan basi atau kedaluwarsa!");

    const button = document.querySelector('#transaction-form button[type="submit"]');
    button.innerText = "⏳ Menyimpan...";
    button.disabled = true;
    try {
        const { error } = await supabaseClient.rpc('record_inventory_movement', {
            p_ingredient_id: ingredientId,
            p_type: type,
            p_qty: qty,
            p_supplier_id: type === 'IN' && supplierId ? Number(supplierId) : null,
            p_menu_item_id: null,
            p_payment_method: paymentMethod,
            p_reason: reason
        });
        if (error) throw error;

        alert("✅ Transaksi Jurnal Berhasil Disimpan!");
        document.getElementById('transaction-form').reset();
        toggleDynamicFields();
        await loadIngredientSuppliers();
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

document.getElementById('ingredient_id').addEventListener('change', (event) => {
    loadIngredientSuppliers();
});

document.getElementById('supplier_id').addEventListener('change', (event) => {
    const selectedOption = event.currentTarget.options[event.currentTarget.selectedIndex];
    document.getElementById('inventory-unit-price').value = selectedOption.dataset.price || '';
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

function localDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function reportDateBounds() {
    const startValue = document.getElementById('report-start-date').value;
    const endValue = document.getElementById('report-end-date').value;
    if (!startValue || !endValue || startValue > endValue) {
        throw new Error('Pilih rentang tanggal yang valid.');
    }

    const [startYear, startMonth, startDay] = startValue.split('-').map(Number);
    const [endYear, endMonth, endDay] = endValue.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay);
    const endExclusive = new Date(endYear, endMonth - 1, endDay + 1);
    return { start: start.toISOString(), end: endExclusive.toISOString() };
}

function reportStatus(paymentMethod, paidAt) {
    if (paidAt) return paymentMethod === 'CREDIT' ? 'Lunas (Utang)' : 'Dibayar';
    if (paymentMethod === 'CREDIT') return 'Belum dibayar';
    return 'Pembayaran belum diketahui';
}

async function fetchAllReportRows(queryFactory) {
    const rows = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await queryFactory().range(offset, offset + pageSize - 1);
        if (error) return { data: null, error };
        rows.push(...(data || []));
        if (!data || data.length < pageSize) return { data: rows, error: null };
    }
}

async function loadFinancialReport() {
    const profitLossBody = document.getElementById('profit-loss-table');
    const cashFlowBody = document.getElementById('cash-flow-table');
    const expenseBody = document.getElementById('expense-table');
    const payableBody = document.getElementById('payables-table');
    try {
        const { start, end } = reportDateBounds();
        profitLossBody.innerHTML = '<tr><td colspan="2">Memuat laporan...</td></tr>';
        cashFlowBody.innerHTML = '<tr><td colspan="4">Memuat arus kas...</td></tr>';
        expenseBody.innerHTML = '<tr><td colspan="5">Memuat biaya...</td></tr>';
        payableBody.innerHTML = '<tr><td colspan="5">Memuat utang...</td></tr>';

        const queryFactories = [
            () => supabaseClient.from('sales').select('id, total_amount, created_at')
                .gte('created_at', start).lt('created_at', end).order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, created_at, qty, unit_price_at_time, menu_item_id, notes, ingredients(name)')
                .eq('type', 'OUT').is('movement_reason', null)
                .gte('created_at', start).lt('created_at', end).order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, created_at, qty, unit_price_at_time, notes')
                .eq('type', 'OUT').eq('movement_reason', 'SPOILED')
                .gte('created_at', start).lt('created_at', end).order('created_at'),
            () => supabaseClient.from('operating_expenses')
                .select('id, description, category, amount, payment_method, created_at, paid_at')
                .gte('created_at', start).lt('created_at', end).order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, qty, unit_price_at_time, paid_at, ingredients(name), suppliers(name)')
                .eq('type', 'IN').gte('paid_at', start).lt('paid_at', end).order('paid_at'),
            () => supabaseClient.from('operating_expenses')
                .select('id, description, amount, paid_at')
                .not('paid_at', 'is', null).gte('paid_at', start).lt('paid_at', end).order('paid_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, qty, unit_price_at_time, created_at, notes, ingredients(name), suppliers(name)')
                .eq('type', 'IN').eq('payment_method', 'CREDIT').is('paid_at', null).order('created_at'),
            () => supabaseClient.from('operating_expenses')
                .select('id, description, category, amount, created_at')
                .eq('payment_method', 'CREDIT').is('paid_at', null).order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, qty, unit_price_at_time')
                .eq('type', 'IN').is('payment_method', null)
                .gte('created_at', start).lt('created_at', end)
        ];
        const [salesResult, cogsResult, spoiledResult, expensesResult, purchasesPaidResult,
            expensesPaidResult, unpaidPurchasesResult, unpaidExpensesResult,
            unknownPurchasesResult] = await Promise.all(queryFactories.map(fetchAllReportRows));
        const results = [salesResult, cogsResult, spoiledResult, expensesResult, purchasesPaidResult,
            expensesPaidResult, unpaidPurchasesResult, unpaidExpensesResult, unknownPurchasesResult];
        const failedResult = results.find(result => result.error);
        if (failedResult) throw failedResult.error;

        const sales = salesResult.data || [];
        const cogsLogs = cogsResult.data || [];
        const spoiledLogs = spoiledResult.data || [];
        const expenses = expensesResult.data || [];
        const paidPurchases = purchasesPaidResult.data || [];
        const paidExpenses = expensesPaidResult.data || [];
        const unpaidPurchases = unpaidPurchasesResult.data || [];
        const unpaidExpenses = unpaidExpensesResult.data || [];
        const unknownPurchases = unknownPurchasesResult.data || [];

        const revenue = sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
        const cogs = cogsLogs.reduce((sum, log) => sum + Number(log.qty) * Number(log.unit_price_at_time), 0);
        const spoilageLoss = spoiledLogs.reduce((sum, log) => sum + Number(log.qty) * Number(log.unit_price_at_time), 0);
        const grossProfit = revenue - cogs;
        const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
        const netProfit = grossProfit - expenseTotal - spoilageLoss;
        const cashIn = revenue;
        const purchaseCashOut = paidPurchases.reduce((sum, log) =>
            sum + Number(log.qty) * Number(log.unit_price_at_time), 0);
        const expenseCashOut = paidExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
        const cashOut = purchaseCashOut + expenseCashOut;

        document.getElementById('report-revenue').innerText = `Rp ${formatRp(revenue)}`;
        document.getElementById('report-gross-profit').innerText = `Rp ${formatRp(grossProfit)}`;
        document.getElementById('report-net-profit').innerText = `Rp ${formatRp(netProfit)}`;
        document.getElementById('report-net-profit').classList.toggle('text-danger', netProfit < 0);
        document.getElementById('report-net-cash-flow').innerText = `Rp ${formatRp(cashIn - cashOut)}`;
        document.getElementById('report-net-cash-flow').classList.toggle('text-danger', cashIn - cashOut < 0);
        document.getElementById('report-cash-in').innerText = `Rp ${formatRp(cashIn)}`;
        document.getElementById('report-cash-out').innerText = `Rp ${formatRp(cashOut)}`;

        const expensesByCategory = new Map();
        expenses.forEach(expense => {
            expensesByCategory.set(
                expense.category,
                (expensesByCategory.get(expense.category) || 0) + Number(expense.amount)
            );
        });
        const expenseRows = [...expensesByCategory.entries()].sort(([left], [right]) => left.localeCompare(right, 'id'))
            .map(([category, amount]) => `<tr><td>Biaya ${escapeHtml(category)}</td><td class="report-amount">Rp ${formatRp(amount)}</td></tr>`)
            .join('');
        profitLossBody.innerHTML = `
            <tr><th>Pendapatan penjualan</th><td class="report-amount">Rp ${formatRp(revenue)}</td></tr>
            <tr><td>(-) Harga Pokok Penjualan (HPP)</td><td class="report-amount">Rp ${formatRp(cogs)}</td></tr>
            <tr class="report-total"><th>Laba Kotor</th><td class="report-amount">Rp ${formatRp(grossProfit)}</td></tr>
            <tr><th colspan="2">Biaya Operasional</th></tr>
            ${expenseRows || '<tr><td colspan="2">Belum ada biaya operasional pada periode ini.</td></tr>'}
            <tr><td>Kerugian Persediaan Basi / Kedaluwarsa</td><td class="report-amount">Rp ${formatRp(spoilageLoss)}</td></tr>
            <tr class="report-total"><th>Laba / (Rugi) Bersih</th><td class="report-amount">Rp ${formatRp(netProfit)}</td></tr>
        `;

        const cashEntries = [
            ...sales.map(sale => ({
                date: sale.created_at,
                description: `Penjualan #${sale.id}`,
                inflow: Number(sale.total_amount),
                outflow: 0
            })),
            ...paidPurchases.map(purchase => ({
                date: purchase.paid_at,
                description: `Pembelian bahan: ${purchase.ingredients?.name || 'Bahan baku'}${purchase.suppliers?.name ? ` (${purchase.suppliers.name})` : ''}`,
                inflow: 0,
                outflow: Number(purchase.qty) * Number(purchase.unit_price_at_time)
            })),
            ...paidExpenses.map(expense => ({
                date: expense.paid_at,
                description: `Biaya: ${expense.description}`,
                inflow: 0,
                outflow: Number(expense.amount)
            }))
        ].sort((left, right) => new Date(right.date) - new Date(left.date));
        cashFlowBody.innerHTML = cashEntries.length
            ? cashEntries.map(entry => `
                <tr>
                    <td>${new Date(entry.date).toLocaleDateString('id-ID')}</td>
                    <td>${escapeHtml(entry.description)}</td>
                    <td>${entry.inflow ? `Rp ${formatRp(entry.inflow)}` : '-'}</td>
                    <td>${entry.outflow ? `Rp ${formatRp(entry.outflow)}` : '-'}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="4">Belum ada arus kas pada periode ini.</td></tr>';

        expenseBody.innerHTML = expenses.length
            ? expenses.map(expense => `
                <tr>
                    <td>${new Date(expense.created_at).toLocaleDateString('id-ID')}</td>
                    <td>${escapeHtml(expense.description)}</td>
                    <td>${escapeHtml(expense.category)}</td>
                    <td>Rp ${formatRp(expense.amount)}</td>
                    <td>${reportStatus(expense.payment_method, expense.paid_at)}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="5">Belum ada biaya pada periode ini.</td></tr>';

        const payableRows = [
            ...unpaidPurchases.map(purchase => ({
                id: purchase.id,
                type: 'PURCHASE',
                date: purchase.created_at,
                description: `Pembelian ${purchase.ingredients?.name || 'bahan baku'}${purchase.suppliers?.name ? ` dari ${purchase.suppliers.name}` : ''}${purchase.notes ? ` - ${purchase.notes}` : ''}`,
                amount: Number(purchase.qty) * Number(purchase.unit_price_at_time)
            })),
            ...unpaidExpenses.map(expense => ({
                id: expense.id,
                type: 'EXPENSE',
                date: expense.created_at,
                description: `${expense.description} (${expense.category})`,
                amount: Number(expense.amount)
            }))
        ].sort((left, right) => new Date(left.date) - new Date(right.date));
        payableBody.innerHTML = payableRows.length
            ? payableRows.map(payable => `
                <tr>
                    <td>${new Date(payable.date).toLocaleDateString('id-ID')}</td>
                    <td>${payable.type === 'PURCHASE' ? 'Pembelian stok' : 'Biaya operasional'}</td>
                    <td>${escapeHtml(payable.description)}</td>
                    <td>Rp ${formatRp(payable.amount)}</td>
                    <td><button type="button" class="btn btn-payable" data-source-type="${payable.type}" data-source-id="${payable.id}">Tandai dibayar</button></td>
                </tr>
            `).join('')
            : '<tr><td colspan="5">Tidak ada utang yang belum dibayar.</td></tr>';

        const unknownPurchaseTotal = unknownPurchases.reduce((sum, purchase) =>
            sum + Number(purchase.qty) * Number(purchase.unit_price_at_time), 0);
        document.getElementById('report-cash-warning').innerText = unknownPurchases.length
            ? `${unknownPurchases.length} pembelian stok lama senilai Rp ${formatRp(unknownPurchaseTotal)} tidak memiliki status pembayaran, sehingga tidak dimasukkan ke arus kas.`
            : 'Penjualan kasir dianggap langsung diterima. Pembelian stok dan biaya operasional masuk arus kas pada tanggal pembayarannya.';
    } catch (error) {
        console.error('Gagal memuat laporan keuangan:', error);
        profitLossBody.innerHTML = '<tr><td colspan="2">Laporan gagal dimuat.</td></tr>';
        cashFlowBody.innerHTML = '<tr><td colspan="4">Arus kas gagal dimuat.</td></tr>';
        expenseBody.innerHTML = '<tr><td colspan="5">Biaya gagal dimuat.</td></tr>';
        payableBody.innerHTML = '<tr><td colspan="5">Utang gagal dimuat.</td></tr>';
        alert(`Gagal memuat laporan keuangan: ${error.message}`);
    }
}

document.getElementById('financial-report-apply').addEventListener('click', loadFinancialReport);
document.getElementById('financial-report-refresh').addEventListener('click', loadFinancialReport);

document.getElementById('expense-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        const { error } = await supabaseClient.rpc('create_operating_expense', {
            p_description: document.getElementById('expense-description').value.trim(),
            p_category: document.getElementById('expense-category').value.trim(),
            p_amount: Number(document.getElementById('expense-amount').value),
            p_payment_method: document.getElementById('expense-payment-method').value
        });
        if (error) throw error;
        form.reset();
        await loadFinancialReport();
        alert('Biaya operasional berhasil dicatat.');
    } catch (error) {
        console.error('Gagal mencatat biaya operasional:', error);
        alert(`Biaya operasional gagal dicatat: ${error.message}`);
    } finally {
        button.disabled = false;
    }
});

document.getElementById('payables-table').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-source-type]');
    if (!button) return;
    if (!window.confirm('Tandai utang ini sudah dibayar? Pembayaran akan tercatat pada periode saat ini.')) return;
    button.disabled = true;
    try {
        const { error } = await supabaseClient.rpc('settle_financial_payable', {
            p_source_type: button.dataset.sourceType,
            p_source_id: Number(button.dataset.sourceId)
        });
        if (error) throw error;
        await loadFinancialReport();
        alert('Pembayaran utang berhasil dicatat.');
    } catch (error) {
        console.error('Gagal mencatat pembayaran utang:', error);
        alert(`Pembayaran gagal dicatat: ${error.message}`);
        button.disabled = false;
    }
});

// Inisialisasi awal saat web dibuka
loadSuppliersAndMenus();
loadInventory();
loadJournalAndAnalysis();
renderPosCart();
const reportToday = new Date();
document.getElementById('report-start-date').value = localDateValue(new Date(reportToday.getFullYear(), reportToday.getMonth(), 1));
document.getElementById('report-end-date').value = localDateValue(reportToday);
loadFinancialReport();