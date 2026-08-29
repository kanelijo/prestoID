---
id: db_overview
title: Supabase Database Architecture Overview
type: database_overview
engine: PostgreSQL 15+
connected_tables:
  - "[[Table_profiles_and_roles]]"
  - "[[Table_tests_and_submissions]]"
  - "[[Table_conversations_and_messages]]"
  - "[[Table_community_posts]]"
---

# 🗄️ Supabase Database Architecture Overview

KanelFlow uses a multi-tenant coaching institute architecture powered by Supabase PostgreSQL with strict Row Level Security (RLS).

## 📊 Core Relational Entity Graph

```text
┌──────────────┐       ┌────────────────────────┐
│  coachings   │◄──────┤       profiles         │
└──────┬───────┘       └───────────┬────────────┘
       │                           │
       ├──────────────┐            ├────────────────────────┐
       ▼              ▼            ▼                        ▼
┌──────────────┐ ┌─────────┐ ┌──────────────┐     ┌───────────────────┐
│    tests     │ │  posts  │ │ conversations│     │ student_payments  │
└──────┬───────┘ └─────────┘ └──────┬───────┘     └───────────────────┘
       ▼                            ▼
┌──────────────┐             ┌──────────────┐
│  questions   │             │   messages   │
└──────────────┘             └──────────────┘
```
