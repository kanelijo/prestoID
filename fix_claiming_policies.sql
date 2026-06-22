-- ===================================================
-- 1. ENABLE ROW LEVEL SECURITY
-- ===================================================
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===================================================
-- 2. ADJUST RLS POLICIES FOR public.students
-- ===================================================

-- Drop existing SELECT and UPDATE policies on students table if they exist
DROP POLICY IF EXISTS "Students can view their own record" ON public.students;
DROP POLICY IF EXISTS "Students can update their own record" ON public.students;
DROP POLICY IF EXISTS "Allow users to update own student record" ON public.students;

-- Policy to allow students to SELECT their own record OR any unclaimed records (needed for claiming profile)
CREATE POLICY "Students can view their own record" ON public.students
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR is_claimed = false 
    OR user_id IS NULL
  );

-- Policy to allow students to UPDATE (claim) their own record OR unclaimed records
CREATE POLICY "Students can update their own record" ON public.students
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR is_claimed = false 
    OR user_id IS NULL
  )
  WITH CHECK (
    auth.uid() = user_id
  );

-- ===================================================
-- 3. ADJUST RLS POLICIES FOR public.profiles
-- ===================================================

-- Drop existing SELECT policies on profiles table if they exist
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view profiles of their students" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage profiles in their business" ON public.profiles;

-- Allow all authenticated users (students and admins) to view profiles
-- (Needed for community feed and for admins to fetch student push tokens)
CREATE POLICY "Anyone can view profiles" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow admins to manage (insert/update/delete) profiles linked to their business
CREATE POLICY "Admins can manage profiles in their business" ON public.profiles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = profiles.business_id
      AND b.admin_id = auth.uid()
    )
  );

-- ===================================================
-- 4. UPDATE USER SIGNUP TRIGGER (handle_new_user)
-- ===================================================
-- Updates the database auto-linking trigger to automatically set is_claimed = true,
-- claimed = true, and business_id if the student registers with an email that already exists.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  existing_student_id UUID;
  student_business_id UUID;
  user_role TEXT;
BEGIN
  user_role := new.raw_user_meta_data->>'role';

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

  -- Auto-link student record on signup if emails match
  IF user_role IS NULL OR user_role = 'student' THEN
    SELECT id, business_id INTO existing_student_id, student_business_id 
    FROM public.students 
    WHERE email = new.email 
    LIMIT 1;
    
    IF existing_student_id IS NOT NULL THEN
      -- Link student record
      UPDATE public.students 
      SET user_id = new.id,
          is_claimed = true
      WHERE id = existing_student_id;
      
      -- Link profile to the business and set claimed = true
      UPDATE public.profiles 
      SET role = 'student',
          business_id = student_business_id,
          claimed = true
      WHERE id = new.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
