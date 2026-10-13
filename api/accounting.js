export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY || !ADMIN_EMAIL) {
        return res.status(500).json({
            success: false,
            error: 'إعدادات Supabase أو ADMIN_EMAIL غير مكتملة على الخادم.'
        });
    }

    const money = value => {
        const n = Number(value ?? 0);
        return Number.isFinite(n) ? n : 0;
    };

    const text = value => String(value ?? '').trim();

    const fail = (message, status = 400) => {
        const error = new Error(message);
        error.status = status;
        throw error;
    };

    try {
        // التحقق من جلسة الأدمن
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'يرجى تسجيل الدخول أولاً.'
            });
        }

        const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token}`
            },
            cache: 'no-store'
        });

        if (!authResponse.ok) {
            return res.status(401).json({
                success: false,
                error: 'جلسة الدخول غير صالحة أو انتهت. سجل الدخول مجدداً.'
            });
        }

        const user = await authResponse.json();

        if (
            !user?.email ||
            String(user.email).trim().toLowerCase() !== ADMIN_EMAIL
        ) {
            return res.status(403).json({
                success: false,
                error: 'ليس لديك صلاحية الوصول إلى الحسابات.'
            });
        }

        // عمليات قاعدة البيانات من الخادم فقط
        async function db(table, method = 'GET', query = {}, body = null) {
            const params = new URLSearchParams();

            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined && value !== null && value !== '') {
                    params.set(key, String(value));
                }
            }

            const url = `${SUPABASE_URL}/rest/v1/${table}` +
                (params.toString() ? `?${params.toString()}` : '');

            const headers = {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json'
            };

            if (['POST', 'PATCH', 'DELETE'].includes(method)) {
                headers.Prefer = 'return=representation';
            }

            const response = await fetch(url, {
                method,
                headers,
                ...(body !== null ? { body: JSON.stringify(body) } : {}),
                cache: 'no-store'
            });

            const raw = await response.text();
            let data = null;

            try {
                data = raw ? JSON.parse(raw) : null;
            } catch {
                data = raw;
            }

            if (!response.ok) {
                console.error(
                    'ACCOUNTING DB ERROR',
                    table,
                    method,
                    response.status,
                    data
                );

                fail(
                    data?.message || data?.hint ||
                    `تعذر تنفيذ العملية على ${table}.`,
                    response.status >= 500 ? 500 : 400
                );
            }

            return data;
        }

        async function insertOne(table, row) {
            const result = await db(table, 'POST', {}, row);

            if (!Array.isArray(result) || !result[0]) {
                fail('لم يتم تأكيد حفظ البيانات.');
            }

            return result[0];
        }

        async function readRows(table, query = {}) {
            const result = await db(table, 'GET', query);
            return Array.isArray(result) ? result : [];
        }

        const action = text(req.query?.action || '');
        const body = req.body && typeof req.body === 'object' ? req.body : {};

        // ==================================================
        // GET: ملخص الحسابات
        // ==================================================
        if (req.method === 'GET') {
            if (!action || action === 'dashboard') {
                const [
                    salesInvoices,
                    purchaseInvoices,
                    orderCosts,
                    receipts,
                    supplierPayments,
                    expenses
                ] = await Promise.all([
                    readRows('accounting_sales_invoices'),
                    readRows('accounting_purchase_invoices'),
                    readRows('accounting_order_costs'),
                    readRows('accounting_customer_receipts'),
                    readRows('accounting_supplier_payments'),
                    readRows('accounting_expenses')
                ]);

                const roundMoney = value =>
                    Math.round((value + Number.EPSILON) * 100) / 100;

                const confirmedSales = salesInvoices.filter(
                    invoice =>
                        String(invoice.status || '').trim().toLowerCase() === 'confirmed'
                );

                const confirmedPurchases = purchaseInvoices.filter(
                    invoice =>
                        String(invoice.status || '').trim().toLowerCase() === 'confirmed'
                );

                const totalSales = roundMoney(
                    confirmedSales.reduce(
                        (sum, invoice) => sum + money(invoice.total), 0
                    )
                );

                const totalPurchases = roundMoney(
                    confirmedPurchases.reduce(
                        (sum, invoice) => sum + money(invoice.total), 0
                    )
                );

                const totalReceipts = roundMoney(
                    receipts.reduce(
                        (sum, receipt) => sum + money(receipt.amount), 0
                    )
                );

                const totalSupplierPayments = roundMoney(
                    supplierPayments.reduce(
                        (sum, payment) => sum + money(payment.amount), 0
                    )
                );

                const totalOrderCosts = roundMoney(
                    orderCosts.reduce(
                        (sum, cost) => sum + money(cost.amount), 0
                    )
                );

                const totalExpenses = roundMoney(
                    expenses.reduce(
                        (sum, expense) => sum + money(expense.amount), 0
                    )
                );

                const customerReceivables = roundMoney(
                    Math.max(0, totalSales - totalReceipts)
                );

                const supplierPayables = roundMoney(
                    Math.max(0, totalPurchases - totalSupplierPayments)
                );

                // صافي الربح التقديري لا يخصم الدفعات والتحصيلات مرة ثانية
                const netProfit = roundMoney(
                    totalSales - totalPurchases - totalExpenses
                );

                return res.status(200).json({
                    success: true,
                    dashboard: {
                        totalSales,
                        totalReceipts,
                        customerReceivables,
                        totalPurchases,
                        totalSupplierPayments,
                        supplierPayables,
                        totalOrderCosts,
                        totalExpenses,
                        netProfit,
                        counts: {
                            salesInvoices: confirmedSales.length,
                            purchaseInvoices: confirmedPurchases.length,
                            orderCosts: orderCosts.length,
                            receipts: receipts.length,
                            supplierPayments: supplierPayments.length,
                            expenses: expenses.length
                        }
                    }
                });
            }

            // سجل المصروفات
            if (action === 'expenses') {
                const rows = await readRows('accounting_expenses', {
                    select: '*',
                    order: 'expense_date.desc',
                    limit: 1000
                });

                const search = text(req.query?.search).toLowerCase();

                const filtered = search
                    ? rows.filter(expense => [
                        expense.recipient,
                        expense.description,
                        expense.category,
                        expense.reference_number,
                        expense.notes,
                        expense.payment_method,
                        expense.expense_date
                    ].some(value => text(value).toLowerCase().includes(search)))
                    : rows;

                return res.status(200).json({
                    success: true,
                    expenses: filtered,
                    count: filtered.length
                });
            }

            // قائمة فواتير المبيعات والمشتريات
            if (action === 'list') {
                const type = text(req.query?.type);

                if (!['sales', 'purchases'].includes(type)) {
                    fail('نوع الفواتير غير صحيح.');
                }

                const table = type === 'sales'
                    ? 'accounting_sales_invoices'
                    : 'accounting_purchase_invoices';

                const rows = await readRows(table, {
                    select: '*',
                    order: 'invoice_date.desc,created_at.desc',
                    limit: 500
                });

                const search = text(req.query?.search).toLowerCase();

                const filtered = search
                    ? rows.filter(row => [
                        row.invoice_number,
                        row.customer_name,
                        row.supplier_name,
                        row.customer_phone,
                        row.supplier_invoice_number
                    ].some(value => text(value).toLowerCase().includes(search)))
                    : rows;

                return res.status(200).json({
                    success: true,
                    invoices: filtered
                });
            }

            // تفاصيل فاتورة
            if (action === 'get') {
                const type = text(req.query?.type);
                const id = text(req.query?.id);

                if (!id || !['sales', 'purchases'].includes(type)) {
                    fail('رقم الفاتورة أو نوعها غير صحيح.');
                }

                const isSales = type === 'sales';

                const invoiceTable = isSales
                    ? 'accounting_sales_invoices'
                    : 'accounting_purchase_invoices';

                const invoiceRows = await readRows(invoiceTable, {
                    select: '*',
                    id: `eq.${id}`,
                    limit: 1
                });

                if (!invoiceRows.length) {
                    fail('الفاتورة غير موجودة.', 404);
                }

                const invoice = invoiceRows[0];

                const [items, payments] = await Promise.all([
                    readRows(
                        isSales
                            ? 'accounting_sales_invoice_items'
                            : 'accounting_purchase_invoice_items',
                        {
                            select: '*',
                            invoice_id: `eq.${id}`,
                            order: 'created_at.asc'
                        }
                    ),
                    readRows(
                        isSales
                            ? 'accounting_customer_receipts'
                            : 'accounting_supplier_payments',
                        {
                            select: '*',
                            [isSales ? 'sales_invoice_id' : 'purchase_invoice_id']:
                                `eq.${id}`,
                            order: isSales
                                ? 'receipt_date.desc'
                                : 'payment_date.desc'
                        }
                    )
                ]);

                const roundMoney = value =>
                    Math.round((value + Number.EPSILON) * 100) / 100;

                const paid = roundMoney(
                    payments.reduce(
                        (sum, payment) => sum + money(payment.amount), 0
                    )
                );

                return res.status(200).json({
                    success: true,
                    invoice,
                    items,
                    payments,
                    paid,
                    remaining: Math.max(
                        0,
                        roundMoney(money(invoice.total) - paid)
                    )
                });
            }

            return res.status(400).json({
                success: false,
                error: 'نوع طلب القراءة غير معروف.'
            });
        }

        // ==================================================
        // POST: العمليات التي تغيّر البيانات
        // ==================================================
        if (req.method === 'POST') {

            // ==================================================
            // حذف فاتورة مبيعات أو مشتريات
            // POST /api/accounting?action=delete-invoice
            // ==================================================
            if (action === 'delete-invoice') {
                const id = text(body.id);
                const type = text(body.type);

                if (!id || !['sales', 'purchases'].includes(type)) {
                    fail('رقم الفاتورة أو نوعها غير صحيح.');
                }

                const isSales = type === 'sales';

                const invoiceTable = isSales
                    ? 'accounting_sales_invoices'
                    : 'accounting_purchase_invoices';

                const itemsTable = isSales
                    ? 'accounting_sales_invoice_items'
                    : 'accounting_purchase_invoice_items';

                const paymentsTable = isSales
                    ? 'accounting_customer_receipts'
                    : 'accounting_supplier_payments';

                const paymentForeignKey = isSales
                    ? 'sales_invoice_id'
                    : 'purchase_invoice_id';

                // التأكد من وجود الفاتورة
                const invoices = await readRows(invoiceTable, {
                    select: 'id,invoice_number,total',
                    id: `eq.${id}`,
                    limit: 1
                });

                if (!invoices.length) {
                    fail('الفاتورة المطلوب حذفها غير موجودة.', 404);
                }

                // لا نحذف فاتورة مرتبطة بتحصيل أو دفعة مورد
                const payments = await readRows(paymentsTable, {
                    select: 'id,amount',
                    [paymentForeignKey]: `eq.${id}`,
                    limit: 1
                });

                if (payments.length) {
                    fail(
                        'لا يمكن حذف الفاتورة لوجود تحصيل أو دفعة مرتبطة بها. راجع الحركة المالية المرتبطة أولاً.',
                        409
                    );
                }

                // حذف أصناف الفاتورة
                await db(itemsTable, 'DELETE', {
                    invoice_id: `eq.${id}`
                });

                // حذف سجل الفاتورة بعد حذف الأصناف
                const deletedInvoices = await db(
                    invoiceTable,
                    'DELETE',
                    { id: `eq.${id}` }
                );

                if (
                    !Array.isArray(deletedInvoices) ||
                    deletedInvoices.length === 0
                ) {
                    fail(
                        'لم يتم تأكيد حذف الفاتورة. راجع قاعدة البيانات قبل إعادة المحاولة.'
                    );
                }

                return res.status(200).json({
                    success: true,
                    message: 'تم حذف الفاتورة بنجاح.',
                    deletedInvoice: deletedInvoices[0]
                });
            }

            // ==================================================
            // تعديل فاتورة مبيعات أو مشتريات
            // ==================================================
            if (action === 'update-sales' || action === 'update-purchase') {
                const isSales = action === 'update-sales';
                const id = text(body.id);

                if (!id) fail('رقم الفاتورة مطلوب للتعديل.');

                const name = text(
                    isSales ? body.customer_name : body.supplier_name
                );

                if (!name) {
                    fail(isSales ? 'اسم العميل مطلوب.' : 'اسم المورد مطلوب.');
                }

                if (!Array.isArray(body.items) || body.items.length === 0) {
                    fail('أضف صنفًا واحدًا على الأقل.');
                }

                const normalizedItems = body.items.map(item => {
                    const itemName = text(
                        item.item_name || item.product_name || item.name
                    );
                    const quantity = money(item.quantity);
                    const unitPrice = money(item.unit_price);

                    if (!itemName || quantity <= 0 || unitPrice < 0) {
                        fail('راجع أسماء الأصناف والكميات والأسعار.');
                    }

                    return {
                        ...item,
                        name: itemName,
                        quantity,
                        unit_price: unitPrice
                    };
                });

                const round = value =>
                    Math.round((value + Number.EPSILON) * 100) / 100;

                const subtotal = round(
                    normalizedItems.reduce(
                        (sum, item) => sum + item.quantity * item.unit_price,
                        0
                    )
                );

                const discount = money(body.discount);
                const extra = money(
                    isSales ? body.shipping_cost : body.additional_cost
                );

                if (discount < 0 || extra < 0 || discount > subtotal) {
                    fail('راجع الخصم والمصاريف الإضافية.');
                }

                const total = round(subtotal - discount + extra);

                const invoiceTable = isSales
                    ? 'accounting_sales_invoices'
                    : 'accounting_purchase_invoices';

                const itemsTable = isSales
                    ? 'accounting_sales_invoice_items'
                    : 'accounting_purchase_invoice_items';

                const paymentTable = isSales
                    ? 'accounting_customer_receipts'
                    : 'accounting_supplier_payments';

                const paymentForeignKey = isSales
                    ? 'sales_invoice_id'
                    : 'purchase_invoice_id';

                const invoices = await readRows(invoiceTable, {
                    select: '*',
                    id: `eq.${id}`,
                    limit: 1
                });

                if (!invoices.length) {
                    fail('الفاتورة المطلوب تعديلها غير موجودة.', 404);
                }

                const payments = await readRows(paymentTable, {
                    select: 'amount',
                    [paymentForeignKey]: `eq.${id}`
                });

                const paid = round(
                    payments.reduce(
                        (sum, payment) => sum + money(payment.amount), 0
                    )
                );

                if (paid > total + 0.001) {
                    fail(
                        `إجمالي الفاتورة الجديد (${total.toFixed(2)}) أقل من المدفوع سابقًا (${paid.toFixed(2)}). لا يمكن الحفظ قبل مراجعة الدفعات.`
                    );
                }

                const header = isSales
                    ? {
                        customer_name: name,
                        customer_phone: text(body.customer_phone) || null,
                        invoice_date: text(body.invoice_date) ||
                            invoices[0].invoice_date,
                        subtotal,
                        discount,
                        shipping_cost: extra,
                        total,
                        notes: text(body.notes) || null
                    }
                    : {
                        supplier_name: name,
                        supplier_invoice_number:
                            text(body.supplier_invoice_number) || null,
                        invoice_date: text(body.invoice_date) ||
                            invoices[0].invoice_date,
                        subtotal,
                        discount,
                        additional_cost: extra,
                        total,
                        notes: text(body.notes) || null
                    };

                const newRows = normalizedItems.map(item => {
                    const row = {
                        invoice_id: id,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        line_total: round(item.quantity * item.unit_price),
                        notes: text(item.notes) || null,
                        unit: text(item.unit) || 'قطعة',
                        category: text(item.category) || 'أخرى'
                    };

                    if (isSales) {
                        row.product_name = item.name;
                        row.product_id = text(item.product_id) || null;
                    } else {
                        row.item_name = item.name;
                    }

                    return row;
                });

                const insertedItems = await db(itemsTable, 'POST', {}, newRows);

                if (
                    !Array.isArray(insertedItems) ||
                    insertedItems.length !== newRows.length
                ) {
                    fail(
                        'لم يتم تأكيد حفظ كل الأصناف الجديدة. راجع الفاتورة قبل إعادة المحاولة.'
                    );
                }

                try {
                    const updatedRows = await db(
                        invoiceTable,
                        'PATCH',
                        { id: `eq.${id}` },
                        header
                    );

                    if (!Array.isArray(updatedRows) || !updatedRows.length) {
                        fail('لم يتم تأكيد تعديل بيانات الفاتورة.');
                    }

                    const oldItems = await readRows(itemsTable, {
                        select: 'id',
                        invoice_id: `eq.${id}`
                    });

                    const newIds = new Set(
                        insertedItems.map(item => String(item.id))
                    );

                    const oldIds = oldItems
                        .filter(item => !newIds.has(String(item.id)))
                        .map(item => item.id);

                    for (const oldId of oldIds) {
                        await db(itemsTable, 'DELETE', {
                            id: `eq.${oldId}`,
                            invoice_id: `eq.${id}`
                        });
                    }
                } catch (error) {
                    console.error('ACCOUNTING INVOICE UPDATE ERROR:', error);
                    throw new Error(
                        'تعذر إكمال تعديل الفاتورة. راجع الفاتورة وأصنافها في قاعدة البيانات قبل إعادة المحاولة.'
                    );
                }

                return res.status(200).json({
                    success: true,
                    message: 'تم تعديل الفاتورة بنجاح.',
                    invoice: { ...invoices[0], ...header, id },
                    subtotal,
                    discount,
                    extra,
                    total,
                    paid,
                    remaining: round(total - paid)
                });
            }

            // ==================================================
            // إنشاء فاتورة مبيعات أو مشتريات
            // ==================================================
            if (action === 'create-sales' || action === 'create-purchase') {
                const isSales = action === 'create-sales';
                const items = body.items;
                const name = text(
                    isSales ? body.customer_name : body.supplier_name
                );

                if (!name) {
                    fail(isSales ? 'اسم العميل مطلوب.' : 'اسم المورد مطلوب.');
                }

                if (!Array.isArray(items) || items.length === 0) {
                    fail('أضف صنفًا واحدًا على الأقل.');
                }

                const normalizedItems = items.map(item => {
                    const itemName = text(
                        item.item_name || item.product_name || item.name
                    );
                    const quantity = money(item.quantity);
                    const unitPrice = money(item.unit_price);

                    if (!itemName || quantity <= 0 || unitPrice < 0) {
                        fail('راجع أسماء الأصناف والكميات والأسعار.');
                    }

                    return {
                        ...item,
                        name: itemName,
                        quantity,
                        unit_price: unitPrice
                    };
                });

                const subtotal = Math.round(
                    normalizedItems.reduce(
                        (sum, item) => sum + item.quantity * item.unit_price,
                        0
                    ) * 100
                ) / 100;

                const discount = money(body.discount);
                const extra = money(
                    isSales ? body.shipping_cost : body.additional_cost
                );

                if (discount < 0 || extra < 0 || discount > subtotal) {
                    fail('راجع قيمة الخصم والمصاريف الإضافية.');
                }

                const total = Math.round(
                    (subtotal - discount + extra) * 100
                ) / 100;

                const initialPaid = money(body.initial_paid);

                if (initialPaid < 0 || initialPaid > total) {
                    fail('المبلغ المدفوع غير صحيح.');
                }

                const invoiceNumber = text(body.invoice_number) ||
                    `${isSales ? 'SAL' : 'PUR'}-${Date.now()}`;

                const invoiceDate = text(body.invoice_date) ||
                    new Date().toISOString().slice(0, 10);

                const header = isSales
                    ? {
                        invoice_number: invoiceNumber,
                        customer_name: name,
                        customer_phone: text(body.customer_phone) || null,
                        invoice_date: invoiceDate,
                        subtotal,
                        discount,
                        shipping_cost: extra,
                        total,
                        notes: text(body.notes) || null,
                        status: 'confirmed'
                    }
                    : {
                        invoice_number: invoiceNumber,
                        supplier_name: name,
                        supplier_invoice_number:
                            text(body.supplier_invoice_number) || null,
                        invoice_date: invoiceDate,
                        subtotal,
                        discount,
                        additional_cost: extra,
                        total,
                        notes: text(body.notes) || null,
                        status: 'confirmed'
                    };

                const invoiceTable = isSales
                    ? 'accounting_sales_invoices'
                    : 'accounting_purchase_invoices';

                const itemsTable = isSales
                    ? 'accounting_sales_invoice_items'
                    : 'accounting_purchase_invoice_items';

                const invoice = await insertOne(invoiceTable, header);

                try {
                    const rows = normalizedItems.map(item => {
                        const row = {
                            invoice_id: invoice.id,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            line_total: Math.round(
                                item.quantity * item.unit_price * 100
                            ) / 100,
                            notes: text(item.notes) || null,
                            unit: text(item.unit) || 'قطعة',
                            category: text(item.category) || 'أخرى'
                        };

                        if (isSales) {
                            row.product_name = item.name;
                            row.product_id = text(item.product_id) || null;
                        } else {
                            row.item_name = item.name;
                        }

                        return row;
                    });

                    await db(itemsTable, 'POST', {}, rows);

                    if (initialPaid > 0) {
                        const paymentMethod = text(body.payment_method) || 'كاش';
                        const paymentDate = text(body.payment_date) || invoiceDate;

                        if (isSales) {
                            await insertOne('accounting_customer_receipts', {
                                customer_name: name,
                                customer_id: invoice.customer_id || null,
                                sales_invoice_id: invoice.id,
                                receipt_date: paymentDate,
                                amount: initialPaid,
                                payment_method: paymentMethod,
                                reference_number:
                                    text(body.reference_number) || null,
                                notes: 'دفعة عند إنشاء الفاتورة'
                            });
                        } else {
                            await insertOne('accounting_supplier_payments', {
                                supplier_name: name,
                                supplier_id: invoice.supplier_id || null,
                                purchase_invoice_id: invoice.id,
                                payment_date: paymentDate,
                                amount: initialPaid,
                                payment_method: paymentMethod,
                                reference_number:
                                    text(body.reference_number) || null,
                                notes: 'دفعة عند إنشاء الفاتورة'
                            });
                        }
                    }
                } catch (saveError) {
                    console.error('INVOICE ITEMS/PAYMENT SAVE ERROR', saveError);
                    throw new Error(
                        'تم إنشاء سجل الفاتورة، لكن تعذر تأكيد حفظ كل الأصناف أو الدفعة. راجع الفاتورة في Supabase قبل إعادة المحاولة.'
                    );
                }

                return res.status(201).json({
                    success: true,
                    message: 'تم حفظ الفاتورة.',
                    invoice,
                    subtotal,
                    discount,
                    extra,
                    total,
                    paid: initialPaid,
                    remaining: total - initialPaid
                });
            }

            // ==================================================
            // تحصيل من عميل أو دفعة لمورد
            // ==================================================
            if (action === 'receipt' || action === 'supplier-payment') {
                const isReceipt = action === 'receipt';
                const amount = money(body.amount);
                const name = text(
                    isReceipt ? body.customer_name : body.supplier_name
                );
                const invoiceId = text(body.invoice_id);

                if (!name) fail('اسم العميل أو المورد مطلوب.');
                if (amount <= 0) fail('المبلغ لازم يكون أكبر من صفر.');
                if (!invoiceId) fail('اختَر الفاتورة المرتبطة بالدفعة.');

                const invoiceTable = isReceipt
                    ? 'accounting_sales_invoices'
                    : 'accounting_purchase_invoices';

                const invoices = await readRows(invoiceTable, {
                    select: '*',
                    id: `eq.${invoiceId}`,
                    limit: 1
                });

                if (!invoices.length) {
                    fail('الفاتورة المرتبطة بالدفعة غير موجودة.', 404);
                }

                const invoice = invoices[0];

                const paymentTable = isReceipt
                    ? 'accounting_customer_receipts'
                    : 'accounting_supplier_payments';

                const foreignKey = isReceipt
                    ? 'sales_invoice_id'
                    : 'purchase_invoice_id';

                const existingPayments = await readRows(paymentTable, {
                    select: 'amount',
                    [foreignKey]: `eq.${invoiceId}`
                });

                const alreadyPaid = existingPayments.reduce(
                    (sum, payment) => sum + money(payment.amount), 0
                );

                const remaining = money(invoice.total) - alreadyPaid;

                if (amount > remaining + 0.001) {
                    fail(
                        `قيمة الدفعة أكبر من المتبقي على الفاتورة (${Math.max(0, remaining).toFixed(2)}).`
                    );
                }

                const payment = isReceipt
                    ? {
                        customer_name: name,
                        customer_id: invoice.customer_id || null,
                        sales_invoice_id: invoiceId,
                        order_number: invoice.order_number || null,
                        receipt_date: text(body.payment_date) ||
                            new Date().toISOString().slice(0, 10),
                        amount,
                        payment_method: text(body.payment_method) || 'كاش',
                        reference_number:
                            text(body.reference_number) || null,
                        notes: text(body.notes) || null
                    }
                    : {
                        supplier_name: name,
                        supplier_id: invoice.supplier_id || null,
                        purchase_invoice_id: invoiceId,
                        payment_date: text(body.payment_date) ||
                            new Date().toISOString().slice(0, 10),
                        amount,
                        payment_method: text(body.payment_method) || 'كاش',
                        reference_number:
                            text(body.reference_number) || null,
                        notes: text(body.notes) || null
                    };

                const saved = await insertOne(paymentTable, payment);

                return res.status(201).json({
                    success: true,
                    message: 'تم تسجيل الدفعة.',
                    payment: saved,
                    paid: alreadyPaid + amount,
                    remaining: Math.max(
                        0,
                        money(invoice.total) - alreadyPaid - amount
                    )
                });
            }

            // ==================================================
            // تسجيل مصروف
            // ==================================================
            if (action === 'expense') {
                const description = text(body.description);
                const amount = money(body.amount);

                if (!description) fail('وصف المصروف مطلوب.');
                if (amount <= 0) {
                    fail('قيمة المصروف يجب أن تكون أكبر من صفر.');
                }

                const expense = await insertOne('accounting_expenses', {
                    expense_date: text(body.expense_date) ||
                        new Date().toISOString().slice(0, 10),
                    category: text(body.category) || 'other',
                    description,
                    recipient: text(body.recipient) || null,
                    amount,
                    payment_method: text(body.payment_method) || 'كاش',
                    reference_number: text(body.reference_number) || null,
                    notes: text(body.notes) || null
                });

                return res.status(201).json({
                    success: true,
                    message: 'تم تسجيل المصروف.',
                    expense
                });
            }

            // ==================================================
            // تعديل مصروف
            // ==================================================
            if (action === 'update-expense') {
                const id = text(body.id);
                const description = text(body.description);
                const amount = money(body.amount);
                const expenseDate = text(body.expense_date);
                const category = text(body.category) || 'other';

                if (!id) fail('رقم المصروف مطلوب للتعديل.');
                if (!description) fail('وصف المصروف مطلوب.');
                if (amount <= 0) {
                    fail('قيمة المصروف يجب أن تكون أكبر من صفر.');
                }

                if (
                    !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) ||
                    Number.isNaN(Date.parse(expenseDate))
                ) {
                    fail('تاريخ المصروف غير صحيح.');
                }

                const existing = await readRows('accounting_expenses', {
                    select: 'id',
                    id: `eq.${id}`,
                    limit: 1
                });

                if (!existing.length) {
                    fail('المصروف المطلوب تعديله غير موجود.', 404);
                }

                const updatedRows = await db(
                    'accounting_expenses',
                    'PATCH',
                    { id: `eq.${id}` },
                    {
                        expense_date: expenseDate,
                        category,
                        description,
                        recipient: text(body.recipient) || null,
                        amount,
                        payment_method: text(body.payment_method) || 'كاش',
                        reference_number: text(body.reference_number) || null,
                        notes: text(body.notes) || null
                    }
                );

                if (!Array.isArray(updatedRows) || !updatedRows.length) {
                    fail('لم يتم تأكيد تعديل المصروف.');
                }

                return res.status(200).json({
                    success: true,
                    message: 'تم تعديل المصروف بنجاح.',
                    expense: updatedRows[0]
                });
            }

            // ==================================================
            // حذف مصروف
            // ==================================================
            if (action === 'delete-expense') {
                const id = text(body.id);

                if (!id) fail('رقم المصروف مطلوب للحذف.');

                const existing = await readRows('accounting_expenses', {
                    select: 'id,description,amount',
                    id: `eq.${id}`,
                    limit: 1
                });

                if (!existing.length) {
                    fail('المصروف المطلوب حذفه غير موجود.', 404);
                }

                const deletedRows = await db(
                    'accounting_expenses',
                    'DELETE',
                    { id: `eq.${id}` }
                );

                if (!Array.isArray(deletedRows) || !deletedRows.length) {
                    fail(
                        'لم يتم تأكيد حذف المصروف. تحقق من صلاحيات قاعدة البيانات.'
                    );
                }

                return res.status(200).json({
                    success: true,
                    message: 'تم حذف المصروف بنجاح.',
                    deletedExpense: deletedRows[0]
                });
            }
        }

        return res.status(405).json({
            success: false,
            error: 'الطريقة غير مدعومة حاليًا.'
        });

    } catch (error) {
        console.error('ACCOUNTING API ERROR:', error);

        return res.status(error.status || 500).json({
            success: false,
            error: error.message || 'حدث خطأ أثناء تنفيذ عملية الحسابات.'
        });
    }
}
