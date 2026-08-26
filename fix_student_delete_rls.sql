-- ============================================================================
-- ZenZa Fast Student Cascade Deletion Migration
-- Run this in your Supabase Dashboard SQL Editor
-- ============================================================================

-- 1. Grant full RLS permissions on all student tables
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to delete students" ON public.students;
CREATE POLICY "Allow users to delete students" ON public.students FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow users to delete attendance" ON public.attendance;
CREATE POLICY "Allow users to delete attendance" ON public.attendance FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow users to delete test_submissions" ON public.test_submissions;
CREATE POLICY "Allow users to delete test_submissions" ON public.test_submissions FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow users to delete payments" ON public.payments;
CREATE POLICY "Allow users to delete payments" ON public.payments FOR DELETE USING (true);

-- 2. Fast Stored Procedure RPC to delete a student and all related data in <5ms
CREATE OR REPLACE FUNCTION public.delete_student_cascade(p_student_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Delete dependent rows from attendance, test_submissions, and payments
    DELETE FROM public.attendance 
    WHERE student_id::text = p_student_id 
       OR student_id IN (SELECT id FROM public.students WHERE enrollment_id = p_student_id OR phone = p_student_id);

    DELETE FROM public.test_submissions 
    WHERE student_id::text = p_student_id 
       OR student_id IN (SELECT id FROM public.students WHERE enrollment_id = p_student_id OR phone = p_student_id);

    DELETE FROM public.payments 
    WHERE student_id::text = p_student_id 
       OR student_id IN (SELECT id FROM public.students WHERE enrollment_id = p_student_id OR phone = p_student_id);

    -- Delete user profile row if linked
    DELETE FROM public.profiles 
    WHERE id::text = p_student_id 
       OR id IN (SELECT user_id FROM public.students WHERE id::text = p_student_id OR enrollment_id = p_student_id OR phone = p_student_id);

    -- Delete student row from students table by ID, Enrollment ID, or Phone
    DELETE FROM public.students 
    WHERE id::text = p_student_id 
       OR enrollment_id = p_student_id 
       OR phone = p_student_id;

    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;
