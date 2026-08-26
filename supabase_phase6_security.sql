-- Phase 6: Security & Settings

-- 1. Single-Device Login: Add device_id to profiles to lock the account to a specific device.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS device_id TEXT;

-- 2. Institutes: Add trial start date to enforce 7-day trial logic
ALTER TABLE institutes ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Institutes: Add some basic settings columns
ALTER TABLE institutes ADD COLUMN IF NOT EXISTS auto_absent_alert BOOLEAN DEFAULT TRUE;
ALTER TABLE institutes ADD COLUMN IF NOT EXISTS auto_fee_reminder BOOLEAN DEFAULT TRUE;
ALTER TABLE institutes ADD COLUMN IF NOT EXISTS community_notifications BOOLEAN DEFAULT TRUE;
