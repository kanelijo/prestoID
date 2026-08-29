---
id: table_chat
title: conversations & messages Tables
type: database_table
engine: PostgreSQL
rls_enabled: true
connected_features:
  - "[[Feature_Student_Peers_and_Chat]]"
related_bugs:
  - "[[BUG_003_Chat_RLS_and_Realtime_Duplicates]]"
---

# Table: `conversations` & `messages`

## 🗄️ Schema Definitions
- `conversations` (`id` UUID, `coaching_id`, `created_at`)
- `conversation_participants` (`conversation_id`, `user_id`, `status`: 'pending' | 'accepted' | 'rejected')
- `messages` (`id` UUID, `conversation_id`, `sender_id`, `content`, `is_read`, `created_at`)

## 🔐 RLS Rules
- Only users listed in `conversation_participants` with `status = 'accepted'` can SELECT or INSERT into `messages`.
