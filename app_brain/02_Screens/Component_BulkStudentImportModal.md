---
id: comp_bulk_import
title: BulkStudentImportModal Component
type: ui_component
source_file: components/BulkStudentImportModal.tsx
connected_screens:
  - "[[Screen_Admin_Dashboard]]"
connected_tables:
  - "[[Table_profiles_and_roles]]"
---

# Component: `BulkStudentImportModal`

## 📁 Source: `components/BulkStudentImportModal.tsx`
Allows institute admins to upload CSV/Excel files to bulk-register dozens or hundreds of students into a specific batch in a single action.

## 🧠 Neural Connections
- Used in: `app/(admin)/students/index.tsx`
- Inserts into: [[Table_profiles_and_roles]] (`profiles` and `auth.users`)
- Batch Processing: Validates phone numbers and emails before batch insertion.
