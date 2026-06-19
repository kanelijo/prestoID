-- Add missing target_batches and viewed_by columns to community_posts

ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS target_batches TEXT[] DEFAULT '{"All"}';
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS viewed_by UUID[] DEFAULT '{}';
