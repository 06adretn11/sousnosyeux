# Rendus de référence — mesures reproductibles

Mesuré le 15 septembre 2026 sur `index.html`
(`sha256 a09fb67c6362517af1d21dc065aeac736557dc3cf79b3271fe2e91098f8bdc4f`).

Ce fichier remplace volontairement des captures d'écran binaires : des **valeurs mesurées**
se comparent, se versionnent et se rejouent, une image non. Les captures peuvent être
reproduites à l'identique par la procédure du §3.

## 1. Mobile — 390 × 844

| Mesure | Valeur |
|---|---|
| `document.documentElement.scrollWidth` | **390** |
| Défilement horizontal de la page | **non** |
| `<meta name="robots">` | `noindex,nofollow,noarchive` |
| Éléments dépassant le cadre | **2** — `NAV.main-nav`, `A.contact-button` |

⚠️ Les deux éléments en dépassement sont le **défaut de navigation mobile** que la vidéo du
prototype d'origine laissait voir. La reconstruction le *contient* (le conteneur
`.nav-scroll` est en `overflow-x: auto`) sans le *corriger* : la barre de navigation reste
plus large que l'écran et doit être défilée latéralement. La page elle-même ne défile pas.

Ce défaut est **conservé** : il fait partie de la référence. Le template public V1 ne le
reprend pas — le moteur de hub n'a pas de barre de navigation propre.

## 2. Desktop — 1440 × 900

| Mesure | Valeur |
|---|---|
| `document.documentElement.scrollWidth` | **1425** (< 1440) |
| Défilement horizontal | **non** |
| `.content-grid` | `671.234px 402.75px` — deux colonnes |
| Cartes d'affaires rendues | **9** |
| Éléments dépassant le cadre | **0** |

Rappel : l'adaptation desktop est **inférée**, pas observée. La vidéo d'origine ne montrait
que le rendu mobile (cf. `README.md` §2.3).

## 3. Reproduire ces mesures

Ouvrir `index.html` dans un navigateur, régler la fenêtre à la largeur voulue, puis exécuter
dans la console :

```js
JSON.stringify({
  vw: innerWidth,
  scrollW: document.documentElement.scrollWidth,
  overflow: document.documentElement.scrollWidth > innerWidth,
  robots: document.querySelector('meta[name=robots]')?.content,
  debordements: [...document.querySelectorAll('*')]
    .filter(e => e.getBoundingClientRect().right > innerWidth + 1)
    .map(e => e.tagName + '.' + (e.className || '')),
})
```

Les polices sont chargées depuis Google Fonts : hors ligne, les substitutions de secours
(`system-ui`, `Georgia`, `Courier New`) décalent légèrement les hauteurs, jamais les largeurs
mesurées ci-dessus.
