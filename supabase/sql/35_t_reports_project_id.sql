-- 日報を案件に紐づけ、案件詳細では当該案件の日報のみ表示する。
-- スマホ日報は project_id 必須。旧データ（project_id NULL）は従来どおり 1 ユーザー・1 日 1 件まで。

ALTER TABLE t_reports
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES t_projects(id) ON DELETE SET NULL;

COMMENT ON COLUMN t_reports.project_id IS '関連案件（スマホ登録時は必須推奨）。NULL は移行前データ';

ALTER TABLE t_reports DROP CONSTRAINT IF EXISTS t_reports_user_id_report_date_key;

-- 案件あり: ユーザー × 案件 × 日付 で一意（同一日に別案件へ複数日報可）
CREATE UNIQUE INDEX IF NOT EXISTS t_reports_user_project_report_date_key
  ON t_reports (user_id, project_id, report_date)
  WHERE project_id IS NOT NULL;

-- 案件なし（レガシー）: ユーザー × 日付 で一意
CREATE UNIQUE INDEX IF NOT EXISTS t_reports_user_report_date_null_project_key
  ON t_reports (user_id, report_date)
  WHERE project_id IS NULL;
