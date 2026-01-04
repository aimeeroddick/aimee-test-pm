-- Create error_logs table for tracking frontend crashes and API errors
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  component_stack TEXT,
  url TEXT,
  user_agent TEXT,
  app_version TEXT,
  context JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  notes TEXT
);

-- Allow authenticated users to insert errors
CREATE POLICY "Users can insert errors" ON error_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow anonymous users to log errors too
CREATE POLICY "Anonymous can insert errors" ON error_logs
  FOR INSERT TO anon
  WITH CHECK (true);

-- Only you (admin) can read all errors
CREATE POLICY "Admin can read all errors" ON error_logs
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = 'roddickaimee@gmail.com');

-- Enable RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Create indexes for faster queries
CREATE INDEX idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX idx_error_logs_user ON error_logs(user_id);
CREATE INDEX idx_error_logs_type ON error_logs((context->>'type'));
