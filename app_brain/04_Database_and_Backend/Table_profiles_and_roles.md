---
id: table_profiles
title: profiles and user_roles Tables
type: database_table
engine: PostgreSQL
rls_enabled: true
connected_stores:
  - "[[Store_useAuthStore]]"
related_bugs:
  - "[[BUG_001_Student_Cascade_Delete]]"
  - "[[BUG_004_Claiming_Institute_Policies]]"
---

# Table: `profiles` & `user_roles`

## 🗄️ Schema Definitions
- `profiles` (`id` UUID PK, `full_name`, `phone`, `avatar_url`, `coaching_id`, `batch_id`, `target_exam`)
- `user_roles` (`user_id` UUID PK, `role` TEXT: 'admin' | 'student' | 'superadmin')

## 🔐 Security & RLS Policies
- Admin can read/write profiles within their own `coaching_id`.
- Students can read public profile cards of peers in the same `coaching_id`.
