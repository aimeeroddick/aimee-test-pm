-- Add confluence_page_url column to confluence_pending_tasks
ALTER TABLE confluence_pending_tasks 
ADD COLUMN IF NOT EXISTS confluence_page_url TEXT;

-- Comment for clarity
COMMENT ON COLUMN confluence_pending_tasks.confluence_page_url IS 'Direct URL to the Confluence page containing this task';
