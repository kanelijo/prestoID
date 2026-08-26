-- Migration script to adapt students table and set up storage for PrestoID

-- 1. Drop existing policies on students, attendance, and payments to avoid dependency issues during alterations
DROP POLICY IF EXISTS "Allow public read of students" ON public.students;
DROP POLICY IF EXISTS "Allow users to update own student record" ON public.students;
DROP POLICY IF EXISTS "Allow admin to manage students" ON public.students;

-- 2. Modify public.students table
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_id_fkey;

-- Make ID default to a generated UUID so admins can create student records without an auth user existing
ALTER TABLE public.students ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Add user_id column that points to auth.users, representing the linked login account (nullable)
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Make email nullable since some students might only have phone, but keep it unique to prevent duplicate linking
ALTER TABLE public.students ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_email_key;
ALTER TABLE public.students ADD CONSTRAINT students_email_key UNIQUE (email);

-- 3. Re-enable/re-create RLS policies for students
CREATE POLICY "Allow public read of students" ON public.students FOR SELECT USING (true);
CREATE POLICY "Allow users to update own student record" ON public.students FOR UPDATE USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Allow admin to manage students" ON public.students FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 4. Update handle_new_user trigger to link auth user to manually registered students by email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  existing_student_id UUID;
  user_role TEXT;
BEGIN
  user_role := COALESCE(new.raw_user_meta_data->>'role', 'student');

  -- Insert profile
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'Student User'),
    new.email,
    user_role
  )
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = COALESCE(profiles.role, EXCLUDED.role);

  -- Link auth account to existing student record if admin added them previously by email
  IF user_role = 'student' THEN
    SELECT id INTO existing_student_id FROM public.students WHERE email = new.email LIMIT 1;
    
    IF existing_student_id IS NOT NULL THEN
      UPDATE public.students
      SET user_id = new.id
      WHERE id = existing_student_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create storage buckets for avatars
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars bucket
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admin Manage Avatars" ON storage.objects;

CREATE POLICY "Public Read Avatars" ON storage.objects 
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated Upload Avatars" ON storage.objects 
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Admin Manage Avatars" ON storage.objects 
  FOR ALL USING (bucket_id = 'avatars' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));
