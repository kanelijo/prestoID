-- Fix foreign keys to point from 'institutes' to 'coachings' table

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_institute_id_fkey;
ALTER TABLE public.students ADD CONSTRAINT students_institute_id_fkey FOREIGN KEY (institute_id) REFERENCES public.coachings(id) ON DELETE CASCADE;

ALTER TABLE public.batches DROP CONSTRAINT IF EXISTS batches_institute_id_fkey;
ALTER TABLE public.batches ADD CONSTRAINT batches_institute_id_fkey FOREIGN KEY (institute_id) REFERENCES public.coachings(id) ON DELETE CASCADE;

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_institute_id_fkey;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_institute_id_fkey FOREIGN KEY (institute_id) REFERENCES public.coachings(id) ON DELETE CASCADE;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_institute_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_institute_id_fkey FOREIGN KEY (institute_id) REFERENCES public.coachings(id) ON DELETE CASCADE;

ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_institute_id_fkey;
ALTER TABLE public.community_posts ADD CONSTRAINT community_posts_institute_id_fkey FOREIGN KEY (institute_id) REFERENCES public.coachings(id) ON DELETE CASCADE;

-- If 'claim_requests' exists
ALTER TABLE public.claim_requests DROP CONSTRAINT IF EXISTS claim_requests_institute_id_fkey;
ALTER TABLE public.claim_requests ADD CONSTRAINT claim_requests_institute_id_fkey FOREIGN KEY (institute_id) REFERENCES public.coachings(id) ON DELETE CASCADE;
