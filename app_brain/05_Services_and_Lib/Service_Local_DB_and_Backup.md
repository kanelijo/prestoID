---
id: srv_local_db
title: Local SQLite DB & Google Drive Backup Service
type: service
source_files:
  - lib/localDb.ts
  - lib/backupService.ts
  - lib/googleDrive.ts
connected_features:
  - "[[Feature_Offline_Sync_and_Storage]]"
---

# Service: Local DB & Cloud Backup

## 📁 Source Files
- `lib/localDb.ts`: Local SQLite storage for offline test taking and cached notes.
- `lib/backupService.ts`: Automated JSON export of student data and attendance.
- `lib/googleDrive.ts`: OAuth integration to sync database backups to the admin's personal Google Drive.
