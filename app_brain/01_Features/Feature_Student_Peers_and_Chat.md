---
id: feat_student_peers_chat
title: Student Directory & Peer Chat
type: feature
status: active
introduced_in: v1.0
connected_screens:
  - "[[Screen_Student_Peers_and_Chat]]"
connected_stores:
  - "[[Store_useChatStore]]"
  - "[[Store_useAuthStore]]"
connected_tables:
  - "[[Table_conversations_and_messages]]"
  - "[[Table_profiles_and_roles]]"
related_bugs:
  - "[[BUG_003_Chat_RLS_and_Realtime_Duplicates]]"
---

# Feature: Student Directory & Peer Chat

## 🎯 Purpose & Scope
Enables students within the same coaching institute to discover peers, send connection requests, view privacy-controlled profile cards, and chat 1-on-1 in real-time.

## 🧠 Neural Connections
- **UI Screen (Directory)**: `app/(student)/peers.tsx` -> [[Screen_Student_Peers_and_Chat]]
- **UI Screen (Chat)**: `app/(student)/student-chat.tsx` -> [[Screen_Student_Peers_and_Chat]]
- **State Store**: [[Store_useChatStore]]
- **Database Tables**: `conversations`, `conversation_participants`, `messages` -> [[Table_conversations_and_messages]]
- **Security**: [[Security_RLS_Matrix]]

## ⚙️ Core Logic Rules
1. **Coaching Isolation**: Students can only view and request connections with students enrolled in their same `coaching_id`.
2. **Connection Request State Machine**: `[NO_REQUEST] -> [PENDING] -> [ACCEPTED / REJECTED]`
3. **Optimistic UI**: Messages render instantly in UI before Supabase confirmation; rollbacks occur on network failure.
4. **Realtime**: Subscribes to Supabase Realtime channel `realtime:public:messages:conversation_id=eq.{id}`.
