const SUPABASE_URL = "https://llpcuhsotoadmljeryhz.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_qEmqkUCuZgmTBmwTSLMvNg_1mVAjU9p"; 
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const formatRp = (num) => Number(num).toLocaleString('id-ID');
const inventoryLogCost = (log) => {
    const batchConsumptions = log.inventory_batch_consumptions || [];
    return batchConsumptions.length
        ? batchConsumptions.reduce((sum, consumption) =>
            sum + Number(consumption.quantity) * Number(consumption.unit_cost), 0)
        : Number(log.qty) * Number(log.unit_price_at_time);
};

// Variabel Global untuk menyimpan instance ChartJS agar bisa di-update
let inventoryChartInstance = null;
let menuEngineeringChartInstance = null;
let executiveCharts = {};
let menuItems = [];
let posCart = [];
let inventorySnapshot = null;
let expiringBatchSnapshot = [];
let executiveDashboardRequest = 0;

function showToast(message, type = 'success') {
    const region = document.getElementById('toast-region');
    const toast = document.createElement('div');
    const iconName = type === 'error' ? 'circle-x' : type === 'warning' ? 'triangle-alert' : 'circle-check';
    toast.className = `toast${type === 'success' ? '' : ` toast-${type}`}`;
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', iconName);
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(icon, text);
    region.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();
    window.setTimeout(() => {
        toast.classList.add('is-leaving');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 3600);
}

function setDatabaseStatus(status) {
    const badge = document.getElementById('database-status');
    const label = status === 'connected'
        ? 'Online / Connected'
        : status === 'offline'
            ? 'Tidak ada koneksi'
            : status === 'error'
                ? 'Database bermasalah'
                : 'Memeriksa database';
    badge.className = `connection-badge ${status === 'connected' ? '' : `is-${status}`}`.trim();
    badge.lastElementChild.textContent = label;
}

function updateLiveDateTime() {
    document.getElementById('live-datetime').textContent = new Intl.DateTimeFormat('id-ID', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date());
}

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
    const activePage = document.getElementById(pageId);
    activePage.classList.add('active');
    document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
    element.classList.add('active');
    document.getElementById('current-page-title').textContent = activePage.querySelector('h1')?.textContent || 'Workspace';
    if (pageId === 'page-laporan') loadMenuEngineering();
}

function navigateToPage(pageId, focusId = '') {
    const pageLink = document.querySelector(`.sidebar-menu li[onclick*="${pageId}"]`);
    if (!pageLink) throw new Error(`Navigasi ke halaman ${pageId} tidak ditemukan.`);
    switchPage(pageId, pageLink);
    if (!focusId) return;
    window.setTimeout(() => {
        const target = document.getElementById(focusId);
        if (!target) throw new Error(`Tujuan aksi cepat ${focusId} tidak ditemukan.`);
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.querySelector('input:not([type="hidden"]), select, textarea')?.focus({ preventScroll: true });
    }, 80);
}

function toggleDynamicFields() {
    const type = document.getElementById('type').value;
    const isPurchase = type === 'IN';
    document.getElementById('inventory-unit-price').required = isPurchase;
    document.getElementById('inventory-batch-number').required = isPurchase;
    document.getElementById('inventory-expiry-date').required = isPurchase;
    document.getElementById('inventory-waste-reason').required = !isPurchase;
    if (type === 'IN') {
        document.getElementById('group-supplier').classList.remove('hidden');
        document.getElementById('group-payment').classList.remove('hidden');
        document.getElementById('group-purchase-price').classList.remove('hidden');
        document.getElementById('group-batch-number').classList.remove('hidden');
        document.getElementById('group-expiry-date').classList.remove('hidden');
        document.getElementById('group-waste-reason').classList.add('hidden');
    } else {
        document.getElementById('group-supplier').classList.add('hidden');
        document.getElementById('group-payment').classList.add('hidden');
        document.getElementById('group-purchase-price').classList.add('hidden');
        document.getElementById('group-batch-number').classList.add('hidden');
        document.getElementById('group-expiry-date').classList.add('hidden');
        document.getElementById('group-waste-reason').classList.remove('hidden');
    }
}

async function loadSuppliersAndMenus() {
    const { data: menus, error: menuError } = await supabaseClient.from('menu_items')
        .select('id, name, selling_price')
        .eq('is_available', true)
        .order('name');
    if (menuError) {
        setDatabaseStatus(navigator.onLine ? 'error' : 'offline');
        console.error('Gagal memuat menu:', menuError);
        document.getElementById('pos-menu-select').innerHTML = '<option value="">Gagal memuat menu</option>';
        document.getElementById('recipe-menu-select').innerHTML = '<option value="">Gagal memuat menu</option>';
        alert(`Gagal memuat menu: ${menuError.message}`);
        return;
    }
    setDatabaseStatus('connected');

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
    const paymentMethod = document.getElementById('pos-payment-method').value;
    const platformFee = ['GOFOOD', 'GRABFOOD'].includes(paymentMethod) ? Math.round(total * 0.2) : 0;
    document.getElementById('pos-total').innerText = `Rp ${formatRp(total)}`;
    document.getElementById('pos-settlement-preview').innerText = platformFee
        ? `Piutang setelah komisi 20%: Rp ${formatRp(total - platformFee)}`
        : `Diterima penuh: Rp ${formatRp(total)}`;
    document.getElementById('pos-checkout-button').disabled = posCart.length === 0;

    if (posCart.length === 0) {
        cartBody.innerHTML = '<tr><td colspan="5" class="empty-state"><div class="empty-state-content"><i data-lucide="shopping-basket"></i><strong>Keranjang masih kosong</strong><span>Pilih menu pizza untuk mulai menambahkan pesanan.</span></div></td></tr>';
        if (window.lucide) window.lucide.createIcons();
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
    if (window.lucide) window.lucide.createIcons();
}

async function loadTodaySalesTotal() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const { data, error } = await supabaseClient.from('sales')
        .select('total_amount')
        .gte('created_at', start)
        .lt('created_at', end);
    if (error) {
        console.error('Gagal memuat total penjualan hari ini:', error);
        showToast(`Total penjualan hari ini gagal dimuat: ${error.message}`, 'error');
        return;
    }
    const total = (data || []).reduce((sum, sale) => sum + Number(sale.total_amount), 0);
    document.getElementById('today-sales-value').textContent = `Rp ${formatRp(total)}`;
}

async function loadSalesJournal() {
    const salesBody = document.getElementById('sales-journal-table');
    const { data: sales, error } = await supabaseClient
        .from('sales')
        .select('id, total_amount, payment_method, platform_fee, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
    if (error) {
        salesBody.innerHTML = '<tr><td colspan="7">Gagal memuat jurnal penjualan.</td></tr>';
        console.error('Gagal memuat jurnal penjualan:', error);
        alert(`Gagal memuat jurnal penjualan: ${error.message}`);
        return;
    }
    if (!sales || sales.length === 0) {
        salesBody.innerHTML = '<tr><td colspan="7">Belum ada transaksi penjualan.</td></tr>';
        return;
    }

    const paymentLabels = {
        CASH: 'Tunai (Kas)',
        QRIS: 'QRIS / Bank Transfer',
        GOFOOD: 'GoFood',
        GRABFOOD: 'GrabFood'
    };
    salesBody.innerHTML = sales.map(sale => {
        const amount = Number(sale.total_amount);
        const fee = Number(sale.platform_fee);
        const receivable = amount - fee;
        const isPlatform = ['GOFOOD', 'GRABFOOD'].includes(sale.payment_method);
        const journalLines = isPlatform
            ? `<b>Debit</b>: Beban Komisi ${paymentLabels[sale.payment_method]} Rp ${formatRp(fee)}<br>Debit: Piutang ${paymentLabels[sale.payment_method]} Rp ${formatRp(receivable)}<br><b>Kredit</b>: Pendapatan Penjualan Rp ${formatRp(amount)}`
            : `<b>Debit</b>: ${sale.payment_method === 'CASH' ? 'Kas' : 'Bank / QRIS'} Rp ${formatRp(amount)}<br><b>Kredit</b>: Pendapatan Penjualan Rp ${formatRp(amount)}`;
        return `
            <tr>
                <td>${new Date(sale.created_at).toLocaleString('id-ID')}</td>
                <td>#${sale.id}</td>
                <td>${paymentLabels[sale.payment_method] || escapeHtml(sale.payment_method)}</td>
                <td>Rp ${formatRp(amount)}</td>
                <td>${fee ? `Rp ${formatRp(fee)}` : '-'}</td>
                <td>${isPlatform ? `Piutang Rp ${formatRp(receivable)}` : `Kas/Bank Rp ${formatRp(amount)}`}</td>
                <td>${journalLines}</td>
            </tr>
        `;
    }).join('');
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

function fifoRecipeCost(recipeRows, batchesByIngredient, ingredientsById) {
    const remainingByBatch = new Map();
    let totalCost = 0;

    for (const recipe of recipeRows) {
        const ingredientId = Number(recipe.ingredient_id);
        let requiredQty = Number(recipe.qty_per_menu);
        const batches = batchesByIngredient.get(ingredientId) || [];

        for (const batch of batches) {
            const remainingQty = remainingByBatch.has(batch.id)
                ? remainingByBatch.get(batch.id)
                : Number(batch.quantity_remaining);
            if (remainingQty <= 0 || requiredQty <= 0) continue;
            const usedQty = Math.min(requiredQty, remainingQty);
            totalCost += usedQty * Number(batch.unit_cost);
            requiredQty -= usedQty;
            remainingByBatch.set(batch.id, remainingQty - usedQty);
        }

        if (requiredQty > 0) {
            const ingredient = ingredientsById.get(ingredientId);
            if (!ingredient) return null;
            totalCost += requiredQty * Number(ingredient.unit_price);
        }
    }

    return totalCost;
}

function median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

async function loadMenuEngineering() {
    const tableBody = document.getElementById('menu-engineering-table');
    const refreshButton = document.getElementById('menu-engineering-refresh');
    tableBody.innerHTML = '<tr><td colspan="8">Memuat analisis menu...</td></tr>';
    refreshButton.disabled = true;

    try {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
        const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        const start = startDate.toISOString();
        const end = endDate.toISOString();
        const [menuResult, recipeResult, batchResult, salesResult, cogsResult] = await Promise.all([
            supabaseClient.from('menu_items')
                .select('id, name, selling_price')
                .eq('is_available', true)
                .order('name'),
            fetchAllReportRows(() => supabaseClient.from('menu_recipes')
                .select('menu_item_id, ingredient_id, qty_per_menu, ingredients(id, name, unit, unit_price)')
                .order('menu_item_id')),
            fetchAllReportRows(() => supabaseClient.from('inventory_batches')
                .select('id, ingredient_id, expiry_date, received_at, quantity_remaining, unit_cost')
                .gt('quantity_remaining', 0)
                .order('expiry_date', { ascending: true, nullsFirst: false })
                .order('received_at', { ascending: true })
                .order('id', { ascending: true })),
            fetchAllReportRows(() => supabaseClient.from('sales')
                .select('id, sale_items(menu_item_id, quantity)')
                .gte('created_at', start)
                .lt('created_at', end)),
            fetchAllReportRows(() => supabaseClient.from('inventory_logs')
                .select('menu_item_id, qty, unit_price_at_time, notes, inventory_batch_consumptions(quantity, unit_cost)')
                .eq('type', 'OUT')
                .is('movement_reason', null)
                .not('menu_item_id', 'is', null)
                .like('notes', 'Penjualan #%')
                .gte('created_at', start)
                .lt('created_at', end))
        ]);

        if (menuResult.error) throw menuResult.error;
        for (const result of [recipeResult, batchResult, salesResult, cogsResult]) {
            if (result.error) throw result.error;
        }

        const menus = menuResult.data || [];
        const recipeRows = recipeResult.data || [];
        const batchesByIngredient = new Map();
        (batchResult.data || []).forEach(batch => {
            const ingredientId = Number(batch.ingredient_id);
            if (!batchesByIngredient.has(ingredientId)) batchesByIngredient.set(ingredientId, []);
            batchesByIngredient.get(ingredientId).push(batch);
        });
        const recipesByMenu = new Map();
        const ingredientsById = new Map();
        recipeRows.forEach(recipe => {
            const menuId = Number(recipe.menu_item_id);
            if (!recipesByMenu.has(menuId)) recipesByMenu.set(menuId, []);
            recipesByMenu.get(menuId).push(recipe);
            if (recipe.ingredients) ingredientsById.set(Number(recipe.ingredient_id), recipe.ingredients);
        });

        const soldUnitsByMenu = new Map();
        const saleMenuQuantities = new Map();
        (salesResult.data || []).forEach(sale => {
            const menuQuantities = new Map();
            (sale.sale_items || []).forEach(item => {
                if (item.menu_item_id === null) return;
                const menuId = Number(item.menu_item_id);
                const quantity = Number(item.quantity);
                soldUnitsByMenu.set(menuId, (soldUnitsByMenu.get(menuId) || 0) + quantity);
                menuQuantities.set(menuId, (menuQuantities.get(menuId) || 0) + quantity);
            });
            saleMenuQuantities.set(Number(sale.id), menuQuantities);
        });
        const actualCostByMenu = new Map();
        const actualUnitsByMenu = new Map();
        const coveredSaleMenus = new Set();
        (cogsResult.data || []).forEach(log => {
            const saleIdMatch = log.notes?.match(/^Penjualan #(\d+)$/);
            if (!saleIdMatch) return;
            const saleId = Number(saleIdMatch[1]);
            const menuId = Number(log.menu_item_id);
            actualCostByMenu.set(menuId, (actualCostByMenu.get(menuId) || 0) + inventoryLogCost(log));
            coveredSaleMenus.add(`${saleId}:${menuId}`);
        });
        coveredSaleMenus.forEach(key => {
            const [saleId, menuId] = key.split(':').map(Number);
            const quantity = saleMenuQuantities.get(saleId)?.get(menuId) || 0;
            actualUnitsByMenu.set(menuId, (actualUnitsByMenu.get(menuId) || 0) + quantity);
        });

        const medianUnitsSold = median(menus.map(menu => soldUnitsByMenu.get(Number(menu.id)) || 0));
        const rows = menus.map(menu => {
            const menuId = Number(menu.id);
            const soldUnits = soldUnitsByMenu.get(menuId) || 0;
            const recipes = recipesByMenu.get(menuId) || [];
            const actualHpp = actualCostByMenu.get(menuId);
            const actualUnits = actualUnitsByMenu.get(menuId) || 0;
            const hppPerPortion = actualUnits > 0 && actualHpp !== undefined
                ? actualHpp / actualUnits
                : recipes.length > 0
                    ? fifoRecipeCost(recipes, batchesByIngredient, ingredientsById)
                    : null;
            const sellingPrice = Number(menu.selling_price);
            const foodCostPercent = hppPerPortion !== null && sellingPrice > 0
                ? (hppPerPortion / sellingPrice) * 100
                : null;
            const isHighSelling = soldUnits > medianUnitsSold;
            let category;
            if (foodCostPercent === null) category = 'NO_RECIPE';
            else if (foodCostPercent < 30) category = isHighSelling ? 'STAR' : 'PUZZLE';
            else if (foodCostPercent > 35) category = isHighSelling ? 'PLOWHORSE' : 'DOG';
            else category = 'NORMAL';

            return {
                id: menuId,
                name: menu.name,
                sellingPrice,
                soldUnits,
                hppPerPortion,
                foodCostPercent,
                category,
                idealMin: hppPerPortion === null ? null : Math.ceil(hppPerPortion / 0.32 - 1e-8),
                idealMax: hppPerPortion === null ? null : Math.floor(hppPerPortion / 0.28 + 1e-8),
                targetPrice: hppPerPortion === null ? null : Math.round(hppPerPortion / 0.30)
            };
        });

        const categoryLabels = {
            STAR: ['STAR', 'badge-star'],
            PLOWHORSE: ['PLOWHORSE', 'badge-plowhorse'],
            PUZZLE: ['PUZZLE', 'badge-puzzle'],
            DOG: ['DOG', 'badge-dog'],
            NORMAL: ['NORMAL', 'badge-normal'],
            NO_RECIPE: ['RESEP BELUM LENGKAP', '']
        };
        tableBody.innerHTML = rows.length
            ? rows.map(row => {
                const [label, badgeClass] = categoryLabels[row.category];
                return `
                    <tr>
                        <td>${escapeHtml(row.name)}</td>
                        <td>${row.hppPerPortion === null ? '-' : `Rp ${formatRp(row.hppPerPortion)}`}</td>
                        <td>Rp ${formatRp(row.sellingPrice)}</td>
                        <td>${row.foodCostPercent === null ? '-' : `${row.foodCostPercent.toFixed(1)}%`}</td>
                        <td>${formatRp(row.soldUnits)}</td>
                        <td><span class="badge ${badgeClass}">${label}</span></td>
                        <td>${row.idealMin === null ? '-' : `Rp ${formatRp(row.idealMin)} – Rp ${formatRp(row.idealMax)}`}</td>
                        <td>${row.targetPrice === null ? '-' : `Rp ${formatRp(row.targetPrice)}`}</td>
                    </tr>
                `;
            }).join('')
            : '<tr><td colspan="8">Belum ada menu untuk dianalisis.</td></tr>';

        renderMenuEngineeringChart(rows.filter(row => row.hppPerPortion !== null));
    } catch (error) {
        console.error('Gagal memuat analisis menu engineering:', error);
        tableBody.innerHTML = '<tr><td colspan="8">Analisis menu gagal dimuat.</td></tr>';
        alert(`Gagal memuat analisis menu engineering: ${error.message}`);
    } finally {
        refreshButton.disabled = false;
    }
}

function renderMenuEngineeringChart(rows) {
    const canvas = document.getElementById('menu-engineering-chart');
    if (menuEngineeringChartInstance) menuEngineeringChartInstance.destroy();
    menuEngineeringChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: rows.map(row => row.name),
            datasets: [
                {
                    label: 'Harga Jual Saat Ini',
                    data: rows.map(row => row.sellingPrice),
                    backgroundColor: '#94a3b8'
                },
                {
                    label: 'Harga Target (Food Cost 30%)',
                    data: rows.map(row => row.targetPrice),
                    backgroundColor: '#10b981'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: value => `Rp ${formatRp(value)}` }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: context => `${context.dataset.label}: Rp ${formatRp(context.raw)}`
                    }
                }
            }
        }
    });
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
    if (error) {
        inventorySnapshot = null;
        expiringBatchSnapshot = null;
        console.error('Gagal memuat persediaan:', error);
        document.getElementById('inventory-table').innerHTML = '<tr><td colspan="4">Gagal memuat data persediaan.</td></tr>';
        document.getElementById('stocktake-table').innerHTML = '<tr><td colspan="4">Gagal memuat data persediaan.</td></tr>';
        setExecutiveDashboardError(`Persediaan gagal dimuat: ${error.message}`);
        alert(`Gagal memuat persediaan: ${error.message}`);
        return;
    }
    inventorySnapshot = data || [];

    let totalAssetRupiah = 0;
    const tableBody = document.getElementById('inventory-table');
    const selectIngredient = document.getElementById('ingredient_id');
    const filterSelect = document.getElementById('filter-ingredient');
    const foodWasteIngredientSelect = document.getElementById('food-waste-ingredient');
    const stocktakeBody = document.getElementById('stocktake-table');
    const expiryAlertContainer = document.getElementById('expiry-alert-container');
    const expiryAlertList = document.getElementById('expiry-alert-list');
    
    let chartLabels = [];
    let chartData = [];

    const alertContainer = document.getElementById('alert-container');
    const alertList = document.getElementById('alert-list');
    alertList.innerHTML = '';
    let hasAlerts = false;
    
    tableBody.innerHTML = '';
    foodWasteIngredientSelect.innerHTML = '<option value="">-- Pilih Bahan Baku --</option>';
    stocktakeBody.innerHTML = '';
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
            alertList.innerHTML += `<li>Stok <b>${escapeHtml(item.name)}</b> tersisa ${item.stock_qty} ${escapeHtml(item.unit)}. Segera Restock!</li>`;
        }
        const qtyStyle = isCritical ? 'class="text-danger"' : '';

        tableBody.innerHTML += `
            <tr>
                <td><b>${escapeHtml(item.name)}</b></td>
                <td ${qtyStyle}>${item.stock_qty} ${item.unit}</td>
                <td>${item.min_stock} ${item.unit}</td>
                <td><b>Rp ${formatRp(totalValue)}</b></td>
            </tr>
        `;
        
        const safeName = escapeHtml(item.name);
        const safeUnit = escapeHtml(item.unit);
        selectIngredient.innerHTML += `<option value="${item.id}" data-price="${item.unit_price}">${safeName} (Sisa: ${item.stock_qty})</option>`;
        foodWasteIngredientSelect.innerHTML += `<option value="${item.id}" data-stock="${item.stock_qty}" data-unit="${safeUnit}">${safeName} (${item.stock_qty} ${safeUnit})</option>`;
        filterSelect.innerHTML += `<option value="${item.id}">Buku Besar: ${safeName}</option>`;
        stocktakeBody.innerHTML += `
            <tr>
                <td>${safeName}</td>
                <td>${item.stock_qty} ${safeUnit}</td>
                <td>
                    <input type="number" min="0" step="0.01" required
                        class="stocktake-physical-qty"
                        data-ingredient-id="${item.id}"
                        data-system-qty="${item.stock_qty}"
                        data-unit="${safeUnit}"
                        value="${item.stock_qty}"
                        aria-label="Jumlah fisik ${safeName}">
                </td>
                <td class="stocktake-variance">0 ${safeUnit}</td>
            </tr>
        `;
    });

    document.getElementById('total-asset-value').innerText = `Rp ${formatRp(totalAssetRupiah)}`;
    alertContainer.classList.toggle('has-critical-alert', hasAlerts);
    if (hasAlerts) alertContainer.classList.remove('hidden'); else alertContainer.classList.add('hidden');

    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + 3);
    const warningDateValue = localDateValue(warningDate);
    const { data: expiringBatches, error: expiryError } = await supabaseClient
        .from('inventory_batches')
        .select('id, batch_number, expiry_date, quantity_remaining, ingredients(name, unit)')
        .gt('quantity_remaining', 0)
        .lte('expiry_date', warningDateValue)
        .order('expiry_date');
    if (expiryError) {
        expiringBatchSnapshot = null;
        console.error('Gagal memuat peringatan batch kedaluwarsa:', expiryError);
        expiryAlertList.innerHTML = '<li>Gagal memuat data batch kedaluwarsa.</li>';
        expiryAlertContainer.classList.remove('hidden');
        alert(`Gagal memuat peringatan kedaluwarsa: ${expiryError.message}`);
    } else if (expiringBatches && expiringBatches.length > 0) {
        expiringBatchSnapshot = expiringBatches;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        expiryAlertList.innerHTML = expiringBatches.map(batch => {
            const expiryDate = new Date(`${batch.expiry_date}T00:00:00`);
            const daysUntilExpiry = Math.round((expiryDate - today) / 86400000);
            const status = daysUntilExpiry < 0
                ? 'SUDAH KEDALUWARSA'
                : daysUntilExpiry === 0
                    ? 'KEDALUWARSA HARI INI'
                    : `Kedaluwarsa H-${daysUntilExpiry}`;
            return `<li><span class="badge badge-out">${status}</span> <b>${escapeHtml(batch.ingredients.name)}</b> — Batch ${escapeHtml(batch.batch_number)}, sisa ${batch.quantity_remaining} ${escapeHtml(batch.ingredients.unit)}, tanggal ${expiryDate.toLocaleDateString('id-ID')}</li>`;
        }).join('');
        expiryAlertContainer.classList.remove('hidden');
    } else {
        expiringBatchSnapshot = [];
        expiryAlertList.innerHTML = '';
        expiryAlertContainer.classList.add('hidden');
    }
    
    // Panggil fungsi render chart
    renderChart(chartLabels, chartData);
    await loadExecutiveDashboard();
}

async function loadJournalAndAnalysis(filterIngredientId = '') {
    let query = supabaseClient.from('inventory_logs')
        .select('*, ingredients(name), suppliers(name), menu_items(name), inventory_batch_consumptions(quantity, unit_cost, inventory_batches(batch_number, expiry_date))')
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
        const totalVal = inventoryLogCost(log);
        
        const supplierName = log.suppliers ? `dari ${log.suppliers.name}` : '';
        const menuName = log.menu_items ? `untuk ${log.menu_items.name}` : '';
        
        // Pembuatan Baris Tabel dengan Badge Visual
        if (log.movement_reason === 'STOCKTAKE_GAIN') {
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td><span class="badge badge-in">ADJUSTMENT</span></td>
                    <td><b>Persediaan Bahan Baku</b> - Selisih lebih stok opname: ${escapeHtml(log.ingredients.name)}<br><div class="acc-kredit">Keuntungan Penyesuaian Persediaan</div></td>
                    <td>Rp ${formatRp(totalVal)}<br>-</td>
                    <td>-<br>Rp ${formatRp(totalVal)}</td>
                </tr>
            `;
        } else if (log.type === 'IN') {
            const paymentAccount = log.payment_method === 'CREDIT'
                ? 'Utang Dagang'
                : log.payment_method === 'CASH'
                    ? 'Kas'
                    : 'Kas / Utang Dagang (pembayaran belum diketahui)';
            const batchDetails = log.batch_number
                ? `<br>Batch ${escapeHtml(log.batch_number)}${log.expiry_date ? ` — Kedaluwarsa ${new Date(`${log.expiry_date}T00:00:00`).toLocaleDateString('id-ID')}` : ''}, biaya/unit Rp ${formatRp(log.unit_cost ?? log.unit_price_at_time)}`
                : '';
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td><span class="badge badge-in">IN</span></td>
                    <td><b>Persediaan (${escapeHtml(log.ingredients.name)})</b> - Masuk ${log.qty} ${supplierName}${batchDetails}<br><div class="acc-kredit">${paymentAccount}</div></td>
                    <td>Rp ${formatRp(totalVal)}<br>-</td>
                    <td>-<br>Rp ${formatRp(totalVal)}</td>
                </tr>
            `;
        } else if (log.movement_reason === 'SPOILED') {
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td><span class="badge badge-out">RUSAK</span></td>
                    <td><b>Beban Kerusakan Persediaan</b> - ${escapeHtml(log.notes || 'Barang basi / kedaluwarsa')}<br><div class="acc-kredit">Persediaan (${escapeHtml(log.ingredients.name)})</div></td>
                    <td>Rp ${formatRp(totalVal)}<br>-</td>
                    <td>-<br>Rp ${formatRp(totalVal)}</td>
                </tr>
            `;
        } else if (log.movement_reason?.startsWith('FOOD_WASTE_') || log.movement_reason === 'STOCKTAKE_LOSS') {
            const reasonLabels = {
                FOOD_WASTE_EXPIRED: 'Kedaluwarsa',
                FOOD_WASTE_DROPPED: 'Jatuh',
                FOOD_WASTE_DOUGH_FAILED: 'Adonan gagal',
                STOCKTAKE_LOSS: 'Selisih kurang stok opname'
            };
            const description = reasonLabels[log.movement_reason] || 'Kerusakan persediaan';
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td><span class="badge badge-out">${log.movement_reason === 'STOCKTAKE_LOSS' ? 'ADJUSTMENT' : 'FOOD WASTE'}</span></td>
                    <td><b>Beban Kerusakan Persediaan (Food Loss Expense)</b> - ${description}: ${escapeHtml(log.ingredients.name)}<br><div class="acc-kredit">Persediaan Bahan Baku</div></td>
                    <td>Rp ${formatRp(totalVal)}<br>-</td>
                    <td>-<br>Rp ${formatRp(totalVal)}</td>
                </tr>
            `;
        } else {
            const consumedBatches = (log.inventory_batch_consumptions || [])
                .map(consumption =>
                    `${escapeHtml(consumption.inventory_batches.batch_number)} (${consumption.quantity} @ Rp ${formatRp(consumption.unit_cost)})`
                )
                .join(', ');
            journalBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td><span class="badge badge-out">OUT</span></td>
                    <td><b>HPP (Beban Pokok)</b> - Dipakai ${log.qty} ${menuName}${consumedBatches ? `<br>Batch FIFO: ${consumedBatches}` : ''}<br><div class="acc-kredit">Persediaan (${escapeHtml(log.ingredients.name)})</div></td>
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

document.getElementById('food-waste-ingredient').addEventListener('change', (event) => {
    const select = event.currentTarget;
    const selectedOption = select.options[select.selectedIndex];
    const quantityInput = document.getElementById('food-waste-quantity');
    quantityInput.max = selectedOption.dataset.stock || '';
    quantityInput.placeholder = selectedOption.dataset.unit
        ? `Maksimal ${selectedOption.dataset.stock} ${selectedOption.dataset.unit}`
        : '';
});

document.getElementById('food-waste-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const ingredientId = Number(document.getElementById('food-waste-ingredient').value);
    const quantity = Number(document.getElementById('food-waste-quantity').value);
    const reason = document.getElementById('food-waste-reason').value;
    const button = form.querySelector('button[type="submit"]');
    if (!ingredientId || !Number.isFinite(quantity) || quantity <= 0 || !reason) {
        alert('Pilih bahan, jumlah rusak, dan alasan food waste yang valid.');
        return;
    }

    button.disabled = true;
    try {
        const { error } = await supabaseClient.rpc('record_food_waste', {
            p_ingredient_id: ingredientId,
            p_qty: quantity,
            p_reason: reason
        });
        if (error) throw error;
        form.reset();
        document.getElementById('food-waste-quantity').removeAttribute('max');
        document.getElementById('food-waste-quantity').placeholder = '';
        await Promise.all([
            loadInventory(),
            loadJournalAndAnalysis(document.getElementById('filter-ingredient').value),
            loadFinancialReport()
        ]);
        showToast('Food waste berhasil dicatat dan jurnal beban kerusakan persediaan telah dibuat.');
    } catch (error) {
        console.error('Gagal mencatat food waste:', error);
        alert(`Food waste gagal dicatat: ${error.message}`);
    } finally {
        button.disabled = false;
    }
});

document.getElementById('stocktake-table').addEventListener('input', (event) => {
    if (!event.target.matches('.stocktake-physical-qty')) return;
    const input = event.target;
    const systemQty = Number(input.dataset.systemQty);
    const physicalQty = Number(input.value);
    const varianceCell = input.closest('tr').querySelector('.stocktake-variance');
    const variance = physicalQty - systemQty;
    varianceCell.textContent = `${variance > 0 ? '+' : ''}${Number.isFinite(variance) ? formatRp(variance).replace(/\.00$/, '') : '-'} ${input.dataset.unit}`;
    varianceCell.classList.toggle('text-danger', variance < 0);
});

document.getElementById('stocktake-refresh').addEventListener('click', loadInventory);

document.getElementById('stocktake-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const inputs = [...form.querySelectorAll('.stocktake-physical-qty')];
    if (inputs.length === 0 || inputs.some(input => !input.reportValidity())) return;

    const counts = inputs.map(input => ({
        ingredient_id: Number(input.dataset.ingredientId),
        expected_stock_qty: Number(input.dataset.systemQty),
        physical_qty: Number(input.value)
    }));
    const changedCount = counts.filter(count => count.physical_qty !== count.expected_stock_qty).length;
    if (changedCount === 0) {
        alert('Tidak ada selisih stok yang perlu disesuaikan.');
        return;
    }
    if (!window.confirm(`Simpan stok opname? ${changedCount} bahan memiliki selisih dan stok sistem akan disesuaikan.`)) return;

    const button = document.getElementById('stocktake-submit');
    button.disabled = true;
    try {
        const { data: adjustmentCount, error } = await supabaseClient.rpc('record_stocktake', {
            p_counts: counts
        });
        if (error) throw error;
        await Promise.all([
            loadInventory(),
            loadJournalAndAnalysis(document.getElementById('filter-ingredient').value),
            loadFinancialReport()
        ]);
        showToast(`Stok opname berhasil disimpan. ${adjustmentCount} penyesuaian jurnal dibuat.`);
    } catch (error) {
        console.error('Gagal menyimpan stok opname:', error);
        alert(`Stok opname gagal disimpan: ${error.message}`);
    } finally {
        button.disabled = false;
    }
});

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
    const batchNumber = type === 'IN'
        ? document.getElementById('inventory-batch-number').value.trim()
        : null;
    const expiryDate = type === 'IN'
        ? document.getElementById('inventory-expiry-date').value
        : null;
    if (type === 'IN' && (!batchNumber || !expiryDate)) {
        return alert('Nomor batch dan tanggal kedaluwarsa wajib diisi untuk stok masuk.');
    }
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
            p_reason: reason,
            p_batch_number: batchNumber,
            p_expiry_date: expiryDate
        });
        if (error) throw error;

        showToast('Transaksi jurnal berhasil disimpan dan stok telah diperbarui.');
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

toggleDynamicFields();

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
    showToast(`${menu.name} ditambahkan ke keranjang.`, 'success');
});

document.getElementById('pos-cart-table').addEventListener('click', (e) => {
    const button = e.target.closest('[data-cart-index]');
    if (!button) return;
    posCart.splice(Number(button.dataset.cartIndex), 1);
    renderPosCart();
});

document.getElementById('pos-payment-method').addEventListener('change', renderPosCart);

document.getElementById('pos-checkout-button').addEventListener('click', async (e) => {
    if (posCart.length === 0) return;
    const total = posCart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);
    const paymentMethod = document.getElementById('pos-payment-method').value;
    const platformFee = ['GOFOOD', 'GRABFOOD'].includes(paymentMethod) ? Math.round(total * 0.2) : 0;
    const confirmation = platformFee
        ? `Simpan penjualan Rp ${formatRp(total)} melalui ${paymentMethod}?\nKomisi 20%: Rp ${formatRp(platformFee)}\nPiutang platform: Rp ${formatRp(total - platformFee)}`
        : `Simpan penjualan Rp ${formatRp(total)} melalui ${paymentMethod}?`;
    if (!window.confirm(confirmation)) return;

    const button = e.currentTarget;
    button.disabled = true;
    button.innerText = '⏳ Menyimpan...';
    try {
        const { data: saleId, error } = await supabaseClient.rpc('create_sale', {
            p_items: posCart.map(item => ({
                menu_item_id: item.id,
                quantity: item.quantity
            })),
            p_payment_method: paymentMethod
        });
        if (error) throw error;

        posCart = [];
        renderPosCart();
        await Promise.all([
            loadInventory(),
            loadJournalAndAnalysis(document.getElementById('filter-ingredient').value),
            loadSalesJournal(),
            loadFinancialReport(),
            loadTodaySalesTotal()
        ]);
        showToast(`Penjualan #${saleId} berhasil disimpan dan stok resep telah diperbarui.`);
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

function dashboardDateRange() {
    const mode = document.getElementById('dashboard-period').value;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start);
    let label;

    if (mode === 'last7') {
        start.setDate(start.getDate() - 6);
        end.setDate(end.getDate() + 1);
        label = `${start.toLocaleDateString('id-ID')} – ${new Date(end.getTime() - 1).toLocaleDateString('id-ID')}`;
    } else if (mode === 'month') {
        start.setDate(1);
        end.setDate(end.getDate() + 1);
        label = start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } else if (mode === 'previous_month') {
        start.setDate(1);
        start.setMonth(start.getMonth() - 1);
        end.setDate(1);
        label = start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } else if (mode === 'custom') {
        const startValue = document.getElementById('dashboard-start-date').value;
        const endValue = document.getElementById('dashboard-end-date').value;
        if (!startValue || !endValue || startValue > endValue) {
            throw new Error('Pilih rentang tanggal dashboard yang valid.');
        }
        const [startYear, startMonth, startDay] = startValue.split('-').map(Number);
        const [endYear, endMonth, endDay] = endValue.split('-').map(Number);
        start.setFullYear(startYear, startMonth - 1, startDay);
        end.setFullYear(endYear, endMonth - 1, endDay);
        end.setDate(end.getDate() + 1);
        label = `${start.toLocaleDateString('id-ID')} – ${new Date(end.getTime() - 1).toLocaleDateString('id-ID')}`;
    } else {
        end.setDate(end.getDate() + 1);
        label = start.toLocaleDateString('id-ID', { dateStyle: 'long' });
    }

    const duration = Math.max(1, Math.round((end - start) / 86400000));
    const previousStart = new Date(start);
    previousStart.setDate(previousStart.getDate() - duration);
    return {
        start,
        end,
        previousStart,
        previousEnd: new Date(start),
        label,
        currentStartIso: start.toISOString(),
        currentEndIso: end.toISOString(),
        previousStartIso: previousStart.toISOString()
    };
}

function dashboardChange(current, previous) {
    if (previous === 0) return current === 0 ? 'Tidak ada perubahan periode' : 'Belum ada pembanding';
    const change = ((current - previous) / Math.abs(previous)) * 100;
    const direction = change > 0 ? 'naik' : change < 0 ? 'turun' : 'tetap';
    return `${direction} ${Math.abs(change).toFixed(1)}% vs periode sebelumnya`;
}

function renderExecutiveKpis(metrics, previousMetrics, periodLabel, inventoryValue, totalPayables) {
    const kpis = [
        {
            label: 'Penjualan bersih',
            value: metrics.revenue,
            previous: previousMetrics.revenue,
            icon: 'banknote',
            note: 'Nilai penjualan tercatat; komisi marketplace dihitung terpisah.'
        },
        { label: 'HPP produk terjual', value: metrics.cogs, previous: previousMetrics.cogs, icon: 'package-minus', note: 'Berdasarkan pemakaian bahan pada transaksi.' },
        { label: 'Laba kotor', value: metrics.grossProfit, previous: previousMetrics.grossProfit, icon: 'chart-no-axes-combined', note: 'Penjualan dikurangi HPP produk terjual.' },
        { label: 'Laba bersih', value: metrics.netProfit, previous: previousMetrics.netProfit, icon: 'wallet', note: 'Setelah biaya operasional, komisi, dan kerusakan.' },
        { label: 'Saldo kas & bank', unavailable: true, icon: 'landmark', note: 'Saldo awal kas/bank belum tersedia untuk menghitung saldo.' },
        { label: 'Nilai persediaan', value: inventoryValue, icon: 'warehouse', note: 'Kondisi terkini, tidak terikat filter periode.' },
        { label: 'Piutang marketplace', unavailable: true, icon: 'receipt-text', note: 'Status settlement GoFood/GrabFood belum dicatat.' },
        { label: 'Utang belum dibayar', value: totalPayables, icon: 'file-clock', note: 'Utang supplier dan biaya operasional; jatuh tempo tidak dicatat.' }
    ];
    document.getElementById('executive-kpis').innerHTML = kpis.map(kpi => `
        <article class="card executive-kpi">
            <div class="executive-kpi-top"><span class="executive-kpi-icon"><i data-lucide="${kpi.icon}"></i></span><span class="executive-kpi-label">${kpi.label}</span></div>
            <strong class="executive-kpi-value${kpi.value < 0 ? ' text-danger' : ''}">${kpi.unavailable ? 'Tidak tersedia' : `Rp ${formatRp(kpi.value)}`}</strong>
            <span class="executive-kpi-period">${kpi.previous === undefined ? 'Posisi saat ini' : escapeHtml(periodLabel)}</span>
            <span class="executive-kpi-change">${kpi.previous === undefined ? escapeHtml(kpi.note) : escapeHtml(dashboardChange(kpi.value, kpi.previous))}</span>
        </article>
    `).join('');
    if (window.lucide) window.lucide.createIcons();
}

function renderExecutiveChart(canvasId, type, data, options) {
    if (executiveCharts[canvasId]) executiveCharts[canvasId].destroy();
    const canvas = document.getElementById(canvasId);
    executiveCharts[canvasId] = new Chart(canvas, { type, data, options });
}

function renderExecutiveWarnings(inventory, expiringBatches, unpaidPurchases, unpaidExpenses, metrics, previousMetrics) {
    const warnings = [];
    inventory.filter(item => Number(item.stock_qty) <= Number(item.min_stock)).forEach(item => {
        warnings.push({
            type: 'critical',
            icon: 'package-x',
            title: `Stok kritis: ${item.name}`,
            detail: `${item.stock_qty} ${item.unit} tersisa; batas minimum ${item.min_stock} ${item.unit}.`
        });
    });
    if (expiringBatches === null) {
        warnings.push({
            type: 'warning',
            icon: 'calendar-x',
            title: 'Peringatan kedaluwarsa tidak tersedia',
            detail: 'Data batch gagal dimuat; periksa koneksi dan migrasi batch tracking.'
        });
    }
    (expiringBatches || []).forEach(batch => {
        warnings.push({
            type: 'warning',
            icon: 'calendar-clock',
            title: `Batch mendekati kedaluwarsa: ${batch.ingredients?.name || 'Bahan baku'}`,
            detail: `Batch ${batch.batch_number}, sisa ${batch.quantity_remaining} ${batch.ingredients?.unit || ''}, kedaluwarsa ${new Date(`${batch.expiry_date}T00:00:00`).toLocaleDateString('id-ID')}.`
        });
    });

    const now = Date.now();
    const olderThan30Days = [...unpaidPurchases, ...unpaidExpenses]
        .filter(item => item.created_at && now - new Date(item.created_at).getTime() > 30 * 86400000);
    if (unpaidPurchases.length || unpaidExpenses.length) {
        warnings.push({
            type: olderThan30Days.length ? 'critical' : 'warning',
            icon: 'file-clock',
            title: `${unpaidPurchases.length + unpaidExpenses.length} kewajiban belum dibayar`,
            detail: `Utang supplier Rp ${formatRp(unpaidPurchases.reduce((sum, row) => sum + Number(row.qty) * Number(row.unit_price_at_time), 0))} dan biaya Rp ${formatRp(unpaidExpenses.reduce((sum, row) => sum + Number(row.amount), 0))}. Jatuh tempo tidak tersedia${olderThan30Days.length ? `; ${olderThan30Days.length} kewajiban tercatat lebih dari 30 hari` : ''}.`
        });
    }
    if (previousMetrics.revenue > 0 && metrics.revenue <= previousMetrics.revenue * 0.8) {
        warnings.push({
            type: 'warning',
            icon: 'trending-down',
            title: 'Penjualan menurun signifikan',
            detail: `Turun ${Math.abs(((metrics.revenue - previousMetrics.revenue) / previousMetrics.revenue) * 100).toFixed(1)}% dibandingkan periode sebelumnya.`
        });
    }
    const currentMargin = metrics.revenue > 0 ? metrics.grossProfit / metrics.revenue : null;
    const previousMargin = previousMetrics.revenue > 0 ? previousMetrics.grossProfit / previousMetrics.revenue : null;
    if (currentMargin !== null && previousMargin !== null && currentMargin <= previousMargin - 0.05) {
        warnings.push({
            type: 'warning',
            icon: 'chart-no-axes-combined',
            title: 'Margin kotor menurun',
            detail: `Margin turun ${((previousMargin - currentMargin) * 100).toFixed(1)} poin persentase dibandingkan periode sebelumnya.`
        });
    }

    const container = document.getElementById('executive-alerts');
    document.getElementById('executive-alert-count').textContent = `${warnings.length} peringatan`;
    document.getElementById('executive-alert-count').className = `badge ${warnings.some(item => item.type === 'critical') ? 'badge-out' : warnings.length ? 'badge-star' : 'badge-normal'}`;
    container.innerHTML = warnings.length
        ? warnings.map(item => `
            <div class="executive-alert-item ${item.type}">
                <i data-lucide="${item.icon}"></i>
                <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></div>
            </div>
        `).join('')
        : '<div class="executive-empty-state"><i data-lucide="circle-check"></i><span>Tidak ada peringatan operasional berdasarkan data saat ini.</span></div>';
    if (window.lucide) window.lucide.createIcons();
}

function setExecutiveDashboardError(message) {
    Object.entries(executiveCharts).forEach(([canvasId, chart]) => {
        chart.destroy();
        delete executiveCharts[canvasId];
        document.getElementById(canvasId).classList.add('hidden');
    });
    [
        ['executive-sales-empty', 'Grafik tidak tersedia karena data gagal dimuat.'],
        ['executive-profit-empty', 'Grafik tidak tersedia karena data gagal dimuat.'],
        ['executive-menu-empty', 'Grafik tidak tersedia karena data gagal dimuat.'],
        ['executive-expense-empty', 'Grafik tidak tersedia karena data gagal dimuat.']
    ].forEach(([id, text]) => {
        const empty = document.getElementById(id);
        empty.textContent = text;
        empty.classList.remove('hidden');
    });
    document.getElementById('executive-kpis').innerHTML = `
        <div class="card executive-load-error"><i data-lucide="circle-alert"></i><strong>Dashboard gagal dimuat</strong><span>${escapeHtml(message)}</span></div>
    `;
    document.getElementById('executive-alerts').innerHTML = '<div class="executive-load-error">Peringatan operasional tidak tersedia karena data gagal dimuat.</div>';
    document.getElementById('executive-alert-count').textContent = 'Gagal dimuat';
    document.getElementById('dashboard-period-label').textContent = 'Data periode tidak tersedia.';
    if (window.lucide) window.lucide.createIcons();
}

async function loadExecutiveDashboard() {
    const requestId = ++executiveDashboardRequest;
    const kpiContainer = document.getElementById('executive-kpis');
    kpiContainer.innerHTML = Array.from({ length: 8 }, () => '<div class="card executive-kpi skeleton-card"></div>').join('');
    document.getElementById('executive-alerts').innerHTML = '<div class="executive-loading"><span class="loading-spinner"></span>Memuat peringatan operasional...</div>';

    try {
        if (!inventorySnapshot) throw new Error('Data persediaan belum tersedia.');
        const range = dashboardDateRange();
        document.getElementById('dashboard-period-label').textContent = range.label;
        const queryFactories = [
            () => supabaseClient.from('sales')
                .select('id, total_amount, platform_fee, created_at, sale_items(menu_name_at_time, quantity, unit_price)')
                .gte('created_at', range.previousStartIso).lt('created_at', range.currentEndIso)
                .order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, created_at, qty, unit_price_at_time, notes, movement_reason, inventory_batch_consumptions(quantity, unit_cost)')
                .eq('type', 'OUT').is('movement_reason', null)
                .gte('created_at', range.previousStartIso).lt('created_at', range.currentEndIso)
                .order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, created_at, qty, unit_price_at_time, movement_reason, inventory_batch_consumptions(quantity, unit_cost)')
                .eq('type', 'OUT').in('movement_reason', [
                    'SPOILED', 'FOOD_WASTE_EXPIRED', 'FOOD_WASTE_DROPPED',
                    'FOOD_WASTE_DOUGH_FAILED', 'STOCKTAKE_LOSS'
                ]).gte('created_at', range.previousStartIso).lt('created_at', range.currentEndIso),
            () => supabaseClient.from('inventory_logs')
                .select('id, created_at, qty, unit_price_at_time')
                .eq('type', 'IN').eq('movement_reason', 'STOCKTAKE_GAIN')
                .gte('created_at', range.previousStartIso).lt('created_at', range.currentEndIso),
            () => supabaseClient.from('operating_expenses')
                .select('id, description, category, amount, payment_method, created_at, paid_at')
                .gte('created_at', range.previousStartIso).lt('created_at', range.currentEndIso)
                .order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, qty, unit_price_at_time, created_at')
                .eq('type', 'IN').eq('payment_method', 'CREDIT').is('paid_at', null).order('created_at'),
            () => supabaseClient.from('operating_expenses')
                .select('id, amount, created_at')
                .eq('payment_method', 'CREDIT').is('paid_at', null).order('created_at')
        ];
        const results = await Promise.all(queryFactories.map(fetchAllReportRows));
        if (requestId !== executiveDashboardRequest) return;
        const failure = results.find(result => result.error);
        if (failure) throw failure.error;
        const [salesResult, cogsResult, wasteResult, gainsResult, expensesResult,
            purchasesResult, unpaidExpensesResult] = results;
        const sales = salesResult.data || [];
        const cogs = cogsResult.data || [];
        const waste = wasteResult.data || [];
        const gains = gainsResult.data || [];
        const expenses = expensesResult.data || [];
        const currentStart = range.start.getTime();
        const currentEnd = range.end.getTime();
        const inCurrentPeriod = row => {
            const timestamp = new Date(row.created_at).getTime();
            return timestamp >= currentStart && timestamp < currentEnd;
        };
        const currentSales = sales.filter(inCurrentPeriod);
        const previousSales = sales.filter(row => !inCurrentPeriod(row));
        const currentCogs = cogs.filter(inCurrentPeriod);
        const previousCogs = cogs.filter(row => !inCurrentPeriod(row));
        const currentWaste = waste.filter(inCurrentPeriod);
        const previousWaste = waste.filter(row => !inCurrentPeriod(row));
        const currentGains = gains.filter(inCurrentPeriod);
        const previousGains = gains.filter(row => !inCurrentPeriod(row));
        const currentExpenses = expenses.filter(inCurrentPeriod);
        const previousExpenses = expenses.filter(row => !inCurrentPeriod(row));

        const metricFor = (periodSales, periodCogs, periodWaste, periodGains, periodExpenses) => {
            const revenue = periodSales.reduce((sum, row) => sum + Number(row.total_amount), 0);
            const platformFees = periodSales.reduce((sum, row) => sum + Number(row.platform_fee), 0);
            const costOfGoods = periodCogs.reduce((sum, row) => sum + inventoryLogCost(row), 0);
            const grossProfit = revenue - costOfGoods;
            const wasteLoss = periodWaste.reduce((sum, row) => sum + inventoryLogCost(row), 0);
            const stocktakeGain = periodGains.reduce((sum, row) =>
                sum + Number(row.qty) * Number(row.unit_price_at_time), 0);
            const operatingExpense = periodExpenses.reduce((sum, row) => sum + Number(row.amount), 0);
            return {
                revenue,
                cogs: costOfGoods,
                grossProfit,
                netProfit: grossProfit - operatingExpense - wasteLoss - platformFees + stocktakeGain
            };
        };
        const metrics = metricFor(currentSales, currentCogs, currentWaste, currentGains, currentExpenses);
        const previousMetrics = metricFor(previousSales, previousCogs, previousWaste, previousGains, previousExpenses);
        const inventoryValue = inventorySnapshot.reduce((sum, row) =>
            sum + Number(row.stock_qty) * Number(row.unit_price), 0);
        const unpaidPurchases = purchasesResult.data || [];
        const unpaidExpenses = unpaidExpensesResult.data || [];
        const totalPayables = unpaidPurchases.reduce((sum, row) =>
            sum + Number(row.qty) * Number(row.unit_price_at_time), 0) +
            unpaidExpenses.reduce((sum, row) => sum + Number(row.amount), 0);

        renderExecutiveKpis(metrics, previousMetrics, range.label, inventoryValue, totalPayables);
        const points = [];
        for (let date = new Date(range.start); date < range.end; date.setDate(date.getDate() + 1)) {
            points.push(localDateValue(new Date(date)));
        }
        const revenueByDate = new Map();
        const cogsByDate = new Map();
        const expenseByDate = new Map();
        const platformFeeByDate = new Map();
        const grossByDate = new Map();
        const netByDate = new Map();
        const menuTotals = new Map();
        const expenseTotals = new Map();
        currentSales.forEach(sale => {
            const day = localDateValue(new Date(sale.created_at));
            revenueByDate.set(day, (revenueByDate.get(day) || 0) + Number(sale.total_amount));
            platformFeeByDate.set(day, (platformFeeByDate.get(day) || 0) + Number(sale.platform_fee));
            (sale.sale_items || []).forEach(item => {
                const name = item.menu_name_at_time || 'Menu tidak diketahui';
                menuTotals.set(name, (menuTotals.get(name) || 0) + Number(item.quantity) * Number(item.unit_price));
            });
        });
        currentCogs.forEach(row => {
            const day = localDateValue(new Date(row.created_at));
            cogsByDate.set(day, (cogsByDate.get(day) || 0) + inventoryLogCost(row));
        });
        currentExpenses.forEach(row => {
            const day = localDateValue(new Date(row.created_at));
            expenseByDate.set(day, (expenseByDate.get(day) || 0) + Number(row.amount));
            expenseTotals.set(row.category, (expenseTotals.get(row.category) || 0) + Number(row.amount));
        });
        currentWaste.forEach(row => {
            const day = localDateValue(new Date(row.created_at));
            expenseByDate.set(day, (expenseByDate.get(day) || 0) + inventoryLogCost(row));
        });
        currentGains.forEach(row => {
            const day = localDateValue(new Date(row.created_at));
            expenseByDate.set(day, (expenseByDate.get(day) || 0) - Number(row.qty) * Number(row.unit_price_at_time));
        });
        points.forEach(day => {
            grossByDate.set(day, (revenueByDate.get(day) || 0) - (cogsByDate.get(day) || 0));
            netByDate.set(day, (grossByDate.get(day) || 0) -
                (expenseByDate.get(day) || 0) - (platformFeeByDate.get(day) || 0));
        });
        const dateLabel = day => new Date(`${day}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        const hasSales = currentSales.length > 0;
        const hasProfitData = currentSales.length > 0 || currentCogs.length > 0 || currentExpenses.length > 0 || currentWaste.length > 0;
        document.getElementById('executive-sales-chart').classList.toggle('hidden', !hasSales);
        document.getElementById('executive-sales-empty').classList.toggle('hidden', hasSales);
        renderExecutiveChart('executive-sales-chart', 'line', {
            labels: points.map(dateLabel),
            datasets: [{ label: 'Penjualan', data: points.map(day => revenueByDate.get(day) || 0), borderColor: '#dc3e34', backgroundColor: 'rgba(220,62,52,.12)', fill: true, tension: .3, pointRadius: points.length > 20 ? 0 : 3 }]
        }, executiveLineChartOptions());
        document.getElementById('executive-profit-chart').classList.toggle('hidden', !hasProfitData);
        document.getElementById('executive-profit-empty').classList.toggle('hidden', hasProfitData);
        renderExecutiveChart('executive-profit-chart', 'line', {
            labels: points.map(dateLabel),
            datasets: [
                { label: 'Laba kotor', data: points.map(day => grossByDate.get(day) || 0), borderColor: '#dc3e34', tension: .3, pointRadius: points.length > 20 ? 0 : 3 },
                { label: 'Laba bersih', data: points.map(day => netByDate.get(day) || 0), borderColor: '#475569', tension: .3, pointRadius: points.length > 20 ? 0 : 3 }
            ]
        }, executiveLineChartOptions());

        const menuEntries = [...menuTotals.entries()].sort((a,b)=>b[1]-a[1]);
        const expenseEntries = [...expenseTotals.entries()].sort((a,b)=>b[1]-a[1]);
        renderExecutiveDoughnut('executive-menu-chart', 'executive-menu-empty', menuEntries, 'Penjualan');
        renderExecutiveDoughnut('executive-expense-chart', 'executive-expense-empty', expenseEntries, 'Biaya');
        renderExecutiveWarnings(inventorySnapshot, expiringBatchSnapshot, unpaidPurchases, unpaidExpenses, metrics, previousMetrics);
    } catch (error) {
        if (requestId !== executiveDashboardRequest) return;
        console.error('Gagal memuat executive dashboard:', error);
        setExecutiveDashboardError(error.message);
    }
}

function executiveLineChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 18 } },
            tooltip: { callbacks: { title: items => items.length ? items[0].label : '', label: item => `${item.dataset.label}: Rp ${formatRp(item.raw)}` } }
        },
        scales: {
            y: { beginAtZero: true, ticks: { callback: value => `Rp ${formatRp(value)}` }, grid: { color: 'rgba(148,163,184,.16)' } },
            x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 10, maxRotation: 0 } }
        }
    };
}

function renderExecutiveDoughnut(canvasId, emptyId, entries, label) {
    const hasData = entries.length > 0;
    document.getElementById(canvasId).classList.toggle('hidden', !hasData);
    document.getElementById(emptyId).classList.toggle('hidden', hasData);
    if (!hasData) {
        if (executiveCharts[canvasId]) {
            executiveCharts[canvasId].destroy();
            delete executiveCharts[canvasId];
        }
        return;
    }
    renderExecutiveChart(canvasId, 'doughnut', {
        labels: entries.map(([name]) => name),
        datasets: [{ label, data: entries.map(([, value]) => value), backgroundColor: ['#dc3e34', '#f59e0b', '#475569', '#f87171', '#94a3b8', '#fbbf24', '#64748b'], borderColor: '#fff', borderWidth: 3 }]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } },
            tooltip: { callbacks: { label: item => `${item.label}: Rp ${formatRp(item.raw)}` } }
        },
        cutout: '62%'
    });
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
            () => supabaseClient.from('sales')
                .select('id, total_amount, payment_method, platform_fee, created_at')
                .gte('created_at', start).lt('created_at', end).order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, created_at, qty, unit_price_at_time, menu_item_id, notes, ingredients(name), inventory_batch_consumptions(quantity, unit_cost)')
                .eq('type', 'OUT').is('movement_reason', null)
                .gte('created_at', start).lt('created_at', end).order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, created_at, qty, unit_price_at_time, notes, inventory_batch_consumptions(quantity, unit_cost)')
                .eq('type', 'OUT').in('movement_reason', [
                    'SPOILED',
                    'FOOD_WASTE_EXPIRED',
                    'FOOD_WASTE_DROPPED',
                    'FOOD_WASTE_DOUGH_FAILED',
                    'STOCKTAKE_LOSS'
                ])
                .gte('created_at', start).lt('created_at', end).order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, qty, unit_price_at_time')
                .eq('type', 'IN').eq('movement_reason', 'STOCKTAKE_GAIN')
                .gte('created_at', start).lt('created_at', end),
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
                .is('movement_reason', null)
                .gte('created_at', start).lt('created_at', end)
        ];
        const [salesResult, cogsResult, spoiledResult, stocktakeGainsResult, expensesResult, purchasesPaidResult,
            expensesPaidResult, unpaidPurchasesResult, unpaidExpensesResult,
            unknownPurchasesResult] = await Promise.all(queryFactories.map(fetchAllReportRows));
        const results = [salesResult, cogsResult, spoiledResult, stocktakeGainsResult, expensesResult, purchasesPaidResult,
            expensesPaidResult, unpaidPurchasesResult, unpaidExpensesResult, unknownPurchasesResult];
        const failedResult = results.find(result => result.error);
        if (failedResult) throw failedResult.error;

        const sales = salesResult.data || [];
        const cogsLogs = cogsResult.data || [];
        const spoiledLogs = spoiledResult.data || [];
        const stocktakeGains = stocktakeGainsResult.data || [];
        const expenses = expensesResult.data || [];
        const paidPurchases = purchasesPaidResult.data || [];
        const paidExpenses = expensesPaidResult.data || [];
        const unpaidPurchases = unpaidPurchasesResult.data || [];
        const unpaidExpenses = unpaidExpensesResult.data || [];
        const unknownPurchases = unknownPurchasesResult.data || [];

        const revenue = sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
        const platformFeeTotal = sales.reduce((sum, sale) => sum + Number(sale.platform_fee), 0);
        const platformReceivable = sales.reduce((sum, sale) =>
            sum + (['GOFOOD', 'GRABFOOD'].includes(sale.payment_method)
                ? Number(sale.total_amount) - Number(sale.platform_fee)
                : 0), 0);
        const cogs = cogsLogs.reduce((sum, log) => sum + inventoryLogCost(log), 0);
        const spoilageLoss = spoiledLogs.reduce((sum, log) => sum + inventoryLogCost(log), 0);
        const grossProfit = revenue - cogs;
        const stocktakeGainTotal = stocktakeGains.reduce((sum, log) =>
            sum + Number(log.qty) * Number(log.unit_price_at_time), 0);
        const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
        const netProfit = grossProfit - expenseTotal - spoilageLoss - platformFeeTotal + stocktakeGainTotal;
        const cashIn = sales.reduce((sum, sale) =>
            sum + (['CASH', 'QRIS'].includes(sale.payment_method) ? Number(sale.total_amount) : 0), 0);
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
        document.getElementById('report-platform-receivable').innerText = `Rp ${formatRp(platformReceivable)}`;

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
            <tr><td>Beban Komisi GoFood / GrabFood</td><td class="report-amount">Rp ${formatRp(platformFeeTotal)}</td></tr>
            <tr><th colspan="2">Biaya Operasional</th></tr>
            ${expenseRows || '<tr><td colspan="2">Belum ada biaya operasional pada periode ini.</td></tr>'}
            <tr><td>Beban Kerusakan Persediaan & Selisih Kurang (Food Loss)</td><td class="report-amount">Rp ${formatRp(spoilageLoss)}</td></tr>
            <tr><td>Keuntungan Penyesuaian Stok (Selisih Lebih)</td><td class="report-amount">Rp ${formatRp(stocktakeGainTotal)}</td></tr>
            <tr class="report-total"><th>Laba / (Rugi) Bersih</th><td class="report-amount">Rp ${formatRp(netProfit)}</td></tr>
        `;

        const cashEntries = [
            ...sales.filter(sale => ['CASH', 'QRIS'].includes(sale.payment_method)).map(sale => ({
                date: sale.created_at,
                description: `Penjualan #${sale.id} (${sale.payment_method === 'CASH' ? 'Tunai' : 'QRIS / Bank Transfer'})`,
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
            ? `${unknownPurchases.length} pembelian stok lama senilai Rp ${formatRp(unknownPurchaseTotal)} tidak memiliki status pembayaran, sehingga tidak dimasukkan ke arus kas. Penjualan GoFood/GrabFood dicatat sebagai piutang, bukan kas masuk.`
            : 'Penjualan Tunai/QRIS dihitung sebagai kas masuk. Penjualan GoFood/GrabFood menjadi piutang sebesar nilai setelah komisi; komisi dicatat sebagai beban, bukan kas keluar. Pembelian stok dan biaya operasional masuk arus kas pada tanggal pembayarannya.';
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
document.getElementById('menu-engineering-refresh').addEventListener('click', loadMenuEngineering);

const dashboardPeriodSelect = document.getElementById('dashboard-period');
const dashboardCustomDates = [
    document.getElementById('dashboard-start-date'),
    document.getElementById('dashboard-end-date')
];
dashboardPeriodSelect.addEventListener('change', () => {
    const isCustom = dashboardPeriodSelect.value === 'custom';
    dashboardCustomDates.forEach(input => input.classList.toggle('hidden', !isCustom));
    if (!isCustom) loadExecutiveDashboard();
});
document.getElementById('dashboard-apply').addEventListener('click', loadExecutiveDashboard);
document.getElementById('executive-actions').addEventListener('click', event => {
    const button = event.target.closest('.quick-action');
    if (!button) return;
    navigateToPage(button.dataset.page, button.dataset.focus || '');
});

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
        showToast('Biaya operasional berhasil dicatat.');
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
        showToast('Pembayaran utang berhasil dicatat.');
    } catch (error) {
        console.error('Gagal mencatat pembayaran utang:', error);
        alert(`Pembayaran gagal dicatat: ${error.message}`);
        button.disabled = false;
    }
});

// Inisialisasi awal saat web dibuka
if (window.lucide) window.lucide.createIcons();
updateLiveDateTime();
window.setInterval(updateLiveDateTime, 60_000);
window.addEventListener('online', () => {
    setDatabaseStatus('checking');
    loadSuppliersAndMenus();
});
window.addEventListener('offline', () => setDatabaseStatus('offline'));
loadSuppliersAndMenus();
loadInventory();
loadJournalAndAnalysis();
loadSalesJournal();
loadTodaySalesTotal();
renderPosCart();
const dashboardToday = localDateValue(new Date());
document.getElementById('dashboard-start-date').value = dashboardToday;
document.getElementById('dashboard-end-date').value = dashboardToday;
const reportToday = new Date();
document.getElementById('report-start-date').value = localDateValue(new Date(reportToday.getFullYear(), reportToday.getMonth(), 1));
document.getElementById('report-end-date').value = localDateValue(reportToday);
loadFinancialReport();