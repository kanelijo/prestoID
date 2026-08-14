# KanelFlow Execution Task List

- [x] Initialize Feature Flags
  - [x] Create Zustand Store `stores/useFeatureFlags.ts`
  - [x] Fetch database flags on app startup in `app/index.tsx`
  - [x] Implement secret tap-gesture unlock in `app/(admin)/profile.tsx` & `app/(student)/profile.tsx`
  - [x] Build Developer Playground UI screen `app/playground.tsx`
- [x] Implement Target Exam Test Engine
  - [x] Build Admin Config UI `app/(admin)/test/target-exam-admin.tsx`
  - [x] Build Student Practice UI `app/(student)/test/target-exam-student.tsx`
- [x] Implement Student-to-Student Conversation
  - [x] Build Student Directory screen `app/(student)/peers.tsx`
  - [x] Add Profile Popup Modal with strict conditions & Privacy Link
  - [x] Implement Request Flow (Pending / Accept / Reject triggers)
  - [x] Build Chat Message view `app/(student)/student-chat.tsx`
