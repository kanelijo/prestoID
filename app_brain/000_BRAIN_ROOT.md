---
id: brain_root
title: MockS Master Brain
type: root_hub
status: active
last_updated: 2026-08-28
tags:
  - architecture
  - master_hub
  - mocks
  - minii_ai
---

# 🧠 MockS Master Neural Brain

Welcome to the central nervous system of **MockS** (powered by **Minii AI**). Every screen, function, state store, database table, API service, and past bug resolution is indexed and interconnected here.

---

## 🌟 0. Strategic Vision & Core Philosophy
- [[MockS_Master_Vision_and_Roadmap]] — *Exam Level Preparation At Home*, Minii AI Architecture, Multi-Institute Ecosystem, and 3-Year Growth Milestones.

---

## 🗺️ Master Neural Map

```text
                               ┌───────────────────────────┐
                               │  000_BRAIN_ROOT (Hub)     │
                               └─────────────┬─────────────┘
                                             │
      ┌───────────────────┬──────────────────┼───────────────────┬───────────────────┐
      ▼                   ▼                  ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  00_Vision   │   │ 01_Features  │   │  02_Screens  │   │  03_Stores   │   │ 04_Database  │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

---

## ⚡ 1. Core Feature Modules
- [[Feature_Minii_AI_Agent]] — Algorithmic learning agent, 24/7 doubt resolution, behavioral analytics, PDF test generator.
- [[Feature_Target_Exam_Engine]] — Timed mock tests, JEE/NEET patterns, negative marking.
- [[Feature_Student_Peers_and_Chat]] — Student directory, peer requests, and real-time chat.
- [[Feature_Community_Feed]] — Public & coaching social feed, likes, attachments, doubts.
- [[Feature_Test_Engine_and_Analytics]] — AI test generation, live dashboard, review system.
- [[Feature_Fee_and_Payments]] — Fee cycle management, receipt generation, student balance.
- [[Feature_Study_Notes_and_PDF]] — In-app PDF viewer, notebank, offline downloads.
- [[Feature_Feature_Flags_and_Playground]] — Secret gestures, dynamic DB flags, dev tools.
- [[Feature_Offline_Sync_and_Storage]] — SQLite fallback, offline action queue, sync worker.

---

## 📱 2. UI Screens & Navigation
- [[Screen_Auth_and_Onboarding]] — Entry auth flows, phone OTP, and initial routing.
- [[Screen_Admin_Dashboard]] — Admin root, institute profile, student roster.
- [[Screen_Admin_Test_Management]] — Admin test creators, bank management, live monitor.
- [[Screen_Student_Home_and_Profile]] — Student dashboard, profile, and digital ID card.
- [[Screen_Student_Peers_and_Chat]] — Peer discovery and real-time chat interface.
- [[Screen_Student_Test_Engine]] — Mock test taking engine, question navigation, results.

---

## 🔄 3. State Management & Stores
- [[Store_useAuthStore]] — Auth session, user profile, role state (`admin` / `student`).
- [[Store_useFeatureFlags]] — In-app dynamic feature toggles & developer unlocks.
- [[Store_useChatStore]] — Active conversation threads, optimistic message dispatch.
- [[Store_useOfflineQueue]] — Pending mutations queue during offline periods.
- [[Store_useNotificationStore]] — In-app and push notification badge counts & listeners.

---

## 🗄️ 4. Database & Backend Schema
- [[DB_Architecture_Overview]] — Supabase PostgreSQL schema, relations, foreign keys.
- [[Table_profiles_and_roles]] — `profiles`, institute linkages, claiming, avatars.
- [[Table_tests_and_submissions]] — `tests`, `questions`, `test_submissions`, score RPCs.
- [[Table_conversations_and_messages]] — `conversations`, `conversation_participants`, `messages`.
- [[Table_community_posts]] — `posts`, `comments`, `likes`, `attachments`.
- [[Security_RLS_Matrix]] — Row Level Security policies, admin grants, student boundaries.

---

## 🛠️ 5. Core Services & Utilities
- [[Service_Supabase_Client]] — `lib/supabase.ts`, auth headers, realtime channels.
- [[Service_Local_DB_and_Backup]] — `lib/localDb.ts`, `lib/backupService.ts`, Google Drive backup.
- [[Service_Notifications_and_Push]] — `lib/notifications.ts`, Expo Push Tokens.

---

## 🐞 6. Bug Log & Fix History
- [[BUG_001_Student_Cascade_Delete]] — Foreign key cascade fix during student deletion.
- [[BUG_002_Score_Calculation_Negative_Marking]] — SQL RPC fix for skipped questions scoring.
- [[BUG_003_Chat_RLS_and_Realtime_Duplicates]] — Chat message delivery & RLS policy fix.
- [[BUG_004_Claiming_Institute_Policies]] — Institute claiming multi-coaching security fixes.
