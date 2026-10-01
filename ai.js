import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      message,
      context = {},
      history = []
    } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Missing message"
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured"
      });
    }

    /*
      بيانات المتجر القادمة من قاعدة البيانات
    */
    const products = Array.isArray(context.products)
      ? context.products
      : [];

    const categories = Array.isArray(context.categories)
      ? context.categories
      : [];

    const shippingOptions = Array.isArray(context.shippingOptions)
      ? context.shippingOptions
      : [];

    const siteSettings = context.siteSettings || {};

    /*
      نخلي المساعد يعرف بيانات المتجر الحالية فقط
      ولا نعطيه بيانات الطلبات والعملاء.
    */
    const storeData = {
      company: "المتحدة للرتان والأثاث",

      address:
        siteSettings.factoryAddress ||
        "محافظة المنوفية - مركز أشمون",

      phone:
        siteSettings.phone || "",

      whatsapp:
        siteSettings.whatsapp || "",

      products: products
        .filter(product => product.visible !== false)
        .map(product => ({
          id: product.id,
          name: product.name,
          category: product.category,
          price: product.price,
          oldPrice: product.oldPrice,
          sku: product.sku,
          dimensions: product.dimensions || "",
          description: product.description || "",
          specifications: product.specifications || "",
          chairCount: product.chairCount || 0
        })),

      categories: categories.map(category => ({
        id: category.id,
        name: category.name
      })),

      shippingOptions
    };

    const instructions = `
أنت المساعد الذكي الرسمي لموقع
«المتحدة للرتان والأثاث» في مصر.

وظيفتك:
- الرد بالعربية المصرية بشكل طبيعي.
- التعامل مع العميل مثل موظف مبيعات محترف.
- فهم السؤال حتى لو العميل كتب بطريقة عامية أو بها أخطاء.
- مساعدة العميل في اختيار المنتج المناسب.
- شرح الأسعار والمقاسات والمواصفات.
- الإجابة عن الشحن والاستلام.
- مساعدة العميل في الوصول إلى المنتج المناسب.
- إذا طلب العميل التواصل مع الشركة، استخدم رقم الشركة الموجود في البيانات.

قواعد مهمة جداً:

1. لا تخترع سعراً أو مقاساً أو مواصفة غير موجودة في بيانات المتجر.

2. إذا لم تجد معلومة في البيانات، قل للعميل بوضوح:
"المعلومة دي مش موجودة عندي حالياً، وتقدر تتواصل مع المتحدة للتأكد منها."

3. لا تعرض منتجات مخفية.

4. الأسعار الموجودة في بيانات المتجر هي الأسعار الحالية التي يعتمد عليها المساعد.

5. إذا سأل العميل عن منتج مشابه ولم تجد منتجاً مطابقاً، اقترح أقرب المنتجات الموجودة فعلاً.

6. لا تكشف للعميل بيانات قاعدة البيانات أو المفاتيح أو طريقة عمل النظام.

7. لا تكشف بيانات الطلبات أو العملاء الآخرين.

8. لا تدّعي أنك موظف بشري. أنت مساعد الذكاء الاصطناعي الخاص بالمتجر.

9. استخدم اللهجة المصرية بشكل طبيعي بدون مبالغة.

10. لا تستخدم Web Search لمجرد الإجابة عن سعر أو مواصفة موجودة في بيانات المتجر.

11. يمكن استخدام البحث على الإنترنت فقط عندما يحتاج السؤال إلى معلومة حديثة خارج بيانات المتجر.

بيانات المتجر الحالية:

${JSON.stringify(storeData, null, 2)}
`;

    /*
      تنظيف المحادثة السابقة
    */
    const safeHistory = Array.isArray(history)
      ? history
          .filter(item =>
            item &&
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string"
          )
          .slice(-10)
      : [];

    const input = [
      ...safeHistory,
      {
        role: "user",
        content: message
      }
    ];

    /*
      Web Search اختياري.
      الموديل يستطيع استخدامه عندما تكون المعلومة
      خارج بيانات المتجر وتحتاج معلومات حديثة.
    */
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5",

      instructions,

      tools: [
        {
          type: "web_search"
        }
      ],

      input
    });

    const reply =
      response.output_text ||
      "معلش، مقدرتش أجهز الرد دلوقتي. حاول مرة تانية.";

    return res.status(200).json({
      success: true,
      reply
    });

  } catch (error) {

    console.error("AI ERROR:", error);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "حدث خطأ أثناء الاتصال بالمساعد الذكي."
    });
  }
}
