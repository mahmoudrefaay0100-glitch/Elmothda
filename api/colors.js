import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {

    try {

        const {
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                success: false,
                error: 'بيانات Supabase غير موجودة في Vercel'
            });
        }

        const supabase = createClient(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY
        );

        // =========================
        // التحقق من تسجيل الدخول
        // =========================

        const authHeader =
            req.headers.authorization || '';

        const token =
            authHeader.startsWith('Bearer ')
                ? authHeader.substring(7)
                : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'غير مصرح'
            });
        }

        const {
            data: userData,
            error: userError
        } = await supabase.auth.getUser(token);

        if (
            userError ||
            !userData ||
            !userData.user
        ) {
            return res.status(401).json({
                success: false,
                error: 'جلسة الدخول غير صالحة'
            });
        }

        // =========================
        // GET - جلب الألوان
        // =========================

        if (req.method === 'GET') {

            const {
                data,
                error
            } = await supabase
                .from('store_colors')
                .select('*')
                .eq('enabled', true)
                .order('id', {
                    ascending: true
                });

            if (error) {
                throw error;
            }

            return res.status(200).json({
                success: true,
                colors: data || []
            });
        }

        // =========================
        // POST - إضافة لون
        // =========================

        if (req.method === 'POST') {

            const {
                type,
                name,
                hex,
                enabled
            } = req.body || {};

            if (
                !type ||
                !name ||
                !hex
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'بيانات اللون ناقصة'
                });
            }

            const validTypes = [
                'cushion',
                'wicker',
                'wood'
            ];

            if (!validTypes.includes(type)) {
                return res.status(400).json({
                    success: false,
                    error: 'نوع اللون غير صحيح'
                });
            }

            const cleanName =
                String(name).trim();

            const cleanHex =
                String(hex).trim();

            if (
                !/^#[0-9A-Fa-f]{6}$/.test(
                    cleanHex
                )
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'كود اللون غير صحيح'
                });
            }

            // منع تكرار نفس اللون في نفس القسم
            const {
                data: existingColor,
                error: duplicateError
            } = await supabase
                .from('store_colors')
                .select('id')
                .eq('type', type)
                .eq('name', cleanName)
                .maybeSingle();

            if (duplicateError) {
                throw duplicateError;
            }

            if (existingColor) {
                return res.status(409).json({
                    success: false,
                    error: 'هذا اللون موجود بالفعل'
                });
            }

            const {
                data,
                error
            } = await supabase
                .from('store_colors')
                .insert({
                    type: type,
                    name: cleanName,
                    hex: cleanHex,
                    enabled: enabled !== false
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            return res.status(201).json({
                success: true,
                color: data
            });
        }

        return res.status(405).json({
            success: false,
            error: 'Method Not Allowed'
        });

    } catch (error) {

        console.error(
            'COLORS API ERROR:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                'حدث خطأ في خادم الألوان'
        });
    }
}
