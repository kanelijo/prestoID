-- ====================================================================
-- Automated Retention Policy for public_feed
-- Automatically deletes any notification older than 2 months (60 days)
-- ====================================================================

-- 1. Create a function to purge old notifications
CREATE OR REPLACE FUNCTION purge_two_month_old_feed()
RETURNS void AS $$
BEGIN
  DELETE FROM public_feed
  WHERE created_at < NOW() - INTERVAL '2 months';
END;
$$ LANGUAGE plpgsql;

-- 2. Optional pg_cron schedule (if pg_cron extension is enabled on Supabase):
-- SELECT cron.schedule('daily-feed-purge', '0 3 * * *', 'SELECT purge_two_month_old_feed();');

-- 3. Automatic Trigger to clean up whenever new notices are inserted:
CREATE OR REPLACE FUNCTION trigger_auto_purge_feed()
RETURNS trigger AS $$
BEGIN
  DELETE FROM public_feed
  WHERE created_at < NOW() - INTERVAL '2 months';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purge_old_feed ON public_feed;
CREATE TRIGGER trg_purge_old_feed
AFTER INSERT ON public_feed
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_auto_purge_feed();
