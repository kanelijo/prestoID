---
id: feat_community
title: Community & Doubt Feed
type: feature
status: active
introduced_in: v1.0
connected_screens:
  - "[[Screen_Admin_Dashboard]]"
  - "[[Screen_Student_Home_and_Profile]]"
connected_tables:
  - "[[Table_community_posts]]"
---

# Feature: Community & Doubt Feed

## 🎯 Purpose & Scope
Allows students and teachers to post study doubts, announcements, image attachments, comment on discussions, and like posts in a social feed format.

## 🧠 Neural Connections
- **Admin Community Screen**: `app/(admin)/community.tsx`
- **Student Community Screen**: `app/(student)/community.tsx`
- **Public Feed Screen**: `app/(student)/public-feed.tsx`
- **Database Tables**: `community_posts`, `community_comments`, `community_likes`, `community_attachments` -> [[Table_community_posts]]
