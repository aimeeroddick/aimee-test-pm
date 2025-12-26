-- Trackli Database Migration v3
-- Adds: Subtasks, Saved Filters, User Preferences

-- SUBTASKS TABLE
CREATE TABLE IF NOT EXISTS subtasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subtasks
CREATE POLICY "Users can view subtasks" ON subtasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tasks 
            JOIN projects ON projects.id = tasks.project_id
            WHERE tasks.id = subtasks.task_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert subtasks" ON subtasks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM tasks 
            JOIN projects ON projects.id = tasks.project_id
            WHERE tasks.id = subtasks.task_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update subtasks" ON subtasks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM tasks 
            JOIN projects ON projects.id = tasks.project_id
            WHERE tasks.id = subtasks.task_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete subtasks" ON subtasks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM tasks 
            JOIN projects ON projects.id = tasks.project_id
            WHERE tasks.id = subtasks.task_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Index for subtasks
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);

-- SAVED FILTERS TABLE
CREATE TABLE IF NOT EXISTS saved_filters (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    filters JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;

-- RLS Policies for saved_filters
CREATE POLICY "Users can view own filters" ON saved_filters
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own filters" ON saved_filters
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own filters" ON saved_filters
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own filters" ON saved_filters
    FOR DELETE USING (user_id = auth.uid());

-- USER PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    dark_mode BOOLEAN DEFAULT FALSE,
    default_view TEXT DEFAULT 'board',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_preferences
CREATE POLICY "Users can view own preferences" ON user_preferences
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own preferences" ON user_preferences
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences" ON user_preferences
    FOR UPDATE USING (user_id = auth.uid());

SELECT 'Migration v3 completed successfully!' as message;
