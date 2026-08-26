-- Drop the existing check constraint on public.institutes.service_type
ALTER TABLE public.institutes DROP CONSTRAINT IF EXISTS institutes_service_type_check;

-- Add a new check constraint that supports College and Hostel/PG categories
ALTER TABLE public.institutes ADD CONSTRAINT institutes_service_type_check CHECK (service_type IN ('Coaching', 'Library', 'School', 'College', 'Hostel'));
