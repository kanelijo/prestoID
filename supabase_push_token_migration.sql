-- SQL Script to add push_token column for push notifications
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token TEXT;
