export default async (req) => {

    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method Not Allowed' }),
            { status: 405, headers: { 'Content-Type': 'application/json' } }
        );
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return new Response(
            JSON.stringify({ error: 'Body JSON inválido' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const { promptText } = body;

    if (!promptText || typeof promptText !== 'string' || promptText.trim().length === 0) {
        return new Response(
            JSON.stringify({ error: 'promptText es requerido' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    if (promptText.length > 500) {
        return new Response(
            JSON.stringify({ error: 'promptText demasiado largo (máx 500 caracteres)' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: 'Servicio no configurado' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const systemPrompt = `Eres un nutricionista experto en recomposición corporal.
Analiza descripciones de comida en lenguaje natural y estima calorías y macronutrientes.
Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta, sin markdown ni texto extra:
{
  "items": [
    {
      "name": "nombre del alimento",
      "meal": "Desayuno|Comida|Cena|Snack",
      "calories": 0,
      "protein": 0,
      "fat": 0,
      "carbs": 0
    }
  ],
  "explanation": "breve explicación del cálculo"
}
Reglas: 1g Proteína=4kcal, 1g Grasa=9kcal, 1g Carbohidrato=4kcal.
Infiere el tipo de comida por el contenido si el usuario no lo indica.`;

    const payload = {
        contents: [{
            parts: [{
                text: `Calcula macros para: "${promptText.trim()}". Devuelve solo el JSON validado.`
            }]
        }],
        generationConfig: {
            responseMimeType: 'application/json'
        },
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        }
    };

    try {
        const geminiRes = await fetch(GEMINI_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });

        if (!geminiRes.ok) {
            const errBody = await geminiRes.text();
            console.error('[analyze-food] Gemini error:', geminiRes.status, errBody);
            return new Response(
                JSON.stringify(
