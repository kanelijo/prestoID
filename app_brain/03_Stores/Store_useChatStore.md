---
id: store_chat
title: useChatStore
type: zustand_store
source_file: stores/useChatStore.ts
connected_features:
  - "[[Feature_Student_Peers_and_Chat]]"
connected_screens:
  - "[[Screen_Student_Peers_and_Chat]]"
---

# Store: `useChatStore`

## 📁 Location
`stores/useChatStore.ts`

## 📦 State Variables
- `activeConversationId`: string | null
- `messages`: Record<conversationId, Message[]>
- `unreadCounts`: Record<conversationId, number>

## ⚙️ Actions
- `addOptimisticMessage(payload)`: Adds message to local state immediately
- `confirmMessage(localId, serverMessage)`: Replaces temp ID with UUID from Supabase
- `markAsRead(conversationId)`: Clears unread badge
