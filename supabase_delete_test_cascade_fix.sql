-- 1. Recreate the foreign key constraint on test_submissions with ON DELETE CASCADE
ALTER TABLE public.test_submissions 
  DROP CONSTRAINT IF EXISTS test_submissions_test_id_fkey;

ALTER TABLE public.test_submissions 
  ADD CONSTRAINT test_submissions_test_id_fkey 
  FOREIGN KEY (test_id) 
  REFERENCES public.tests(id) 
  ON DELETE CASCADE;

-- 2. Create the DELETE policy on test_submissions to allow deletion of records
DROP POLICY IF EXISTS "Enable delete for all users" ON public.test_submissions;
CREATE POLICY "Enable delete for all users" ON public.test_submissions FOR DELETE USING (true);
