module.exports = async function handler(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY =
        process.env.SUPABASE_SERVICE_ROLE_KEY;

    const ADMIN_EMAIL =
        process.env.ADMIN_EMAIL || 'admin@elmothda.com';

    res.setHeader('Cache-Control', 'no-store, max-age=0');

    res.setHeader(
        'Allow',
        'GET, POST, PUT, DELETE'
    );

    // =====================================================
    // أدوات مساعدة
    // =====================================================

    function sendError(status, message, extra = {}) {
        return res.status(status).json({
            success: false,
            error: message,
            ...extra
        });
    }

    function parseJson(text, fallback = null) {
        if (!text) return fallback;

        try {
            return JSON.parse(text);
        } catch {
            return fallback;
        }
    }

    async function readResponse(response) {
        const text = await response.text();

        return {
            text,
            data: parseJson(text, null)
        };
    }

    function getSupabaseError(data, fallback) {
        if (!data || typeof data !== 'object') {
            return fallback;
        }

        return (
            data.message ||
            data.error_description ||
            data.details ||
            data.hint ||
            data.error ||
            fallback
        );
    }

    function getBody() {
        if (req.body && typeof req.body === 'object') {
            return req.body;
        }

        if (typeof req.body === 'string') {
            return parseJson(req.body, {});
        }

        return {};
    }

    function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(
            object,
            key
        );
    }

    function isEmpty(value) {
        return (
            value === undefined ||
            value === null ||
            String(value).trim() === ''
        );
    }

    function normalizePrice(value, fieldName) {
        if (
            value === '' ||
            value === undefined ||
            value === null
        ) {
            return null;
        }

        const number = Number(value);

        if (!Number.isFinite(number) || number < 0) {
            throw new Error(
                `قيمة ${fieldName} غير صحيحة`
            );
        }

        return number;
    }

    function normalizeSortOrder(value) {
        if (
            value === '' ||
            value === undefined ||
            value === null
        ) {
            return 0;
        }

        const number = Number(value);

        if (!Number.isFinite(number)) {
            throw new Error(
                'ترتيب العرض غير صحيح'
            );
        }

        return number;
    }

    function normalizeDate(value, fieldName) {
        if (
            value === '' ||
            value === undefined ||
            value === null
        ) {
            return null;
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            throw new Error(
                `تاريخ ${fieldName} غير صحيح`
            );
        }

        return value;
    }

    function buildOfferData(body, isUpdate = false) {
        const data = {};

        const fields = [
            'title',
            'description',
            'image_url',
            'old_price',
            'offer_price',
            'button_text',
            'button_link',
            'start_date',
            'end_date',
            'is_active',
            'show_popup',
            'show_homepage',
            'sort_order'
        ];

        // في التعديل لا نغيّر الحقول التي لم تُرسل.
        // في الإضافة نحافظ على القيم الافتراضية الأصلية.
        for (const field of fields) {
            if (isUpdate && !hasOwn(body, field)) {
                continue;
            }

            if (!isUpdate && !hasOwn(body, field)) {
                continue;
            }

            const value = body[field];

            switch (field) {
                case 'title':
                case 'description':
                case 'image_url':
                case 'button_link':
                    data[field] =
                        value === null ? '' : String(value ?? '');
                    break;

                case 'button_text':
                    data[field] =
                        isEmpty(value)
                            ? 'اطلب العرض'
                            : String(value);
                    break;

                case 'old_price':
                    data[field] = normalizePrice(
                        value,
                        'السعر القديم'
                    );
                    break;

                case 'offer_price':
                    data[field] = normalizePrice(
                        value,
                        'سعر العرض'
                    );
                    break;

                case 'start_date':
                    data[field] = normalizeDate(
                        value,
                        'بداية العرض'
                    );
                    break;

                case 'end_date':
                    data[field] = normalizeDate(
                        value,
                        'نهاية العرض'
                    );
                    break;

                case 'is_active':
                case 'show_popup':
                case 'show_homepage':
                    if (typeof value !== 'boolean') {
                        throw new Error(
                            `قيمة ${field} يجب أن تكون true أو false`
                        );
                    }

                    data[field] = value;
                    break;

                case 'sort_order':
                    data[field] =
                        normalizeSortOrder(value);
                    break;
            }
        }

        // الحفاظ على القيم الافتراضية عند إنشاء عرض جديد.
        if (!isUpdate) {
            if (!hasOwn(data, 'title')) {
                data.title = '';
            }

            if (!hasOwn(data, 'description')) {
                data.description = '';
            }

            if (!hasOwn(data, 'image_url')) {
                data.image_url = '';
            }

            if (!hasOwn(data, 'old_price')) {
                data.old_price = null;
            }

            if (!hasOwn(data, 'offer_price')) {
                data.offer_price = null;
            }

            if (!hasOwn(data, 'button_text')) {
                data.button_text = 'اطلب العرض';
            }

            if (!hasOwn(data, 'button_link')) {
                data.button_link = '';
            }

            if (!hasOwn(data, 'start_date')) {
                data.start_date = null;
            }

            if (!hasOwn(data, 'end_date')) {
                data.end_date = null;
            }

            if (!hasOwn(data, 'is_active')) {
                data.is_active = true;
            }

            if (!hasOwn(data, 'show_popup')) {
                data.show_popup = true;
            }

            if (!hasOwn(data, 'show_homepage')) {
                data.show_homepage = true;
            }

            if (!hasOwn(data, 'sort_order')) {
                data.sort_order = 0;
            }
        }

        // لا تسمح بتحديد تاريخ نهاية يسبق تاريخ البداية.
        const startValue = hasOwn(data, 'start_date')
            ? data.start_date
            : undefined;

        const endValue = hasOwn(data, 'end_date')
            ? data.end_date
            : undefined;

        if (startValue && endValue) {
            const start = new Date(startValue);
            const end = new Date(endValue);

            if (
                !Number.isNaN(start.getTime()) &&
                !Number.isNaN(end.getTime()) &&
                end < start
            ) {
                throw new Error(
                    'تاريخ نهاية العرض يجب أن يكون بعد تاريخ بدايته'
                );
            }
        }

        return data;
    }

    function getIdFilter(id) {
        return (
            SUPABASE_URL +
            '/rest/v1/offers?id=eq.' +
            encodeURIComponent(String(id))
        );
    }

    function supabaseHeaders(extra = {}) {
        return {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization:
                'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
            ...extra
        };
    }

    function isOfferVisibleNow(offer) {
        if (!offer || offer.is_active === false) {
            return false;
        }

        const now = Date.now();

        if (offer.start_date) {
            const start = new Date(
                offer.start_date
            ).getTime();

            if (
                Number.isFinite(start) &&
                start > now
            ) {
                return false;
            }
        }

        if (offer.end_date) {
            const endText = String(
                offer.end_date
            ).trim();

            // لو تاريخ النهاية من نوع YYYY-MM-DD،
            // اعتبر اليوم كاملًا ضمن مدة العرض.
            const endDate = /^\d{4}-\d{2}-\d{2}$/.test(
                endText
            )
                ? new Date(endText + 'T23:59:59.999')
                : new Date(endText);

            const end = endDate.getTime();

            if (
                Number.isFinite(end) &&
                end < now
            ) {
                return false;
            }
        }

        return true;
    }

    function comparableValue(value) {
        if (value === undefined) {
            return undefined;
        }

        if (value === null || value === '') {
            return null;
        }

        if (typeof value === 'boolean') {
            return value;
        }

        if (
            typeof value === 'number' ||
            (
                typeof value === 'string' &&
                value.trim() !== '' &&
                Number.isFinite(Number(value))
            )
        ) {
            return Number(value);
        }

        if (typeof value === 'string') {
            const date = new Date(value);

            if (
                /^\d{4}-\d{2}-\d{2}/.test(value) &&
                !Number.isNaN(date.getTime())
            ) {
                return date.getTime();
            }

            return value;
        }

        return value;
    }

    function updateMatches(savedOffer, updateData) {
        if (!savedOffer || typeof savedOffer !== 'object') {
            return false;
        }

        for (const key of Object.keys(updateData)) {
            const expected = comparableValue(
                updateData[key]
            );

            const actual = comparableValue(
                savedOffer[key]
            );

            if (expected !== actual) {
                return false;
            }
        }

        return true;
    }

    // =====================================================
    // التحقق من إعدادات Supabase
    // =====================================================

    if (
        !SUPABASE_URL ||
        !SUPABASE_SERVICE_ROLE_KEY
    ) {
        return sendError(
            500,
            'إعدادات Supabase غير موجودة في Vercel'
        );
    }

    // =====================================================
    // التحقق من الأدمن
    // =====================================================

    let isAdmin = false;

    const authHeader =
        req.headers.authorization || '';

    const tokenMatch = String(authHeader).match(
        /^Bearer\s+(.+)$/i
    );

    const token = tokenMatch
        ? tokenMatch[1].trim()
        : '';

    if (token) {
        try {
            const authResponse = await fetch(
                SUPABASE_URL + '/auth/v1/user',
                {
                    method: 'GET',
                    headers: {
                        apikey: SUPABASE_SERVICE_ROLE_KEY,
                        Authorization: 'Bearer ' + token
                    }
                }
            );

            if (authResponse.ok) {
                const user = await authResponse.json();

                if (
                    user &&
                    user.email &&
                    String(user.email).toLowerCase() ===
                    String(ADMIN_EMAIL).trim().toLowerCase()
                ) {
                    isAdmin = true;
                }
            }
        } catch (error) {
            console.error(
                'ADMIN AUTH ERROR:',
                error?.message || error
            );
        }
    }

    // =====================================================
    // GET - تحميل العروض
    // =====================================================

    if (req.method === 'GET') {
        try {
            // الأدمن يرى جميع العروض، حتى المعطلة والمنتهية.
            // الزائر يرى العروض النشطة ضمن المدة المحددة فقط.
            const query = isAdmin
                ? '?select=*&order=sort_order.asc,created_at.desc'
                : '?select=*&is_active=eq.true&order=sort_order.asc,created_at.desc';

            const response = await fetch(
                SUPABASE_URL +
                    '/rest/v1/offers' +
                    query,
                {
                    method: 'GET',
                    headers: supabaseHeaders()
                }
            );

            const result = await readResponse(response);

            if (!response.ok) {
                console.error(
                    'GET OFFERS SUPABASE ERROR:',
                    result.data || result.text
                );

                return sendError(
                    response.status,
                    getSupabaseError(
                        result.data,
                        'فشل تحميل العروض'
                    )
                );
            }

            if (!Array.isArray(result.data)) {
                return sendError(
                    500,
                    'بيانات العروض المستلمة من قاعدة البيانات غير صحيحة'
                );
            }

            let offers = result.data;

            if (!isAdmin) {
                offers = offers.filter(
                    isOfferVisibleNow
                );
            }

            return res.status(200).json({
                success: true,
                offers
            });
        } catch (error) {
            console.error(
                'GET OFFERS ERROR:',
                error?.message || error
            );

            return sendError(
                500,
                'حدث خطأ أثناء تحميل العروض'
            );
        }
    }

    // =====================================================
    // حماية عمليات التعديل
    // =====================================================

    if (
        ['POST', 'PUT', 'DELETE'].includes(req.method) &&
        !isAdmin
    ) {
        return sendError(
            401,
            'غير مصرح لك بتنفيذ هذا الإجراء'
        );
    }

    // =====================================================
    // POST - إضافة عرض
    // =====================================================

    if (req.method === 'POST') {
        try {
            const body = getBody();

            const insertData = buildOfferData(
                body,
                false
            );

            if (isEmpty(insertData.title)) {
                return sendError(
                    400,
                    'عنوان العرض مطلوب'
                );
            }

            const response = await fetch(
                SUPABASE_URL + '/rest/v1/offers',
                {
                    method: 'POST',
                    headers: supabaseHeaders({
                        'Content-Type': 'application/json',
                        Prefer: 'return=representation'
                    }),
                    body: JSON.stringify(insertData)
                }
            );

            const result = await readResponse(response);

            if (!response.ok) {
                console.error(
                    'POST OFFERS SUPABASE ERROR:',
                    result.data || result.text
                );

                return sendError(
                    response.status,
                    getSupabaseError(
                        result.data,
                        'فشل إنشاء العرض'
                    )
                );
            }

            const savedOffer = Array.isArray(result.data)
                ? result.data[0]
                : result.data;

            if (!savedOffer || !savedOffer.id) {
                return sendError(
                    500,
                    'تم إرسال العرض ولكن تعذر تأكيد حفظه في قاعدة البيانات'
                );
            }

            return res.status(201).json({
                success: true,
                message: 'تم إنشاء العرض بنجاح',
                offer: savedOffer
            });
        } catch (error) {
            console.error(
                'POST OFFERS ERROR:',
                error?.message || error
            );

            return sendError(
                400,
                error?.message ||
                    'حدث خطأ أثناء إنشاء العرض'
            );
        }
    }

    // =====================================================
    // PUT - تعديل عرض
    // =====================================================

    if (req.method === 'PUT') {
        try {
            const body = getBody();
            const id = body.id;

            if (isEmpty(id)) {
                return sendError(
                    400,
                    'رقم العرض مطلوب'
                );
            }

            const updateData = buildOfferData(
                body,
                true
            );

            if (
                Object.keys(updateData).length === 0
            ) {
                return sendError(
                    400,
                    'لا توجد بيانات لتعديل العرض'
                );
            }

            console.log(
                'PUT OFFER:',
                String(id),
                Object.keys(updateData)
            );

            // إرسال التعديل مع طلب إعادة الصف المحفوظ.
            const response = await fetch(
                getIdFilter(id),
                {
                    method: 'PATCH',
                    headers: supabaseHeaders({
                        'Content-Type': 'application/json',
                        Prefer: 'return=representation'
                    }),
                    body: JSON.stringify(updateData)
                }
            );

            const result = await readResponse(response);

            if (!response.ok) {
                console.error(
                    'PUT OFFERS SUPABASE ERROR:',
                    result.data || result.text
                );

                return sendError(
                    response.status,
                    getSupabaseError(
                        result.data,
                        'فشل تعديل العرض'
                    )
                );
            }

            // المسار الطبيعي: Supabase يعيد الصف المعدل.
            if (
                Array.isArray(result.data) &&
                result.data.length > 0
            ) {
                const savedOffer = result.data[0];

                if (!updateMatches(savedOffer, updateData)) {
                    console.error(
                        'OFFER UPDATE VERIFICATION MISMATCH:',
                        String(id)
                    );

                    return sendError(
                        409,
                        'لم تتطابق البيانات المحفوظة مع بيانات التعديل المطلوبة'
                    );
                }

                return res.status(200).json({
                    success: true,
                    message: 'تم تعديل العرض بنجاح',
                    offer: savedOffer
                });
            }

            // إذا لم يرجع PATCH صفًا، نتحقق من وجود العرض
            // ومن تطابق القيم المطلوبة بعد التعديل.
            const verifyResponse = await fetch(
                getIdFilter(id) + '&select=*',
                {
                    method: 'GET',
                    headers: supabaseHeaders()
                }
            );

            const verifyResult = await readResponse(
                verifyResponse
            );

            if (!verifyResponse.ok) {
                console.error(
                    'VERIFY OFFER ERROR:',
                    verifyResult.data || verifyResult.text
                );

                return sendError(
                    502,
                    'تعذر التحقق من حفظ تعديل العرض'
                );
            }

            const verifyData = verifyResult.data;

            if (
                !Array.isArray(verifyData) ||
                verifyData.length === 0
            ) {
                return sendError(
                    404,
                    'لم يتم العثور على العرض المطلوب تعديله'
                );
            }

            const savedOffer = verifyData[0];

            if (!updateMatches(savedOffer, updateData)) {
                console.error(
                    'OFFER UPDATE NOT CONFIRMED:',
                    String(id)
                );

                return sendError(
                    409,
                    'لم يتم تأكيد حفظ التعديل. راجع بيانات العرض وحاول مرة أخرى'
                );
            }

            return res.status(200).json({
                success: true,
                message: 'تم تعديل العرض بنجاح',
                offer: savedOffer
            });
        } catch (error) {
            console.error(
                'PUT OFFERS ERROR:',
                error?.message || error
            );

            return sendError(
                400,
                error?.message ||
                    'حدث خطأ أثناء تعديل العرض'
            );
        }
    }

    // =====================================================
    // DELETE - حذف عرض
    // =====================================================

    if (req.method === 'DELETE') {
        try {
            const body = getBody();

            const id =
                body.id !== undefined &&
                body.id !== null &&
                String(body.id).trim() !== ''
                    ? body.id
                    : req.query?.id;

            if (isEmpty(id)) {
                return sendError(
                    400,
                    'رقم العرض مطلوب للحذف'
                );
            }

            const response = await fetch(
                getIdFilter(id),
                {
                    method: 'DELETE',
                    headers: supabaseHeaders({
                        Prefer: 'return=representation'
                    })
                }
            );

            const result = await readResponse(response);

            if (!response.ok) {
                console.error(
                    'DELETE OFFERS SUPABASE ERROR:',
                    result.data || result.text
                );

                return sendError(
                    response.status,
                    getSupabaseError(
                        result.data,
                        'فشل حذف العرض'
                    )
                );
            }

            // لا نعلن نجاح الحذف إذا لم يرجع Supabase صفًا محذوفًا.
            if (
                !Array.isArray(result.data) ||
                result.data.length === 0
            ) {
                return sendError(
                    404,
                    'لم يتم العثور على العرض المطلوب حذفه'
                );
            }

            return res.status(200).json({
                success: true,
                message: 'تم حذف العرض بنجاح',
                deleted: result.data
            });
        } catch (error) {
            console.error(
                'DELETE OFFERS ERROR:',
                error?.message || error
            );

            return sendError(
                500,
                'حدث خطأ أثناء حذف العرض'
            );
        }
    }

    // =====================================================
    // METHOD NOT ALLOWED
    // =====================================================

    return sendError(
        405,
        'Method Not Allowed'
    );
};
