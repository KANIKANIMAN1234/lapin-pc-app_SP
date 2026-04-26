-- ==============================================================
-- 04_rls_policies.sql
-- Row Level Security（RLS）ポリシー設定
-- 実行順序: 03_functions_triggers.sql の後に実行してください
-- ==============================================================
-- 注意: get_current_user_role() 関数が 03 で作成済みであること


-- ==============================================================
-- m_users テーブル
-- ==============================================================
ALTER TABLE m_users ENABLE ROW LEVEL SECURITY;

-- 自分自身のプロフィールは全ロールから閲覧可能
CREATE POLICY "m_users_select_self" ON m_users
  FOR SELECT USING (id = auth.uid()::UUID);

-- admin・staff: 全ユーザーを閲覧可能
CREATE POLICY "m_users_select_all" ON m_users
  FOR SELECT USING (get_current_user_role() IN ('admin', 'staff'));

-- admin のみ: ユーザー追加・更新・削除
CREATE POLICY "m_users_admin_write" ON m_users
  FOR ALL USING (get_current_user_role() = 'admin');


-- ==============================================================
-- m_settings テーブル
-- ==============================================================
ALTER TABLE m_settings ENABLE ROW LEVEL SECURITY;

-- admin・staff: 閲覧可能
CREATE POLICY "m_settings_select" ON m_settings
  FOR SELECT USING (get_current_user_role() IN ('admin', 'staff'));

-- admin のみ: 変更可能
CREATE POLICY "m_settings_admin_write" ON m_settings
  FOR ALL USING (get_current_user_role() = 'admin');


-- ==============================================================
-- m_bonus_periods テーブル
-- ==============================================================
ALTER TABLE m_bonus_periods ENABLE ROW LEVEL SECURITY;

-- 全員: 閲覧可能（ボーナス期間は公開情報）
CREATE POLICY "m_bonus_periods_select" ON m_bonus_periods
  FOR SELECT USING (TRUE);

-- admin のみ: 変更可能
CREATE POLICY "m_bonus_periods_admin_write" ON m_bonus_periods
  FOR ALL USING (get_current_user_role() = 'admin');


-- ==============================================================
-- t_projects テーブル
-- ==============================================================
ALTER TABLE t_projects ENABLE ROW LEVEL SECURITY;

-- 閲覧: admin・staff=全件, sales=自分担当のみ（論理削除除外）
CREATE POLICY "t_projects_select" ON t_projects
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role() IN ('admin', 'staff')
      OR (
        get_current_user_role() = 'sales'
        AND assigned_to = auth.uid()::UUID
      )
    )
  );

-- 追加: 全ロール可（salesは assigned_to=自分のみ許可）
CREATE POLICY "t_projects_insert" ON t_projects
  FOR INSERT WITH CHECK (
    get_current_user_role() IN ('admin', 'staff')
    OR (
      get_current_user_role() = 'sales'
      AND assigned_to = auth.uid()::UUID
    )
  );

-- 更新: admin・staff=全件, sales=自分担当のみ
CREATE POLICY "t_projects_update" ON t_projects
  FOR UPDATE USING (
    get_current_user_role() IN ('admin', 'staff')
    OR (
      get_current_user_role() = 'sales'
      AND assigned_to = auth.uid()::UUID
    )
  );

-- 論理削除（deleted_at への UPDATE）: admin・staff のみ
CREATE POLICY "t_projects_soft_delete" ON t_projects
  FOR UPDATE USING (get_current_user_role() IN ('admin', 'staff'))
  WITH CHECK (deleted_at IS NOT NULL);


-- ==============================================================
-- t_photos テーブル
-- ==============================================================
ALTER TABLE t_photos ENABLE ROW LEVEL SECURITY;

-- 閲覧: admin・staff=全件, sales=自分担当案件の写真のみ
CREATE POLICY "t_photos_select" ON t_photos
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role() IN ('admin', 'staff')
      OR (
        get_current_user_role() = 'sales'
        AND project_id IN (SELECT get_my_project_ids())
      )
    )
  );

-- アップロード: 全ロール可（salesは自分担当案件のみ）
CREATE POLICY "t_photos_insert" ON t_photos
  FOR INSERT WITH CHECK (
    get_current_user_role() IN ('admin', 'staff')
    OR (
      get_current_user_role() = 'sales'
      AND project_id IN (SELECT get_my_project_ids())
    )
  );

-- 論理削除: admin・staff=全件, sales=自分がアップロードしたもののみ
CREATE POLICY "t_photos_soft_delete" ON t_photos
  FOR UPDATE USING (
    get_current_user_role() IN ('admin', 'staff')
    OR (
      get_current_user_role() = 'sales'
      AND uploaded_by = auth.uid()::UUID
    )
  );


-- ==============================================================
-- t_budgets テーブル
-- ==============================================================
ALTER TABLE t_budgets ENABLE ROW LEVEL SECURITY;

-- 閲覧・変更: admin・staff=全件, sales=自分担当案件のみ
CREATE POLICY "t_budgets_select" ON t_budgets
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role() IN ('admin', 'staff')
      OR project_id IN (SELECT get_my_project_ids())
    )
  );

CREATE POLICY "t_budgets_insert" ON t_budgets
  FOR INSERT WITH CHECK (
    get_current_user_role() IN ('admin', 'staff')
    OR project_id IN (SELECT get_my_project_ids())
  );

CREATE POLICY "t_budgets_update" ON t_budgets
  FOR UPDATE USING (
    get_current_user_role() IN ('admin', 'staff')
    OR project_id IN (SELECT get_my_project_ids())
  );


-- ==============================================================
-- t_receipts テーブル
-- ==============================================================
ALTER TABLE t_receipts ENABLE ROW LEVEL SECURITY;

-- 閲覧: admin・staff=全件, sales=自分が作成したもの
CREATE POLICY "t_receipts_select" ON t_receipts
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role() IN ('admin', 'staff')
      OR created_by = auth.uid()::UUID
    )
  );

CREATE POLICY "t_receipts_insert" ON t_receipts
  FOR INSERT WITH CHECK (TRUE);  -- 全ロール登録可

-- 確認・却下: admin・staff のみ
CREATE POLICY "t_receipts_update" ON t_receipts
  FOR UPDATE USING (
    get_current_user_role() IN ('admin', 'staff')
    OR created_by = auth.uid()::UUID
  );


-- ==============================================================
-- t_meetings テーブル
-- ==============================================================
ALTER TABLE t_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "t_meetings_select" ON t_meetings
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role() IN ('admin', 'staff')
      OR project_id IN (SELECT get_my_project_ids())
    )
  );

CREATE POLICY "t_meetings_insert" ON t_meetings
  FOR INSERT WITH CHECK (
    get_current_user_role() IN ('admin', 'staff')
    OR project_id IN (SELECT get_my_project_ids())
  );

CREATE POLICY "t_meetings_update" ON t_meetings
  FOR UPDATE USING (
    get_current_user_role() IN ('admin', 'staff')
    OR recorded_by = auth.uid()::UUID
  );


-- ==============================================================
-- t_reports テーブル
-- ==============================================================
ALTER TABLE t_reports ENABLE ROW LEVEL SECURITY;

-- 閲覧: admin・staff=全件, sales=自分の日報のみ
CREATE POLICY "t_reports_select" ON t_reports
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role() IN ('admin', 'staff')
      OR user_id = auth.uid()::UUID
    )
  );

CREATE POLICY "t_reports_insert" ON t_reports
  FOR INSERT WITH CHECK (user_id = auth.uid()::UUID);

CREATE POLICY "t_reports_update" ON t_reports
  FOR UPDATE USING (
    get_current_user_role() IN ('admin', 'staff')
    OR user_id = auth.uid()::UUID
  );


-- ==============================================================
-- t_expenses テーブル
-- ==============================================================
ALTER TABLE t_expenses ENABLE ROW LEVEL SECURITY;

-- 閲覧: admin・staff=全件, sales=自分の経費のみ
CREATE POLICY "t_expenses_select" ON t_expenses
  FOR SELECT USING (
    deleted_at IS NULL AND (
      get_current_user_role() IN ('admin', 'staff')
      OR user_id = auth.uid()::UUID
    )
  );

CREATE POLICY "t_expenses_insert" ON t_expenses
  FOR INSERT WITH CHECK (user_id = auth.uid()::UUID);

-- 承認・却下: admin・staff のみ / 本人はpending中のみ更新可
CREATE POLICY "t_expenses_update" ON t_expenses
  FOR UPDATE USING (
    get_current_user_role() IN ('admin', 'staff')
    OR (user_id = auth.uid()::UUID AND status = 'pending')
  );


-- ==============================================================
-- t_bonus テーブル（社長のみアクセス）
-- ==============================================================
ALTER TABLE t_bonus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "t_bonus_admin_only" ON t_bonus
  FOR ALL USING (get_current_user_role() = 'admin');
