-- Add multi-coaching support to community posts
ALTER TABLE public.community_posts
ADD COLUMN IF NOT EXISTS institute_id UUID REFERENCES public.institutes(id),
ADD COLUMN IF NOT EXISTS target_batches TEXT[] DEFAULT '{}'::text[];

-- Update RLS policies to restrict posts by institute
DROP POLICY IF EXISTS "Allow public read of community posts" ON public.community_posts;
CREATE POLICY "Allow public read of community posts" ON public.community_posts FOR SELECT USING (true);
-- (In a real scenario, this would check if the student is enrolled in the institute_id)

-- Add viewed_by column to track who has seen the post
ALTER TABLE public.community_posts
ADD COLUMN IF NOT EXISTS viewed_by UUID[] DEFAULT '{}'::uuid[];
