---
id: feat_feature_flags
title: Feature Flags & Developer Playground
type: feature
status: active
introduced_in: v1.0
connected_screens:
  - "[[Screen_Admin_Dashboard]]"
  - "[[Screen_Student_Home_and_Profile]]"
connected_stores:
  - "[[Store_useFeatureFlags]]"
---

# Feature: Feature Flags & Developer Playground

## 🎯 Purpose & Scope
Provides runtime feature toggles fetched from database configurations with a secret gesture unlock to access the in-app Developer Playground.

## 🧠 Neural Connections
- **Store**: [[Store_useFeatureFlags]] (`stores/useFeatureFlags.ts`)
- **Developer Screen**: `app/playground.tsx`
- **Unlock Triggers**:
  - `app/(admin)/profile.tsx` (7 rapid taps on build version)
  - `app/(student)/profile.tsx` (7 rapid taps on build version)
