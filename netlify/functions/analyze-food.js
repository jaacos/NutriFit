exports.handler = async function(event) {

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Body JSON inválido' })
        };
    }

    const { promptText } = body;

    if (!promptText || typeof promptText !== 'string' || promptText.trim().length === 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'promptText es requerido' })
        };
    }

    if (promptText.length > 500) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'promptText demasiado largo' })
        };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 503,
            body: JSON.stringify({ error: 'Servicio no configurado' })
        };
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
        const fetch = await import('node-fetch').catch(() => null);
        const fetchFn = fetch ? fetch.default : globalThis.fetch;

        const geminiRes = await fetchFn(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiRes.ok) {
            const errBody = await geminiRes.text();
            console.error('[analyze-food] Gemini error:', geminiRes.status, errBody);
            return {
                statusCode: 502,
                body: JSON.stringify({ error: 'Error en el servicio de IA' })
            };
        }

        const data = await geminiRes.json();

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };

    } catch (err) {
        console.error('[analyze-food] Error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error interno del servidor' })
        };
    }
};
