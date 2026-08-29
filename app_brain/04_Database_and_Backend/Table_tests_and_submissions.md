---
id: table_tests
title: tests, questions & submissions Tables
type: database_table
engine: PostgreSQL
rls_enabled: true
connected_features:
  - "[[Feature_Target_Exam_Engine]]"
related_bugs:
  - "[[BUG_002_Score_Calculation_Negative_Marking]]"
---

# Table: `tests`, `questions`, `test_submissions`

## 🗄️ Key Tables
- `tests` (`id`, `coaching_id`, `title`, `duration_minutes`, `pattern`, `status`)
- `questions` (`id`, `test_id`, `question_text`, `options`, `correct_answer`, `marking_scheme`)
- `test_submissions` (`id`, `test_id`, `student_id`, `score`, `accuracy`, `submitted_at`)

## ⚡ Stored Functions / RPCs
- `calculate_test_score(submission_id UUID)`: Computes marks with negative marking support.
