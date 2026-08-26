-- 1. Create a DELETE policy on public.students to allow admins to delete student records in their business
DROP POLICY IF EXISTS "Admins can delete students" ON public.students;
DROP POLICY IF EXISTS "Admins can delete students in business" ON public.students;

CREATE POLICY "Admins can delete students in business" ON public.students
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles admin_p
      WHERE admin_p.id = auth.uid() 
      AND admin_p.role = 'admin'
      AND (
        students.business_id = admin_p.business_id
        OR
        EXISTS (
          SELECT 1 FROM public.businesses b
          WHERE b.id = students.business_id
          AND b.admin_id = auth.uid()
        )
      )
    )
  );

-- 2. Create a DELETE policy on public.profiles to allow admins to delete student profiles in their business
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles in business" ON public.profiles;

CREATE POLICY "Admins can delete profiles in business" ON public.profiles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles admin_p
      WHERE admin_p.id = auth.uid() 
      AND admin_p.role = 'admin'
      AND (
        profiles.business_id = admin_p.business_id
        OR
        EXISTS (
          SELECT 1 FROM public.businesses b
          WHERE b.id = profiles.business_id
          AND b.admin_id = auth.uid()
        )
      )
    )
  );
