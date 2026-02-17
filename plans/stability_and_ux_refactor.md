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
- Optimize the `tier_distribution` calculation: Instead of fetching all tags for all leads and processing in Python, use a SQL `GROUP BY` query if tags are in a separate table (e.g., `SELECT tag, COUNT(*) FROM lead_tags WHERE tag LIKE 'Tier %' GROUP BY tag`). If tags are stored as JSON, implement a computed column or use DB-specific JSON indexing.
- Ensure all count queries in `compute_core_funnel_stats` and `_build_daily_trend` are efficient and utilize the new indexes.
- **Baseline:** Measure current response time for `/api/v1/admin/stats` (target < 200ms).

### 1.3 Optimize `list_leads` and `_get_tasks_payload`
- Ensure sorting columns are indexed.
- Review the `total = query.count()` call. Use an optimized count strategy such as estimated counts (`EXPLAIN`) or a separate lightweight count query to avoid expensive full scans on large datasets.

## 2. UX Simplification (Product Improvements)

### 2.1 Simplify Campaign Enrollment (Addressing the "JSON" complaint)
- Refactor the campaign enrollment filter UI: replace manual JSON editing with a simple form that generates the filter JSON. Include an "Advanced Mode" for raw JSON.
- Specify defaults to pre-populate filters (e.g., `status=active`, `created_at` within last 30 days).
- Implement JSON schema validation on the backend to provide friendly error messages (e.g., "Le champ 'min_score' doit être un nombre").

### 2.2 Improve Error Handling and Loading Feedback
- Implement a "fallback propre": return a sanitized, UI-friendly message and a retry option instead of raw stack traces.
- Standardize the error structure across all endpoints: `{ "error": "Code", "message": "Friendly Message", "details": { ... } }` as referenced in `src/admin/app.py`.

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
