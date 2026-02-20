# Plan de Continuité - Phase 3 : Workflows & Excellence UX

Ce plan vise à combler les dernières lacunes critiques identifiées lors des tests et à élever l'expérience utilisateur aux standards professionnels.

## 1. Excellence UX & Feedback Visuel

### 1.1. Notifications (Toasts)
- **Objectif** : Remplacer les alertes silencieuses par des notifications visuelles.
- **Action** : Vérifier et généraliser l'usage de `sonner` dans tous les formulaires (Leads, Tasks, Appointments).

### 1.2. États de Chargement (Spinners & Skeletons)
- **Objectif** : Éliminer les sauts de contenu lors du chargement des données.
- **Action** : Ajouter des `Skeleton` loaders sur les tableaux de bord et les listes (Leads, Pipeline). Ajouter des `IconLoader2` (spin) sur les boutons lors des soumissions API.

### 1.3. Actions Groupées (Bulk Actions)
- **Objectif** : Permettre la gestion de masse.
- **Action** : Ajouter des checkboxes sur la `LeadsTable` pour supprimer ou changer le statut de plusieurs leads à la fois.

## 2. Workflows & Automatisation (Feature Critique)

### 2.1. Moteur de Workflows "If This Then That"
- **Objectif** : Automatiser les actions répétitives.
- **Action Backend** : Créer un modèle `DBWorkflowRule` (Trigger, Criteria, Action).
- **Action Frontend** : Créer une page `/workflows` pour configurer des règles simples (ex: "Si Score > 80, alors Créer Tâche de relance").

### 2.2. Automatisation des Étapes
- **Objectif** : Transition automatique dans le funnel.
- **Action** : Déclencher un changement d'étape vers "BOOKED" automatiquement lorsqu'un rendez-vous est créé.

### 2.3. Automatisations Avancées (Nouvelle Phase)
- **Triggers additionnels** :
    - `lead_created` : Déclenché lors de l'ajout manuel ou via landing page.
    - `task_completed` : Déclenché quand une tâche passe en statut "Done".
- **Actions additionnelles** :
    - `send_webhook` : Envoyer les données du lead à une URL externe (ex: Zapier/Slack).
    - `add_tag` : Ajouter automatiquement un tag au lead (ex: "VIP" si score > 90).
- **Logique métier** :
    - "Si un lead est créé, alors envoyer un webhook de notification."
    - "Si une tâche de 'Qualification' est terminée, alors passer le lead en étape 'engaged'."

## 3. Déploiement & Versioning

### 3.1. Consolidation Git
- **Action** : Effectuer un commit global de toutes les fonctionnalités ajoutées (Appointments + UX + Fixes).
- **Message** : "feat: add appointment booking system, i18n updates and core architecture fixes"

## 4. Plan de Vérification
- **Test UX** : Vérifier que chaque action (création/édition) affiche un Toast de succès ou d'erreur.
- **Test Workflow** : Créer un rendez-vous et vérifier que le statut du lead passe bien en "BOOKED".
- **Validation Git** : `git status` et `git log` pour confirmer la propreté du repo.
