-- Add images column to feedback table
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS images TEXT[];

-- Comment for documentation
COMMENT ON COLUMN feedback.images IS 'Array of image URLs stored in Supabase Storage';
