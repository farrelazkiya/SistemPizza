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
let menuEngineeringRows = [];
let menuEngineeringLoadId = 0;
let menuEngineeringSimulationRow = null;
let executiveCharts = {};
let menuItems = [];
let posCart = [];
let posCheckoutInProgress = false;
let posHistoryRequest = 0;
let inventorySnapshot = null;
let expiringBatchSnapshot = [];
let executiveDashboardRequest = 0;
let accountingJournalEntries = [];
let financialTrendChart = null;
let financialExpenseChart = null;
let currentFinancialReport = null;
let financialReportRequest = 0;
let activeReportTab = 'profit-loss';

const ACCOUNTING_ACCOUNTS = {
    cash: 'Kas',
    bank: 'Bank / QRIS',
    marketplace: 'Piutang Marketplace',
    inventory: 'Persediaan Bahan Baku',
    payable: 'Utang Dagang',
    revenue: 'Pendapatan Penjualan',
    cogs: 'Harga Pokok Penjualan',
    commission: 'Beban Komisi Marketplace',
    waste: 'Beban Kerusakan Persediaan',
    stocktakeLoss: 'Beban Selisih Kurang Persediaan',
    stocktakeGain: 'Keuntungan Penyesuaian Persediaan',
    unknown: 'Akun Penyeimbang Transaksi Lama'
};

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
    if (pageId === 'page-laporan' && ['journal', 'ledger'].includes(activeReportTab)) {
        switchFinancialReportTab('profit-loss', false);
    } else if (pageId === 'page-jurnal' && !['journal', 'ledger'].includes(activeReportTab)) {
        switchFinancialReportTab('journal', false);
    }
    if (pageId === 'page-laporan') loadMenuEngineering();
    if (pageId === 'page-jurnal') {
        loadAccountingJournal();
        loadSalesJournal();
    }
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
        .select('id, name, selling_price, is_available')
        .order('name');
    if (menuError) {
        setDatabaseStatus(navigator.onLine ? 'error' : 'offline');
        console.error('Gagal memuat menu:', menuError);
        document.getElementById('pos-menu-grid').innerHTML = `<div class="pos-history-error">Menu gagal dimuat: ${escapeHtml(menuError.message)}</div>`;
        document.getElementById('pos-menu-count').textContent = 'Menu tidak tersedia';
        document.getElementById('recipe-menu-select').innerHTML = '<option value="">Gagal memuat menu</option>';
        alert(`Gagal memuat menu: ${menuError.message}`);
        return;
    }
    setDatabaseStatus('connected');

    menuItems = menus || [];
    const posMenuSelect = document.getElementById('pos-menu-select');
    const recipeMenuSelect = document.getElementById('recipe-menu-select');
    const availableMenus = menuItems.filter(menu => menu.is_available !== false);
    const menuOptions = availableMenus.map(menu =>
        `<option value="${menu.id}">${escapeHtml(menu.name)} - Rp ${formatRp(menu.selling_price)}</option>`
    ).join('');
    if (posMenuSelect) posMenuSelect.innerHTML = `<option value="">-- Pilih Menu Pizza --</option>${menuOptions}`;
    recipeMenuSelect.innerHTML = `<option value="">-- Pilih Menu Pizza --</option>${menuOptions}`;
    renderPosMenuGrid();

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

function paymentMethodLabel(method) {
    return ({
        CASH: 'Tunai (Kas)',
        QRIS: 'QRIS / Bank Transfer',
        GOFOOD: 'GoFood',
        GRABFOOD: 'GrabFood'
    })[method] || escapeHtml(method);
}

function posTotal() {
    return posCart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);
}

function posPlatformFee(total) {
    return Math.round((total * 0.2 + Number.EPSILON) * 100) / 100;
}

function renderPosMenuGrid() {
    const grid = document.getElementById('pos-menu-grid');
    if (!grid) return;
    const search = document.getElementById('pos-menu-search').value.trim().toLocaleLowerCase('id-ID');
    const filteredMenus = menuItems.filter(menu => menu.name.toLocaleLowerCase('id-ID').includes(search));
    const availableCount = filteredMenus.filter(menu => menu.is_available !== false).length;
    document.getElementById('pos-menu-count').textContent = `${availableCount} menu tersedia${search ? ` · ${filteredMenus.length} hasil` : ''}`;
    if (!filteredMenus.length) {
        grid.innerHTML = '<div class="pos-menu-empty"><i data-lucide="search-x"></i><strong>Menu tidak ditemukan</strong><span>Coba kata pencarian yang berbeda.</span></div>';
        if (window.lucide) window.lucide.createIcons();
        return;
    }
    grid.innerHTML = filteredMenus.map(menu => {
        const available = menu.is_available !== false;
        return `
            <article class="pos-menu-card${available ? '' : ' is-unavailable'}">
                <div class="pos-menu-art" aria-hidden="true"><i data-lucide="pizza"></i></div>
                <div class="pos-menu-card-body">
                    <span class="pos-menu-availability ${available ? 'is-available' : 'is-unavailable'}"><span></span>${available ? 'Tersedia' : 'Tidak tersedia'}</span>
                    <h3>${escapeHtml(menu.name)}</h3>
                    <strong>Rp ${formatRp(menu.selling_price)}</strong>
                    <button type="button" class="btn pos-add-menu" data-menu-id="${menu.id}" ${available && !posCheckoutInProgress ? '' : 'disabled'}>
                        <i data-lucide="plus"></i>${available ? (posCheckoutInProgress ? 'Menyimpan...' : 'Tambah') : 'Tidak tersedia'}
                    </button>
                </div>
            </article>
        `;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
}

function updatePosPaymentSummary() {
    const total = posTotal();
    const paymentMethod = document.getElementById('pos-payment-method').value;
    const platformFee = ['GOFOOD', 'GRABFOOD'].includes(paymentMethod) ? posPlatformFee(total) : 0;
    const cashFields = document.getElementById('pos-cash-fields');
    const cashInput = document.getElementById('pos-cash-received');
    const cash = Number(cashInput.value);
    const isCash = paymentMethod === 'CASH';
    cashFields.classList.toggle('hidden', !isCash);
    cashInput.required = isCash && total > 0;
    document.getElementById('pos-change').textContent =
        `Rp ${formatRp(isCash && Number.isFinite(cash) ? Math.max(0, cash - total) : 0)}`;
    document.getElementById('pos-settlement-preview').textContent = platformFee
        ? `Komisi 20%: Rp ${formatRp(platformFee)} · Piutang platform: Rp ${formatRp(total - platformFee)}`
        : isCash
            ? (total && cash < total ? `Kurang Rp ${formatRp(total - cash)}` : 'Masukkan jumlah uang yang diterima.')
            : `Pembayaran ${paymentMethodLabel(paymentMethod)} dicatat melalui kasir.`;
}

function renderPosCart() {
    const cart = document.getElementById('pos-cart-items');
    const total = posCart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);
    const count = posCart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('pos-subtotal').innerText = `Rp ${formatRp(total)}`;
    document.getElementById('pos-total').innerText = `Rp ${formatRp(total)}`;
    document.getElementById('pos-cart-count').textContent = `${count} item`;
    updatePosPaymentSummary();
    const paymentMethod = document.getElementById('pos-payment-method').value;
    const cashReceived = Number(document.getElementById('pos-cash-received').value);
    const validCart = Number.isFinite(total) && total > 0 && posCart.every(item =>
        Number.isSafeInteger(item.quantity) && item.quantity > 0 &&
        Number.isFinite(item.selling_price) && item.selling_price >= 0);
    document.getElementById('pos-checkout-button').disabled = posCart.length === 0 || posCheckoutInProgress ||
        !validCart || (paymentMethod === 'CASH' &&
            (!Number.isSafeInteger(cashReceived) || cashReceived < total));

    if (posCart.length === 0) {
        cart.innerHTML = '<div class="pos-cart-empty"><i data-lucide="shopping-basket"></i><strong>Keranjang masih kosong</strong><span>Pilih menu untuk memulai transaksi.</span></div>';
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    cart.innerHTML = posCart.map(item => `
        <article class="pos-cart-item">
            <div class="pos-cart-item-info"><strong>${escapeHtml(item.name)}</strong><span>Rp ${formatRp(item.selling_price)} / item</span><b>Rp ${formatRp(item.selling_price * item.quantity)}</b></div>
            <div class="pos-cart-item-controls">
                <button type="button" class="pos-quantity-button" data-cart-action="decrease" data-menu-id="${item.id}" aria-label="Kurangi ${escapeHtml(item.name)}">−</button>
                <span>${item.quantity}</span>
                <button type="button" class="pos-quantity-button" data-cart-action="increase" data-menu-id="${item.id}" aria-label="Tambah ${escapeHtml(item.name)}">+</button>
                <button type="button" class="pos-remove-item" data-cart-action="remove" data-menu-id="${item.id}" aria-label="Hapus ${escapeHtml(item.name)}"><i data-lucide="trash-2"></i></button>
            </div>
        </article>
    `).join('');
    if (window.lucide) window.lucide.createIcons();
}

function renderPosReceipt(sale) {
    const content = document.getElementById('pos-receipt-content');
    content.innerHTML = `
        <div class="receipt-brand"><span>🍕</span><h2 id="pos-receipt-title">Pizza Craft</h2><p>Struk Penjualan</p></div>
        <div class="receipt-meta"><div><span>No. Transaksi</span><strong>#${escapeHtml(sale.id)}</strong></div><div><span>Waktu</span><strong>${new Date(sale.createdAt).toLocaleString('id-ID')}</strong></div><div><span>Metode pembayaran</span><strong>${paymentMethodLabel(sale.paymentMethod)}</strong></div></div>
        <div class="receipt-items">${sale.items.map(item => `<div><span>${escapeHtml(item.name)} × ${item.quantity}</span><strong>Rp ${formatRp(item.selling_price * item.quantity)}</strong></div>`).join('')}</div>
        <div class="receipt-total"><span>Total</span><strong>Rp ${formatRp(sale.total)}</strong></div>
        ${sale.paymentMethod === 'CASH' && Number.isFinite(sale.cashReceived)
            ? `<div class="receipt-cash"><span>Uang diterima (untuk transaksi ini)</span><strong>Rp ${formatRp(sale.cashReceived)}</strong><span>Kembalian</span><strong>Rp ${formatRp(sale.cashReceived - sale.total)}</strong></div>`
            : sale.paymentMethod === 'CASH'
                ? '<p class="receipt-cash-unavailable">Nominal uang diterima dan kembalian tidak tersimpan dalam transaksi.</p>'
                : ''}
        ${['GOFOOD', 'GRABFOOD'].includes(sale.paymentMethod) ? `<div class="receipt-cash"><span>Komisi platform (20%)</span><strong>Rp ${formatRp(Number.isFinite(sale.platformFee) ? sale.platformFee : posPlatformFee(sale.total))}</strong></div>` : ''}
        <p class="receipt-thanks">Terima kasih telah berbelanja.</p>
    `;
    document.getElementById('pos-new-sale').classList.toggle('hidden', Boolean(sale.fromHistory));
    document.getElementById('pos-receipt-dialog').showModal();
}

async function loadPosSalesHistory() {
    const requestId = ++posHistoryRequest;
    const body = document.getElementById('pos-history-table');
    body.innerHTML = '<tr><td colspan="6">Memuat riwayat penjualan...</td></tr>';
    try {
        const searchValue = document.getElementById('pos-history-search').value.trim().replace(/^#/, '');
        const startValue = document.getElementById('pos-history-start').value;
        const endValue = document.getElementById('pos-history-end').value;
        if (startValue && endValue && startValue > endValue) throw new Error('Rentang tanggal riwayat tidak valid.');
        let query = supabaseClient.from('sales')
            .select('id, total_amount, payment_method, platform_fee, created_at, sale_items(menu_name_at_time, quantity, unit_price)')
            .order('created_at', { ascending: false });
        if (searchValue) {
            if (!/^\d+$/.test(searchValue)) {
                body.innerHTML = '<tr><td colspan="6">Nomor transaksi hanya boleh berisi angka.</td></tr>';
                return;
            }
            query = query.eq('id', Number(searchValue));
        } else {
            if (startValue) {
                const [year, month, day] = startValue.split('-').map(Number);
                query = query.gte('created_at', new Date(year, month - 1, day).toISOString());
            }
            if (endValue) {
                const [year, month, day] = endValue.split('-').map(Number);
                query = query.lt('created_at', new Date(year, month - 1, day + 1).toISOString());
            }
        }
        const paymentMethod = document.getElementById('pos-history-payment').value;
        if (paymentMethod) query = query.eq('payment_method', paymentMethod);
        const status = document.getElementById('pos-history-status').value;
        if (status && status !== 'saved') throw new Error('Status transaksi tidak valid.');
        const { data, error } = await query.limit(searchValue ? 1 : 100);
        if (error) throw error;
        if (requestId !== posHistoryRequest) return;
        const sales = data || [];
        body.innerHTML = sales.length ? sales.map(sale => `
            <tr>
                <td>${new Date(sale.created_at).toLocaleString('id-ID')}</td><td><strong>#${sale.id}</strong></td>
                <td>${paymentMethodLabel(sale.payment_method)}</td><td>Rp ${formatRp(sale.total_amount)}</td>
                <td><span class="pos-saved-badge"><span></span>Tersimpan</span></td>
                <td><button type="button" class="btn btn-remove pos-history-detail" data-sale-id="${sale.id}">Detail</button></td>
            </tr>
        `).join('') : '<tr><td colspan="6" class="pos-history-empty">Tidak ada transaksi sesuai filter.</td></tr>';
    } catch (error) {
        if (requestId !== posHistoryRequest) return;
        body.innerHTML = `<tr><td colspan="6" class="pos-history-error">Riwayat gagal dimuat: ${escapeHtml(error.message)}</td></tr>`;
        console.error('Gagal memuat riwayat penjualan:', error);
    }
}

async function showPosSaleDetails(saleId) {
    try {
        const { data, error } = await supabaseClient.from('sales')
            .select('id, total_amount, payment_method, platform_fee, created_at, sale_items(menu_name_at_time, quantity, unit_price)')
            .eq('id', saleId).single();
        if (error) throw error;
        renderPosReceipt({
            id: data.id,
            createdAt: data.created_at,
            paymentMethod: data.payment_method,
            platformFee: Number(data.platform_fee),
            total: Number(data.total_amount),
            fromHistory: true,
            items: (data.sale_items || []).map(item => ({
                name: item.menu_name_at_time,
                quantity: Number(item.quantity),
                selling_price: Number(item.unit_price)
            }))
        });
    } catch (error) {
        console.error('Gagal memuat detail transaksi:', error);
        showToast(`Detail transaksi gagal dimuat: ${error.message}`, 'error');
    }
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

function accountingEntry(date, reference, description, lines) {
    return lines.filter(line => Number(line.debit) !== 0 || Number(line.credit) !== 0).map(line => ({
        date,
        reference,
        description,
        account: line.account,
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0
    }));
}

function buildAccountingJournal(sales, inventoryLogs, expenses) {
    const entries = [];
    sales.forEach(sale => {
        const amount = Number(sale.total_amount);
        const fee = Number(sale.platform_fee) || 0;
        const platformSale = ['GOFOOD', 'GRABFOOD'].includes(sale.payment_method);
        const debitAccount = sale.payment_method === 'CASH'
            ? ACCOUNTING_ACCOUNTS.cash
            : sale.payment_method === 'QRIS'
                ? ACCOUNTING_ACCOUNTS.bank
                : platformSale
                    ? ACCOUNTING_ACCOUNTS.marketplace
                    : ACCOUNTING_ACCOUNTS.unknown;
        const lines = [{ account: debitAccount, debit: amount - (platformSale ? fee : 0), credit: 0 }];
        if (platformSale && fee > 0) lines.push({ account: ACCOUNTING_ACCOUNTS.commission, debit: fee, credit: 0 });
        lines.push({ account: ACCOUNTING_ACCOUNTS.revenue, debit: 0, credit: amount });
        entries.push(...accountingEntry(
            sale.created_at,
            `PJ-${sale.id}`,
            `Penjualan ${paymentMethodLabel(sale.payment_method)} #${sale.id}`,
            lines
        ));
    });

    inventoryLogs.forEach(log => {
        const amount = inventoryLogCost(log);
        const reference = `ST-${log.id}`;
        const ingredientName = log.ingredients?.name || 'Bahan baku';
        const description = `${log.type === 'IN' ? 'Mutasi stok masuk' : 'Mutasi stok keluar'}: ${ingredientName}${log.notes ? ` — ${log.notes}` : ''}`;
        if (log.type === 'IN' && log.movement_reason === 'STOCKTAKE_GAIN') {
            entries.push(...accountingEntry(log.created_at, reference, 'Stok opname selisih lebih', [
                { account: ACCOUNTING_ACCOUNTS.inventory, debit: amount, credit: 0 },
                { account: ACCOUNTING_ACCOUNTS.stocktakeGain, debit: 0, credit: amount }
            ]));
        } else if (log.type === 'IN' && !log.movement_reason) {
            const creditAccount = log.payment_method === 'CASH'
                ? ACCOUNTING_ACCOUNTS.cash
                : log.payment_method === 'CREDIT'
                    ? ACCOUNTING_ACCOUNTS.payable
                    : ACCOUNTING_ACCOUNTS.unknown;
            entries.push(...accountingEntry(log.created_at, reference, description, [
                { account: ACCOUNTING_ACCOUNTS.inventory, debit: amount, credit: 0 },
                { account: creditAccount, debit: 0, credit: amount }
            ]));
            if (log.payment_method === 'CREDIT' && log.paid_at) {
                entries.push(...accountingEntry(log.paid_at, `BYR-ST-${log.id}`, `Pelunasan utang pembelian ${ingredientName}`, [
                    { account: ACCOUNTING_ACCOUNTS.payable, debit: amount, credit: 0 },
                    { account: ACCOUNTING_ACCOUNTS.cash, debit: 0, credit: amount }
                ]));
            }
        } else if (log.type === 'OUT') {
            const isStocktakeLoss = log.movement_reason === 'STOCKTAKE_LOSS';
            const isWaste = log.movement_reason === 'SPOILED' || log.movement_reason?.startsWith('FOOD_WASTE_');
            const expenseAccount = isStocktakeLoss
                ? ACCOUNTING_ACCOUNTS.stocktakeLoss
                : isWaste
                    ? ACCOUNTING_ACCOUNTS.waste
                    : log.menu_item_id || log.notes?.startsWith('Penjualan #')
                        ? ACCOUNTING_ACCOUNTS.cogs
                        : ACCOUNTING_ACCOUNTS.unknown;
            entries.push(...accountingEntry(log.created_at, reference, description, [
                { account: expenseAccount, debit: amount, credit: 0 },
                { account: ACCOUNTING_ACCOUNTS.inventory, debit: 0, credit: amount }
            ]));
        }
    });

    expenses.forEach(expense => {
        const amount = Number(expense.amount);
        const expenseAccount = `Beban Operasional — ${expense.category}`;
        const creditAccount = expense.payment_method === 'CASH'
            ? ACCOUNTING_ACCOUNTS.cash
            : ACCOUNTING_ACCOUNTS.payable;
        entries.push(...accountingEntry(expense.created_at, `BY-${expense.id}`, expense.description, [
            { account: expenseAccount, debit: amount, credit: 0 },
            { account: creditAccount, debit: 0, credit: amount }
        ]));
        if (expense.payment_method === 'CREDIT' && expense.paid_at) {
            entries.push(...accountingEntry(expense.paid_at, `BYR-BY-${expense.id}`, `Pelunasan biaya: ${expense.description}`, [
                { account: ACCOUNTING_ACCOUNTS.payable, debit: amount, credit: 0 },
                { account: ACCOUNTING_ACCOUNTS.cash, debit: 0, credit: amount }
            ]));
        }
    });
    return entries.sort((left, right) =>
        new Date(right.date) - new Date(left.date) || left.reference.localeCompare(right.reference));
}

function renderAccountingJournal() {
    const body = document.getElementById('accounting-journal-table');
    const trialBody = document.getElementById('accounting-trial-balance');
    const trialTotal = document.getElementById('accounting-trial-balance-total');
    const startValue = document.getElementById('accounting-start-date').value;
    const endValue = document.getElementById('accounting-end-date').value;
    const accountFilter = document.getElementById('accounting-account-filter').value;
    const searchValue = document.getElementById('accounting-journal-search').value.trim().toLocaleLowerCase('id');
    if (startValue && endValue && startValue > endValue) throw new Error('Rentang tanggal jurnal tidak valid.');
    const start = startValue ? new Date(`${startValue}T00:00:00`).getTime() : -Infinity;
    let end = Infinity;
    if (endValue) {
        const [year, month, day] = endValue.split('-').map(Number);
        end = new Date(year, month - 1, day + 1).getTime();
    }
    const periodEntries = accountingJournalEntries.filter(entry => {
        const time = new Date(entry.date).getTime();
        return time >= start && time < end;
    });
    const filtered = periodEntries.filter(entry =>
        (!accountFilter || entry.account === accountFilter) &&
        (!searchValue || `${entry.reference} ${entry.description} ${entry.account}`.toLocaleLowerCase('id').includes(searchValue)));
    const runningByAccount = new Map();
    const runningByEntry = new Map();
    [...accountingJournalEntries].reverse().forEach(entry => {
        const balance = (runningByAccount.get(entry.account) || 0) + entry.debit - entry.credit;
        runningByAccount.set(entry.account, balance);
        runningByEntry.set(`${entry.date}|${entry.reference}|${entry.account}`, balance);
    });
    document.getElementById('accounting-period-label').textContent = startValue || endValue
        ? `${startValue ? new Date(`${startValue}T00:00:00`).toLocaleDateString('id-ID') : 'Awal data'} – ${endValue ? new Date(`${endValue}T00:00:00`).toLocaleDateString('id-ID') : 'Akhir data'}`
        : 'Semua transaksi yang tercatat';
    document.getElementById('accounting-trial-period-label').textContent =
        document.getElementById('accounting-period-label').textContent;
    body.innerHTML = filtered.length ? filtered.map(entry => `
        <tr>
            <td>${new Date(entry.date).toLocaleString('id-ID')}</td>
            <td><strong>${escapeHtml(entry.reference)}</strong></td>
            <td>${escapeHtml(entry.description)}</td>
            <td>${escapeHtml(entry.account)}</td>
            <td class="report-amount">${entry.debit ? `Rp ${formatRp(entry.debit)}` : '-'}</td>
            <td class="report-amount">${entry.credit ? `Rp ${formatRp(entry.credit)}` : '-'}</td>
            <td class="report-amount">${(() => {
                const balance = runningByEntry.get(`${entry.date}|${entry.reference}|${entry.account}`) || 0;
                return `${balance >= 0 ? 'D' : 'K'} Rp ${formatRp(Math.abs(balance))}`;
            })()}</td>
        </tr>
    `).join('') : '<tr><td colspan="7" class="empty-state">Tidak ada jurnal pada filter yang dipilih.</td></tr>';

    const balances = new Map();
    periodEntries.forEach(entry => {
        const balance = balances.get(entry.account) || { debit: 0, credit: 0 };
        balance.debit += entry.debit;
        balance.credit += entry.credit;
        balances.set(entry.account, balance);
    });
    const rows = [...balances.entries()].sort(([left], [right]) => left.localeCompare(right, 'id'));
    const totalDebit = rows.reduce((sum, [, balance]) => sum + balance.debit, 0);
    const totalCredit = rows.reduce((sum, [, balance]) => sum + balance.credit, 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
    trialBody.innerHTML = rows.length ? rows.map(([account, balance]) => `
        <tr>
            <td>${escapeHtml(account)}</td>
            <td class="report-amount">${balance.debit ? `Rp ${formatRp(balance.debit)}` : '-'}</td>
            <td class="report-amount">${balance.credit ? `Rp ${formatRp(balance.credit)}` : '-'}</td>
            <td class="report-amount">${balance.debit >= balance.credit ? `Debit Rp ${formatRp(balance.debit - balance.credit)}` : `Kredit Rp ${formatRp(balance.credit - balance.debit)}`}</td>
        </tr>
    `).join('') : '<tr><td colspan="4" class="empty-state">Tidak ada mutasi akun pada periode ini.</td></tr>';
    trialTotal.innerHTML = rows.length
        ? `<tr class="report-total"><th>Total</th><th class="report-amount">Rp ${formatRp(totalDebit)}</th><th class="report-amount">Rp ${formatRp(totalCredit)}</th><th>${isBalanced ? 'Seimbang' : 'Tidak seimbang'}</th></tr>`
        : '';
    document.getElementById('accounting-balance-note').textContent = rows.length
        ? `Total debit ${isBalanced ? 'seimbang' : 'tidak seimbang'} dengan kredit untuk mutasi yang ditampilkan. Ini bukan neraca saldo akhir karena saldo awal akun dan seluruh aset/kewajiban tidak dicatat dalam skema saat ini.`
        : 'Saldo awal akun dan neraca saldo lengkap belum tersedia pada skema saat ini.';
}

async function loadAccountingJournal() {
    const body = document.getElementById('accounting-journal-table');
    body.innerHTML = '<tr><td colspan="7">Memuat jurnal semua transaksi...</td></tr>';
    try {
        const [salesResult, logsResult, expensesResult] = await Promise.all([
            fetchAllReportRows(() => supabaseClient.from('sales')
                .select('id, total_amount, payment_method, platform_fee, created_at')
                .order('created_at', { ascending: false })),
            fetchAllReportRows(() => supabaseClient.from('inventory_logs')
                .select('id, type, qty, unit_price_at_time, created_at, paid_at, payment_method, movement_reason, notes, menu_item_id, ingredients(name), inventory_batch_consumptions(quantity, unit_cost)')
                .order('created_at', { ascending: false })),
            fetchAllReportRows(() => supabaseClient.from('operating_expenses')
                .select('id, description, category, amount, payment_method, created_at, paid_at')
                .order('created_at', { ascending: false }))
        ]);
        const failed = [salesResult, logsResult, expensesResult].find(result => result.error);
        if (failed) throw failed.error;
        accountingJournalEntries = buildAccountingJournal(
            salesResult.data || [],
            logsResult.data || [],
            expensesResult.data || []
        );
        const accountFilter = document.getElementById('accounting-account-filter');
        const selectedAccount = accountFilter.value;
        const accounts = [...new Set(accountingJournalEntries.map(entry => entry.account))]
            .sort((left, right) => left.localeCompare(right, 'id'));
        accountFilter.innerHTML = '<option value="">Semua akun</option>' +
            accounts.map(account => `<option value="${escapeHtml(account)}">${escapeHtml(account)}</option>`).join('');
        if (accounts.includes(selectedAccount)) accountFilter.value = selectedAccount;
        renderAccountingJournal();
    } catch (error) {
        body.innerHTML = `<tr><td colspan="7" class="pos-history-error">Jurnal umum gagal dimuat: ${escapeHtml(error.message)}</td></tr>`;
        document.getElementById('accounting-trial-balance').innerHTML =
            '<tr><td colspan="4" class="pos-history-error">Neraca saldo mutasi tidak tersedia.</td></tr>';
        document.getElementById('accounting-period-label').textContent = 'Jurnal tidak tersedia.';
        document.getElementById('accounting-balance-note').textContent = `Gagal memuat sumber transaksi: ${error.message}`;
        console.error('Gagal memuat jurnal umum:', error);
    }
}

function exportAccountingJournal() {
    const startValue = document.getElementById('accounting-start-date').value;
    const endValue = document.getElementById('accounting-end-date').value;
    const accountFilter = document.getElementById('accounting-account-filter').value;
    const start = startValue ? new Date(`${startValue}T00:00:00`).getTime() : -Infinity;
    let end = Infinity;
    if (endValue) {
        const [year, month, day] = endValue.split('-').map(Number);
        end = new Date(year, month - 1, day + 1).getTime();
    }
    const searchValue = document.getElementById('accounting-journal-search').value.trim().toLocaleLowerCase('id');
    const rows = accountingJournalEntries.filter(entry => {
        const time = new Date(entry.date).getTime();
        return time >= start && time < end && (!accountFilter || entry.account === accountFilter) &&
            (!searchValue || `${entry.reference} ${entry.description} ${entry.account}`.toLocaleLowerCase('id').includes(searchValue));
    });
    const csvValue = value => {
        const text = String(value);
        const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
        return `"${safeText.replace(/"/g, '""')}"`;
    };
    const csv = [
        ['Pizza Craft — Jurnal Umum', document.getElementById('accounting-period-label').textContent, 'Mata uang: Rupiah'],
        [],
        ['Tanggal', 'Referensi', 'Keterangan', 'Akun', 'Debit (Rp)', 'Kredit (Rp)'],
        ...rows.map(entry => [
            new Date(entry.date).toLocaleString('id-ID'),
            entry.reference,
            entry.description,
            entry.account,
            entry.debit,
            entry.credit
        ])
    ].map(row => row.map(csvValue).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `jurnal-umum-${localDateValue(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
    const requestId = ++menuEngineeringLoadId;
    tableBody.innerHTML = '<tr><td colspan="12">Memuat analisis menu...</td></tr>';
    refreshButton.disabled = true;
    document.getElementById('menu-engineering-recommendations').innerHTML =
        '<p class="report-note">Menghitung rekomendasi dari data penjualan...</p>';

    try {
        const range = getMenuEngineeringRange();
        const previousDuration = range.end.getTime() - range.start.getTime();
        const previousRange = document.getElementById('menu-engineering-period').value === 'previous-month'
            ? {
                start: new Date(range.start.getFullYear(), range.start.getMonth() - 1, 1),
                end: range.start
            }
            : {
            start: new Date(range.start.getTime() - previousDuration),
            end: range.start
            };
        const queryStart = previousRange.start.toISOString();
        const queryEnd = range.end.toISOString();
        const [menuResult, recipeResult, batchResult, salesResult, cogsResult] = await Promise.all([
            supabaseClient.from('menu_items')
                .select('id, name, selling_price, is_available')
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
                .select('id, total_amount, platform_fee, created_at, sale_items(menu_item_id, quantity, unit_price)')
                .gte('created_at', queryStart)
                .lt('created_at', queryEnd)),
            fetchAllReportRows(() => supabaseClient.from('inventory_logs')
                .select('menu_item_id, qty, unit_price_at_time, notes, inventory_batch_consumptions(quantity, unit_cost)')
                .eq('type', 'OUT')
                .is('movement_reason', null)
                .not('menu_item_id', 'is', null)
                .like('notes', 'Penjualan #%')
                .gte('created_at', queryStart)
                .lt('created_at', queryEnd))
        ]);
        if (requestId !== menuEngineeringLoadId) return;

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

        const currentMetrics = new Map();
        const previousMetrics = new Map();
        const coveredSaleMenus = new Set();
        const getMetrics = (map, menuId) => {
            if (!map.has(menuId)) map.set(menuId, { units: 0, grossSales: 0, netSales: 0, actualHpp: 0, actualUnits: 0 });
            return map.get(menuId);
        };
        const saleMenuQuantities = new Map();
        (salesResult.data || []).forEach(sale => {
            const saleDate = new Date(sale.created_at);
            const isCurrent = saleDate >= range.start && saleDate < range.end;
            const isPrevious = saleDate >= previousRange.start && saleDate < previousRange.end;
            if (!isCurrent && !isPrevious) return;
            const periodMetrics = isCurrent ? currentMetrics : previousMetrics;
            const menuQuantities = new Map();
            const items = sale.sale_items || [];
            const saleItemsGross = items.reduce((sum, item) =>
                sum + Number(item.unit_price) * Number(item.quantity), 0);
            const platformFee = Number(sale.platform_fee || 0);
            (sale.sale_items || []).forEach(item => {
                if (item.menu_item_id === null) return;
                const menuId = Number(item.menu_item_id);
                const quantity = Number(item.quantity);
                menuQuantities.set(menuId, (menuQuantities.get(menuId) || 0) + quantity);
                const metrics = getMetrics(periodMetrics, menuId);
                const itemGross = Number(item.unit_price) * quantity;
                const allocatedPlatformFee = saleItemsGross > 0
                    ? platformFee * itemGross / saleItemsGross
                    : 0;
                metrics.units += quantity;
                metrics.grossSales += itemGross;
                metrics.netSales += itemGross - allocatedPlatformFee;
            });
            saleMenuQuantities.set(Number(sale.id), { menuQuantities, isCurrent });
        });
        (cogsResult.data || []).forEach(log => {
            const saleIdMatch = log.notes?.match(/^Penjualan #(\d+)$/);
            if (!saleIdMatch) return;
            const saleId = Number(saleIdMatch[1]);
            const menuId = Number(log.menu_item_id);
            const sale = saleMenuQuantities.get(saleId);
            if (!sale) return;
            const metrics = getMetrics(sale.isCurrent ? currentMetrics : previousMetrics, menuId);
            metrics.actualHpp += inventoryLogCost(log);
            const coveredKey = `${sale.isCurrent ? 'current' : 'previous'}:${saleId}:${menuId}`;
            if (!coveredSaleMenus.has(coveredKey)) {
                metrics.actualUnits += sale.menuQuantities.get(menuId) || 0;
                coveredSaleMenus.add(coveredKey);
            }
        });

        const fallbackHppByMenu = new Map();
        const getFallbackHpp = menuId => {
            if (fallbackHppByMenu.has(menuId)) return fallbackHppByMenu.get(menuId);
            const recipes = recipesByMenu.get(menuId) || [];
            const fallback = recipes.length > 0
                ? fifoRecipeCost(recipes, batchesByIngredient, ingredientsById)
                : null;
            fallbackHppByMenu.set(menuId, fallback);
            return fallback;
        };
        const calculatePeriodRow = (menuId, metrics) => {
            const soldUnits = metrics?.units || 0;
            const actualUnits = Math.min(metrics?.actualUnits || 0, soldUnits);
            const actualHpp = metrics?.actualHpp || 0;
            const fallbackHpp = getFallbackHpp(menuId);
            const uncoveredUnits = soldUnits - actualUnits;
            const hppIsAvailable = actualUnits === soldUnits
                ? soldUnits > 0 || fallbackHpp !== null
                : fallbackHpp !== null;
            const totalHpp = soldUnits === 0
                ? 0
                : hppIsAvailable
                    ? actualHpp + uncoveredUnits * fallbackHpp
                    : null;
            const hppPerPortion = soldUnits > 0
                ? hppIsAvailable ? totalHpp / soldUnits : null
                : fallbackHpp;
            const netSales = metrics?.netSales || 0;
            return {
                units: soldUnits,
                grossSales: metrics?.grossSales || 0,
                netSales,
                totalHpp,
                hppPerPortion,
                contribution: totalHpp === null ? null : netSales - totalHpp,
                marginPerUnit: soldUnits > 0 && totalHpp !== null
                    ? (netSales - totalHpp) / soldUnits
                    : null,
                hppBasis: soldUnits === 0 || actualUnits === 0
                    ? fallbackHpp === null ? 'Resep belum lengkap' : 'Estimasi resep FIFO'
                    : uncoveredUnits > 0
                        ? 'Aktual batch + estimasi resep'
                        : 'Aktual batch'
            };
        };
        const allRows = menus.map(menu => {
            const menuId = Number(menu.id);
            const current = calculatePeriodRow(menuId, currentMetrics.get(menuId));
            const previous = calculatePeriodRow(menuId, previousMetrics.get(menuId));
            const sellingPrice = Number(menu.selling_price);
            const foodCostPercent = current.hppPerPortion !== null && current.grossSales > 0 && current.units > 0
                ? (current.hppPerPortion / (current.grossSales / current.units)) * 100
                : null;
            return {
                id: menuId,
                name: menu.name,
                isAvailable: menu.is_available !== false,
                sellingPrice,
                current,
                previous,
                foodCostPercent,
                category: 'DATA_TERBATAS',
                performanceChange: current.contribution === null || previous.contribution === null
                    ? null
                    : current.contribution - previous.contribution
            };
        });
        const classificationMenus = allRows.filter(row => row.isAvailable || row.current.units > 0);
        const totalUnits = classificationMenus.reduce((sum, row) => sum + row.current.units, 0);
        const validMarginRows = classificationMenus.filter(row =>
            row.current.units > 0 && row.current.marginPerUnit !== null);
        const enoughData = totalUnits >= 10 && validMarginRows.length >= 2;
        const popularityThreshold = classificationMenus.length > 0
            ? totalUnits * 0.7 / classificationMenus.length
            : 0;
        const profitabilityDenominator = validMarginRows.reduce((sum, row) => sum + row.current.units, 0);
        const profitThreshold = profitabilityDenominator > 0
            ? validMarginRows.reduce((sum, row) =>
                sum + row.current.marginPerUnit * row.current.units, 0) / profitabilityDenominator
            : 0;
        allRows.forEach(row => {
            if (!enoughData) {
                row.category = row.current.hppPerPortion === null && row.current.units > 0
                    ? 'NO_HPP'
                    : 'DATA_TERBATAS';
                return;
            }
            if (row.current.marginPerUnit === null) {
                row.category = row.current.units > 0 ? 'NO_HPP' : 'DATA_TERBATAS';
                return;
            }
            const isPopular = row.current.units >= popularityThreshold;
            const hasHighMargin = row.current.marginPerUnit >= profitThreshold;
            row.category = isPopular
                ? hasHighMargin ? 'STAR' : 'PLOWHORSE'
                : hasHighMargin ? 'PUZZLE' : 'DOG';
        });
        const totalNetSales = allRows.reduce((sum, row) => sum + row.current.netSales, 0);
        const selectedMenuId = document.getElementById('menu-engineering-menu-filter').value;
        const selectedRows = selectedMenuId
            ? allRows.filter(row => String(row.id) === selectedMenuId)
            : allRows;
        menuEngineeringRows = allRows;
        populateMenuEngineeringFilter(menus);
        const rows = selectedMenuId
            ? allRows.filter(row => String(row.id) === selectedMenuId)
            : allRows;
        renderMenuEngineeringTable(rows, totalNetSales);
        renderMenuEngineeringChart(selectedRows, popularityThreshold, profitThreshold, enoughData);
        renderMenuEngineeringRecommendations(rows, enoughData, popularityThreshold, profitThreshold);
        document.getElementById('menu-engineering-period-label').textContent =
            `${formatMenuEngineeringDate(range.start)} – ${formatMenuEngineeringDate(new Date(range.end.getTime() - 1))}`;
        document.getElementById('menu-engineering-comparison-label').textContent =
            `Perbandingan sebelumnya: ${formatMenuEngineeringDate(previousRange.start)} – ${formatMenuEngineeringDate(new Date(previousRange.end.getTime() - 1))}`;
        document.getElementById('menu-engineering-threshold-note').textContent = enoughData
            ? `Batas popularitas: ${formatMenuEngineeringNumber(popularityThreshold)} porsi (70% dari rata-rata ${formatMenuEngineeringNumber(totalUnits / classificationMenus.length)} porsi per menu yang aktif/terjual). Batas margin: Rp ${formatMenuEngineeringCurrency(profitThreshold)} kontribusi per porsi (rata-rata tertimbang unit menu terjual).`
            : 'Klasifikasi ditahan karena data belum memadai: diperlukan sedikitnya 10 porsi terjual dan 2 menu dengan HPP yang dapat dihitung pada periode ini.';
        document.getElementById('menu-engineering-data-note').textContent =
            'Penjualan bersih per menu = harga item historis dikurangi alokasi proporsional komisi platform; belum ada data diskon/refund pada sumber transaksi. HPP mengutamakan konsumsi batch aktual, lalu estimasi resep FIFO bila biaya aktual belum tercatat. Kategori menu tidak tersedia pada skema, sehingga filter kategori tidak ditampilkan.';

    } catch (error) {
        if (requestId !== menuEngineeringLoadId) return;
        console.error('Gagal memuat analisis menu engineering:', error);
        if (menuEngineeringChartInstance) {
            menuEngineeringChartInstance.destroy();
            menuEngineeringChartInstance = null;
        }
        menuEngineeringRows = [];
        tableBody.innerHTML = '<tr><td colspan="12" class="pos-history-error">Analisis gagal dimuat. Periksa koneksi dan coba muat ulang.</td></tr>';
        document.getElementById('menu-engineering-recommendations').innerHTML =
            '<p class="pos-history-error">Rekomendasi tidak tersedia karena data analisis gagal dimuat.</p>';
        document.getElementById('menu-engineering-period-label').textContent = 'Data tidak tersedia';
        document.getElementById('menu-engineering-threshold-note').textContent =
            'Batas klasifikasi tidak dapat dihitung karena sumber data gagal dimuat.';
        showToast(`Analisis menu gagal dimuat: ${error.message}`, 'error');
    } finally {
        if (requestId === menuEngineeringLoadId) refreshButton.disabled = false;
    }
}

function dateInputValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getMenuEngineeringRange() {
    const period = document.getElementById('menu-engineering-period').value;
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let start;
    let end = new Date(startToday.getTime() + 86400000);
    if (period === 'today') {
        start = startToday;
    } else if (period === 'last7') {
        start = new Date(startToday.getTime() - 6 * 86400000);
    } else if (period === 'this-month') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (period === 'previous-month') {
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 1);
    } else {
        const startValue = document.getElementById('menu-engineering-start-date').value;
        const endValue = document.getElementById('menu-engineering-end-date').value;
        if (!startValue || !endValue || startValue > endValue) {
            throw new Error('Pilih rentang tanggal kustom yang valid.');
        }
        const [startYear, startMonth, startDay] = startValue.split('-').map(Number);
        const [endYear, endMonth, endDay] = endValue.split('-').map(Number);
        start = new Date(startYear, startMonth - 1, startDay);
        end = new Date(endYear, endMonth - 1, endDay + 1);
    }
    return { start, end };
}

function formatMenuEngineeringDate(date) {
    return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric'
    }).format(date);
}

function formatMenuEngineeringNumber(value) {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value);
}

function formatMenuEngineeringCurrency(value) {
    return formatRp(Math.round(value));
}

function populateMenuEngineeringFilter(menus) {
    const select = document.getElementById('menu-engineering-menu-filter');
    const previousValue = select.value;
    const options = ['<option value="">Semua menu</option>'];
    menus.forEach(menu => {
        options.push(`<option value="${Number(menu.id)}">${escapeHtml(menu.name)}${menu.is_available === false ? ' (nonaktif)' : ''}</option>`);
    });
    select.innerHTML = options.join('');
    if (menus.some(menu => String(menu.id) === previousValue)) select.value = previousValue;
}

function renderMenuEngineeringTable(rows, totalNetSales) {
    const categoryLabels = {
        STAR: ['STAR — populer & margin tinggi', 'badge-star'],
        PLOWHORSE: ['PLOWHORSE — populer, margin rendah', 'badge-plowhorse'],
        PUZZLE: ['PUZZLE — kurang populer, margin tinggi', 'badge-puzzle'],
        DOG: ['DOG — kurang populer & margin rendah', 'badge-dog'],
        NO_HPP: ['HPP TIDAK TERSEDIA', ''],
        DATA_TERBATAS: ['DATA TERBATAS', 'badge-limited']
    };
    const tableBody = document.getElementById('menu-engineering-table');
    tableBody.innerHTML = rows.length
        ? rows.map(row => {
            const [label, badgeClass] = categoryLabels[row.category];
            const current = row.current;
            const contributionShare = totalNetSales > 0 ? current.netSales / totalNetSales * 100 : null;
            const previousContribution = row.previous.contribution;
            const changeText = row.performanceChange === null
                ? '—'
                : previousContribution === 0
                    ? current.contribution === 0 ? '—' : `Baru (+Rp ${formatMenuEngineeringCurrency(current.contribution)})`
                    : `${row.performanceChange >= 0 ? '+' : '−'}Rp ${formatMenuEngineeringCurrency(Math.abs(row.performanceChange))} (${row.performanceChange >= 0 ? '+' : ''}${(row.performanceChange / Math.abs(previousContribution) * 100).toFixed(1)}%)`;
            return `
                <tr>
                    <td><strong>${escapeHtml(row.name)}</strong><small class="menu-engineering-subtext">${row.current.hppBasis}</small></td>
                    <td>${formatMenuEngineeringNumber(current.units)}</td>
                    <td>${current.netSales === 0 && current.units === 0 ? '—' : `Rp ${formatMenuEngineeringCurrency(current.netSales)}`}</td>
                    <td>${current.hppPerPortion === null ? '—' : `Rp ${formatMenuEngineeringCurrency(current.hppPerPortion)}`}</td>
                    <td>${current.totalHpp === null ? '—' : `Rp ${formatMenuEngineeringCurrency(current.totalHpp)}`}</td>
                    <td>${current.marginPerUnit === null ? '—' : `Rp ${formatMenuEngineeringCurrency(current.marginPerUnit)}`}</td>
                    <td>${current.contribution === null ? '—' : `Rp ${formatMenuEngineeringCurrency(current.contribution)}`}</td>
                    <td>${row.foodCostPercent === null ? '—' : `${row.foodCostPercent.toFixed(1)}%`}</td>
                    <td>${contributionShare === null ? '—' : `${contributionShare.toFixed(1)}%`}</td>
                    <td>${escapeHtml(changeText)}</td>
                    <td><span class="badge ${badgeClass}" title="Popularitas dan margin dihitung dari batas yang ditampilkan di atas">${label}</span></td>
                    <td><button type="button" class="btn btn-remove menu-simulate-button" data-menu-simulate="${row.id}" ${current.hppPerPortion === null ? 'disabled' : ''}>Simulasikan</button></td>
                </tr>
            `;
        }).join('')
        : '<tr><td colspan="12" class="empty-state">Tidak ada menu pada filter yang dipilih.</td></tr>';
}

function renderMenuEngineeringRecommendations(rows, enoughData, popularityThreshold, profitThreshold) {
    const container = document.getElementById('menu-engineering-recommendations');
    if (!enoughData) {
        container.innerHTML = '<p class="report-note">Rekomendasi otomatis ditahan sampai tersedia minimal 10 porsi terjual dan 2 menu dengan HPP terhitung.</p>';
        return;
    }
    const recommendations = [];
    rows.forEach(row => {
        if (row.current.marginPerUnit === null) return;
        if (row.current.units > 0 && row.current.marginPerUnit < profitThreshold) {
            recommendations.push({
                title: `Evaluasi margin ${row.name}`,
                detail: `Kontribusi Rp ${formatMenuEngineeringCurrency(row.current.marginPerUnit)} per porsi berada di bawah rata-rata Rp ${formatMenuEngineeringCurrency(profitThreshold)}. Tinjau harga jual atau biaya resep.`
            });
        }
        if (row.category === 'PUZZLE') {
            recommendations.push({
                title: `Uji promosi terukur untuk ${row.name}`,
                detail: `Margin Rp ${formatMenuEngineeringCurrency(row.current.marginPerUnit)} per porsi di atas rata-rata, sementara penjualan ${formatMenuEngineeringNumber(row.current.units)} porsi belum mencapai batas popularitas ${formatMenuEngineeringNumber(popularityThreshold)} porsi.`
            });
        } else if (row.category === 'STAR') {
            recommendations.push({
                title: `Pertahankan ${row.name}`,
                detail: `Menu populer (${formatMenuEngineeringNumber(row.current.units)} porsi) dengan kontribusi Rp ${formatMenuEngineeringCurrency(row.current.marginPerUnit)} per porsi yang kuat.`
            });
        }
        if (row.previous.units > 0 && row.current.units > 0 &&
            row.previous.hppPerPortion > 0 && row.current.hppPerPortion !== null &&
            row.current.hppPerPortion > row.previous.hppPerPortion * 1.1) {
            const increase = (row.current.hppPerPortion / row.previous.hppPerPortion - 1) * 100;
            recommendations.push({
                title: `Periksa kenaikan HPP ${row.name}`,
                detail: `HPP per porsi naik ${increase.toFixed(1)}% dibanding periode sebelumnya. Evaluasi harga resep, porsi, dan supplier.`
            });
        }
    });
    container.innerHTML = recommendations.length
        ? recommendations.map(item => `<article class="menu-recommendation"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></article>`).join('')
        : '<p class="report-note">Belum ada rekomendasi khusus; periksa tabel dan tren saat periode berikutnya.</p>';
}

function renderMenuEngineeringChart(rows, popularityThreshold, profitThreshold, enoughData) {
    const canvas = document.getElementById('menu-engineering-chart');
    if (menuEngineeringChartInstance) menuEngineeringChartInstance.destroy();
    const categoryOrder = ['STAR', 'PLOWHORSE', 'PUZZLE', 'DOG', 'DATA_TERBATAS', 'NO_HPP'];
    const colors = {
        STAR: '#16a34a',
        PLOWHORSE: '#f59e0b',
        PUZZLE: '#4f46e5',
        DOG: '#64748b',
        DATA_TERBATAS: '#94a3b8',
        NO_HPP: '#dc2626'
    };
    const datasets = categoryOrder.map(category => ({
        label: category,
        data: rows.filter(row => row.category === category && row.current.marginPerUnit !== null).map(row => ({
            x: row.current.units,
            y: row.current.marginPerUnit,
            menuName: row.name,
            hppPerPortion: row.current.hppPerPortion,
            contribution: row.current.contribution,
            category
        })),
        backgroundColor: colors[category],
        pointRadius: 7,
        pointHoverRadius: 9
    })).filter(dataset => dataset.data.length > 0);
    const thresholdPlugin = {
        id: 'menuEngineeringThresholds',
        afterDraw(chart) {
            if (!enoughData) return;
            const { ctx, chartArea, scales } = chart;
            if (!chartArea || !scales.x || !scales.y) return;
            const x = scales.x.getPixelForValue(popularityThreshold);
            const y = scales.y.getPixelForValue(profitThreshold);
            ctx.save();
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(chartArea.right, y);
            ctx.stroke();
            ctx.restore();
        }
    };
    menuEngineeringChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'scatter',
        data: {
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Unit terjual pada periode' }, beginAtZero: true },
                y: { title: { display: true, text: 'Kontribusi laba kotor per porsi (Rp)' }, ticks: { callback: value => `Rp ${formatRp(value)}` } }
            },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: context => {
                            const point = context.raw;
                            return [
                                point.menuName,
                                `Terjual: ${formatMenuEngineeringNumber(point.x)} porsi`,
                                `Kontribusi/porsi: Rp ${formatMenuEngineeringCurrency(point.y)}`,
                                `Total kontribusi: Rp ${formatMenuEngineeringCurrency(point.contribution)}`,
                                `HPP/porsi: Rp ${formatMenuEngineeringCurrency(point.hppPerPortion)}`,
                                `Klasifikasi: ${point.category}`
                            ];
                        }
                    }
                }
            },
            onClick(event, elements, chart) {
                const element = elements[0];
                if (!element) return;
                const point = chart.data.datasets[element.datasetIndex].data[element.index];
                const selectedRow = menuEngineeringRows.find(row => row.name === point.menuName);
                if (selectedRow) openMenuEngineeringSimulation(selectedRow.id);
            }
        },
        plugins: [thresholdPlugin]
    });
}

function openMenuEngineeringSimulation(menuId) {
    const row = menuEngineeringRows.find(item => item.id === Number(menuId));
    if (!row || row.current.hppPerPortion === null) return;
    menuEngineeringSimulationRow = row;
    document.getElementById('menu-simulation-name').textContent = row.name;
    document.getElementById('menu-simulation-hpp').textContent = `Rp ${formatMenuEngineeringCurrency(row.current.hppPerPortion)} / porsi (${row.current.hppBasis})`;
    document.getElementById('menu-simulation-price').value = String(row.sellingPrice);
    document.getElementById('menu-simulation-target').value =
        localStorage.getItem('menuEngineeringTargetFoodCost') || '30';
    document.getElementById('menu-engineering-simulation').hidden = false;
    updateMenuEngineeringSimulation();
    document.getElementById('menu-engineering-simulation').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateMenuEngineeringSimulation() {
    if (!menuEngineeringSimulationRow) return;
    const alternativePrice = Number(document.getElementById('menu-simulation-price').value);
    const targetValue = Number(document.getElementById('menu-simulation-target').value);
    const hpp = menuEngineeringSimulationRow.current.hppPerPortion;
    const isValid = Number.isFinite(alternativePrice) && alternativePrice > 0 &&
        Number.isFinite(targetValue) && targetValue > 0 && targetValue < 100;
    document.getElementById('menu-simulation-result').innerHTML = isValid
        ? `<div><span>Food Cost simulasi</span><strong>${(hpp / alternativePrice * 100).toFixed(1)}%</strong></div>
           <div><span>Laba kotor / porsi</span><strong>Rp ${formatMenuEngineeringCurrency(alternativePrice - hpp)}</strong></div>
           <div><span>Harga untuk target ${targetValue}%</span><strong>Rp ${formatMenuEngineeringCurrency(hpp / (targetValue / 100))}</strong></div>`
        : '<p class="pos-history-error">Masukkan harga alternatif di atas Rp 0 dan target food cost antara 1% sampai 99%.</p>';
    document.getElementById('menu-simulation-save-target').disabled = !Number.isFinite(targetValue) || targetValue <= 0 || targetValue >= 100;
}

function closeMenuEngineeringSimulation(resetPrice = false) {
    if (resetPrice && menuEngineeringSimulationRow) {
        document.getElementById('menu-simulation-price').value = String(menuEngineeringSimulationRow.sellingPrice);
        updateMenuEngineeringSimulation();
    }
    document.getElementById('menu-engineering-simulation').hidden = true;
    menuEngineeringSimulationRow = null;
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
    filterSelect.innerHTML = '<option value="">Semua Bahan</option>';

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
            loadFinancialReport(),
            loadAccountingJournal()
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
            loadFinancialReport(),
            loadAccountingJournal()
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

document.getElementById('pos-menu-search').addEventListener('input', renderPosMenuGrid);
document.getElementById('pos-menu-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-menu-id]');
    if (!button || posCheckoutInProgress) return;
    const menu = menuItems.find(item => Number(item.id) === Number(button.dataset.menuId));
    if (!menu || menu.is_available === false) {
        showToast('Menu ini tidak tersedia untuk dijual.', 'warning');
        return;
    }
    const existingItem = posCart.find(item => Number(item.id) === Number(menu.id));
    if (existingItem) existingItem.quantity += 1;
    else posCart.push({ id: menu.id, name: menu.name, selling_price: Number(menu.selling_price), quantity: 1 });
    renderPosCart();
    showToast(`${menu.name} ditambahkan ke keranjang.`);
});

document.getElementById('pos-cart-items').addEventListener('click', event => {
    const button = event.target.closest('[data-cart-action]');
    if (!button || posCheckoutInProgress) return;
    const item = posCart.find(cartItem => Number(cartItem.id) === Number(button.dataset.menuId));
    if (!item) return;
    if (button.dataset.cartAction === 'remove' || (button.dataset.cartAction === 'decrease' && item.quantity === 1)) {
        posCart = posCart.filter(cartItem => Number(cartItem.id) !== Number(button.dataset.menuId));
    } else if (button.dataset.cartAction === 'decrease') {
        item.quantity -= 1;
    } else if (button.dataset.cartAction === 'increase' && Number.isSafeInteger(item.quantity + 1)) {
        item.quantity += 1;
    }
    renderPosCart();
});

document.getElementById('pos-payment-method').addEventListener('change', renderPosCart);
document.getElementById('pos-cash-received').addEventListener('input', renderPosCart);

document.getElementById('pos-checkout-button').addEventListener('click', async event => {
    if (posCheckoutInProgress || posCart.length === 0) return;
    const items = posCart.map(item => ({ ...item }));
    const total = items.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);
    const paymentMethod = document.getElementById('pos-payment-method').value;
    const cashReceived = Number(document.getElementById('pos-cash-received').value);
    if (!Number.isFinite(total) || total <= 0 || items.some(item =>
        !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isFinite(item.selling_price) || item.selling_price < 0)) {
        showToast('Keranjang memiliki jumlah atau nominal yang tidak valid.', 'error');
        return;
    }
    if (paymentMethod === 'CASH' && (!Number.isSafeInteger(cashReceived) || cashReceived < total)) {
        showToast('Jumlah uang diterima harus sama dengan atau lebih besar dari total.', 'warning');
        document.getElementById('pos-cash-received').focus();
        return;
    }
    const platformFee = ['GOFOOD', 'GRABFOOD'].includes(paymentMethod) ? posPlatformFee(total) : 0;
    const confirmation = platformFee
        ? `Simpan penjualan Rp ${formatRp(total)} melalui ${paymentMethodLabel(paymentMethod)}?\nKomisi 20%: Rp ${formatRp(platformFee)}\nPiutang platform: Rp ${formatRp(total - platformFee)}`
        : `Simpan penjualan Rp ${formatRp(total)} melalui ${paymentMethodLabel(paymentMethod)}${paymentMethod === 'CASH' ? `?\nUang diterima: Rp ${formatRp(cashReceived)}\nKembalian: Rp ${formatRp(cashReceived - total)}` : '?'}`;
    if (!window.confirm(confirmation)) return;

    posCheckoutInProgress = true;
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = '<span class="loading-spinner"></span>Menyimpan...';
    document.querySelectorAll('.pos-add-menu').forEach(menuButton => { menuButton.disabled = true; });
    let saleId;
    try {
        const { data, error } = await supabaseClient.rpc('create_sale', {
            p_items: items.map(item => ({ menu_item_id: item.id, quantity: item.quantity })),
            p_payment_method: paymentMethod
        });
        if (error) throw error;
        if (data === null || data === undefined) throw new Error('Transaksi belum dikonfirmasi oleh database.');
        saleId = data;
    } catch (error) {
        console.error('Gagal menyimpan penjualan:', error);
        showToast(`Penjualan gagal disimpan: ${error.message}`, 'error');
    }
    if (saleId !== undefined) {
        const receipt = { id: saleId, createdAt: new Date().toISOString(), paymentMethod, total, cashReceived, items };
        posCart = [];
        document.getElementById('pos-cash-received').value = '';
        renderPosCart();
        try {
            renderPosReceipt(receipt);
            showToast(`Penjualan #${saleId} berhasil disimpan dan stok resep telah diperbarui.`);
        } catch (error) {
            console.error(`Penjualan #${saleId} tersimpan, tetapi struk gagal ditampilkan:`, error);
            showToast(`Penjualan #${saleId} tersimpan, tetapi struk gagal ditampilkan: ${error.message}`, 'warning');
        }
        const refreshTasks = [
            loadInventory(),
            loadJournalAndAnalysis(document.getElementById('filter-ingredient').value),
            loadSalesJournal(),
            loadFinancialReport(),
            loadAccountingJournal(),
            loadTodaySalesTotal(),
            loadPosSalesHistory()
        ];
        void Promise.allSettled(refreshTasks).then(refreshResults => {
            const refreshFailures = refreshResults.filter(result => result.status === 'rejected');
            if (refreshFailures.length) {
                console.error('Transaksi tersimpan, tetapi sebagian tampilan gagal diperbarui:', refreshFailures);
                showToast('Transaksi tersimpan, tetapi sebagian data layar perlu diperbarui.', 'warning');
            }
        });
    }
    posCheckoutInProgress = false;
    button.innerHTML = '<i data-lucide="circle-check"></i>Simpan Penjualan';
    renderPosCart();
    renderPosMenuGrid();
    if (window.lucide) window.lucide.createIcons();
});

document.getElementById('pos-history-refresh').addEventListener('click', loadPosSalesHistory);
['pos-history-search', 'pos-history-start', 'pos-history-end', 'pos-history-payment', 'pos-history-status']
    .forEach(id => {
        document.getElementById(id).addEventListener('input', loadPosSalesHistory);
        document.getElementById(id).addEventListener('change', loadPosSalesHistory);
    });
document.getElementById('pos-history-table').addEventListener('click', event => {
    const button = event.target.closest('[data-sale-id]');
    if (button) showPosSaleDetails(Number(button.dataset.saleId));
});
document.getElementById('pos-receipt-close').addEventListener('click', () =>
    document.getElementById('pos-receipt-dialog').close());
document.getElementById('pos-receipt-print').addEventListener('click', () => {
    document.body.classList.add('pos-printing');
    window.print();
});
window.addEventListener('afterprint', () => document.body.classList.remove('pos-printing'));
document.getElementById('pos-new-sale').addEventListener('click', () => {
    document.getElementById('pos-receipt-dialog').close();
    document.getElementById('pos-menu-search').focus();
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

function setReportPeriodOptions() {
    const today = new Date();
    const monthNames = Array.from({ length: 12 }, (_, month) =>
        new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2020, month, 1)));
    const monthOptions = monthNames.map((name, month) =>
        `<option value="${month}">${name}</option>`).join('');
    const yearOptions = Array.from({ length: 8 }, (_, index) => today.getFullYear() - 5 + index)
        .map(year => `<option value="${year}">${year}</option>`).join('');
    ['report-month', 'accounting-month'].forEach(id => {
        document.getElementById(id).innerHTML = monthOptions;
        document.getElementById(id).value = String(today.getMonth());
    });
    ['report-year', 'accounting-year'].forEach(id => {
        document.getElementById(id).innerHTML = yearOptions;
        document.getElementById(id).value = String(today.getFullYear());
    });
}

function applyReportMonthToDates() {
    const year = Number(document.getElementById('report-year').value);
    const month = Number(document.getElementById('report-month').value);
    const start = new Date(year, month, 1);
    const today = new Date();
    const end = month === today.getMonth() && year === today.getFullYear()
        ? today
        : new Date(year, month + 1, 0);
    document.getElementById('report-start-date').value = localDateValue(start);
    document.getElementById('report-end-date').value = localDateValue(end);
    updateReportDateMode();
}

function updateReportDateMode() {
    const isCustom = document.getElementById('report-range-mode').value === 'custom';
    document.getElementById('report-start-date').closest('.form-group').hidden = !isCustom;
    document.getElementById('report-end-date').closest('.form-group').hidden = !isCustom;
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

function reportPeriodLabel() {
    const start = document.getElementById('report-start-date').value;
    const end = document.getElementById('report-end-date').value;
    const format = value => new Intl.DateTimeFormat('id-ID', {
        day: '2-digit', month: 'long', year: 'numeric'
    }).format(new Date(`${value}T00:00:00`));
    return `${format(start)} – ${format(end)}`;
}

function applyAccountingPeriodFilter() {
    const start = document.getElementById('report-start-date').value;
    const end = document.getElementById('report-end-date').value;
    document.getElementById('accounting-start-date').value = start;
    document.getElementById('accounting-end-date').value = end;
}

function switchFinancialReportTab(tab, navigate = true) {
    activeReportTab = tab;
    document.querySelectorAll('[data-report-tab]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.reportTab === tab);
        button.setAttribute('aria-current', button.dataset.reportTab === tab ? 'page' : 'false');
    });
    const isJournalPage = ['journal', 'ledger'].includes(tab);
    const pageId = isJournalPage ? 'page-jurnal' : 'page-laporan';
    const pageLink = document.querySelector(`.sidebar-menu li[onclick*="${pageId}"]`);
    if (navigate && pageLink && !document.getElementById(pageId).classList.contains('active')) switchPage(pageId, pageLink);
    document.querySelectorAll('.report-profit-loss-panel, .report-summary-panel, .report-visualization-panel, .menu-engineering-analysis-panel, .report-cash-flow-panel, .report-transaction-panel, .accounting-ledger-panel, .accounting-journal-panel, .accounting-inventory-ledger-panel, .accounting-sales-summary-panel').forEach(panel => {
        let visible = false;
        if (tab === 'profit-loss') visible = panel.matches('.report-summary-panel, .report-visualization-panel, .menu-engineering-analysis-panel, .report-profit-loss-panel');
        if (tab === 'cash-flow') visible = panel.matches('.report-cash-flow-panel');
        if (tab === 'transactions') visible = panel.matches('.report-transaction-panel');
        if (tab === 'journal') visible = panel.matches('.accounting-journal-panel');
        if (tab === 'ledger') visible = panel.matches('.accounting-ledger-panel, .accounting-journal-panel');
        panel.hidden = !visible;
    });
}

function navigateToJournalReference(reference) {
    const search = document.getElementById('accounting-journal-search');
    search.value = reference;
    document.getElementById('accounting-account-filter').value = '';
    switchFinancialReportTab('journal');
    applyAccountingPeriodFilter();
    renderAccountingJournal();
    document.getElementById('accounting-journal-table').closest('.report-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function renderFinancialReportCharts(sales, cogsLogs, expenses) {
    if (financialTrendChart) financialTrendChart.destroy();
    if (financialExpenseChart) financialExpenseChart.destroy();
    const daily = new Map();
    const dateKey = date => localDateValue(new Date(date));
    sales.forEach(sale => {
        const key = dateKey(sale.created_at);
        const row = daily.get(key) || { revenue: 0, cogs: 0 };
        row.revenue += Number(sale.total_amount);
        daily.set(key, row);
    });
    cogsLogs.forEach(log => {
        const key = dateKey(log.created_at);
        const row = daily.get(key) || { revenue: 0, cogs: 0 };
        row.cogs += inventoryLogCost(log);
        daily.set(key, row);
    });
    const keys = [...daily.keys()].sort();
    const labels = keys.map(key => new Date(`${key}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }));
    const revenueData = keys.map(key => daily.get(key).revenue);
    const cogsData = keys.map(key => daily.get(key).cogs);
    const profitData = keys.map(key => daily.get(key).revenue - daily.get(key).cogs);
    const trendCanvas = document.getElementById('financial-trend-chart');
    const trendEmpty = document.getElementById('financial-trend-empty');
    trendCanvas.hidden = keys.length === 0;
    trendEmpty.hidden = keys.length > 0;
    financialTrendChart = keys.length ? new Chart(trendCanvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [
            { label: 'Penjualan tercatat', data: revenueData, borderColor: '#dc3e34', backgroundColor: 'rgba(220,62,52,.08)', tension: .25, fill: false },
            { label: 'HPP', data: cogsData, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.08)', tension: .25, fill: false },
            { label: 'Laba kotor', data: profitData, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.08)', tension: .25, fill: false }
        ] },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { tooltip: { callbacks: { label: item => `${item.dataset.label}: Rp ${formatRp(item.raw)}` } } },
            scales: { y: { ticks: { callback: value => `Rp ${formatRp(value)}` } } }
        }
    }) : null;
    const expenseCategories = new Map();
    expenses.forEach(expense => expenseCategories.set(
        expense.category,
        (expenseCategories.get(expense.category) || 0) + Number(expense.amount)
    ));
    const categories = [...expenseCategories.entries()].sort((left, right) => right[1] - left[1]);
    const expenseCanvas = document.getElementById('financial-expense-chart');
    const expenseEmpty = document.getElementById('financial-expense-empty');
    expenseCanvas.hidden = categories.length === 0;
    expenseEmpty.hidden = categories.length > 0;
    financialExpenseChart = categories.length ? new Chart(expenseCanvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels: categories.map(([category]) => category), datasets: [{
            label: 'Biaya operasional (Rp)',
            data: categories.map(([, amount]) => amount),
            backgroundColor: ['#dc3e34', '#f59e0b', '#475569', '#16a34a', '#6366f1', '#94a3b8'],
            borderColor: '#fff',
            borderWidth: 3
        }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: item => `${item.label}: Rp ${formatRp(item.raw)}` } }
            }
        }
    }) : null;
}

async function loadFinancialReport() {
    const requestId = ++financialReportRequest;
    const profitLossBody = document.getElementById('profit-loss-table');
    const cashFlowBody = document.getElementById('cash-flow-table');
    const expenseBody = document.getElementById('expense-table');
    const payableBody = document.getElementById('payables-table');
    try {
        const { start, end } = reportDateBounds();
        const currentStartDate = new Date(start);
        const currentEndDate = new Date(end);
        let previousStartDate;
        let previousEndDate;
        if (document.getElementById('report-range-mode').value === 'month') {
            previousStartDate = new Date(currentStartDate.getFullYear(), currentStartDate.getMonth() - 1, 1);
            const currentMonthEnd = new Date(currentStartDate.getFullYear(), currentStartDate.getMonth() + 1, 1);
            const isFullMonth = currentEndDate.getTime() === currentMonthEnd.getTime();
            const previousMonthEndDay = new Date(currentStartDate.getFullYear(), currentStartDate.getMonth(), 0).getDate();
            previousEndDate = isFullMonth
                ? currentStartDate
                : new Date(currentStartDate.getFullYear(), currentStartDate.getMonth() - 1,
                    Math.min(currentEndDate.getDate(), previousMonthEndDay + 1));
        } else {
            previousStartDate = new Date(currentStartDate.getTime() - (currentEndDate.getTime() - currentStartDate.getTime()));
            previousEndDate = currentStartDate;
        }
        const previousStart = previousStartDate.toISOString();
        const queryStart = document.getElementById('financial-report-compare').checked ? previousStart : start;
        currentFinancialReport = null;
        document.getElementById('financial-report-period-label').textContent = 'Memuat laporan...';
        document.getElementById('report-cash-summary').innerHTML = '<div class="executive-loading"><span class="loading-spinner"></span>Memuat ringkasan kas...</div>';
        if (financialTrendChart) { financialTrendChart.destroy(); financialTrendChart = null; }
        if (financialExpenseChart) { financialExpenseChart.destroy(); financialExpenseChart = null; }
        document.getElementById('financial-trend-chart').hidden = true;
        document.getElementById('financial-trend-empty').hidden = false;
        document.getElementById('financial-trend-empty').textContent = 'Memuat tren pendapatan dan laba...';
        document.getElementById('financial-expense-chart').hidden = true;
        document.getElementById('financial-expense-empty').hidden = false;
        document.getElementById('financial-expense-empty').textContent = 'Memuat komposisi biaya...';
        profitLossBody.innerHTML = '<tr><td colspan="2">Memuat laporan...</td></tr>';
        cashFlowBody.innerHTML = '<tr><td colspan="5">Memuat arus kas...</td></tr>';
        expenseBody.innerHTML = '<tr><td colspan="5">Memuat biaya...</td></tr>';
        payableBody.innerHTML = '<tr><td colspan="5">Memuat utang...</td></tr>';
        document.getElementById('report-sales-summary').innerHTML = '<tr><td colspan="7">Memuat ringkasan transaksi...</td></tr>';

        const queryFactories = [
            () => supabaseClient.from('sales')
                .select('id, total_amount, payment_method, platform_fee, created_at')
                .gte('created_at', queryStart).lt('created_at', end).order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, created_at, qty, unit_price_at_time, menu_item_id, notes, ingredients(name), inventory_batch_consumptions(quantity, unit_cost)')
                .eq('type', 'OUT').is('movement_reason', null)
                .gte('created_at', queryStart).lt('created_at', end).order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, created_at, qty, unit_price_at_time, notes, inventory_batch_consumptions(quantity, unit_cost)')
                .eq('type', 'OUT').in('movement_reason', [
                    'SPOILED',
                    'FOOD_WASTE_EXPIRED',
                    'FOOD_WASTE_DROPPED',
                    'FOOD_WASTE_DOUGH_FAILED',
                    'STOCKTAKE_LOSS'
                ])
                .gte('created_at', queryStart).lt('created_at', end).order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, qty, unit_price_at_time, created_at')
                .eq('type', 'IN').eq('movement_reason', 'STOCKTAKE_GAIN')
                .gte('created_at', queryStart).lt('created_at', end),
            () => supabaseClient.from('operating_expenses')
                .select('id, description, category, amount, payment_method, created_at, paid_at')
                .gte('created_at', queryStart).lt('created_at', end).order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, qty, unit_price_at_time, paid_at, ingredients(name), suppliers(name)')
                .eq('type', 'IN').gte('paid_at', queryStart).lt('paid_at', end).order('paid_at'),
            () => supabaseClient.from('operating_expenses')
                .select('id, description, amount, paid_at')
                .not('paid_at', 'is', null).gte('paid_at', queryStart).lt('paid_at', end).order('paid_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, qty, unit_price_at_time, created_at, notes, ingredients(name), suppliers(name)')
                .eq('type', 'IN').eq('payment_method', 'CREDIT').is('paid_at', null).order('created_at'),
            () => supabaseClient.from('operating_expenses')
                .select('id, description, category, amount, created_at')
                .eq('payment_method', 'CREDIT').is('paid_at', null).order('created_at'),
            () => supabaseClient.from('inventory_logs')
                .select('id, qty, unit_price_at_time, created_at')
                .eq('type', 'IN').is('payment_method', null)
                .is('movement_reason', null)
                .gte('created_at', queryStart).lt('created_at', end)
        ];
        const [salesResult, cogsResult, spoiledResult, stocktakeGainsResult, expensesResult, purchasesPaidResult,
            expensesPaidResult, unpaidPurchasesResult, unpaidExpensesResult,
            unknownPurchasesResult] = await Promise.all(queryFactories.map(fetchAllReportRows));
        if (requestId !== financialReportRequest) return;
        const results = [salesResult, cogsResult, spoiledResult, stocktakeGainsResult, expensesResult, purchasesPaidResult,
            expensesPaidResult, unpaidPurchasesResult, unpaidExpensesResult, unknownPurchasesResult];
        const failedResult = results.find(result => result.error);
        if (failedResult) throw failedResult.error;

        const inPeriod = (row, field, lower, upper) => {
            const time = new Date(row[field]).getTime();
            return time >= lower.getTime() && time < upper.getTime();
        };
        const filterPeriod = (result, field, lower, upper) =>
            (result.data || []).filter(row => inPeriod(row, field, lower, upper));
        const sales = filterPeriod(salesResult, 'created_at', currentStartDate, currentEndDate);
        const cogsLogs = filterPeriod(cogsResult, 'created_at', currentStartDate, currentEndDate);
        const spoiledLogs = filterPeriod(spoiledResult, 'created_at', currentStartDate, currentEndDate);
        const stocktakeGains = filterPeriod(stocktakeGainsResult, 'created_at', currentStartDate, currentEndDate);
        const expenses = filterPeriod(expensesResult, 'created_at', currentStartDate, currentEndDate);
        const paidPurchases = filterPeriod(purchasesPaidResult, 'paid_at', currentStartDate, currentEndDate);
        const paidExpenses = filterPeriod(expensesPaidResult, 'paid_at', currentStartDate, currentEndDate);
        const previousSales = document.getElementById('financial-report-compare').checked
            ? filterPeriod(salesResult, 'created_at', previousStartDate, previousEndDate) : [];
        const previousCogsLogs = document.getElementById('financial-report-compare').checked
            ? filterPeriod(cogsResult, 'created_at', previousStartDate, previousEndDate) : [];
        const previousExpenses = document.getElementById('financial-report-compare').checked
            ? filterPeriod(expensesResult, 'created_at', previousStartDate, previousEndDate) : [];
        const previousSpoiled = document.getElementById('financial-report-compare').checked
            ? filterPeriod(spoiledResult, 'created_at', previousStartDate, previousEndDate) : [];
        const previousGains = document.getElementById('financial-report-compare').checked
            ? filterPeriod(stocktakeGainsResult, 'created_at', previousStartDate, previousEndDate) : [];
        const previousPaidPurchases = document.getElementById('financial-report-compare').checked
            ? filterPeriod(purchasesPaidResult, 'paid_at', previousStartDate, previousEndDate) : [];
        const previousPaidExpenses = document.getElementById('financial-report-compare').checked
            ? filterPeriod(expensesPaidResult, 'paid_at', previousStartDate, previousEndDate) : [];
        const unpaidPurchases = unpaidPurchasesResult.data || [];
        const unpaidExpenses = unpaidExpensesResult.data || [];
        const unknownPurchases = filterPeriod(unknownPurchasesResult, 'created_at', currentStartDate, currentEndDate);

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
        const periodMetrics = (periodSales, periodCogs, periodWaste, periodGains, periodExpenses, periodPurchases, periodPaidExpenses) => {
            const salesTotal = periodSales.reduce((sum, row) => sum + Number(row.total_amount), 0);
            const hppTotal = periodCogs.reduce((sum, row) => sum + inventoryLogCost(row), 0);
            const expenseAmount = periodExpenses.reduce((sum, row) => sum + Number(row.amount), 0);
            const wasteAmount = periodWaste.reduce((sum, row) => sum + inventoryLogCost(row), 0);
            const adjustmentGain = periodGains.reduce((sum, row) =>
                sum + Number(row.qty) * Number(row.unit_price_at_time), 0);
            const commission = periodSales.reduce((sum, row) => sum + Number(row.platform_fee), 0);
            const receipts = periodSales.reduce((sum, row) =>
                sum + (['CASH', 'QRIS'].includes(row.payment_method) ? Number(row.total_amount) : 0), 0);
            const supplierPayments = periodPurchases.reduce((sum, row) =>
                sum + Number(row.qty) * Number(row.unit_price_at_time), 0);
            const operationalPayments = periodPaidExpenses.reduce((sum, row) => sum + Number(row.amount), 0);
            return {
                revenue: salesTotal,
                grossProfit: salesTotal - hppTotal,
                netProfit: salesTotal - hppTotal - expenseAmount - wasteAmount - commission + adjustmentGain,
                netCashChange: receipts - supplierPayments - operationalPayments
            };
        };
        const comparisonMetrics = document.getElementById('financial-report-compare').checked
            ? periodMetrics(previousSales, previousCogsLogs, previousSpoiled, previousGains, previousExpenses, previousPaidPurchases, previousPaidExpenses)
            : null;

        document.getElementById('report-revenue').innerText = `Rp ${formatRp(revenue)}`;
        document.getElementById('report-gross-profit').innerText = `Rp ${formatRp(grossProfit)}`;
        document.getElementById('report-net-profit').innerText = `Rp ${formatRp(netProfit)}`;
        document.getElementById('report-net-profit').classList.toggle('text-danger', netProfit < 0);
        document.getElementById('report-net-cash-flow').innerText = `Rp ${formatRp(cashIn - cashOut)}`;
        document.getElementById('report-net-cash-flow').classList.toggle('text-danger', cashIn - cashOut < 0);
        document.getElementById('report-cash-in').innerText = `Rp ${formatRp(cashIn)}`;
        document.getElementById('report-cash-out').innerText = `Rp ${formatRp(cashOut)}`;
        document.getElementById('report-platform-receivable').innerText = `Rp ${formatRp(platformReceivable)}`;
        document.getElementById('report-sales-summary').innerHTML = sales.length
            ? sales.map(sale => {
                const platformSale = ['GOFOOD', 'GRABFOOD'].includes(sale.payment_method);
                const settledAmount = platformSale
                    ? Number(sale.total_amount) - Number(sale.platform_fee)
                    : ['CASH', 'QRIS'].includes(sale.payment_method) ? Number(sale.total_amount) : null;
                return `<tr>
                    <td>${new Date(sale.created_at).toLocaleString('id-ID')}</td>
                    <td><strong>#${sale.id}</strong></td>
                    <td>${escapeHtml(paymentMethodLabel(sale.payment_method))}</td>
                    <td class="report-amount">Rp ${formatRp(sale.total_amount)}</td>
                    <td class="report-amount">${Number(sale.platform_fee) ? `Rp ${formatRp(sale.platform_fee)}` : '-'}</td>
                    <td class="report-amount">${settledAmount === null ? 'Tidak diketahui' : `Rp ${formatRp(settledAmount)}`}</td>
                    <td><button type="button" class="report-source-link" data-report-reference="PJ-${sale.id}">PJ-${sale.id}</button></td>
                </tr>`;
            }).join('')
            : '<tr><td colspan="7" class="empty-state">Tidak ada penjualan pada periode ini.</td></tr>';
        document.getElementById('financial-report-period-label').textContent =
            `Periode laporan: ${reportPeriodLabel()}${comparisonMetrics ? ` | Pembanding: ${new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(previousStartDate)} – ${new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(previousEndDate.getTime() - 86400000))}` : ''}`;
        const comparisonContainer = document.getElementById('financial-report-comparison');
        comparisonContainer.innerHTML = comparisonMetrics
            ? [
                ['Penjualan', revenue, comparisonMetrics.revenue],
                ['Laba kotor', grossProfit, comparisonMetrics.grossProfit],
                ['Laba bersih', netProfit, comparisonMetrics.netProfit],
                ['Perubahan kas tercatat', cashIn - cashOut, comparisonMetrics.netCashChange]
            ].map(([label, current, previous]) => {
                const delta = Number(current) - Number(previous);
                return `<div class="report-comparison-item"><span>${label}</span><strong>Rp ${formatRp(current)}</strong><small>Periode lalu Rp ${formatRp(previous)} · ${delta >= 0 ? '+' : '−'}Rp ${formatRp(Math.abs(delta))}</small></div>`;
            }).join('')
            : '<p class="report-note">Perbandingan periode sebelumnya dinonaktifkan.</p>';

        const expensesByCategory = new Map();
        expenses.forEach(expense => {
            expensesByCategory.set(
                expense.category,
                (expensesByCategory.get(expense.category) || 0) + Number(expense.amount)
            );
        });
        const detailMarkup = (items, reference, description, amount) => items.length
            ? `<details class="report-detail"><summary>Lihat ${formatRp(items.length)} transaksi sumber</summary><div class="report-detail-scroll"><table><tbody>${items.map(item => `
                <tr><td>${new Date(item.created_at || item.paid_at).toLocaleDateString('id-ID')}</td><td>${escapeHtml(description(item))}</td><td class="report-amount">Rp ${formatRp(amount(item))}</td><td><button type="button" class="report-source-link" data-report-reference="${escapeHtml(reference(item))}">${escapeHtml(reference(item))}</button></td></tr>
            `).join('')}</tbody></table></div></details>`
            : '<small class="report-note">Tidak ada transaksi sumber pada periode ini.</small>';
        const expenseRows = [...expensesByCategory.entries()].sort(([left], [right]) => left.localeCompare(right, 'id'))
            .map(([category, amount]) => {
                const rows = expenses.filter(expense => expense.category === category);
                return `<tr><td>Biaya ${escapeHtml(category)}${detailMarkup(rows, row => `BY-${row.id}`, row => row.description, row => Number(row.amount))}</td><td class="report-amount">Rp ${formatRp(amount)}</td></tr>`;
            }).join('');
        const cogsTotal = cogsLogs.reduce((sum, log) => sum + inventoryLogCost(log), 0);
        const expenseSalesBreakdown = detailMarkup(sales, row => `PJ-${row.id}`, row => `Penjualan ${paymentMethodLabel(row.payment_method)} #${row.id}`, row => Number(row.total_amount));
        const cogsBreakdown = detailMarkup(cogsLogs, row => `ST-${row.id}`, row => `${row.ingredients?.name || 'HPP penjualan'}${row.notes ? ` — ${row.notes}` : ''}`, row => inventoryLogCost(row));
        const wasteBreakdown = detailMarkup(spoiledLogs, row => `ST-${row.id}`, row => row.notes || 'Food waste / selisih stok', row => inventoryLogCost(row));
        const gainBreakdown = detailMarkup(stocktakeGains, row => `ST-${row.id}`, row => row.notes || 'Penyesuaian stok selisih lebih', row => Number(row.qty) * Number(row.unit_price_at_time));
        profitLossBody.innerHTML = `
            <tr><td>Penjualan bruto tercatat${expenseSalesBreakdown}</td><td class="report-amount">Rp ${formatRp(revenue)}</td></tr>
            <tr><td>Diskon dan retur</td><td class="report-amount">Tidak tersedia — tidak dicatat</td></tr>
            <tr class="report-subtotal"><th>Penjualan bersih tercatat</th><th class="report-amount">Rp ${formatRp(revenue)}</th></tr>
            <tr><td>(-) Harga Pokok Penjualan (HPP)${cogsBreakdown}</td><td class="report-amount">Rp ${formatRp(cogsTotal)}</td></tr>
            <tr class="report-total"><th>Laba Kotor</th><td class="report-amount">Rp ${formatRp(grossProfit)} <small>(${revenue > 0 ? (grossProfit / revenue * 100).toFixed(1) : '—'}%)</small></td></tr>
            <tr><td>Beban Komisi GoFood / GrabFood${detailMarkup(sales.filter(sale => Number(sale.platform_fee) > 0), row => `PJ-${row.id}`, row => `Komisi penjualan #${row.id}`, row => Number(row.platform_fee))}</td><td class="report-amount">Rp ${formatRp(platformFeeTotal)}</td></tr>
            <tr><th colspan="2">Biaya Operasional</th></tr>
            ${expenseRows || '<tr><td colspan="2">Belum ada biaya operasional pada periode ini.</td></tr>'}
            <tr><td>Beban Kerusakan Persediaan & Selisih Kurang (Food Loss)${wasteBreakdown}</td><td class="report-amount">Rp ${formatRp(spoilageLoss)}</td></tr>
            <tr><td>Keuntungan Penyesuaian Stok (Selisih Lebih)${gainBreakdown}</td><td class="report-amount">Rp ${formatRp(stocktakeGainTotal)}</td></tr>
            <tr><td>Pendapatan / beban lainnya</td><td class="report-amount">Tidak tersedia — tidak ada sumber data terpisah</td></tr>
            <tr class="report-total"><th>Laba / (Rugi) Bersih</th><td class="report-amount">Rp ${formatRp(netProfit)} <small>(${revenue > 0 ? (netProfit / revenue * 100).toFixed(1) : '—'}%)</small></td></tr>
        `;

        const cashEntries = [
            ...sales.filter(sale => ['CASH', 'QRIS'].includes(sale.payment_method)).map(sale => ({
                date: sale.created_at,
                reference: `PJ-${sale.id}`,
                description: `Penjualan #${sale.id} (${sale.payment_method === 'CASH' ? 'Tunai' : 'QRIS / Bank Transfer'})`,
                inflow: Number(sale.total_amount),
                outflow: 0
            })),
            ...paidPurchases.map(purchase => ({
                date: purchase.paid_at,
                reference: `ST-${purchase.id}`,
                description: `Pembelian bahan: ${purchase.ingredients?.name || 'Bahan baku'}${purchase.suppliers?.name ? ` (${purchase.suppliers.name})` : ''}`,
                inflow: 0,
                outflow: Number(purchase.qty) * Number(purchase.unit_price_at_time)
            })),
            ...paidExpenses.map(expense => ({
                date: expense.paid_at,
                reference: `BYR-BY-${expense.id}`,
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
                    <td><button type="button" class="report-source-link" data-report-reference="${escapeHtml(entry.reference)}">${escapeHtml(entry.reference)}</button></td>
                </tr>
            `).join('')
            : '<tr><td colspan="5">Belum ada arus kas pada periode ini.</td></tr>';
        document.getElementById('cash-flow-table').closest('table').querySelector('thead tr').innerHTML =
            '<th>Tanggal</th><th>Keterangan</th><th>Kas / Bank Masuk</th><th>Pembayaran Keluar</th><th>Sumber</th>';
        document.getElementById('report-cash-summary').innerHTML = `
            <div><span>Saldo awal</span><strong>Tidak tersedia</strong><small>Saldo pembuka tidak dicatat</small></div>
            <div><span>Penerimaan pelanggan tercatat</span><strong>Rp ${formatRp(cashIn)}</strong></div>
            <div><span>Pembayaran supplier</span><strong>Rp ${formatRp(purchaseCashOut)}</strong></div>
            <div><span>Pembayaran operasional</span><strong>Rp ${formatRp(expenseCashOut)}</strong></div>
            <div><span>Arus kas operasi bersih tercatat</span><strong>Rp ${formatRp(cashIn - cashOut)}</strong></div>
            <div><span>Investasi / pendanaan</span><strong>Tidak tersedia</strong><small>Tidak ada sumber data terpisah</small></div>
            <div><span>Total perubahan kas tercatat</span><strong>Rp ${formatRp(cashIn - cashOut)}</strong></div>
            <div><span>Saldo akhir</span><strong>Tidak tersedia</strong><small>Saldo awal & mutasi bank lengkap tidak dicatat</small></div>
        `;

        expenseBody.innerHTML = expenses.length
            ? expenses.map(expense => `
                <tr>
                    <td>${new Date(expense.created_at).toLocaleDateString('id-ID')}</td>
                    <td>${escapeHtml(expense.description)} <button type="button" class="report-source-link" data-report-reference="BY-${expense.id}">BY-${expense.id}</button></td>
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
        payableBody.closest('.report-card').querySelector('.report-note').textContent =
            'Daftar ini menunjukkan utang yang belum dibayar saat ini (tidak dibatasi periode). Pembayaran yang sudah terjadi masuk ke arus kas berdasarkan tanggal pembayaran.';

        const unknownPurchaseTotal = unknownPurchases.reduce((sum, purchase) =>
            sum + Number(purchase.qty) * Number(purchase.unit_price_at_time), 0);
        document.getElementById('report-cash-warning').innerText = unknownPurchases.length
            ? `${unknownPurchases.length} pembelian stok lama senilai Rp ${formatRp(unknownPurchaseTotal)} tidak memiliki status pembayaran, sehingga tidak dimasukkan ke arus kas. Penjualan GoFood/GrabFood dicatat sebagai piutang, bukan kas masuk.`
            : 'Penjualan Tunai/QRIS dihitung sebagai kas masuk. Penjualan GoFood/GrabFood menjadi piutang sebesar nilai setelah komisi; komisi dicatat sebagai beban, bukan kas keluar. Pembelian stok dan biaya operasional masuk arus kas pada tanggal pembayarannya.';
        currentFinancialReport = {
            period: reportPeriodLabel(),
            revenue, cogs, grossProfit, netProfit, cashIn, cashOut,
            sales, cogsLogs, expenses, spoiledLogs, stocktakeGains, cashEntries,
            expenseCategories: [...expensesByCategory.entries()],
            comparisonMetrics
        };
        renderFinancialReportCharts(sales, cogsLogs, expenses);
    } catch (error) {
        if (requestId !== financialReportRequest) return;
        console.error('Gagal memuat laporan keuangan:', error);
        profitLossBody.innerHTML = '<tr><td colspan="2">Laporan gagal dimuat.</td></tr>';
        cashFlowBody.innerHTML = '<tr><td colspan="5">Arus kas gagal dimuat.</td></tr>';
        expenseBody.innerHTML = '<tr><td colspan="5">Biaya gagal dimuat.</td></tr>';
        payableBody.innerHTML = '<tr><td colspan="5">Utang gagal dimuat.</td></tr>';
        currentFinancialReport = null;
        if (financialTrendChart) { financialTrendChart.destroy(); financialTrendChart = null; }
        if (financialExpenseChart) { financialExpenseChart.destroy(); financialExpenseChart = null; }
        document.getElementById('financial-trend-chart').hidden = true;
        document.getElementById('financial-trend-empty').hidden = false;
        document.getElementById('financial-trend-empty').textContent = 'Grafik tidak tersedia karena data gagal dimuat.';
        document.getElementById('financial-expense-chart').hidden = true;
        document.getElementById('financial-expense-empty').hidden = false;
        document.getElementById('financial-expense-empty').textContent = 'Grafik tidak tersedia karena data gagal dimuat.';
        document.getElementById('financial-report-period-label').textContent = 'Data laporan tidak tersedia.';
        document.getElementById('report-cash-summary').innerHTML =
            '<p class="pos-history-error">Ringkasan kas tidak tersedia karena data gagal dimuat.</p>';
        document.getElementById('financial-report-comparison').innerHTML =
            '<p class="pos-history-error">Perbandingan tidak tersedia karena data gagal dimuat.</p>';
        showToast(`Laporan keuangan gagal dimuat: ${error.message}`, 'error');
    }
}

async function applyFinancialFilters() {
    try {
        reportDateBounds();
        applyAccountingPeriodFilter();
        await Promise.all([loadFinancialReport(), loadAccountingJournal()]);
    } catch (error) {
        showToast(error.message, 'warning');
    }
}

function resetFinancialFilters() {
    const now = new Date();
    document.getElementById('report-range-mode').value = 'month';
    document.getElementById('report-month').value = String(now.getMonth());
    document.getElementById('report-year').value = String(now.getFullYear());
    applyReportMonthToDates();
    document.getElementById('accounting-account-filter').value = '';
    document.getElementById('accounting-journal-search').value = '';
    applyAccountingPeriodFilter();
    applyFinancialFilters();
}

function exportVisibleFinancialReport() {
    if (!currentFinancialReport) {
        showToast('Tidak ada laporan yang dapat diekspor.', 'warning');
        return;
    }
    if (activeReportTab === 'journal') {
        exportAccountingJournal();
        return;
    }
    const csvValue = value => `"${String(value).replace(/"/g, '""')}"`;
    if (activeReportTab === 'ledger') {
        const rows = [
            ['Pizza Craft — Buku Besar / Neraca Saldo Mutasi', document.getElementById('accounting-period-label').textContent, 'Mata uang: Rupiah'],
            [],
            ['Neraca Saldo Mutasi'],
            ...[...document.querySelectorAll('#accounting-trial-balance tr, #accounting-trial-balance-total tr')]
                .map(row => [...row.children].map(cell => cell.innerText.replace(/\s+/g, ' ').trim())),
            [],
            ['Detail Buku Besar'],
            ...[...document.querySelectorAll('.accounting-journal-panel table > thead tr, .accounting-journal-panel table > tbody tr')]
                .map(row => [...row.children].map(cell => cell.innerText.replace(/\s+/g, ' ').trim()))
        ];
        downloadReportCsv(rows, `pizza-craft-buku-besar-${localDateValue(new Date())}.csv`, csvValue);
        return;
    }
    const sections = activeReportTab === 'cash-flow'
        ? [['Arus Kas', document.querySelector('.report-cash-flow-panel table')]]
        : activeReportTab === 'transactions'
            ? [
                ['Ringkasan Penjualan', document.querySelector('#report-sales-summary')?.closest('table')],
                ['Biaya Operasional', document.querySelector('#expense-table')?.closest('table')],
                ['Utang Belum Dibayar', document.querySelector('#payables-table')?.closest('table')]
            ]
            : [['Laba Rugi', document.querySelector('.report-profit-loss-panel table')]];
    const rows = [[`Pizza Craft — ${activeReportTab}`, currentFinancialReport.period, 'Mata uang: Rupiah'], []];
    if (activeReportTab === 'cash-flow') {
        rows.push(['Ringkasan Arus Kas']);
        document.querySelectorAll('#report-cash-summary > div').forEach(item => {
            rows.push([item.querySelector('span')?.innerText || '', item.querySelector('strong')?.innerText || '']);
        });
        rows.push([]);
    }
    if (activeReportTab === 'profit-loss' && currentFinancialReport.comparisonMetrics) {
        rows.push(['Perbandingan periode sebelumnya']);
        document.querySelectorAll('#financial-report-comparison .report-comparison-item').forEach(item => {
            rows.push([item.querySelector('span')?.innerText || '', item.querySelector('strong')?.innerText || '', item.querySelector('small')?.innerText || '']);
        });
        rows.push([]);
    }
    sections.forEach(([title, table]) => {
        if (!table) return;
        rows.push([title]);
        table.querySelectorAll(':scope > thead tr, :scope > tbody tr, :scope > tfoot tr').forEach(row => {
            rows.push([...row.children].map(cell => cell.innerText.replace(/\s+/g, ' ').trim()));
        });
        rows.push([]);
    });
    if (activeReportTab === 'profit-loss' && financialTrendChart) {
        rows.push(['Tren Harian (Rp)']);
        rows.push(['Tanggal', ...financialTrendChart.data.datasets.map(dataset => dataset.label)]);
        financialTrendChart.data.labels.forEach((label, index) => {
            rows.push([label, ...financialTrendChart.data.datasets.map(dataset => dataset.data[index])]);
        });
        rows.push(['Komposisi biaya operasional (Rp)']);
        rows.push(['Kategori', 'Nominal']);
        currentFinancialReport.expenseCategories.forEach(([category, amount]) => rows.push([category, amount]));
    }
    downloadReportCsv(rows, `pizza-craft-${activeReportTab}-${localDateValue(new Date())}.csv`, csvValue);
}

function downloadReportCsv(rows, filename, csvValue = value => `"${String(value).replace(/"/g, '""')}"`) {
    const csv = rows.map(row => row.map(csvValue).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

document.getElementById('financial-report-apply').addEventListener('click', applyFinancialFilters);
document.getElementById('financial-report-refresh').addEventListener('click', applyFinancialFilters);
document.getElementById('financial-report-reset').addEventListener('click', resetFinancialFilters);
document.getElementById('financial-report-export').addEventListener('click', exportVisibleFinancialReport);
document.getElementById('financial-report-print').addEventListener('click', () => window.print());
document.getElementById('report-month').addEventListener('change', () => {
    document.getElementById('report-range-mode').value = 'month';
    document.getElementById('accounting-month').value = document.getElementById('report-month').value;
    applyReportMonthToDates();
});
document.getElementById('financial-report-compare').addEventListener('change', event => {
    document.getElementById('report-compare-previous').checked = event.target.checked;
    applyFinancialFilters();
});
document.getElementById('report-compare-previous').addEventListener('change', event => {
    document.getElementById('financial-report-compare').checked = event.target.checked;
    applyFinancialFilters();
});
document.getElementById('accounting-report-export').addEventListener('click', exportVisibleFinancialReport);
document.getElementById('report-year').addEventListener('change', () => {
    document.getElementById('report-range-mode').value = 'month';
    document.getElementById('accounting-year').value = document.getElementById('report-year').value;
    applyReportMonthToDates();
});
document.getElementById('report-range-mode').addEventListener('change', event => {
    if (event.target.value === 'month') applyReportMonthToDates();
    updateReportDateMode();
});
['report-start-date', 'report-end-date'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
        document.getElementById('report-range-mode').value = 'custom';
    });
});
document.querySelectorAll('[data-report-tab]').forEach(button => {
    button.addEventListener('click', () => switchFinancialReportTab(button.dataset.reportTab));
});
document.getElementById('page-laporan').addEventListener('click', event => {
    const sourceButton = event.target.closest('[data-report-reference]');
    if (sourceButton) navigateToJournalReference(sourceButton.dataset.reportReference);
});
document.getElementById('menu-engineering-refresh').addEventListener('click', loadMenuEngineering);
document.getElementById('menu-engineering-apply').addEventListener('click', loadMenuEngineering);
document.getElementById('menu-engineering-period').addEventListener('change', event => {
    const customFields = document.querySelectorAll('.menu-engineering-custom-date');
    const isCustom = event.target.value === 'custom';
    customFields.forEach(field => { field.hidden = !isCustom; });
    if (isCustom) {
        const today = new Date();
        const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const start = new Date(end.getTime() - 6 * 86400000);
        document.getElementById('menu-engineering-start-date').value ||= dateInputValue(start);
        document.getElementById('menu-engineering-end-date').value ||= dateInputValue(end);
    } else {
        loadMenuEngineering();
    }
});
document.getElementById('menu-engineering-menu-filter').addEventListener('change', loadMenuEngineering);
document.getElementById('menu-engineering-table').addEventListener('click', event => {
    const button = event.target.closest('[data-menu-simulate]');
    if (button) openMenuEngineeringSimulation(button.dataset.menuSimulate);
});
document.getElementById('menu-simulation-price').addEventListener('input', updateMenuEngineeringSimulation);
document.getElementById('menu-simulation-target').addEventListener('input', updateMenuEngineeringSimulation);
document.getElementById('menu-simulation-save-target').addEventListener('click', () => {
    const target = Number(document.getElementById('menu-simulation-target').value);
    if (!Number.isFinite(target) || target <= 0 || target >= 100) {
        showToast('Target food cost harus antara 1% sampai 99%.', 'warning');
        return;
    }
    localStorage.setItem('menuEngineeringTargetFoodCost', String(target));
    showToast('Target food cost analisis tersimpan di perangkat ini.');
    updateMenuEngineeringSimulation();
});
document.getElementById('menu-simulation-reset').addEventListener('click', () => closeMenuEngineeringSimulation(true));
document.getElementById('menu-simulation-close').addEventListener('click', () => closeMenuEngineeringSimulation());
document.getElementById('accounting-journal-apply').addEventListener('click', () => {
    try {
        if (document.getElementById('accounting-start-date').value &&
            document.getElementById('accounting-end-date').value &&
            document.getElementById('accounting-start-date').value > document.getElementById('accounting-end-date').value) {
            throw new Error('Rentang tanggal jurnal tidak valid.');
        }
        document.getElementById('report-start-date').value = document.getElementById('accounting-start-date').value;
        document.getElementById('report-end-date').value = document.getElementById('accounting-end-date').value;
        document.getElementById('report-range-mode').value = 'custom';
        updateReportDateMode();
        loadFinancialReport();
        renderAccountingJournal();
    } catch (error) {
        showToast(error.message, 'warning');
    }
});
document.getElementById('accounting-account-filter').addEventListener('change', () => {
    try {
        renderAccountingJournal();
    } catch (error) {
        showToast(error.message, 'warning');
    }
});
document.getElementById('accounting-journal-search').addEventListener('input', () => {
    try {
        renderAccountingJournal();
    } catch (error) {
        showToast(error.message, 'warning');
    }
});
document.getElementById('accounting-journal-reset').addEventListener('click', () => {
    document.getElementById('accounting-month').value = document.getElementById('report-month').value;
    document.getElementById('accounting-year').value = document.getElementById('report-year').value;
    document.getElementById('accounting-account-filter').value = '';
    document.getElementById('accounting-journal-search').value = '';
    resetFinancialFilters();
});
['accounting-month', 'accounting-year'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
        document.getElementById('report-month').value = document.getElementById('accounting-month').value;
        document.getElementById('report-year').value = document.getElementById('accounting-year').value;
        document.getElementById('report-range-mode').value = 'month';
        applyReportMonthToDates();
    });
});
document.getElementById('accounting-journal-export').addEventListener('click', () => {
    try {
        if (document.getElementById('accounting-start-date').value &&
            document.getElementById('accounting-end-date').value &&
            document.getElementById('accounting-start-date').value > document.getElementById('accounting-end-date').value) {
            throw new Error('Rentang tanggal jurnal tidak valid.');
        }
        exportAccountingJournal();
    } catch (error) {
        showToast(error.message, 'warning');
    }
});
document.getElementById('accounting-journal-search').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('accounting-journal-apply').click();
    }
});

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
        await Promise.all([loadFinancialReport(), loadAccountingJournal()]);
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
        await Promise.all([loadFinancialReport(), loadAccountingJournal()]);
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
loadPosSalesHistory();
renderPosCart();
const dashboardToday = localDateValue(new Date());
document.getElementById('dashboard-start-date').value = dashboardToday;
document.getElementById('dashboard-end-date').value = dashboardToday;
const reportToday = new Date();
setReportPeriodOptions();
document.getElementById('report-start-date').value = localDateValue(new Date(reportToday.getFullYear(), reportToday.getMonth(), 1));
document.getElementById('report-end-date').value = localDateValue(reportToday);
updateReportDateMode();
applyAccountingPeriodFilter();
document.getElementById('accounting-month').value = document.getElementById('report-month').value;
document.getElementById('accounting-year').value = document.getElementById('report-year').value;
switchFinancialReportTab('profit-loss', false);
loadFinancialReport();
loadAccountingJournal();