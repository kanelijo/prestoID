-- Telegram Dual-Stream Storage Schema Update
-- Run this in your Supabase SQL Editor

ALTER TABLE community_posts 
ADD COLUMN IF NOT EXISTS tg_file_id TEXT,
ADD COLUMN IF NOT EXISTS backup_url TEXT,
ADD COLUMN IF NOT EXISTS file_type TEXT,
ADD COLUMN IF NOT EXISTS local_sync_id TEXT;
