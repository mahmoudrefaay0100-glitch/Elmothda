export default async function handler(req, res) {
  try {
    const {
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    } = process.env;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        success: false,
        error: "Supabase environment variables are missing"
      });
    }

    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };

    // جلب المنتجات
    if (req.method === "GET") {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/products?select=*&order=created_at.desc`,
        {
          headers
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: data?.message || "Failed to load products"
        });
      }

      return res.status(200).json({
        success: true,
        products: data || []
      });
    }

    // إضافة أو تعديل منتج
    if (req.method === "POST") {
      const product = req.body || {};

      if (!product.id) {
        product.id =
          "prod-" +
          Date.now() +
          "-" +
          Math.random()
            .toString(36)
            .substring(2, 8);
      }

      const payload = {
        id: String(product.id),
        name: product.name || product.title || "منتج جديد",
        category: product.category || "",
        price: Number(product.price || 0),
        old_price: Number(
          product.old_price ||
          product.oldPrice ||
          0
        ),
        sku: product.sku || "",
        description: product.description || "",
        specifications:
          product.specifications || "",
        dimensions:
          product.dimensions || "",
        chair_count:
          Number(
            product.chair_count ||
            product.chairCount ||
            0
          ),
        image_url:
          product.image_url ||
          product.imageUrl ||
          "",
        visible:
          product.visible !== false,
        featured:
          product.featured === true,
        updated_at:
          new Date().toISOString()
      };

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/products?on_conflict=id`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error:
            data?.message ||
            data?.hint ||
            "Failed to save product"
        });
      }

      return res.status(200).json({
        success: true,
        product: data?.[0] || payload
      });
    }

    // حذف منتج
    if (req.method === "DELETE") {
      const id =
        req.query?.id ||
        req.body?.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Product ID is required"
        });
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers
        }
      );

      if (!response.ok) {
        const data = await response.json();

        return res.status(response.status).json({
          success: false,
          error:
            data?.message ||
            "Failed to delete product"
        });
      }

      return res.status(200).json({
        success: true,
        deleted: id
      });
    }

    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });

  } catch (error) {

    console.error("PRODUCTS API ERROR:", error);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Server error"
    });
  }
}
