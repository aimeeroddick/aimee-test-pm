-- Create spark_analytics table for tracking query patterns
CREATE TABLE IF NOT EXISTS spark_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  handler TEXT NOT NULL, -- 'local' or 'claude'
  success BOOLEAN, -- null = pending, true = success, false = failure
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analyzing patterns
CREATE INDEX IF NOT EXISTS idx_spark_analytics_handler ON spark_analytics(handler);
CREATE INDEX IF NOT EXISTS idx_spark_analytics_created_at ON spark_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_spark_analytics_success ON spark_analytics(success);

-- RLS policies
ALTER TABLE spark_analytics ENABLE ROW LEVEL SECURITY;

-- Users can insert their own analytics
CREATE POLICY "Users can insert own analytics" ON spark_analytics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Only admins/service role can read all analytics (for analysis)
-- Regular users can't see other users' queries
CREATE POLICY "Service role can read all analytics" ON spark_analytics
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role');

-- Useful queries for analysis:
-- 
-- See what queries are falling through to Claude:
-- SELECT query_text, COUNT(*) as count FROM spark_analytics WHERE handler = 'claude' GROUP BY query_text ORDER BY count DESC;
--
-- See local vs Claude ratio:
-- SELECT handler, COUNT(*) as count FROM spark_analytics GROUP BY handler;
--
-- See failure rate for Claude:
-- SELECT success, COUNT(*) FROM spark_analytics WHERE handler = 'claude' GROUP BY success;
--
-- Recent Claude fallbacks (to identify new patterns to add):
-- SELECT query_text, created_at FROM spark_analytics WHERE handler = 'claude' ORDER BY created_at DESC LIMIT 50;
