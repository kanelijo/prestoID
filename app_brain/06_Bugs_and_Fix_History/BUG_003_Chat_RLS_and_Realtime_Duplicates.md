---
id: bug_003
title: Chat Realtime Delivery & RLS Permission Denied
type: bug_fix
severity: high
status: resolved
date_fixed: 2026-08-28
affected_features:
  - "[[Feature_Student_Peers_and_Chat]]"
affected_tables:
  - "[[Table_conversations_and_messages]]"
sql_patch: "supabase_fix_chat_rls.sql"
---

# BUG #003: Chat Realtime Delivery & RLS Permission Denied

## 🐞 Problem Description
Students could not see incoming realtime chat messages, and attempts to insert messages occasionally returned 403 Forbidden.

## 🔍 Root Cause
The RLS policy checked `auth.uid() = sender_id` but did not check if the sender was an accepted participant in the conversation.

## 🛠️ Solution Applied
1. Executed `supabase_fix_chat_rls.sql` allowing bidirectional access for validated participants.
2. Added deduplication logic in [[Store_useChatStore]] to prevent duplicate bubbles when both optimistic state and realtime broadcast arrived.
