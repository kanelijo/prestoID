-- SQL migration to create study_materials table
-- Run this in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard)

CREATE TABLE IF NOT EXISTS public.study_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Notes', 'E-Book', 'Doc')),
  batch_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.study_materials ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow students and admins in the same business to view study materials
DROP POLICY IF EXISTS "Users can read business study materials" ON public.study_materials;
CREATE POLICY "Users can read business study materials" ON public.study_materials
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE business_id = study_materials.business_id
    )
  );

-- Admin policy: Allow admins to manage (insert, update, delete) their business study materials
DROP POLICY IF EXISTS "Admins can manage business study materials" ON public.study_materials;
CREATE POLICY "Admins can manage business study materials" ON public.study_materials
  FOR ALL USING (
    auth.uid() IN (
      SELECT admin_id FROM public.businesses WHERE id = study_materials.business_id
    )
  );
