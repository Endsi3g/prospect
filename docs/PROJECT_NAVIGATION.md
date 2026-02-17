# Project Navigation Guide

This repository is organized to keep runtime code separate from operational scripts and planning docs.

## Top-level runtime files

- `requirements.txt`: Python dependencies.
- `.env.example`: Environment variable template.
- `README.md`: Product overview and quickstart.

## Source code

- `src/core/`: Models, database setup, and lightweight schema compatibility migrations.
- `src/enrichment/`: Apollo/Apify sourcing and enrichment services.
- `src/intent/`: Intent provider adapters (mock, Bombora, 6sense).
- `src/scoring/`: Scoring engine, rules config, and optimizer.
- `src/workflows/`: Pipeline orchestration logic.
- `src/admin/`: FastAPI admin dashboard and APIs.
- `src/outreach/`: Follow-up automation logic.
- `src/ai_engine/`: Prompting and message generation.

## Documentation

- `docs/NEXT_STEPS.md`: Immediate and short-term roadmap.
- `docs/README.md`
- `docs/api/admin_v1.md`
- `docs/operations/OPERATIONS_MANUAL.md`
- `docs/frontend/FRONTEND_REFACTOR_GUIDE.md`
- `docs/strategy/AI_INTEGRATION_PLAN.md`
- `docs/strategy/ADVANCED_FEATURES.md`
- `docs/strategy/NEXT_STEPS.md`
- `docs/playbooks/AUDIT_PLAYBOOK.md`
- `docs/playbooks/ELITE_SALES_MANUAL.md`

## Scripts

- `scripts/run_system.py`: Main CLI entrypoint for sourcing, enrichment, scoring, and outreach flow.
- `scripts/ops/check_connections.py`
- `scripts/ops/check_pipeline.py`
- `scripts/ops/setup_schedule.ps1`
- `scripts/ops/deploy.ps1`: Deployment automation.
- `scripts/ops/git_sync.ps1`: Git synchronization utility.
- `scripts/ops/dev_cycle.ps1`: Development cycle helper.
- `scripts/qa/test_frontends.ps1`: Frontend QA automation.
- `scripts/verification/verify_funnel.py`
- `scripts/verification/verify_advanced_system.py`
- `scripts/verification/test_followup_logic.py`
- `scripts/utilities/detect_region.py`: Geographic region detection.
- `scripts/utilities/extract_manual.py`
- `scripts/utilities/generate_proposal.py`

## Assets

- `assets/reference/`: Reference PDFs and manual source materials.

## Archive

- `archive/root-frontend-artifacts/`: Legacy npm artifacts moved out of root for cleaner navigation.
