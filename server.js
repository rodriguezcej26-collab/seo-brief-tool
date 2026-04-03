const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Función para extraer headings y datos de una URL
async function extraerDatosURL(url) {
  try {
    const response = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      }
    });

    const html = response.data;

    // Extraer meta description
    const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i) ||
                      html.match(/<meta[^>]*content=["']([^"']*)[^>]*name=["']description["']/i);
    const metaDesc = metaMatch ? metaMatch[1].substring(0, 200) : '';

    // Extraer headings H1, H2, H3
    const headings = [];

    const h1Matches = [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gis)];
    const h2Matches = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gis)];
    const h3Matches = [...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/gis)];

    h1Matches.slice(0, 3).forEach(m => {
      const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text.length > 2 && text.length < 200) headings.push({ tipo: 'H1', texto: text });
    });

    h2Matches.slice(0, 10).forEach(m => {
      const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text.length > 2 && text.length < 200) headings.push({ tipo: 'H2', texto: text });
    });

    h3Matches.slice(0, 10).forEach(m => {
      const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text.length > 2 && text.length < 200) headings.push({ tipo: 'H3', texto: text });
    });

    // Contar palabras aproximadas
    const textoLimpio = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const palabras = textoLimpio.split(' ').filter(w => w.length > 3).length;

    return {
      metaDesc,
      headings,
      palabras: Math.min(palabras, 9999),
      ok: true
    };

  } catch (err) {
    return { metaDesc: '', headings: [], palabras: 0, ok: false };
  }
}

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

    const top10Base = resultadosOrganicos.slice(0, 10).map((r, i) => ({
      posicion: i + 1,
      titulo: r.title || '',
      url: r.link || '',
      descripcion: r.snippet || ''
    }));

    // PASO 2: Extraer headings de cada URL en paralelo
    console.log('Extrayendo headings del top 10...');
    const datosURLs = await Promise.all(top10Base.map(r => extraerDatosURL(r.url)));

    const top10 = top10Base.map((r, i) => ({
      ...r,
      metaDesc: datosURLs[i].metaDesc || r.descripcion,
      headings: datosURLs[i].headings,
      palabras: datosURLs[i].palabras,
      scraped: datosURLs[i].ok
    }));

    // PASO 3: Generar brief con Gemini
    console.log('Generando brief con IA...');

    const prompt = `Eres un experto en SEO y marketing de contenidos. 
    
Analiza estos 10 primeros resultados de Google para la keyword: "${keyword}"

RESULTADOS TOP 10:
${top10.map(r => `${r.posicion}. ${r.titulo}\nURL: ${r.url}\nDescripción: ${r.descripcion}\nHeadings: ${r.headings.map(h => `${h.tipo}: ${h.texto}`).join(' | ')}`).join('\n\n')}

Genera un brief de contenido SEO completo y estructurado en español con este formato exacto:

## 🎯 INTENCIÓN DE BÚSQUEDA
[Explica si es informacional, transaccional, navegacional o comercial y por qué]

## 📊 ANÁLISIS DEL TOP 10
[3-4 patrones o tendencias clave que observas en los resultados y sus headings]

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
- **Longitud recomendada:** [número de palabras basado en el promedio del top 10]
- **Tipo de contenido:** [artículo, guía, lista, comparativa, etc.]
- **Tono:** [profesional, cercano, técnico, etc.]

## ✅ CHECKLIST SEO ON-PAGE
[Lista de 5-6 elementos técnicos clave a incluir]

## 💡 ÁNGULO DIFERENCIADOR
[Qué puede hacer este artículo para destacar sobre la competencia actual]`;

    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2000, temperature: 0.7 }
      }
    );

    const brief = geminiResponse.data.candidates[0].content.parts[0].text;

    res.json({ keyword, pais, top10, brief });

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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});
