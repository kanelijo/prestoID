---
id: store_feature_flags
title: useFeatureFlags
type: zustand_store
source_file: stores/useFeatureFlags.ts
connected_features:
  - "[[Feature_Feature_Flags_and_Playground]]"
  - "[[Feature_Target_Exam_Engine]]"
---

# Store: `useFeatureFlags`

## 📁 Location
`stores/useFeatureFlags.ts`

## 📦 Flags Controlled
- `TARGET_EXAM_ENABLED`: Toggles JEE/NEET test modules
- `STUDENT_CHAT_ENABLED`: Toggles peer directory & chat
- `AI_TEST_GENERATION`: Toggles Gemini AI question creator
- `OFFLINE_SYNC_ENABLED`: Toggles SQLite action queue

## ⚙️ Actions
- `fetchFlags()`: Fetches dynamic flags from Supabase
- `toggleFlag(key, value)`: Developer override in playground
