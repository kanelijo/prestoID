---
id: bug_002
title: Score Calculation Penalized Skipped Questions
type: bug_fix
severity: high
status: resolved
date_fixed: 2026-08-28
affected_features:
  - "[[Feature_Target_Exam_Engine]]"
affected_tables:
  - "[[Table_tests_and_submissions]]"
sql_patch: "fix_score_calculation_v2.sql"
---

# BUG #002: Score Calculation Penalized Skipped Questions

## 🐞 Problem Description
When students skipped questions in a JEE/NEET test, the scoring algorithm treated `null` as an incorrect answer and deducted negative marks (-1).

## 🔍 Root Cause
The comparison `user_answer != correct_answer` evaluated to true when `user_answer` was `null`.

## 🛠️ Solution Applied
Updated SQL stored function in `fix_score_calculation_v2.sql` with an explicit check:
```sql
IF student_answer IS NULL THEN
  -- Skipped: 0 marks
  score := score + 0;
ELSIF student_answer = correct_answer THEN
  score := score + correct_marks;
ELSE
  score := score - negative_marks;
END IF;
```
