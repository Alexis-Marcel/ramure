# Ramure

**Votre arbre généalogique, chez vous.** Ramure est une application web open source pour construire, explorer et partager un arbre généalogique — entièrement dans le navigateur, sans serveur ni compte. Vos données familiales ne quittent jamais votre ordinateur.

## Fonctionnalités

- **Édition visuelle** — ajoutez parents, partenaires et enfants en deux clics ; l'arbre se réorganise automatiquement en vue « sablier » (ascendants au-dessus, descendants en dessous de la personne de référence).
- **Navigation fluide** — zoom à la molette, déplacement à la souris, double-clic sur une fiche pour recentrer l'arbre sur cette personne.
- **Local-first** — tout est sauvegardé automatiquement dans votre navigateur (localStorage). Aucune donnée n'est envoyée nulle part.
- **GEDCOM** — import et export au format standard de la généalogie, compatible avec Geneanet, Ancestry, Gramps, etc.
- **Page à partager** — exportez un fichier HTML autonome contenant l'arbre interactif en lecture seule : envoyez-le par mail à la famille ou déposez-le sur n'importe quel hébergeur statique.
- **Sauvegarde JSON** — exportez/importez une copie complète de vos données.

## Démarrer

```bash
npm install
npm run dev
```

Puis ouvrez http://localhost:5173. Pour essayer sans saisir de données, chargez l'exemple intégré : la famille de Victor Hugo.

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` | build de production dans `dist/` |
| `npm test` | tests unitaires (parseur GEDCOM, layout) |
| `npm run lint` | lint (oxlint) |

## Stack

React 19 + TypeScript + Vite, [zustand](https://github.com/pmndrs/zustand) pour l'état, SVG maison pour le rendu de l'arbre (aucune dépendance de visualisation). Polices auto-hébergées via Fontsource — l'app fonctionne hors ligne une fois chargée.

## Modèle de données

Le modèle suit la structure GEDCOM : des **personnes** (`INDI`) et des **unions** (`FAM`) reliant partenaires et enfants. Ce n'est donc pas un arbre au sens strict mais un graphe, ce qui permet remariages et familles recomposées.

## Feuille de route

- [ ] Photos sur les fiches
- [ ] Vue éventail (ascendance circulaire) et frise chronologique
- [ ] Sources et citations
- [ ] Impression / export PDF
- [ ] Collaboration (sync optionnelle auto-hébergeable)

Les contributions sont bienvenues — ouvrez une issue pour en discuter.

## Licence

[MIT](LICENSE)
