---
id: screen_auth
title: Authentication & Onboarding Screens
type: screen
category: authentication
connected_stores:
  - "[[Store_useAuthStore]]"
connected_tables:
  - "[[Table_profiles_and_roles]]"
---

# Screen: Authentication & Onboarding

## 📁 Source Files
- `app/index.tsx` (Root splash & session router)
- `app/onboarding.tsx` (Welcome carousel & role picker)
- `app/(auth)/*` (Phone number input, OTP verification)

## 🧠 Neural Connections
- **Store**: [[Store_useAuthStore]]
- **Target Tables**: `profiles`, `user_roles` -> [[Table_profiles_and_roles]]
- **Auth Provider**: Supabase GoTrue Phone Auth
