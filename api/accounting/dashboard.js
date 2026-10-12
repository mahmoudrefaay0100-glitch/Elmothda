
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const SUPABASE_SERVICE_ROLE_KEY =
        process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
        !SUPABASE_URL ||
        !SUPABASE_ANON_KEY ||
        !SUPABASE_SERVICE_ROLE_KEY
    ) {
        return res.status(500).json({
            success: false,
            error: 'إعدادات Supabase غير مكتملة على الخادم.'
        });
    }

    try {
        // 1. قراءة Access Token
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'يرجى تسجيل الدخول أولاً.'
            });
        }

        // 2. التحقق من صحة التوكن لدى Supabase Auth
        const authResponse = await fetch(
            `${SUPABASE_URL}/auth/v1/user`,
            {
                method: 'GET',
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${token}`
                },
                cache: 'no-store'
            }
        );

        if (!authResponse.ok) {
            return res.status(401).json({
                success: false,
                error: 'جلسة الدخول غير صالحة أو انتهت. سجل الدخول مجدداً.'
            });
        }

        const user = await authResponse.json();

        if (!user?.id || !user?.email) {
            return res.status(401).json({
                success: false,
                error: 'تعذر التحقق من حساب المستخدم.'
            });
        }

        // 3. التحقق من صلاحية الأدمن
        // يجب ضبط ADMIN_EMAIL في Vercel على بريد الأدمن الفعلي.
        const ADMIN_EMAIL = String(
            process.env.ADMIN_EMAIL || ''
        ).trim().toLowerCase();

        if (
            !ADMIN_EMAIL ||
            String(user.email).trim().toLowerCase() !== ADMIN_EMAIL
        ) {
            return res.status(403).json({
                success: false,
                error: 'ليس لديك صلاحية الوصول إلى الحسابات.'
            });
        }

        // 4. تجهيز اتصال قاعدة البيانات على الخادم
        const dbHeaders = {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
        };

        async function readTable(table, select = '*') {
            const url =
                `${SUPABASE_URL}/rest/v1/${table}` +
                `?select=${encodeURIComponent(select)}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: dbHeaders,
                cache: 'no-store'
            });

            const text = await response.text();

            let data;
            try {
                data = text ? JSON.parse(text) : [];
            } catch {
                data = null;
            }

            if (!response.ok) {
                console.error(
                    'ACCOUNTING DASHBOARD DB ERROR:',
                    table,
                    response.status,
                    data
                );

                throw new Error(`تعذر قراءة جدول ${table}`);
            }

            return Array.isArray(data) ? data : [];
        }

        // 5. قراءة بيانات الحسابات
        const [
            salesInvoices,
            purchaseInvoices,
            orderCosts,
            receipts,
            supplierPayments,
            expenses
        ] = await Promise.all([
            readTable('accounting_sales_invoices'),
            readTable('accounting_purchase_invoices'),
            readTable('accounting_order_costs'),
            readTable('accounting_customer_receipts'),
            readTable('accounting_supplier_payments'),
            readTable('accounting_expenses')
        ]);

        // 6. تجميع الأرقام
        const money = value => {
            const n = Number(value ?? 0);
            return Number.isFinite(n) ? n : 0;
        };

        const confirmedSales = salesInvoices.filter(
            x => String(x.status).toLowerCase() === 'confirmed'
        );

        const confirmedPurchases = purchaseInvoices.filter(
            x => String(x.status).toLowerCase() === 'confirmed'
        );

        const totalSales = confirmedSales.reduce(
            (sum, x) => sum + money(x.total), 0
        );

        const totalReceipts = receipts.reduce(
            (sum, x) => sum + money(x.amount), 0
        );

        const totalPurchases = confirmedPurchases.reduce(
            (sum, x) => sum + money(x.total), 0
        );

        const totalSupplierPayments = supplierPayments.reduce(
            (sum, x) => sum + money(x.amount), 0
        );

        const totalOrderCosts = orderCosts.reduce(
            (sum, x) => sum + money(x.amount), 0
        );

        const totalExpenses = expenses.reduce(
            (sum, x) => sum + money(x.amount), 0
        );

        const customerReceivables = Math.max(
            0, totalSales - totalReceipts
        );

        const supplierPayables = Math.max(
            0, totalPurchases - totalSupplierPayments
        );

        // لا نخصم إجمالي المشتريات مرة أخرى من الأرباح
        // لأن تكلفة الخامات قد تكون مسجلة ضمن تكاليف الطلبات.
        const netProfit =
            totalSales - totalOrderCosts - totalExpenses;

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

    } catch (error) {
        console.error('ACCOUNTING DASHBOARD ERROR:', error);

        return res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء تحميل ملخص الحسابات.'
        });
    }
}
