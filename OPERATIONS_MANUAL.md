# Manuel d'Opérations et de Déploiement - Prospect

Ce document détaille étape par étape comment configurer, déployer et faire fonctionner l'application **Prospect**, ainsi que les identifiants nécessaires pour les différents services.

## 1. Vue d'ensemble des Systèmes

L'application est composée de trois parties principales :

1. **Backend API (FastAPI)** : Gère la logique métier, l'IA, et la base de données. Hébergé sur **Render.com**.
2. **Admin Dashboard (Next.js)** : Interface de gestion pour les administrateurs. Hébergé sur **Netlify**.
3. **System Playground (Next.js)** : Interface de test et de simulation. Hébergé sur **Netlify**.
4. **Base de Données** : PostgreSQL, géré via **Supabase**.

---

## 2. Identifiants et Accès

Pour administrer l'application, vous devez vous connecter aux services suivants avec les identifiants indiqués :

### 2.1 Backend - Render.com (`prospect-api`)

* **Service** : [Render Dashboard](https://dashboard.render.com/)
* **Email de connexion** : `quebecsaas@gmail.com`
* **Rôle** : Hébergement du service Python (FastAPI).
* **Action requise** : Déployer le service, vérifier les logs, configurer les variables d'environnement.

### 2.2 Base de Données - Supabase

* **Service** : [Supabase Dashboard](https://supabase.com/dashboard)
* **Email de connexion** : `sitavex909@cameltok.com`
* **Rôle** : Hébergement de la base de données PostgreSQL.
* **Action requise** : Récupérer l'URL de connexion (Transaction Pooler) pour la variable `DATABASE_URL`.

### 2.3 Frontends - Netlify (`admin-dashboard`, `system-playground`)

* **Service** : [Netlify](https://app.netlify.com/)
* **Compte/Team** : `theuprising`
* **Rôle** : Hébergement des applications Next.js.
* **Action requise** : Déployer les sites, configurer les variables d'environnement (API URL).

---

## 3. Configuration et Déploiement (Étape par Étape)

### Étape 1 : Configuration de la Base de Données (Supabase)

* **Connection String** : `postgresql://postgres:Endsieg25$@db.rykkphesilpsyzhvvest.supabase.co:5432/postgres`
* **Supabase URL** : `https://rykkphesilpsyzhvvest.supabase.co`
* **Publishable Key** : `sb_publishable_f8AJB5VVNTheKh1XRtav_g_DZsNLeDj`

### Étape 2 : Déploiement du Backend (Render)

1. Connectez-vous à Render avec `quebecsaas@gmail.com`.
2. Sélectionnez le service Web `prospect-api` (ou créez-en un nouveau lié au dépôt GitHub).
3. Allez dans **Environment**. Assurez-vous que les variables suivantes sont définies :
    * `DATABASE_URL` : La chaîne de connexion Supabase (voir Étape 1).
    * `OPENAI_API_KEY` : Votre clé API OpenAI.
    * `ADMIN_CORS_ALLOW_ORIGINS` : La liste des URLs des frontends Netlify (ex: `https://votre-admin-dashboard.netlify.app,https://votre-playground.netlify.app`). Séparez par des virgules, sans espaces.
    * `JWT_SECRET` : Une clé secrète longue pour sécuriser les tokens.
    * `PYTHON_VERSION` : `3.11.14` (Géré automatiquement via `.tool-versions`).
4. Si vous faites une mise à jour de code, cliquez sur **Manual Deploy > Deploy latest commit**.
5. Attendez que le déploiement soit "Live".

### Étape 3 : Déploiement des Frontends (Netlify - Compte 'theuprising')

#### Admin Dashboard

1. Connectez-vous à Netlify avec le compte `theuprising`.
2. Allez sur le site `admin-dashboard`.
3. Allez dans **Site configuration > Environment variables**.
4. Ajoutez/Vérifiez :
    * `NEXT_PUBLIC_API_BASE_URL` : L'URL de votre backend Render (ex: `https://prospect-api-iso3.onrender.com`). **Attention : pas de slash à la fin !**
    * `NODE_VERSION` : `20`
5. Lancez un déploiement : **Deploys > Trigger deploy**.

#### System Playground

1. Allez sur le site `system-playground` dans Netlify.
2. Allez dans **Site configuration > Environment variables**.
3. Ajoutez/Vérifiez :
    * `NEXT_PUBLIC_API_BASE_URL` : L'URL de votre backend Render.
    * `NODE_VERSION` : `20`
4. Lancez un déploiement.

---

## 4. Accès à l'Application (Test de Fonctionnement)

Une fois tout déployé, voici comment accéder au système.

### Identifiants "Master" (Hardcoded)

Ces identifiants fonctionnent sur tous les environnements pour garantir l'accès, même si la base de données est vide :

**Utilisateur 1 (Super Admin)**

* **Utilisateur** : `Endsi3g`
* **Mot de passe** : `Endsieg25$`

**Utilisateur 2 (Admin Standard)**

* **Utilisateur** : `admin`
* **Mot de passe** : `Endsieg25$`

### Procédure de Test Rapide

1. Ouvrez l'URL du **System Playground** (Netlify).
    * Le formulaire de connexion devrait être pré-rempli avec `Endsi3g` / `Endsieg25$`.
    * Cliquez sur **DÉVERROUILLER**.
    * Si vous accédez au dashboard, la connexion Backend <-> Frontend fonctionne.

2. Ouvrez l'URL du **Admin Dashboard** (Netlify).
    * Le formulaire devrait être pré-rempli (ou utilisez `admin` / `Endsieg25$`).
    * Cliquez sur **Se connecter**.
    * Vérifiez que vous pouvez voir les paramètres et qu'il n'y a pas de clignotement de thème (corrigé avec le dernier patch).

---

## 5. Maintenance et Mises à Jour

### Mettre à jour le code

Le projet est configuré pour le déploiement continu (CI/CD) via Git.

1. Faites vos modifications locales sur votre machine.
2. Envoyez les changements sur GitHub :

    ```bash
    git add .
    git commit -m "Description des changements"
    git push origin main
    ```

3. **Render** et **Netlify** détecteront automatiquement le nouveau commit et redéploieront les services.
    * **Backend (Render)** : Prend 3-5 minutes.
    * **Frontends (Netlify)** : Prend 1-2 minutes.

### Dépannage Rapide

* **Bug de "Reload Infini" sur le Login** : Assurez-vous que le dernier correctif (`skipAuthRetry: true` dans `app-providers.tsx`) est bien déployé sur Netlify.
* **Erreur CORS (Bloqué par la politique...)** : Vérifiez `ADMIN_CORS_ALLOW_ORIGINS` sur Render. Il doit contenir l'URL exacte du frontend (sans slash à la fin).
* **Erreur 500 sur le Login** : Vérifiez les logs sur Render. Souvent lié à une erreur de connexion Base de Données (`DATABASE_URL`).

---
*Document généré le 12 Février 2026 par Google Antigravity.*
