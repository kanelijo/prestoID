-- Enable RLS on student_messages table
ALTER TABLE public.student_messages ENABLE ROW LEVEL SECURITY;

-- 1. DROP old policies if they exist
DROP POLICY IF EXISTS "Enable read access for receiver" ON public.student_messages;
DROP POLICY IF EXISTS "Enable read access for sender or receiver" ON public.student_messages;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.student_messages;
DROP POLICY IF EXISTS "Enable delete for receiver" ON public.student_messages;
DROP POLICY IF EXISTS "Enable delete for sender or receiver" ON public.student_messages;

-- 2. CREATE SELECT Policy (Allows both sender and receiver to select/read messages)
CREATE POLICY "Enable read access for sender or receiver" ON public.student_messages
  FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 3. CREATE INSERT Policy (Allows users to send messages, ensuring they can only set themselves as the sender)
CREATE POLICY "Enable insert for authenticated users" ON public.student_messages
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- 4. CREATE DELETE Policy (Allows receivers to delete messages from transit queue, or senders to clean up)
CREATE POLICY "Enable delete for sender or receiver" ON public.student_messages
  FOR DELETE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
