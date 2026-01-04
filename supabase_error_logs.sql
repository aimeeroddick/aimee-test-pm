-- Create error_logs table for tracking frontend crashes
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
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  notes TEXT
);

-- Allow authenticated users to insert their own errors
CREATE POLICY "Users can insert their own errors" ON error_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Allow anonymous users to log errors too
CREATE POLICY "Anonymous can insert errors" ON error_logs
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- Only you (admin) can read all errors
CREATE POLICY "Admin can read all errors" ON error_logs
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = 'roddickaimee@gmail.com');

-- Enable RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Create index for faster queries
CREATE INDEX idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX idx_error_logs_user ON error_logs(user_id);
