-- =====================================================================
-- Migration 012 — `source_resolutions` : mémoire du pont vers la source
--
-- CIBLE : Neon (base `neondb`, branche `migration-clean`).
--
-- LE PROBLÈME QU'ELLE MÉMORISE. `watch-updates` interroge Google News,
-- qui ne rend que des identifiants opaques. Mesuré le 25/09/2026 sur le
-- backlog réel : 126 documents sur 126 sont dans ce cas, et aucun n'est
-- résolvable par décodage, redirection ou meta-refresh. Retrouver l'URL
-- éditeur coûte une recherche web par document. Ce coût ne doit être
-- payé qu'une fois.
--
-- POURQUOI PAS UNE TABLE EXISTANTE
--   · `articles` — écartée. Son contrat est le registre des articles LUS,
--     et `content_fingerprint` y est NOT NULL : elle ne peut pas porter
--     un ÉCHEC de résolution, qui est précisément ce qu'il faut mémoriser
--     pour ne pas le repayer.
--   · `case_checks` — écartée. Son grain est (affaire, challenge). Un
--     document remonté pour trois affaires est UN document : le résoudre
--     trois fois serait payer trois fois la même recherche.
--
-- Le grain est donc le DOCUMENT, identifié par (titre normalisé, domaine
-- éditeur) — l'identifiant Google News change d'un cycle à l'autre pour
-- un même article et ne peut pas servir de clé.
--
-- MÉMOIRE RÉESSAYABLE, PAS MORTE. Un échec porte `checked_at` et
-- `failure_reason`, jamais un verdict définitif : un article introuvable
-- aujourd'hui peut être indexé demain. C'est l'appelant qui décide du
-- délai de reprise, la table ne l'impose pas.
--
-- 100 % additive, idempotente, rejouable.
-- =====================================================================

create table if not exists source_resolutions (
  doc_key             text primary key,

  -- Ce que la veille avait trouvé.
  case_ids            jsonb not null default '[]'::jsonb,
  titre               text,
  publisher_domain    text,
  raw_url             text,

  -- Ce que la résolution a produit.
  publisher_url       text,
  resolution_method   text,
  resolution_family   text
                        check (resolution_family is null or resolution_family in
                          ('MEME_EDITEUR', 'MEME_FAIT', 'MEME_FAIT_AGREGATEUR')),
  fetch_status        text,
  content_fingerprint text,
  failure_reason      text,

  resolved_at         timestamptz,
  checked_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index if not exists idx_source_resolutions_statut
  on source_resolutions(fetch_status, checked_at desc);

comment on table source_resolutions is
  'Mémoire du pont résultat de veille → document source. Une ligne = un '
  'document, quel que soit le nombre d''affaires concernées. Les échecs '
  'sont mémorisés mais restent réessayables.';

comment on column source_resolutions.resolution_family is
  'MEME_EDITEUR : l''article du média que la veille a remonté. MEME_FAIT : '
  'un autre média couvrant le même fait, quand le premier est '
  'introuvable — substitution légitime pour SNY, qui documente des faits '
  'et non des exemplaires, mais qui doit être DÉCLARÉE et vérifiée. '
  'MEME_FAIT_AGREGATEUR : reprise syndiquée, non admissible comme source '
  'primaire au sens de la règle R4.';
