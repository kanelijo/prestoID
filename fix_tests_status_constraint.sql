ALTER TABLE public.tests DROP CONSTRAINT IF EXISTS "test-status-check";
ALTER TABLE public.tests DROP CONSTRAINT IF EXISTS "tests_status_check";
ALTER TABLE public.tests ADD CONSTRAINT "tests_status_check" CHECK (status IN ('draft', 'published', 'scheduled', 'live', 'completed'));
