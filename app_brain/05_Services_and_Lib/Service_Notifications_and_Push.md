---
id: srv_notifications
title: Notifications & Push Service
type: service
source_files:
  - lib/notifications.ts
  - lib/telegram.ts
  - lib/resendService.ts
---

# Service: Notifications & Push Multi-Channel Dispatch

## 📁 Source Files
- `lib/notifications.ts`: Expo Push Notifications handler for test reminders and peer chat.
- `lib/telegram.ts`: Automated alerts sent to Institute Telegram channel when new tests are published.
- `lib/resendService.ts`: Email transactional service for fee receipts and password recovery.
