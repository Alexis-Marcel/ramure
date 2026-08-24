# Ramure

**Votre arbre généalogique, chez vous.** Ramure est une application web open source pour construire, explorer et partager un arbre généalogique — local-first, sans compte ni service tiers. Vos données familiales restent dans votre navigateur, et se synchronisent en famille via votre propre serveur si vous le souhaitez.

**Essayer sans installer :** https://alexis-marcel.github.io/ramure/

## Fonctionnalités

- **Édition visuelle** — ajoutez parents, partenaires et enfants en deux clics ; l'arbre se réorganise automatiquement en vue « sablier » (ascendants au-dessus, descendants en dessous de la personne de référence).
- **Navigation fluide** — zoom à la molette, déplacement à la souris, double-clic sur une fiche pour recentrer l'arbre sur cette personne.
- **Local-first** — tout est sauvegardé automatiquement dans votre navigateur (IndexedDB) et fonctionne hors-ligne. Aucune donnée n'est envoyée à un service tiers.
- **Espace famille** — construisez l'arbre à plusieurs, en direct ou en décalé : les modifications de chacun fusionnent automatiquement (CRDT Yjs) via un petit serveur auto-hébergé, fourni en image Docker.
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

## Héberger pour la famille (Docker)

Une seule image contient l'application **et** le serveur de synchronisation. Aucune base de données à installer : la persistance est un LevelDB embarqué dans le volume `/data` (sauvegarder = copier ce dossier).

```bash
docker run -d --name ramure \
  -p 8484:8484 \
  -v /chemin/vers/vos/donnees:/data \
  ghcr.io/alexis-marcel/ramure:latest
```

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `8484` | port HTTP + WebSocket |
| `DATA_DIR` | `/data` | dossier de persistance des espaces famille |

- **Unraid** : ajoutez un conteneur avec l'image `ghcr.io/alexis-marcel/ramure:latest`, mappez un port et le volume `/data`, c'est tout.
- **Reverse proxy** (Nginx Proxy Manager, Traefik…) : pointez votre domaine vers le port du conteneur et **activez le support WebSocket**. Le HTTPS du proxy suffit, le serveur n'a rien à configurer.
- `GET /health` répond `{"status":"ok"}` pour vos sondes.

### Créer un espace famille

Dans l'app : **Famille → adresse de votre serveur → Créer l'espace famille**, puis envoyez le lien d'invitation. Chaque membre garde une copie complète hors-ligne ; le serveur fusionne et mémorise les modifications, y compris celles faites pendant que les autres étaient déconnectés. L'identifiant secret de l'espace fait office de clé d'accès : ne partagez le lien qu'en privé.

## Stack

React 19 + TypeScript + Vite, [zustand](https://github.com/pmndrs/zustand) pour l'état, SVG maison pour le rendu de l'arbre (aucune dépendance de visualisation). Polices auto-hébergées via Fontsource — l'app fonctionne hors ligne une fois chargée.

## Modèle de données

Le modèle suit la structure GEDCOM : des **personnes** (`INDI`) et des **unions** (`FAM`) reliant partenaires et enfants. Ce n'est donc pas un arbre au sens strict mais un graphe, ce qui permet remariages et familles recomposées.

## Feuille de route

- [ ] Photos sur les fiches
- [ ] Vue éventail (ascendance circulaire) et frise chronologique
- [ ] Sources et citations
- [ ] Impression / export PDF
- [x] Collaboration (sync optionnelle auto-hébergeable)

Les contributions sont bienvenues — ouvrez une issue pour en discuter.

## Licence

[MIT](LICENSE)
