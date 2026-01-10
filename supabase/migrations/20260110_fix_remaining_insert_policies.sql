-- Migration: Fix remaining INSERT policies with auth.uid() performance issue

-- attachments - fix INSERT with check
DROP POLICY IF EXISTS "Users can insert attachments" ON attachments;
CREATE POLICY "Users can insert attachments" ON attachments FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM tasks
        JOIN projects ON projects.id = tasks.project_id
        WHERE tasks.id = attachments.task_id
        AND projects.user_id = (select auth.uid())
    )
);

-- beta_testers - fix SELECT
DROP POLICY IF EXISTS "Only authenticated users can view" ON beta_testers;
CREATE POLICY "Only authenticated users can view" ON beta_testers FOR SELECT USING (
    (select auth.role()) = 'authenticated'::text
);

-- email_extraction_analytics - fix INSERT
DROP POLICY IF EXISTS "Users can insert own analytics" ON email_extraction_analytics;
CREATE POLICY "Users can insert own analytics" ON email_extraction_analytics FOR INSERT WITH CHECK (
    (select auth.uid()) = user_id
);

-- error_logs - fix SELECT
DROP POLICY IF EXISTS "Admin can read all errors" ON error_logs;
CREATE POLICY "Admin can read all errors" ON error_logs FOR SELECT TO authenticated USING (
    ((select auth.jwt()) ->> 'email'::text) = ANY (ARRAY['roddickaimee@gmail.com'::text, 'aimee.roddick@spicymango.co.uk'::text])
);

-- feedback - fix INSERT
DROP POLICY IF EXISTS "Users can insert feedback" ON feedback;
CREATE POLICY "Users can insert feedback" ON feedback FOR INSERT WITH CHECK (
    (select auth.uid()) = user_id OR user_id IS NULL
);

-- profiles - fix INSERT
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (
    (select auth.uid()) = id
);

-- project_customers - fix INSERT
DROP POLICY IF EXISTS "Users can insert project customers" ON project_customers;
CREATE POLICY "Users can insert project customers" ON project_customers FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_customers.project_id
        AND projects.user_id = (select auth.uid())
    )
);

-- project_members - fix INSERT
DROP POLICY IF EXISTS "Users can insert project members" ON project_members;
CREATE POLICY "Users can insert project members" ON project_members FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_members.project_id
        AND projects.user_id = (select auth.uid())
    )
);

-- project_tags - fix INSERT
DROP POLICY IF EXISTS "Users can insert project tags" ON project_tags;
CREATE POLICY "Users can insert project tags" ON project_tags FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_tags.project_id
        AND projects.user_id = (select auth.uid())
    )
);

-- projects - fix INSERT
DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
CREATE POLICY "Users can insert own projects" ON projects FOR INSERT WITH CHECK (
    (select auth.uid()) = user_id
);

-- spark_analytics - fix INSERT
DROP POLICY IF EXISTS "Users can insert own analytics" ON spark_analytics;
CREATE POLICY "Users can insert own analytics" ON spark_analytics FOR INSERT WITH CHECK (
    (select auth.uid()) = user_id
);

-- task_dependencies - fix INSERT
DROP POLICY IF EXISTS "Users can insert task dependencies" ON task_dependencies;
CREATE POLICY "Users can insert task dependencies" ON task_dependencies FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM tasks
        JOIN projects ON projects.id = tasks.project_id
        WHERE tasks.id = task_dependencies.task_id
        AND projects.user_id = (select auth.uid())
    )
);

-- task_tags - fix INSERT
DROP POLICY IF EXISTS "Users can insert task tags" ON task_tags;
CREATE POLICY "Users can insert task tags" ON task_tags FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM tasks
        JOIN projects ON projects.id = tasks.project_id
        WHERE tasks.id = task_tags.task_id
        AND projects.user_id = (select auth.uid())
    )
);

-- tasks - fix INSERT
DROP POLICY IF EXISTS "Users can insert tasks" ON tasks;
CREATE POLICY "Users can insert tasks" ON tasks FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = tasks.project_id
        AND projects.user_id = (select auth.uid())
    )
);

-- user_list_items - fix INSERT
DROP POLICY IF EXISTS "Users can insert own list items" ON user_list_items;
CREATE POLICY "Users can insert own list items" ON user_list_items FOR INSERT WITH CHECK (
    (select auth.uid()) = user_id
);

-- user_settings - fix INSERT
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (
    (select auth.uid()) = user_id
);
