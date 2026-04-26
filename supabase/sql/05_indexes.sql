-- ==============================================================
-- 05_indexes.sql
-- インデックス設計
-- 実行順序: 04_rls_policies.sql の後に実行してください
-- ==============================================================


-- --------------------------------------------------------------
-- t_projects
-- --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_t_projects_assigned_to
  ON t_projects(assigned_to) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_t_projects_status
  ON t_projects(status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_t_projects_updated_at
  ON t_projects(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_t_projects_project_number
  ON t_projects(project_number);

CREATE INDEX IF NOT EXISTS idx_t_projects_inquiry_date
  ON t_projects(inquiry_date DESC);

CREATE INDEX IF NOT EXISTS idx_t_projects_contract_date
  ON t_projects(contract_date DESC);


-- --------------------------------------------------------------
-- t_photos
-- --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_t_photos_project_id
  ON t_photos(project_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_t_photos_uploaded_by
  ON t_photos(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_t_photos_type
  ON t_photos(type);


-- --------------------------------------------------------------
-- t_budgets
-- --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_t_budgets_project_id
  ON t_budgets(project_id) WHERE deleted_at IS NULL;


-- --------------------------------------------------------------
-- t_receipts
-- --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_t_receipts_project_id
  ON t_receipts(project_id);

CREATE INDEX IF NOT EXISTS idx_t_receipts_status
  ON t_receipts(status);

CREATE INDEX IF NOT EXISTS idx_t_receipts_purchase_date
  ON t_receipts(purchase_date DESC);

-- JSONB 検索用 GIN インデックス
CREATE INDEX IF NOT EXISTS idx_t_receipts_ocr_result
  ON t_receipts USING GIN(ocr_result);

CREATE INDEX IF NOT EXISTS idx_t_receipts_ai_candidates
  ON t_receipts USING GIN(ai_candidates);


-- --------------------------------------------------------------
-- t_meetings
-- --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_t_meetings_project_id
  ON t_meetings(project_id);

CREATE INDEX IF NOT EXISTS idx_t_meetings_meeting_date
  ON t_meetings(meeting_date DESC);


-- --------------------------------------------------------------
-- t_reports
-- --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_t_reports_user_date
  ON t_reports(user_id, report_date DESC);


-- --------------------------------------------------------------
-- t_expenses
-- --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_t_expenses_user_id
  ON t_expenses(user_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_t_expenses_project_id
  ON t_expenses(project_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_t_expenses_status
  ON t_expenses(status);

CREATE INDEX IF NOT EXISTS idx_t_expenses_expense_date
  ON t_expenses(expense_date DESC);


-- --------------------------------------------------------------
-- t_bonus
-- --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_t_bonus_user_year
  ON t_bonus(user_id, year, period_number);


-- --------------------------------------------------------------
-- m_users
-- --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_m_users_line_user_id
  ON m_users(line_user_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_m_users_role
  ON m_users(role) WHERE deleted_at IS NULL;
