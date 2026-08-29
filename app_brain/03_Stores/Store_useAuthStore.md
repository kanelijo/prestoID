---
id: store_auth
title: useAuthStore
type: zustand_store
source_file: stores/useAuthStore.ts
connected_screens:
  - "[[Screen_Auth_and_Onboarding]]"
  - "[[Screen_Admin_Dashboard]]"
  - "[[Screen_Student_Home_and_Profile]]"
---

# Store: `useAuthStore`

## 📁 Location
`stores/useAuthStore.ts`

## 📦 State Variables
- `session`: Supabase Auth Session | null
- `user`: User profile object with `id`, `role`, `coaching_id`
- `isAuthenticated`: boolean
- `isLoading`: boolean

## ⚙️ Core Actions
- `setSession(session)`: Updates active JWT token
- `setUser(user)`: Caches student/admin profile
- `signOut()`: Flushes local storage and session
