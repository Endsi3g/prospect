# Implementation Plan - Backend Stability and UX Simplification

This plan addresses the 10-second freeze reported in the evaluation and simplifies the "Campaigns" feature UX.

## 1. Backend Performance Optimization (Stability)

### 1.1 Add Missing Database Indexes
Add indexes to frequently queried/sorted columns in `src/core/db_models.py`:
- **DBLead**: `total_score`, `last_scored_at`, `created_at`, `updated_at`, `status`.
- **DBInteraction**: `lead_id`, `type`, `timestamp`.
- **DBTask**: `created_at`, `due_date`, `status`.
- **DBProject**: `created_at`, `due_date`, `status`.

### 1.2 Refactor `compute_core_funnel_stats` in `src/admin/stats_service.py`
- Optimize the `tier_distribution` calculation: Instead of fetching all tags for all leads, use a SQL query to count occurrences of tags starting with "Tier " if possible, or at least optimize the fetch.
- Ensure all count queries in `compute_core_funnel_stats` and `_build_daily_trend` are efficient and utilize the new indexes.

### 1.3 Optimize `list_leads` and `_get_tasks_payload`
- Ensure sorting columns are indexed.
- Review the `total = query.count()` call to ensure it's not the bottleneck.

## 2. UX Simplification (Product Improvements)

### 2.1 Simplify Campaign Enrollment (Addressing the "JSON" complaint)
- Refactor the campaign enrollment filter logic to be more user-friendly.
- While the full UI refactor belongs in the frontend, the backend can support it by providing better defaults and validation.

### 2.2 Improve Error Handling and Loading Feedback
- Implement the "fallback propre" (clean fallback) mentioned in the continuation plan.
- Ensure all endpoints return consistent error structures (standardized in `src/admin/app.py`).

## 3. Verification Plan

### 3.1 Automated Tests
- Create a performance test script that populates the database with 10k+ leads and measures response times for dashboard and lists.
- Add regression tests for the new optimized queries.

### 3.2 Manual Verification
- Verify the fixes in the local development environment using the `admin-dashboard`.

## 4. Proposed Steps

1. **Step 1:** Modify `src/core/db_models.py` to add indexes.
2. **Step 2:** Refactor `src/admin/stats_service.py` for better performance.
3. **Step 3:** (Optional/Ongoing) Work on the Secrets/Help refactor as per `IMPLEMENTATION_PLAN_ENV_KEYS_HELP_COMPAGNIEDOCS.md` if these are also causing issues.
