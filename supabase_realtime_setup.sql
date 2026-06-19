-- SQL Script to enable realtime updates for the community_posts table
-- Copy and run this script in your Supabase SQL Editor:

alter publication supabase_realtime add table public.community_posts;
