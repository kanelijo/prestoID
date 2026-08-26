-- Allow students to insert their own payment records (useful for client-side recording of UPI/Razorpay transactions)
DROP POLICY IF EXISTS "Allow students to insert own payments" ON public.payments;

CREATE POLICY "Allow students to insert own payments" ON public.payments
  FOR INSERT 
  WITH CHECK (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );
