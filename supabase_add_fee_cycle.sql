-- Add fee_cycle column to students table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS fee_cycle TEXT DEFAULT 'monthly' CHECK (fee_cycle IN ('monthly', 'yearly', 'one time'));
