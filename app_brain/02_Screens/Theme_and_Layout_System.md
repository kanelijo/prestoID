---
id: sys_theme_layout
title: App Layouts, Theme & Navigation System
type: architecture_system
connected_screens:
  - "[[Screen_Auth_and_Onboarding]]"
  - "[[Screen_Admin_Dashboard]]"
  - "[[Screen_Student_Home_and_Profile]]"
---

# 🎨 App Layouts, Theme & Navigation System

## 📁 Root Layouts
- **`app/_layout.tsx`**: Root Expo Router provider, font loader, sound effect initializer, network listener, and global error boundary.
- **`app/(admin)/_layout.tsx`**: Bottom tab navigation for Admin (Home, Tests, Students, Community, Profile).
- **`app/(student)/_layout.tsx`**: Bottom tab navigation for Student (Dashboard, Practice Tests, Peers, Notes, Profile).

## 🎭 Theme & Design Constants
- Colors: Dark mode palette, neon accents (#6366f1 Indigo, #10b981 Emerald, #ef4444 Crimson).
- Typography: Inter / SF Pro with scalable font sizing.
- Haptics & Audio: Integrated with `lib/audioEffects.ts` for test clicks and rewards.
