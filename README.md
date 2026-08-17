# PlanifProf avec base de données

## Lancer le site localement

Le bouton de connexion fonctionne avec le serveur Python, pas en ouvrant simplement les fichiers HTML directement.

```bash
python3 app.py
```

Ouvrir ensuite :

```text
http://localhost:8000/login.html
```

## Compte test

- Utilisateur : `test`
- Mot de passe : `test`

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

La base SQLite `planifprof.db` est créée automatiquement et stocke les données par utilisateur : horaires, cours, groupes, élèves, plans de classe, contraintes, plans d’intervention, évaluations et résultats.
