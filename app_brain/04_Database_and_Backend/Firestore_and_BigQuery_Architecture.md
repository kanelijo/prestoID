---
id: firestore_bigquery_architecture
title: Cloud Firestore & BigQuery Telemetry Architecture
type: database_architecture
engines:
  - Cloud Firestore (Enterprise Native)
  - Google BigQuery
  - Supabase PostgreSQL
tags:
  - firestore
  - bigquery
  - telemetry
  - cbt_engine
  - realtime
---

# ⚡ Cloud Firestore & Google BigQuery Telemetry Architecture

MockS implements a **Tri-Database Strategy** to handle thousands of concurrent CBT examinees, sub-second live proctoring, and deep analytical processing without overloading the master transactional PostgreSQL database.

---

## 🏛️ Tri-Database Responsibility Matrix

| Database | Primary Role | Frequency | Typical Workloads |
| :--- | :--- | :--- | :--- |
| **Supabase PostgreSQL** | ACID Master Relational DB | Low-Medium | Auth, Student Rosters, Batches, Fees, Published Tests, Official Final Submissions. |
| **Cloud Firestore** | Realtime Edge Sync & Proctoring | High (Every 3-5s) | Active exam heartbeats, question navigation index, live online presence, doubt boards. |
| **Google BigQuery** | Analytics & AI Intelligence Warehouse | Batch / Stream | Millions of question response times, option distribution, discrimination index, AIR projections. |

---

## 📡 Firestore Collections Blueprint

### 1. `live_exam_sessions/{testId}/examinees/{studentId}`
Used for live exam heartbeat and real-time proctoring telemetry.
```json
{
  "testId": "test_uuid",
  "studentId": "student_uuid",
  "studentName": "Aarav Sharma",
  "currentQuestionIndex": 14,
  "totalAnswered": 12,
  "timeRemainingSeconds": 1420,
  "batteryLevel": 88,
  "networkStatus": "online",
  "lastHeartbeat": 1724976000000,
  "isCompleted": false,
  "updatedAt": "ServerTimestamp"
}
```

### 2. `cbt_telemetry_events/{eventId}`
High-resolution granular interaction logs automatically streamed to BigQuery via the Firebase **"Stream Collections to BigQuery"** extension.
```json
{
  "eventId": "test_uuid_student_uuid_timestamp_hash",
  "testId": "test_uuid",
  "studentId": "student_uuid",
  "batchId": "batch_uuid",
  "eventType": "OPTION_CHANGE",
  "questionId": "q_42",
  "selectedOptionIndex": 2,
  "previousOptionIndex": 1,
  "timeSpentOnQuestionSeconds": 45,
  "remainingTimeSeconds": 1375,
  "serverTimestamp": "ServerTimestamp"
}
```

### 3. `user_presence/{userId}`
Real-time peer presence tracker.
```json
{
  "userId": "user_uuid",
  "isOnline": true,
  "currentScreen": "student_notes",
  "lastActive": 1724976000000,
  "updatedAt": "ServerTimestamp"
}
```

---

## 📊 Google BigQuery Streaming Pipeline

```text
┌─────────────────────────┐
│     MockS Mobile App    │
│   (lib/firestore.ts)    │
└────────────┬────────────┘
             │ Writes cbt_telemetry_events
             ▼
┌─────────────────────────┐
│     Cloud Firestore     │
│ (cbt_telemetry_events)  │
└────────────┬────────────┘
             │ Firebase Extension: "Stream Collections to BigQuery"
             ▼
┌─────────────────────────┐
│     Google BigQuery     │
│ (mocks_cbt_telemetry)   │
└────────────┬────────────┘
             │
             ├───────────────────────────────────────────┐
             ▼                                           ▼
┌─────────────────────────┐                 ┌─────────────────────────┐
│    Item Response Theory │                 │     Minii AI Engine     │
│  (Question Difficulty)  │                 │  (Personalized Insights)│
└─────────────────────────┘                 └─────────────────────────┘
```

---

## 🔒 Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Examinees can only write their own heartbeat
    match /live_exam_sessions/{testId}/examinees/{studentId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == studentId;
    }

    // Telemetry events can only be inserted by authenticated students
    match /cbt_telemetry_events/{eventId} {
      allow create: if request.auth != null;
      allow read: if false; // Only accessible by BigQuery / Admin backend
    }

    // Presence rules
    match /user_presence/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
