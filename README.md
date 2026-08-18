# PlanifProf avec base de données
## Comportement attendu

- La page d’accueil `index.html` est publique.
- Les pages suivantes sont protégées :
  - `builder.html`
  - `bibliotheque.html`
  - `groupes.html`
  - `certificats.html`
- Si un prof tente d’ouvrir une page protégée sans être connecté, le serveur redirige vers `login.html`.
- Après connexion, le prof accède seulement aux données associées à son compte.

## Données stockées

La base Supabase est créée automatiquement et stocke les données par utilisateur : horaires, cours, groupes, élèves, plans de classe, contraintes, plans d’intervention, évaluations et résultats.
