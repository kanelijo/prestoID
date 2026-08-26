ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_institute_id_fkey;
ALTER TABLE public.students ADD CONSTRAINT students_institute_id_fkey FOREIGN KEY (institute_id) REFERENCES public.coachings(id) ON DELETE CASCADE;
