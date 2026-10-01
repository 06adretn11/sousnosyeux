// =====================================================================
// scripts/lib/capteurs.mjs
//
// Contrat générique de capteur pour l'observatoire de discovery (A1)
// + premier capteur : RSS (A2) + filtre déterministe (A3).
//
// CAPTEUR → observation brute → normalisation → filtre → CANDIDATE/REJECT
//
// Le contrat est volontairement pauvre : il doit seulement permettre de
// comparer PLUS TARD plusieurs capteurs avec les mêmes métriques. Ce n'est
// pas un modèle de données de production, et il n'écrit rien dans Neon.
// =====================================================================

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------
// 1. CONTRAT — forme d'une observation normalisée
// ---------------------------------------------------------------------
// {
//   observation_id      empreinte stable, sert à la déduplication
//   observed_at         ISO — quand l'observatoire l'a vue
//   source_channel      'rss' — d'autres capteurs viendront
//   source_name         nom du flux
//   source_scope        'national' | 'regional' | 'departemental'
//   url, published_at, title, excerpt
//   territoire_apparent { mode, valeurs[] }
//   decision            'CANDIDATE' | 'REJECT'
//   signal              { regle, structures[], faits[], mineurs[] }
//   rejection_reason    string | null
// }

export const CONTRAT_VERSION = 'capteur-v0.1';

// ---------------------------------------------------------------------
// 2. NORMALISATION DU TEXTE
// ---------------------------------------------------------------------
const ENTITES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', rsquo: "'", hellip: '…', euro: '€',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ocirc: 'ô',
};

export function decodeEntites(s = '') {
  let out = s;
  // deux passes : les flux France 3 sont doublement encodés (&amp;quot;)
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITES ? ENTITES[n.toLowerCase()] : m));
  }
  return out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** minuscules sans accents — pour la comparaison lexicale uniquement */
export function aplatir(s = '') {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, "'");
}

// ---------------------------------------------------------------------
// 3. LEXIQUES — le filtre est lexical, explicable, modifiable
// ---------------------------------------------------------------------

/** Structures accueillant des mineurs, et les rôles qui les désignent. */
export const STRUCTURES = [
  'creche', 'micro-creche', 'microcreche', 'halte-garderie', 'halte garderie',
  "jardin d'enfants", 'multi-accueil', 'pouponniere',
  'assistante maternelle', 'assistant maternel', 'assistantes maternelles', 'nounou', 'nourrice',
  'ecole maternelle', 'ecole elementaire', 'ecole primaire', 'ecole publique', 'ecole privee',
  'instituteur', 'institutrice', 'professeur des ecoles', "directeur d'ecole", "directrice d'ecole",
  'periscolaire', 'peri-scolaire', 'centre de loisirs', 'accueil de loisirs', 'alsh',
  'centre aere', 'garderie', 'cantine', 'colonie de vacances',
  'animateur', 'animatrice', 'atsem',
  'college', 'lycee', 'internat', 'surveillant',
  'mecs', "foyer de l'enfance", "aide sociale a l'enfance", 'placement',
  "famille d'accueil", 'assistant familial', 'institut medico-educatif', 'itep',
  'club sportif', 'entraineur', 'educateur sportif', 'moniteur', 'catechisme', 'aumonier',
  'scout', 'patronage',
  'etablissement scolaire', 'enseignant', 'enseignante', 'educateur', 'educatrice',
  'auxiliaire de puericulture', 'puericultrice',
];

/** Vocabulaire factuel — un événement, pas une opinion. */
export const FAITS = [
  'violence', 'violences', 'maltraitance', 'maltraitances', 'sevices', 'brutalite',
  'agression sexuelle', 'agressions sexuelles', 'attouchement', 'attouchements',
  'viol', 'viols', 'inceste', 'pedocriminalite', 'pedophilie', 'pedocriminel',
  'corruption de mineur', 'atteinte sexuelle', 'exhibition',
  'pedopornographie', 'images pedopornographiques',
  'harcelement', 'coups', 'gifle', 'gifles', 'humiliation', 'humiliations',
  'plainte', 'plaintes', 'signalement', 'signalements',
  'mis en examen', 'mise en examen', 'garde a vue', 'interpelle', 'interpellation',
  'incarcere', 'ecroue', 'detention provisoire', 'mandat de depot',
  'proces', 'comparution', 'correctionnel', 'assises',
  'juge pour', 'jugee', 'juges pour', 'ecarte', 'ecartee', 'demis',
  'condamne', 'condamnee', 'condamnation', 'relaxe', 'acquitte', 'non-lieu',
  'enquete', 'information judiciaire', 'parquet', 'procureur', 'procureure',
  'suspendu', 'suspendue', 'suspension', 'licencie', 'revoque', 'radie',
  'soupcon', 'soupcons', 'accuse', 'accusee', 'accusation', 'mis en cause',
  'negligence', 'maltraitant',
];

/** Faits graves — suffisent avec une mention de mineur, sans structure (recall). */
export const FAITS_GRAVES = [
  'agression sexuelle', 'agressions sexuelles', 'attouchement', 'attouchements',
  'viol', 'viols', 'inceste', 'pedocriminalite', 'pedophilie', 'pedocriminel',
  'corruption de mineur', 'atteinte sexuelle', 'pedopornographie', 'images pedopornographiques',
  'maltraitance', 'maltraitances', 'sevices', 'violences sur', 'violence sur',
];

/** Mentions de mineurs. */
export const MINEURS = [
  'enfant', 'enfants', 'bebe', 'bebes', 'nourrisson', 'nourrissons',
  'mineur', 'mineure', 'mineurs', 'mineures', 'eleve', 'eleves',
  'adolescent', 'adolescente', 'adolescents', 'collegien', 'collegienne',
  'lyceen', 'lyceenne', 'fillette', 'garconnet', 'tout-petits',
  'petite fille', 'petit garcon', 'jeune fille', 'jeune garcon',
];

/** Contextes récurrents et coûteux — ANNOTÉS, jamais bloquants (recall d'abord). */
export const ANTI_CONTEXTES = [
  { motif: 'conflit-arme', termes: ['gaza', 'ukraine', 'israel', 'soudan', 'bombardement', 'frappe aerienne'] },
  { motif: 'sport-resultat', termes: ['ligue 1', 'ligue 2', 'championnat', 'mercato'] },
  { motif: 'culture-fiction', termes: ['netflix', 'long-metrage', 'festival du film', 'roman'] },
];

// ---------------------------------------------------------------------
// 4. GÉOLOCALISATION APPARENTE — volontairement partielle
// ---------------------------------------------------------------------
// On ne cherche PAS à géolocaliser correctement. On cherche à MESURER
// quelle part du flux est géolocalisable depuis le seul titre + extrait.
// Couverture : le territoire étalon (75), le second territoire (80) et
// ses voisins régionaux. Tout le reste ressort en « inconnu », ce qui est
// précisément la mesure recherchée.
export const DEPARTEMENTS = {
  '02': ['aisne', 'laon', 'saint-quentin', 'soissons', 'chateau-thierry'],
  '59': ['nord', 'lille', 'dunkerque', 'valenciennes', 'roubaix', 'tourcoing', 'douai', 'maubeuge', 'cambrai'],
  '60': ['oise', 'beauvais', 'compiegne', 'creil', 'senlis', 'noyon'],
  '62': ['pas-de-calais', 'arras', 'calais', 'boulogne-sur-mer', 'lens', 'bethune', 'saint-omer', 'berck'],
  '75': ['paris', 'parisien', 'parisienne', 'arrondissement'],
  '80': ['somme', 'amiens', 'amienois', 'abbeville', 'peronne', 'doullens', 'montdidier',
    'corbie', 'friville', 'roye', 'cayeux', 'saint-valery', 'picardie', 'picard'],
};

/** Termes ambigus : communes réelles de la Somme, mais mots courants. */
const AMBIGUS = new Set(['rue', 'ham', 'albert', 'nord', 'somme', 'arrondissement']);

export function detecterTerritoire(texte, flux = {}) {
  const t = ' ' + aplatir(texte) + ' ';
  const trouves = [];
  for (const [code, termes] of Object.entries(DEPARTEMENTS)) {
    for (const terme of termes) {
      const motif = terme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?<![a-z])${motif}(?![a-z])`).test(t)) {
        trouves.push({ code, terme });
        break;
      }
    }
  }
  const nets = trouves.filter((x) => !AMBIGUS.has(x.terme));
  if (nets.length) return { mode: 'texte', valeurs: [...new Set(nets.map((x) => x.code))] };
  if (flux.departement) return { mode: 'flux', valeurs: [flux.departement] };
  if (flux.region_codes) return { mode: 'flux-region', valeurs: flux.region_codes };
  return { mode: 'inconnu', valeurs: [] };
}

// ---------------------------------------------------------------------
// 5. FILTRE DÉTERMINISTE — recall d'abord (A3)
// ---------------------------------------------------------------------
function trouver(texte, lexique) {
  const t = aplatir(texte);
  return lexique.filter((m) => t.includes(m));
}

export function filtrer({ title = '', excerpt = '' }) {
  const texte = `${title} ${excerpt}`;
  const structures = trouver(texte, STRUCTURES);
  const faits = trouver(texte, FAITS);
  const graves = trouver(texte, FAITS_GRAVES);
  const mineurs = trouver(texte, MINEURS);
  const anti = ANTI_CONTEXTES
    .filter((a) => trouver(texte, a.termes).length > 0)
    .map((a) => a.motif);

  // R1 — structure accueillant des mineurs × fait
  if (structures.length && faits.length) {
    return {
      decision: 'CANDIDATE', regle: 'R1_STRUCTURE_x_FAIT',
      structures, faits, mineurs, anti_contextes: anti, rejection_reason: null,
    };
  }
  // R2 — filet de recall : mineur × (fait grave OU acte judiciaire fort),
  //      sans structure nommée — « un homme qui gardait des enfants écroué »
  const JUDICIAIRE_FORT = ['mis en examen', 'mise en examen', 'ecroue', 'incarcere',
    'garde a vue', 'condamne', 'condamnee', 'condamnation', 'detention provisoire', 'mandat de depot'];
  const judiciaire = trouver(texte, JUDICIAIRE_FORT);
  if (mineurs.length && (graves.length || judiciaire.length)) {
    return {
      decision: 'CANDIDATE', regle: 'R2_MINEUR_x_FAIT_GRAVE',
      structures, faits: graves, mineurs, anti_contextes: anti, rejection_reason: null,
    };
  }

  let raison = 'NI_STRUCTURE_NI_MINEUR';
  if (structures.length && !faits.length) raison = 'STRUCTURE_SANS_FAIT';
  else if (mineurs.length && faits.length) raison = 'MINEUR_x_FAIT_NON_GRAVE_SANS_STRUCTURE';
  else if (mineurs.length) raison = 'MINEUR_SANS_FAIT';
  else if (faits.length) raison = 'FAIT_SANS_PUBLIC_MINEUR';

  return {
    decision: 'REJECT', regle: null,
    structures, faits, mineurs, anti_contextes: anti, rejection_reason: raison,
  };
}

// ---------------------------------------------------------------------
// 6. CAPTEUR RSS (A2)
// ---------------------------------------------------------------------
function champ(bloc, nom) {
  const m = bloc.match(new RegExp(`<${nom}[^>]*>([\\s\\S]*?)</${nom}>`, 'i'));
  return m ? decodeEntites(m[1].replace(/<!\[CDATA\[|\]\]>/g, '')) : '';
}

export function parserRSS(xml) {
  const blocs = xml.split(/<item[\s>]/i).slice(1);
  return blocs
    .map((b) => {
      const fin = b.search(/<\/item>/i);
      const bloc = fin === -1 ? b : b.slice(0, fin);
      const lien = champ(bloc, 'link') || champ(bloc, 'guid');
      const date = champ(bloc, 'pubDate') || champ(bloc, 'dc:date');
      let iso = null;
      if (date) {
        const d = new Date(date);
        if (!Number.isNaN(d.getTime())) iso = d.toISOString();
      }
      return {
        title: champ(bloc, 'title'),
        url: lien,
        excerpt: champ(bloc, 'description'),
        published_at: iso,
      };
    })
    .filter((x) => x.title && x.url);
}

export function empreinte(url, title) {
  const cle = (url || '').split(/[?#]/)[0].replace(/\/$/, '') || aplatir(title);
  return createHash('sha1').update(cle).digest('hex').slice(0, 16);
}

/**
 * Capteur RSS conforme au contrat générique.
 * @returns {{flux, ok, status, octets, duree_ms, items, erreur}}
 */
export async function capteurRSS(flux, { timeoutMs = 15000 } = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(flux.url, {
      headers: {
        'user-agent': 'sousnosyeux-observatoire/0.1 (experimentation; contact@sousnosyeux.org)',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const corps = await r.text();
    return {
      flux,
      ok: r.ok,
      status: r.status,
      octets: Buffer.byteLength(corps),
      duree_ms: Date.now() - t0,
      items: r.ok ? parserRSS(corps) : [],
      erreur: r.ok ? null : `HTTP ${r.status}`,
    };
  } catch (e) {
    return { flux, ok: false, status: 0, octets: 0, duree_ms: Date.now() - t0, items: [], erreur: e.message };
  }
}
