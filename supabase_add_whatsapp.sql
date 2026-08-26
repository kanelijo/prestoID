-- Add whatsapp_number to institutes
ALTER TABLE institutes ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
