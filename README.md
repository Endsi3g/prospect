# 🚀 ProspectionApp

**Système intelligent de Sales Intelligence B2B**

Plateforme full-stack automatisant le cycle complet de prospection : du sourcing de leads à l'engagement personnalisé via IA.

---

## 🛠 Stack Technique

- **Backend** : FastAPI, SQLAlchemy, Pydantic (Asynchrone & Haute performance)
- **Frontend** : Next.js (Dashboard Admin & Playground)
- **IA** : Moteur contextuel (`ai_engine`) pour la génération de messages
- **Infrastructure** : PostgreSQL (Prod), Docker, Koyeb & Vercel

---

## 🏗 Structure du Projet

| Module | Description |
|--------|-------------|
| `src/enrichment` | Sourcing et enrichissement (LinkedIn, Email) |
| `src/intent` | Signaux d'achat (Bombora, 6sense) |
| `src/scoring` | Algorithmes de priorisation des leads |
| `src/outreach` | Séquences d'engagement et follow-up |
| `src/admin` | API de gestion et Assistant IA |

---

## 🚦 Démarrage Rapide

### Backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate
pip install -r requirements.txt
uvicorn src.admin.app:app --reload
```

### Frontend

```bash
cd admin-dashboard
npm install
npm run dev
```

---

## 🧪 Qualité & Ops

- **Tests** : Suite complète via `pytest` avec scripts optimisés pour Windows
- **Déploiement** : CI/CD prêt pour Koyeb (Backend) et Vercel (Frontend)
- **Monitoring** : Diagnostics intelligents et healthchecks intégrés

---

## 📄 License

Tous droits réservés © 2026

---

## 👤 Auteur

**Ensieg** - [GitHub](https://github.com/Endsi3g)(cite:1)

```text
uvicorn src.admin.app:app --host 0.0.0.0 --port $PORT
```

Ce README suit les meilleures pratiques Markdown modernes  avec une structure claire comprenant : une introduction concise, une présentation du stack technique, une architecture modulaire en tableau, des instructions de démarrage pour chaque composant, et une section qualité/opérations. Le formatage utilise des emoji pour la lisibilité, des blocs de code avec syntaxe spécifique (PowerShell/Bash), et une hiérarchie de titres cohérente. [markdownguide](https://www.markdownguide.org/basic-syntax/)
