-- ==============================================================
-- 03_functions_triggers.sql
-- PostgreSQL Functions & Triggers
-- 実行順序: 02_transaction_tables.sql の後に実行してください
-- ==============================================================


-- ==============================================================
-- Section 1: ヘルパー関数（RLSで使用）
-- ==============================================================

-- ログインユーザーのロールを取得
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    'anon'
  );
$$;

-- ログインユーザーが担当する案件IDのリストを取得
CREATE OR REPLACE FUNCTION get_my_project_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM t_projects
  WHERE assigned_to = auth.uid()
    AND deleted_at IS NULL;
$$;


-- ==============================================================
-- Section 2: updated_at 自動更新トリガー（全テーブル共通）
-- ==============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- m_users
CREATE OR REPLACE TRIGGER m_users_updated_at
  BEFORE UPDATE ON m_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- m_settings
CREATE OR REPLACE TRIGGER m_settings_updated_at
  BEFORE UPDATE ON m_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- m_bonus_periods
CREATE OR REPLACE TRIGGER m_bonus_periods_updated_at
  BEFORE UPDATE ON m_bonus_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- t_projects
CREATE OR REPLACE TRIGGER t_projects_updated_at
  BEFORE UPDATE ON t_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- t_budgets
CREATE OR REPLACE TRIGGER t_budgets_updated_at
  BEFORE UPDATE ON t_budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- t_receipts
CREATE OR REPLACE TRIGGER t_receipts_updated_at
  BEFORE UPDATE ON t_receipts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- t_meetings
CREATE OR REPLACE TRIGGER t_meetings_updated_at
  BEFORE UPDATE ON t_meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- t_reports
CREATE OR REPLACE TRIGGER t_reports_updated_at
  BEFORE UPDATE ON t_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- t_expenses
CREATE OR REPLACE TRIGGER t_expenses_updated_at
  BEFORE UPDATE ON t_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- t_bonus
CREATE OR REPLACE TRIGGER t_bonus_updated_at
  BEFORE UPDATE ON t_bonus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ==============================================================
-- Section 3: project_number 自動採番
-- INSERT時に project_number が NULL の場合に自動採番
-- フォーマット: YYYY-NNN（例: 2026-001）
-- ==============================================================

CREATE OR REPLACE FUNCTION generate_project_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  current_year TEXT;
  max_num      INTEGER;
  new_number   TEXT;
BEGIN
  -- 既に番号が指定されている場合はそのまま
  IF NEW.project_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  current_year := TO_CHAR(NOW(), 'YYYY');

  SELECT COALESCE(
    MAX(CAST(SPLIT_PART(project_number, '-', 2) AS INTEGER)),
    0
  )
  INTO max_num
  FROM t_projects
  WHERE project_number LIKE current_year || '-%';

  new_number := current_year || '-' || LPAD((max_num + 1)::TEXT, 3, '0');
  NEW.project_number := new_number;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER t_projects_set_number
  BEFORE INSERT ON t_projects
  FOR EACH ROW EXECUTE FUNCTION generate_project_number();


-- ==============================================================
-- Section 4: budgets合計 → projects.actual_cost 自動同期
-- t_budgets の actual_amount が変更された際に
-- t_projects.actual_cost を自動的に再集計する
-- ==============================================================

CREATE OR REPLACE FUNCTION sync_actual_cost()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE t_projects
  SET actual_cost = (
    SELECT COALESCE(SUM(actual_amount), 0)
    FROM t_budgets
    WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
      AND deleted_at IS NULL
  )
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER t_budgets_sync_cost
  AFTER INSERT OR UPDATE OR DELETE ON t_budgets
  FOR EACH ROW EXECUTE FUNCTION sync_actual_cost();


-- ==============================================================
-- Section 5: Supabase Auth との連携
-- LINE認証後、m_users テーブルに自動でユーザーを作成する
-- Edge Function(auth-line) で auth.users へ追加後に呼ばれる
-- ==============================================================

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- auth.users への INSERT 時に m_users へ同期（初回のみ）
  INSERT INTO m_users (id, email, name, role, avatar_url, line_user_id, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', '未設定'),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'sales'),
    NEW.raw_user_meta_data ->> 'avatar_url',
    NEW.raw_user_meta_data ->> 'line_user_id',
    'active'
  )
  ON CONFLICT DO NOTHING;  -- id・email・line_user_id 全ての重複を無視

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- トリガーのエラーで auth.users INSERT がロールバックされないように
    RAISE WARNING 'handle_new_auth_user error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- auth.users への INSERT をトリガー
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
