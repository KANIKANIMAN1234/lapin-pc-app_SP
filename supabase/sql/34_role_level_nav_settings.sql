-- 役割ID（m_users.role）を任意拡張し、権限は role_level（admin/staff/sales）で RLS 判定する。
-- 管理画面: 役割マスタ（role_definitions）・サイドバー表示（nav_visibility_by_role）
-- 事前: 31_get_current_user_role_m_users_fallback.sql 推奨

-- ── m_users.role_level ───────────────────────────────────────
ALTER TABLE m_users
  ADD COLUMN IF NOT EXISTS role_level TEXT NOT NULL DEFAULT 'sales'
    CHECK (role_level IN ('admin', 'staff', 'sales'));

COMMENT ON COLUMN m_users.role IS '役割ID（m_settings role_definitions の id と一致）';
COMMENT ON COLUMN m_users.role_level IS '権限グループ admin=全権限 / staff=事務 / sales=担当ベース。RLS はこちらを参照';

UPDATE m_users
SET role_level = CASE role::text
  WHEN 'admin' THEN 'admin'
  WHEN 'staff' THEN 'staff'
  WHEN 'sales' THEN 'sales'
  ELSE 'sales'
END;

ALTER TABLE m_users DROP CONSTRAINT IF EXISTS m_users_role_check;

-- ── RLS 用: 権限レベル ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_current_user_role_level()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT u.role_level::text
      FROM m_users u
      WHERE u.id = auth.uid()
        AND u.deleted_at IS NULL
      LIMIT 1
    ),
    CASE trim(lower(COALESCE(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role',
      ''
    )))
      WHEN 'admin' THEN 'admin'
      WHEN 'staff' THEN 'staff'
      WHEN 'sales' THEN 'sales'
      ELSE NULL
    END,
    'anon'
  );
$$;

COMMENT ON FUNCTION get_current_user_role_level() IS
  'RLS 用。m_users.role_level 優先、無ければ JWT の role が従来3種のときのみ解決';

-- ── auth 新規ユーザー: role_level を同期 ─────────────────────
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role  TEXT;
  v_level TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'sales');
  v_level := CASE v_role
    WHEN 'admin' THEN 'admin'
    WHEN 'staff' THEN 'staff'
    WHEN 'sales' THEN 'sales'
    ELSE 'sales'
  END;

  INSERT INTO m_users (id, email, name, role, role_level, avatar_url, line_user_id, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', '未設定'),
    v_role,
    v_level,
    NEW.raw_user_meta_data ->> 'avatar_url',
    NEW.raw_user_meta_data ->> 'line_user_id',
    'active'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_auth_user error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ── m_users ポリシー ──────────────────────────────────────────
DROP POLICY IF EXISTS "m_users_select_all" ON m_users;
CREATE POLICY "m_users_select_all" ON m_users
  FOR SELECT USING (get_current_user_role_level() IN ('admin', 'staff'));

DROP POLICY IF EXISTS "m_users_admin_write" ON m_users;
CREATE POLICY "m_users_admin_write" ON m_users
  FOR ALL USING (get_current_user_role_level() = 'admin');

-- ── m_settings ────────────────────────────────────────────────
DROP POLICY IF EXISTS "m_settings_select" ON m_settings;
CREATE POLICY "m_settings_select" ON m_settings
  FOR SELECT USING (get_current_user_role_level() IN ('admin', 'staff'));

DROP POLICY IF EXISTS "m_settings_admin_write" ON m_settings;
CREATE POLICY "m_settings_admin_write" ON m_settings
  FOR ALL USING (get_current_user_role_level() = 'admin');

-- ── m_bonus_periods ───────────────────────────────────────────
DROP POLICY IF EXISTS "m_bonus_periods_admin_write" ON m_bonus_periods;
CREATE POLICY "m_bonus_periods_admin_write" ON m_bonus_periods
  FOR ALL USING (get_current_user_role_level() = 'admin');

-- ── t_projects ────────────────────────────────────────────────
DROP POLICY IF EXISTS "t_projects_select" ON t_projects;
CREATE POLICY "t_projects_select" ON t_projects
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role_level() IN ('admin', 'staff')
      OR (
        get_current_user_role_level() = 'sales'
        AND assigned_to = auth.uid()::UUID
      )
    )
  );

DROP POLICY IF EXISTS "t_projects_insert" ON t_projects;
CREATE POLICY "t_projects_insert" ON t_projects
  FOR INSERT WITH CHECK (
    get_current_user_role_level() IN ('admin', 'staff')
    OR (
      get_current_user_role_level() = 'sales'
      AND assigned_to = auth.uid()::UUID
    )
  );

DROP POLICY IF EXISTS "t_projects_update" ON t_projects;
CREATE POLICY "t_projects_update" ON t_projects
  FOR UPDATE USING (
    deleted_at IS NULL
    AND (
      get_current_user_role_level() IN ('admin', 'staff')
      OR (
        get_current_user_role_level() = 'sales'
        AND assigned_to = auth.uid()::UUID
      )
    )
  )
  WITH CHECK (
    (
      deleted_at IS NULL
      AND (
        get_current_user_role_level() IN ('admin', 'staff')
        OR (
          get_current_user_role_level() = 'sales'
          AND assigned_to = auth.uid()::UUID
        )
      )
    )
    OR (
      deleted_at IS NOT NULL
      AND get_current_user_role_level() IN ('admin', 'staff')
    )
  );

-- ── t_photos ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "t_photos_select" ON t_photos;
CREATE POLICY "t_photos_select" ON t_photos
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role_level() IN ('admin', 'staff')
      OR (
        get_current_user_role_level() = 'sales'
        AND project_id IN (SELECT get_my_project_ids())
      )
    )
  );

DROP POLICY IF EXISTS "t_photos_insert" ON t_photos;
CREATE POLICY "t_photos_insert" ON t_photos
  FOR INSERT WITH CHECK (
    get_current_user_role_level() IN ('admin', 'staff')
    OR (
      get_current_user_role_level() = 'sales'
      AND project_id IN (SELECT get_my_project_ids())
    )
  );

DROP POLICY IF EXISTS "t_photos_soft_delete" ON t_photos;
CREATE POLICY "t_photos_soft_delete" ON t_photos
  FOR UPDATE USING (
    get_current_user_role_level() IN ('admin', 'staff')
    OR (
      get_current_user_role_level() = 'sales'
      AND uploaded_by = auth.uid()::UUID
    )
  );

-- ── t_budgets ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "t_budgets_select" ON t_budgets;
CREATE POLICY "t_budgets_select" ON t_budgets
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role_level() IN ('admin', 'staff')
      OR project_id IN (SELECT get_my_project_ids())
    )
  );

DROP POLICY IF EXISTS "t_budgets_insert" ON t_budgets;
CREATE POLICY "t_budgets_insert" ON t_budgets
  FOR INSERT WITH CHECK (
    get_current_user_role_level() IN ('admin', 'staff')
    OR project_id IN (SELECT get_my_project_ids())
  );

DROP POLICY IF EXISTS "t_budgets_update" ON t_budgets;
CREATE POLICY "t_budgets_update" ON t_budgets
  FOR UPDATE USING (
    get_current_user_role_level() IN ('admin', 'staff')
    OR project_id IN (SELECT get_my_project_ids())
  );

-- ── t_receipts ────────────────────────────────────────────────
DROP POLICY IF EXISTS "t_receipts_select" ON t_receipts;
CREATE POLICY "t_receipts_select" ON t_receipts
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role_level() IN ('admin', 'staff')
      OR created_by = auth.uid()::UUID
    )
  );

DROP POLICY IF EXISTS "t_receipts_update" ON t_receipts;
CREATE POLICY "t_receipts_update" ON t_receipts
  FOR UPDATE USING (
    get_current_user_role_level() IN ('admin', 'staff')
    OR created_by = auth.uid()::UUID
  );

-- ── t_meetings ────────────────────────────────────────────────
DROP POLICY IF EXISTS "t_meetings_select" ON t_meetings;
CREATE POLICY "t_meetings_select" ON t_meetings
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role_level() IN ('admin', 'staff')
      OR project_id IN (SELECT get_my_project_ids())
    )
  );

DROP POLICY IF EXISTS "t_meetings_insert" ON t_meetings;
CREATE POLICY "t_meetings_insert" ON t_meetings
  FOR INSERT WITH CHECK (
    get_current_user_role_level() IN ('admin', 'staff')
    OR project_id IN (SELECT get_my_project_ids())
  );

DROP POLICY IF EXISTS "t_meetings_update" ON t_meetings;
CREATE POLICY "t_meetings_update" ON t_meetings
  FOR UPDATE USING (
    get_current_user_role_level() IN ('admin', 'staff')
    OR recorded_by = auth.uid()::UUID
  );

-- ── t_reports ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "t_reports_select" ON t_reports;
CREATE POLICY "t_reports_select" ON t_reports
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role_level() IN ('admin', 'staff')
      OR user_id = auth.uid()::UUID
    )
  );

DROP POLICY IF EXISTS "t_reports_update" ON t_reports;
CREATE POLICY "t_reports_update" ON t_reports
  FOR UPDATE USING (
    get_current_user_role_level() IN ('admin', 'staff')
    OR user_id = auth.uid()::UUID
  );

-- ── t_expenses ────────────────────────────────────────────────
DROP POLICY IF EXISTS "t_expenses_select" ON t_expenses;
CREATE POLICY "t_expenses_select" ON t_expenses
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      get_current_user_role_level() IN ('admin', 'staff')
      OR user_id = auth.uid()::UUID
      OR (
        get_current_user_role_level() = 'sales'
        AND project_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM t_projects p
          WHERE p.id = t_expenses.project_id
            AND p.deleted_at IS NULL
            AND (
              p.assigned_to = auth.uid()::UUID
              OR p.created_by = auth.uid()::UUID
            )
        )
      )
    )
  );

DROP POLICY IF EXISTS "t_expenses_update" ON t_expenses;
CREATE POLICY "t_expenses_update" ON t_expenses
  FOR UPDATE USING (
    get_current_user_role_level() IN ('admin', 'staff')
    OR (user_id = auth.uid()::UUID AND status = 'pending')
  );

-- ── t_bonus ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "t_bonus_admin_only" ON t_bonus;
CREATE POLICY "t_bonus_admin_only" ON t_bonus
  FOR ALL USING (get_current_user_role_level() = 'admin');

-- ── m_customers ───────────────────────────────────────────────
DROP POLICY IF EXISTS "m_customers_select" ON m_customers;
CREATE POLICY "m_customers_select" ON m_customers
  FOR SELECT USING (
    deleted_at IS NULL
    AND auth.uid() IS NOT NULL
    AND get_current_user_role_level() IN ('admin', 'staff', 'sales')
  );

DROP POLICY IF EXISTS "m_customers_insert" ON m_customers;
CREATE POLICY "m_customers_insert" ON m_customers
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND get_current_user_role_level() IN ('admin', 'staff', 'sales')
  );

DROP POLICY IF EXISTS "m_customers_update" ON m_customers;
CREATE POLICY "m_customers_update" ON m_customers
  FOR UPDATE USING (
    deleted_at IS NULL
    AND get_current_user_role_level() IN ('admin', 'staff')
  );

DROP POLICY IF EXISTS "m_customers_soft_delete" ON m_customers;
CREATE POLICY "m_customers_soft_delete" ON m_customers
  FOR UPDATE USING (get_current_user_role_level() IN ('admin', 'staff'))
  WITH CHECK (deleted_at IS NOT NULL);

-- ── 設定シード（アプリのデフォルトと揃える）───────────────────
INSERT INTO m_settings (key, value, description)
VALUES (
  'role_definitions',
  '[{"id":"admin","label":"管理者","level":"admin"},{"id":"staff","label":"事務","level":"staff"},{"id":"sales","label":"営業","level":"sales"}]',
  'システム役割（ID・表示名・権限レベル）。従業員の role は id と一致'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO m_settings (key, value, description)
VALUES (
  'nav_visibility_by_role',
  '{}',
  '役割IDごとのサイドバー表示。キーは href、false で非表示。空オブジェクトはデフォルト表示'
)
ON CONFLICT (key) DO NOTHING;
