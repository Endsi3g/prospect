# Next Steps - Project Prospect

Date: 2026-02-17
Status: MVP implementation ongoing

## Immediate Actions (Next 24-48h)

### 1. Stability & Performance
- [ ] **Database Optimization**: Add indexes to `DBLead`, `DBInteraction`, `DBTask`, and `DBProject` as specified in `plans/stability_and_ux_refactor.md`.
- [ ] **Stats Service Refactor**: Optimize `compute_core_funnel_stats` to resolve the 10-second freeze issue.
- [ ] **Error Handling**: Standardize API error responses to prevent UI crashes and provide actionable feedback.

### 2. UI/UX Simplification
- [ ] **Campaign Filters**: Replace JSON-based filtering with a user-friendly form in the admin dashboard.
- [ ] **Dashboard Refresh**: Ensure all widgets load reliably without intermittent "Loading..." hangs.

### 3. Core Feature Completion
- [ ] **Nurture Engine**: Finalize the "campaign/nurture" schema (templates, steps, delays).
- [ ] **AI Integration**: Connect the context-aware script generation (emails, calls, DM) to the lead enrichment data.

## Short-Term Roadmap (1-2 Weeks)

### 1. Multi-Channel Outreach
- Implement multi-step email sequences with automated follow-ups.
- Integrate call script generation based on company and owner research.

### 2. Advanced Personalization
- Full implementation of the relevance scoring system.
- Large-scale personalized content generation.

### 3. Production Deployment
- Finalize build pipeline for Vercel (frontend).
- Deploy backend to Cloud Run / Render with proper environment key management.

## Technical Debt & Organization
- [x] Clean up and organize root folder structure.
- [ ] Update documentation in `docs/api/` and `docs/frontend/`.
- [ ] Improve automated test coverage for critical paths (leads, tasks, stats).
