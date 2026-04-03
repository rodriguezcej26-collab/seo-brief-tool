const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// RUTA PRINCIPAL: Analizar keyword
// ============================================================
app.post('/api/analizar', async (req, res) => {
  const { keyword, pais } = req.body;

  if (!keyword) {
    return res.status(400).json({ error: 'La keyword es obligatoria' });
  }

  try {
    // PASO 1: Obtener Top 10 de Google con SerpApi
    console.log(`Buscando top 10 para: "${keyword}" en ${pais}`);
    
    const serpResponse = await axios.get('https://serpapi.com/search', {
      params: {
        q: keyword,
        gl: pais || 'co',
        hl: 'es',
        num: 10,
        api_key: process.env.SERP_API_KEY
      }
    });

    const resultadosOrganicos = serpResponse.data.organic_results || [];
    
    if (resultadosOrganicos.length === 0) {
      return res.status(404).json({ error: 'No se encontraron resultados para esta keyword' });
    }

    // Extraer datos relevantes del top 10
    const top10 = resultadosOrganicos.slice(0, 10).map((r, i) => ({
      posicion: i + 1,
      titulo: r.title || '',
      url: r.link || '',
      descripcion: r.snippet || ''
    }));

    // PASO 2: Enviar a Google Gemini para generar el brief
    console.log('Generando brief con IA...');

    const prompt = `Eres un experto en SEO y marketing de contenidos. 
    
Analiza estos 10 primeros resultados de Google para la keyword: "${keyword}"

RESULTADOS TOP 10:
${top10.map(r => `${r.posicion}. ${r.titulo}\nURL: ${r.url}\nDescripción: ${r.descripcion}`).join('\n\n')}

Genera un brief de contenido SEO completo y estructurado en español con este formato exacto:

## 🎯 INTENCIÓN DE BÚSQUEDA
[Explica si es informacional, transaccional, navegacional o comercial y por qué]

## 📊 ANÁLISIS DEL TOP 10
[3-4 patrones o tendencias clave que observas en los resultados]

## 📝 ESTRUCTURA RECOMENDADA PARA EL ARTÍCULO

### Título sugerido (H1):
[Título optimizado para SEO]

### Subtítulos principales (H2s):
[Lista de 5-7 H2s recomendados]

### Subtítulos secundarios (H3s sugeridos):
[Lista de H3s clave para los H2 más importantes]

## 🔑 PALABRAS CLAVE
- **Primaria:** ${keyword}
- **Secundarias:** [lista de 5-7 keywords relacionadas]
- **LSI/Semánticas:** [lista de 5 términos semánticamente relacionados]

## 📏 ESPECIFICACIONES DE CONTENIDO
- **Longitud recomendada:** [número de palabras]
- **Tipo de contenido:** [artículo, guía, lista, comparativa, etc.]
- **Tono:** [profesional, cercano, técnico, etc.]

## ✅ CHECKLIST SEO ON-PAGE
[Lista de 5-6 elementos técnicos clave a incluir]

## 💡 ÁNGULO DIFERENCIADOR
[Qué puede hacer este artículo para destacar sobre la competencia actual]`;

    // Llamada a Google Gemini API (gratis)
    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.7
        }
      }
    );

    const brief = geminiResponse.data.candidates[0].content.parts[0].text;

    // Devolver resultado completo
    res.json({
      keyword,
      pais,
      top10,
      brief
    });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    
    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({ error: 'API Key inválida. Verifica tus credenciales.' });
    }
    
    res.status(500).json({ 
      error: 'Error al generar el brief. Inténtalo de nuevo.',
      detalle: error.message 
    });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});
