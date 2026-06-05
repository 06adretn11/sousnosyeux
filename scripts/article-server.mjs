// =====================================================================
// scripts/article-server.mjs
// Serveur local d'analyse d'articles de presse.
//
// Pipeline : URL → fetch HTML → extraction texte → analyse LLM → JSON structuré
//
// Usage :
//   node --env-file=.env.local scripts/article-server.mjs
//
// Endpoints :
//   POST /analyze   { url, context? }  → analyse complète (LLM si clé dispo)
//   GET  /health                        → { ok: true }
//
// Env :
//   ANTHROPIC_API_KEY  — optionnel. Sans clé : extraction texte seule.
// =====================================================================

import { createServer } from 'node:http';

const PORT = 3456;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const HAS_LLM = ANTHROPIC_KEY.length > 10;

// --- Enums du projet (pour le prompt LLM) ---
const ENUMS = {
  type_affaire: ['viol', 'agression sexuelle', 'atteinte sexuelle', 'images pédocriminelles', 'violences sexuelles', 'mixte', 'à qualifier'],
  statut_judiciaire: ['plainte', 'enquête', 'mise en examen', 'procès', 'condamnation non définitive', 'condamnation définitive', 'relaxe / non-lieu / classement', 'à qualifier'],
  statut_des_faits: ['allégué', 'retenu par jugement non définitif', 'établi judiciairement', 'non établi', 'mixte'],
};

// --- HTML → texte lisible (sans dépendances) ---
function extractText(html) {
  // 1. Retirer les blocs non-contenu
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 2. Chercher le contenu principal
  const articleMatch = clean.match(/<article[\s\S]*?<\/article>/i);
  const mainMatch = clean.match(/<main[\s\S]*?<\/main>/i);
  const contentDiv = clean.match(/<div[^>]*class="[^"]*(?:article|content|post|entry|story)[^"]*"[\s\S]*?<\/div>/i);

  let content = articleMatch?.[0] || mainMatch?.[0] || contentDiv?.[0] || clean;

  // 3. Extraire les paragraphes
  const paragraphs = [];
  const pMatches = content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  for (const m of pMatches) {
    const text = m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim();
    if (text.length > 30) paragraphs.push(text);
  }

  // Fallback : texte brut si peu de <p>
  if (paragraphs.join(' ').length < 200) {
    const raw = content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim();
    return raw.slice(0, 5000);
  }

  return paragraphs.join('\n\n').slice(0, 5000);
}

// --- Extraction du titre ---
function extractTitle(html) {
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
  if (ogTitle) return decodeEntities(ogTitle[1]);
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag) return decodeEntities(titleTag[1]).replace(/\s+/g, ' ').trim();
  return '';
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

// --- Détection par mots-clés (fallback sans LLM) ---
function keywordAnalysis(text) {
  const lower = text.toLowerCase();
  const hints = [];

  // Statut judiciaire — patterns stricts pour éviter les faux positifs
  // (ex: "maison d'arrêt", "sortir de prison" ≠ condamnation)
  const condamnationStrong = /condamn[ée]\s+(à|a)\s|reconnu[e]?\s+coupable|peine\s+de\s+\d|an[s]?\s+de\s+prison\s+(ferme|avec|dont)|mois\s+de\s+prison\s+(ferme|avec|dont)|mois\s+avec\s+sursis|an[s]?\s+avec\s+sursis|emprisonnement/.test(lower);

  if (condamnationStrong) {
    if (/cour\s+d['']?appel.*confirm|cassation|définitiv/.test(lower)) {
      hints.push({ field: 'statut_judiciaire', value: 'condamnation définitive', confidence: 'moyenne' });
    } else {
      hints.push({ field: 'statut_judiciaire', value: 'condamnation non définitive', confidence: 'moyenne' });
    }
    if (/relaxe|relax[ée]|acquitt[ée]/.test(lower)) {
      hints.push({ field: 'statut_judiciaire', value: 'relaxe / non-lieu / classement', confidence: 'faible', note: 'Relaxe et condamnation détectées — vérifier' });
    }
  } else if (/relaxe|relax[ée]|acquitt[ée]|non[- ]lieu|class[ée]\s+sans\s+suite/.test(lower)) {
    hints.push({ field: 'statut_judiciaire', value: 'relaxe / non-lieu / classement', confidence: 'moyenne' });
  } else if (/\bjug[ée]\b|tribunal\s+correctionnel|procès|audience\s+de\s+jugement|comparaît|comparution|renvoy[ée]\s+devant/.test(lower)) {
    hints.push({ field: 'statut_judiciaire', value: 'procès', confidence: 'moyenne' });
  } else if (/mis[e]?\s+en\s+examen|écrou[ée]|détention\s+provisoire|incarcér|mandat\s+de\s+dépôt/.test(lower)) {
    hints.push({ field: 'statut_judiciaire', value: 'mise en examen', confidence: 'moyenne' });
  } else if (/enquête\s+(ouverte|préliminaire|judiciaire)|information\s+judiciaire|gendarme|perquisition/.test(lower)) {
    hints.push({ field: 'statut_judiciaire', value: 'enquête', confidence: 'faible' });
  } else if (/plainte\s+(déposée|pour)|signalement/.test(lower)) {
    hints.push({ field: 'statut_judiciaire', value: 'plainte', confidence: 'faible' });
  }

  // Statut des faits
  if (/condamn[ée]|reconnu[e]?\s+coupable/.test(lower)) {
    if (/cour\s+d['']?appel|cassation|définitiv/.test(lower)) {
      hints.push({ field: 'statut_des_faits', value: 'établi judiciairement', confidence: 'moyenne' });
    } else {
      hints.push({ field: 'statut_des_faits', value: 'retenu par jugement non définitif', confidence: 'moyenne' });
    }
  }
  if (/relaxe|relax[ée]|acquitt[ée]|non[- ]lieu|class[ée]\s+sans\s+suite/.test(lower)) {
    hints.push({ field: 'statut_des_faits', value: 'non établi', confidence: 'moyenne' });
  }

  // Type affaire
  if (/viol(?!ence)/.test(lower)) hints.push({ field: 'type_affaire', value: 'viol', confidence: 'faible' });
  if (/agression[s]?\s+sexuelle/.test(lower)) hints.push({ field: 'type_affaire', value: 'agression sexuelle', confidence: 'faible' });
  if (/atteinte[s]?\s+sexuelle/.test(lower)) hints.push({ field: 'type_affaire', value: 'atteinte sexuelle', confidence: 'faible' });
  if (/p[ée]do(?:pornographi|criminell)|image[s]?\s+(?:p[ée]do|à\s+caract[èe]re)/.test(lower)) hints.push({ field: 'type_affaire', value: 'images pédocriminelles', confidence: 'faible' });

  return hints;
}

// --- Analyse LLM via Claude API ---
async function llmAnalysis(text, context) {
  const systemPrompt = `Tu es un assistant juridique spécialisé dans l'analyse d'articles de presse concernant des affaires judiciaires en France. Tu extrais des informations factuelles structurées.

Contexte de l'affaire en base :
- Établissement : ${context.etablissement || 'non précisé'}
- Commune : ${context.commune || 'non précisé'}
- Statut actuel en base : ${context.statut_judiciaire || 'non précisé'}

Valeurs possibles pour chaque champ (utilise EXACTEMENT ces valeurs) :
- type_affaire : ${ENUMS.type_affaire.join(', ')}
- statut_judiciaire : ${ENUMS.statut_judiciaire.join(', ')}
- statut_des_faits : ${ENUMS.statut_des_faits.join(', ')}

Règles :
- statut_des_faits doit être cohérent avec statut_judiciaire :
  * plainte/enquête/mise en examen/procès → "allégué"
  * condamnation non définitive → "retenu par jugement non définitif"
  * condamnation définitive → "établi judiciairement"
  * relaxe / non-lieu / classement → "non établi"
- Si l'article mentionne viol ET agression sexuelle → "mixte"
- Respecte la présomption d'innocence dans le résumé
- Le résumé doit être factuel et neutre, max 2 phrases

Réponds UNIQUEMENT en JSON valide avec cette structure :
{
  "statut_judiciaire": "...",
  "statut_des_faits": "...",
  "type_affaire": "...",
  "enfants": "1 enfant | plusieurs enfants | non précisé",
  "resume": "...",
  "date_article": "YYYY-MM-DD ou null",
  "evolution_detectee": true/false,
  "commentaire_evolution": "explication si evolution_detectee=true, sinon null",
  "confidence": "haute | moyenne | faible"
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: `Analyse cet article de presse et extrais les informations structurées :\n\n${text}` }],
      system: systemPrompt,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text || '';

  // Extraire le JSON de la réponse
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Pas de JSON dans la réponse LLM');

  return JSON.parse(jsonMatch[0]);
}

// --- Fetch article avec gestion user-agent + charset ---
async function fetchArticle(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    },
    redirect: 'follow',
  });

  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
    throw new Error(`Content-Type inattendu: ${contentType}`);
  }

  // Détection charset : header Content-Type > meta tag > fallback UTF-8
  const bytes = await res.arrayBuffer();
  let charset = 'utf-8';

  const ctMatch = contentType.match(/charset=([^\s;]+)/i);
  if (ctMatch) {
    charset = ctMatch[1].toLowerCase();
  } else {
    // Pré-décodage rapide en latin1 pour lire les meta tags
    const preview = new TextDecoder('latin1').decode(bytes.slice(0, 2000));
    const metaMatch = preview.match(/<meta[^>]*charset=["']?([^"'\s;>]+)/i);
    if (metaMatch) charset = metaMatch[1].toLowerCase();
  }

  return new TextDecoder(charset).decode(bytes);
}

// --- Serveur HTTP ---
const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, llm: HAS_LLM }));
    return;
  }

  // Analyze
  if (req.method === 'POST' && req.url === '/analyze') {
    let body = '';
    for await (const chunk of req) body += chunk;

    try {
      const { url, context = {} } = JSON.parse(body);
      if (!url) throw new Error('url manquant');

      console.log(`📰 Analyse de ${url}`);

      // 1. Fetch HTML
      const html = await fetchArticle(url);
      console.log(`   HTML récupéré (${html.length} chars)`);

      // 2. Extraction texte
      const text = extractText(html);
      const title = extractTitle(html);
      console.log(`   Texte extrait (${text.length} chars) — "${title.slice(0, 60)}..."`);

      // 3. Analyse
      let analysis = null;
      let hints = keywordAnalysis(text);
      let mode = 'keywords';

      if (HAS_LLM) {
        try {
          analysis = await llmAnalysis(text, context);
          mode = 'llm';
          console.log(`   🤖 Analyse LLM : ${analysis.statut_judiciaire} (${analysis.confidence})`);
          if (analysis.evolution_detectee) {
            console.log(`   ⚡ Évolution détectée : ${analysis.commentaire_evolution}`);
          }
        } catch (e) {
          console.log(`   ⚠️  LLM fallback → keywords : ${e.message}`);
        }
      } else {
        console.log(`   📝 Analyse par mots-clés (pas de clé API)`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        mode,
        title,
        text_excerpt: text.slice(0, 2000),
        analysis,
        hints,
      }));

    } catch (e) {
      console.log(`   ❌ ${e.message}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🔍 Article Analyzer — http://localhost:${PORT}`);
  console.log(`   Mode : ${HAS_LLM ? '🤖 LLM (Claude API)' : '📝 Mots-clés uniquement'}`);
  if (!HAS_LLM) {
    console.log(`   💡 Pour activer l'analyse LLM, ajouter ANTHROPIC_API_KEY dans .env.local`);
  }
  console.log(`\n   Ouvrir tools/review.html pour commencer.\n`);
});
