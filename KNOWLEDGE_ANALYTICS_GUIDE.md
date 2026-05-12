# Knowledge Gain Analytics Guide

This guide implements the pipeline:

1. Pre-test (baseline)
2. 3D simulation run (performance + behavior)
3. Post-test (outcome)
4. Mobile app session duration analytics

## 1) Run the schema

Open Supabase SQL Editor and run:

- `knowledge_analytics_setup.sql`

It creates:

- `training_modules`
- `training_module_attempts`
- `training_simulation_sessions`
- `app_sessions` (mobile/personnel sessions)
- `v_training_knowledge_gain` (ready-to-query analytics view)

## 2) Record learner events

### Pre-test attempt

```sql
INSERT INTO training_module_attempts (admin_id, module_id, attempt_type, score, total_items, correct_items)
VALUES ('<admin_id>', '<module_id>', 'pre_test', 62, 20, 12);
```

### Simulation completion

```sql
INSERT INTO training_simulation_sessions (
  admin_id,
  module_id,
  completion_rate,
  simulation_score,
  duration_seconds,
  error_count,
  hint_count
)
VALUES ('<admin_id>', '<module_id>', 88, 84, 755, 2, 1);
```

### Post-test attempt

```sql
INSERT INTO training_module_attempts (admin_id, module_id, attempt_type, score, total_items, correct_items)
VALUES ('<admin_id>', '<module_id>', 'post_test', 86, 20, 17);
```

## 3) Analytics formula used

Normalized gain:

- $g = \frac{post - pre}{100 - pre}$

Interpretation:

- `g < 0.20` = low gain
- `0.20 <= g < 0.40` = moderate gain
- `g >= 0.40` = strong gain

## 4) Frontend integration added

- Service file: `src/utils/knowledgeAnalyticsService.js`
- Analytics page now pulls live stats: `src/components/Analytics.jsx`

Computed dashboard cards:

- Active users
- Questions answered (based on completed pre/post rows)
- Average mobile session duration
- Starting knowledge
- Current knowledge
- Knowledge gain

## 5) Optional next step (AI summary)

If you want natural-language insights, run a local model (free) with Ollama and feed it the aggregated rows from `v_training_knowledge_gain`.

Recommended local model for this use:

- `llama3.1:8b`

Prompt with strict JSON output so your dashboard can parse recommendations consistently.
