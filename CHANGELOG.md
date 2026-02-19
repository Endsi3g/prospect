# Changelog - Uprising Prospect

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-02-18

### ✨ App Stabilization & UX Enhancement

#### 🚀 Features

- **Premium Landing Page**: Complete redesign of the landing page with a long-form, visually rich experience using Tabler Icons and premium Tailwind CSS v4 styling.
- **Forced Authentication Flow**: Implemented `SessionGuard` and `auth-util.ts` to protect internal dashboard routes, ensuring all unauthenticated users are redirected to the landing page.
- **Onboarding API**: Implemented primary account endpoints (`GET/PUT /api/v1/admin/account`) to manage user profile and onboarding wizard status from the backend.

#### 🔧 Fixes & Stabilization

- **API Port Mismatch**: Fixed "Fallback" mode by updating `NEXT_PUBLIC_API_BASE_URL` to use port `8001`, aligning with the FastAPI backend configuration.
- **Module Integration**: Verified and stabilized connectivity for key modules:
  - **Appointments**: Full API consistency for calendar and lead booking.
  - **Workflows**: Verified automation rule creation and management.
  - **Site Builder**: Confirmed endpoint mapping for landing page generation.
- **Onboarding Manager**: Optimized `OnboardingManager.tsx` with centralized public route detection.

#### 🛠 DevOps

- **Backend Infrastructure**: Standardized Pydantic and SQLAlchemy models for `AccountProfile`.
- **Environment Management**: Updated `.env.local` templates for consistent local deployment.

---

## [1.0.1] - 2026-02-13

### 🛠 Reliability & Infrastructure Cleanup

#### 🔧 Fixes

- **Backend Assistant Parsing**: Resolved `422 Unprocessable Entity` errors on assistant requests in `src/admin/app.py`.
- **Windows Test Stability**: Fixed permission issues in `pytest` by implementing a local `.pytest_tmp` base directory.

#### 🏗 Structure

- **Doc Refresh**: Updated `README.md` and API documentation for better clarity.
- **CI/CD**: Implemented GitHub Actions for backend tests and frontend builds.

---

## [1.0.0] - 2026-02-01

### 🎉 Initial Release

- Core Growth Automation Studio features.
- Lead sourcing and enrichment engine.
- AI-powered outreach sequences.
- Integrated Kanban pipeline.
