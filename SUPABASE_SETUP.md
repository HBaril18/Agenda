# Configuration Supabase pour PlanifProf

## 1. Créer la table de verrouillage

Dans Supabase > SQL Editor, exécute `supabase-setup.sql`.

## 2. Installer Supabase CLI

```bash
npm install -g supabase
supabase login
supabase link --project-ref TON_PROJECT_REF
```

## 3. Déployer la fonction sécurisée

```bash
supabase functions deploy secure-login --no-verify-jwt
```

Les variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement dans les Edge Functions hébergées par Supabase.

## 4. Configurer les URL Auth

Dans Authentication > URL Configuration :

- Site URL : l'adresse GitHub Pages du projet
- Redirect URLs : ajouter l'adresse `login.html` du site

## 5. Comportement du verrouillage

- 3 mots de passe invalides maximum
- verrouillage temporaire de 15 minutes
- compteur remis à zéro après une connexion réussie
- la table privée `login_security` n'est pas accessible au navigateur

## 6. Protection complémentaire recommandée

Active aussi la protection CAPTCHA dans Supabase Auth et ajuste les limites dans Authentication > Rate Limits. Le verrouillage par compte peut autrement être utilisé par un tiers pour bloquer volontairement un compte connu.
