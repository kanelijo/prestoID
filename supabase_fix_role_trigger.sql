-- SQL Script to find and remove database triggers blocking profile role updates
-- Run this in your Supabase Dashboard SQL Editor (https://supabase.com)

DO $$
DECLARE
  r RECORD;
  dropped_count INT := 0;
BEGIN
  -- 1. Scan pg_catalog to find any triggers whose function code contains the words 'cannot modify'
  FOR r IN 
    SELECT t.tgname AS trigger_name, c.relname AS table_name, p.proname AS function_name
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE p.prosrc ILIKE '%cannot modify%' 
      AND n.nspname = 'public'
  LOOP
    -- 2. Dynamically drop the trigger
    EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON public.' || quote_ident(r.table_name) || ' CASCADE;';
    RAISE NOTICE 'SUCCESSFULLY DROPPED TRIGGER % ON TABLE %', r.trigger_name, r.table_name;
    dropped_count := dropped_count + 1;
  END LOOP;

  IF dropped_count = 0 THEN
    RAISE NOTICE 'No triggers containing restriction search terms were found.';
  ELSE
    RAISE NOTICE 'Total triggers dropped: %', dropped_count;
  END IF;
END $$;
