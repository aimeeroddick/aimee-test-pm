-- Migration: Project Tags
-- Adds project-scoped tags for flexible sub-categorization within projects

-- ============================================================================
-- TABLE: project_tags
-- ============================================================================

CREATE TABLE project_tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, name)
);

CREATE INDEX idx_project_tags_project_id ON project_tags(project_id);

-- ============================================================================
-- TABLE: task_tags
-- ============================================================================

CREATE TABLE task_tags (
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
    tag_id UUID REFERENCES project_tags(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (task_id, tag_id)
);

CREATE INDEX idx_task_tags_task_id ON task_tags(task_id);
CREATE INDEX idx_task_tags_tag_id ON task_tags(tag_id);

-- ============================================================================
-- RLS POLICIES: project_tags
-- ============================================================================

ALTER TABLE project_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project tags" ON project_tags
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_tags.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert project tags" ON project_tags
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_tags.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update project tags" ON project_tags
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_tags.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete project tags" ON project_tags
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_tags.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- ============================================================================
-- RLS POLICIES: task_tags
-- Users can manage tags on tasks belonging to their projects
-- ============================================================================

ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view task tags" ON task_tags
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tasks
            JOIN projects ON projects.id = tasks.project_id
            WHERE tasks.id = task_tags.task_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert task tags" ON task_tags
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM tasks
            JOIN projects ON projects.id = tasks.project_id
            WHERE tasks.id = task_tags.task_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete task tags" ON task_tags
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM tasks
            JOIN projects ON projects.id = tasks.project_id
            WHERE tasks.id = task_tags.task_id
            AND projects.user_id = auth.uid()
        )
    );
