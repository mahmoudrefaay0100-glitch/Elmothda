export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, context } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Missing message' });
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
    }

    const system = `أنت المساعد الذكي الرسمي لموقع «المتحدة للرتان والأثاث» في مصر.
أجب بالعربية بشكل طبيعي ومفيد، وافهم الأسئلة المفتوحة وليس فقط كلمات محددة.
إذا كان السؤال عن منتجات أو أسعار أو مقاسات أو شحن أو بيانات الشركة، اعتمد على بيانات المتجر المرسلة لك ولا تخترع بيانات غير موجودة.
إذا كان السؤال عاماً خارج المتجر، أجب عنه بشكل طبيعي، وكن واضحاً إذا احتجت إلى معلومات حديثة.
بيانات المتجر الحالية:
${JSON.stringify(context || {}, null, 2)}`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
        instructions: system,
        tools: [{ type: 'web_search' }],
        input: message
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'OpenAI request failed' });
    }

    return res.status(200).json({ reply: data.output_text || 'لم أتمكن من تكوين رد حالياً.' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
}
