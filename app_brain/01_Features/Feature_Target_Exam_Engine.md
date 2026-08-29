---
id: feat_target_exam
title: Target Exam Test Engine
type: feature
status: active
introduced_in: v1.0
connected_screens:
  - "[[Screen_Admin_Test_Management]]"
  - "[[Screen_Student_Test_Engine]]"
connected_stores:
  - "[[Store_useFeatureFlags]]"
connected_tables:
  - "[[Table_tests_and_submissions]]"
related_bugs:
  - "[[BUG_002_Score_Calculation_Negative_Marking]]"
---

# Feature: Target Exam Test Engine

## 🎯 Purpose & Scope
Allows coaching institute administrators to create timed mock practice tests modeled on national exams (JEE Main/Advanced, NEET) and allows enrolled students to take timed exams with instant scoring and detailed analytics.

## 🧠 Neural Connections
- **UI Admin Screen**: `app/(admin)/test/target-exam-admin.tsx` -> [[Screen_Admin_Test_Management]]
- **UI Student Screen**: `app/(student)/test/target-exam-student.tsx` -> [[Screen_Student_Test_Engine]]
- **Database Tables**: `tests`, `questions`, `test_submissions` -> [[Table_tests_and_submissions]]
- **Feature Flag Key**: `TARGET_EXAM_ENABLED` in [[Store_useFeatureFlags]]
- **Past Fixes**: [[BUG_002_Score_Calculation_Negative_Marking]]

## ⚙️ Core Logic Rules
1. **Exam Patterns**: Supports JEE (Single Correct, Multi-Correct, Numerical) and NEET (Single Correct +4/-1).
2. **Timer Integrity**: Local countdown with background timer protection.
3. **Auto-Submit**: When time reaches 00:00, triggers automatic payload submission to Supabase.
4. **Scoring RPC**: Uses Postgres stored procedure `calculate_test_score` to ensure tamper-proof grading.
