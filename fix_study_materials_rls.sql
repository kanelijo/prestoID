-- Fix study_materials RLS so STUDENTS can read their business's materials
-- The old policy only checked the `profiles` table,
-- but students log in with auth.uid() linked to `students.user_id`, not `profiles.id`

DROP POLICY IF EXISTS "Users can read business study materials" ON public.study_materials;

CREATE POLICY "Users can read business study materials" ON public.study_materials
  FOR SELECT USING (
    -- Admin or staff via profiles table
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE business_id = study_materials.business_id
    )
    OR
    -- Students via students table
    auth.uid() IN (
      SELECT user_id FROM public.students WHERE business_id = study_materials.business_id AND user_id IS NOT NULL
    )
  );
