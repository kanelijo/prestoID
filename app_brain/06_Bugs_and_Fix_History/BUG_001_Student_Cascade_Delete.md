---
id: bug_001
title: Student Deletion Foreign Key Cascade Failure
type: bug_fix
severity: critical
status: resolved
date_fixed: 2026-08-28
affected_tables:
  - "[[Table_profiles_and_roles]]"
sql_patch: "supabase_delete_student_cascade_fix.sql"
---

# BUG #001: Student Deletion Foreign Key Cascade Failure

## 🐞 Problem Description
Deleting a student profile from the Admin screen crashed because foreign key constraints in `student_payments`, `test_submissions`, and `community_comments` blocked deletion.

## 🔍 Root Cause
Foreign key references were created with default `ON DELETE NO ACTION` instead of `ON DELETE CASCADE`.

## 🛠️ Solution Applied
Executed `supabase_delete_student_cascade_fix.sql` and `master_fix_student_deletion.sql` to drop old foreign keys and recreate them with `ON DELETE CASCADE`.
