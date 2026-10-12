
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

        // كل عمليات قاعدة البيانات تتم من الخادم فقط
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

            if (method === 'POST') {
                headers.Prefer = 'return=representation';
            } else if (method === 'PATCH') {
                headers.Prefer = 'return=representation';
            } else if (method === 'DELETE') {
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
                console.error('ACCOUNTING DB ERROR', table, method, response.status, data);
                fail(
                    data?.message || data?.hint || `تعذر تنفيذ العملية على ${table}.`,
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

        async function replaceItems(table, invoiceId, items, type) {
            if (!Array.isArray(items) || items.length === 0) {
                fail('أضف صنفًا واحدًا على الأقل إلى الفاتورة.');
            }

            const rows = items.map(item => {
                const name = text(item.item_name || item.product_name || item.name);
                const quantity = money(item.quantity);
                const unitPrice = money(item.unit_price);

                if (!name) fail('اسم أحد الأصناف فارغ.');
                if (quantity <= 0) fail(`الكمية غير صحيحة للصنف: ${name}`);
                if (unitPrice < 0) fail(`السعر غير صحيح للصنف: ${name}`);

                const row = {
                    invoice_id: invoiceId,
                    quantity,
                    unit_price: unitPrice,
                    line_total: Math.round(quantity * unitPrice * 100) / 100,
                    notes: text(item.notes) || null,
                    unit: text(item.unit) || 'قطعة',
                    category: text(item.category) || 'أخرى'
                };

                if (type === 'sales') {
                    row.product_name = name;
                    row.product_id = text(item.product_id) || null;
                } else {
                    row.item_name = name;
                }

                return row;
            });

            return db(table, 'POST', {}, rows);
        }

        const action = text(req.query?.action || '');
        const body = req.body && typeof req.body === 'object' ? req.body : {};

        // ==================================================
        // GET: ملخص الحسابات الحالي
        // GET: قائمة الفواتير
        // GET: تفاصيل فاتورة واحدة
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

                const confirmedSales = salesInvoices.filter(
                    x => String(x.status).toLowerCase() === 'confirmed'
                );
                const confirmedPurchases = purchaseInvoices.filter(
                    x => String(x.status).toLowerCase() === 'confirmed'
                );

                const totalSales = confirmedSales.reduce((s, x) => s + money(x.total), 0);
                const totalReceipts = receipts.reduce((s, x) => s + money(x.amount), 0);
                const totalPurchases = confirmedPurchases.reduce((s, x) => s + money(x.total), 0);
                const totalSupplierPayments = supplierPayments.reduce((s, x) => s + money(x.amount), 0);
                const totalOrderCosts = orderCosts.reduce((s, x) => s + money(x.amount), 0);
                const totalExpenses = expenses.reduce((s, x) => s + money(x.amount), 0);

                return res.status(200).json({
                    success: true,
                    dashboard: {
                        totalSales,
                        totalReceipts,
                        customerReceivables: Math.max(0, totalSales - totalReceipts),
                        totalPurchases,
                        totalSupplierPayments,
                        supplierPayables: Math.max(0, totalPurchases - totalSupplierPayments),
                        totalOrderCosts,
                        totalExpenses,
                        netProfit: totalSales - totalOrderCosts - totalExpenses,
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

            if (action === 'list') {
                const type = text(req.query?.type);
                if (!['sales', 'purchases'].includes(type)) {
                    fail('نوع الفواتير غير صحيح.');
                }

                const isSales = type === 'sales';
                const table = isSales
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

                return res.status(200).json({ success: true, invoices: filtered });
            }

            if (action === 'get') {
                const type = text(req.query?.type);
                const id = text(req.query?.id);

                if (!id || !['sales', 'purchases'].includes(type)) {
                    fail('رقم الفاتورة أو نوعها غير صحيح.');
                }

                const isSales = type === 'sales';
                const table = isSales
                    ? 'accounting_sales_invoices'
                    : 'accounting_purchase_invoices';

                const invoiceRows = await readRows(table, {
                    select: '*',
                    id: `eq.${id}`,
                    limit: 1
                });

                if (!invoiceRows.length) fail('الفاتورة غير موجودة.', 404);

                const invoice = invoiceRows[0];

                const [items, payments] = await Promise.all([
                    readRows(
                        isSales
                            ? 'accounting_sales_invoice_items'
                            : 'accounting_purchase_invoice_items',
                        { select: '*', invoice_id: `eq.${id}`, order: 'created_at.asc' }
                    ),
                    readRows(
                        isSales
                            ? 'accounting_customer_receipts'
                            : 'accounting_supplier_payments',
                        {
                            select: '*',
                            [isSales ? 'sales_invoice_id' : 'purchase_invoice_id']: `eq.${id}`,
                            order: isSales ? 'receipt_date.desc' : 'payment_date.desc'
                        }
                    )
                ]);

                const paid = payments.reduce((sum, payment) => sum + money(payment.amount), 0);

                return res.status(200).json({
                    success: true,
                    invoice,
                    items,
                    payments,
                    paid,
                    remaining: Math.max(0, money(invoice.total) - paid)
                });
            }

            return res.status(400).json({
                success: false,
                error: 'نوع طلب القراءة غير معروف.'
            });
        }

        // ==================================================
        // POST: إنشاء فاتورة مبيعات أو مشتريات
        // POST: تحصيل من عميل أو دفعة لمورد أو مصروف
        // ==================================================
        if (req.method === 'POST') {
            if (action === 'create-sales' || action === 'create-purchase') {
                const isSales = action === 'create-sales';
                const type = isSales ? 'sales' : 'purchases';
                const items = body.items;
                const name = text(isSales ? body.customer_name : body.supplier_name);

                if (!name) fail(isSales ? 'اسم العميل مطلوب.' : 'اسم المورد مطلوب.');

                if (!Array.isArray(items) || items.length === 0) {
                    fail('أضف صنفًا واحدًا على الأقل.');
                }

                const normalizedItems = items.map(item => {
                    const itemName = text(item.item_name || item.product_name || item.name);
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

                const subtotal = Math.round(normalizedItems.reduce(
                    (sum, item) => sum + item.quantity * item.unit_price, 0
                ) * 100) / 100;

                const discount = money(body.discount);
                const extra = money(isSales ? body.shipping_cost : body.additional_cost);

                if (discount < 0 || extra < 0 || discount > subtotal) {
                    fail('راجع قيمة الخصم والمصاريف الإضافية.');
                }

                const total = Math.round((subtotal - discount + extra) * 100) / 100;
                const initialPaid = money(body.initial_paid);

                if (initialPaid < 0 || initialPaid > total) {
                    fail('المبلغ المدفوع غير صحيح.');
                }

                const invoiceNumber = text(body.invoice_number) ||
                    `${isSales ? 'SAL' : 'PUR'}-${Date.now()}`;

                const header = isSales
                    ? {
                        invoice_number: invoiceNumber,
                        customer_name: name,
                        customer_phone: text(body.customer_phone) || null,
                        invoice_date: text(body.invoice_date) || new Date().toISOString().slice(0, 10),
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
                        supplier_invoice_number: text(body.supplier_invoice_number) || null,
                        invoice_date: text(body.invoice_date) || new Date().toISOString().slice(0, 10),
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
                            line_total: Math.round(item.quantity * item.unit_price * 100) / 100,
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

                        if (isSales) {
                            await insertOne('accounting_customer_receipts', {
                                customer_name: name,
                                customer_id: invoice.customer_id || null,
                                sales_invoice_id: invoice.id,
                                receipt_date: text(body.payment_date) || header.invoice_date,
                                amount: initialPaid,
                                payment_method: paymentMethod,
                                reference_number: text(body.reference_number) || null,
                                notes: 'دفعة عند إنشاء الفاتورة'
                            });
                        } else {
                            await insertOne('accounting_supplier_payments', {
                                supplier_name: name,
                                supplier_id: invoice.supplier_id || null,
                                purchase_invoice_id: invoice.id,
                                payment_date: text(body.payment_date) || header.invoice_date,
                                amount: initialPaid,
                                payment_method: paymentMethod,
                                reference_number: text(body.reference_number) || null,
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

            if (action === 'receipt' || action === 'supplier-payment') {
                const isReceipt = action === 'receipt';
                const amount = money(body.amount);
                const name = text(isReceipt ? body.customer_name : body.supplier_name);
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

                if (!invoices.length) fail('الفاتورة المرتبطة بالدفعة غير موجودة.', 404);

                const invoice = invoices[0];
                const paymentTable = isReceipt
                    ? 'accounting_customer_receipts'
                    : 'accounting_supplier_payments';

                const foreignKey = isReceipt ? 'sales_invoice_id' : 'purchase_invoice_id';
                const existingPayments = await readRows(paymentTable, {
                    select: 'amount',
                    [foreignKey]: `eq.${invoiceId}`
                });

                const alreadyPaid = existingPayments.reduce((sum, p) => sum + money(p.amount), 0);
                const remaining = money(invoice.total) - alreadyPaid;

                if (amount > remaining + 0.001) {
                    fail(`قيمة الدفعة أكبر من المتبقي على الفاتورة (${Math.max(0, remaining).toFixed(2)}).`);
                }

                const payment = isReceipt
                    ? {
                        customer_name: name,
                        customer_id: invoice.customer_id || null,
                        sales_invoice_id: invoiceId,
                        order_number: invoice.order_number || null,
                        receipt_date: text(body.payment_date) || new Date().toISOString().slice(0, 10),
                        amount,
                        payment_method: text(body.payment_method) || 'كاش',
                        reference_number: text(body.reference_number) || null,
                        notes: text(body.notes) || null
                    }
                    : {
                        supplier_name: name,
                        supplier_id: invoice.supplier_id || null,
                        purchase_invoice_id: invoiceId,
                        payment_date: text(body.payment_date) || new Date().toISOString().slice(0, 10),
                        amount,
                        payment_method: text(body.payment_method) || 'كاش',
                        reference_number: text(body.reference_number) || null,
                        notes: text(body.notes) || null
                    };

                const saved = await insertOne(paymentTable, payment);

                return res.status(201).json({
                    success: true,
                    message: 'تم تسجيل الدفعة.',
                    payment: saved,
                    paid: alreadyPaid + amount,
                    remaining: Math.max(0, money(invoice.total) - alreadyPaid - amount)
                });
            }

            if (action === 'expense') {
                const description = text(body.description);
                const amount = money(body.amount);

                if (!description) fail('وصف المصروف مطلوب.');
                if (amount <= 0) fail('قيمة المصروف يجب أن تكون أكبر من صفر.');

                const expense = await insertOne('accounting_expenses', {
                    expense_date: text(body.expense_date) || new Date().toISOString().slice(0, 10),
                    category: text(body.category) || 'other',
                    description,
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

            return res.status(400).json({
                success: false,
                error: 'نوع عملية الحفظ غير معروف.'
            });
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
