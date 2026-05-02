-- t_projects: 案件名（管理番号とは別。Drive フォルダ名の優先ラベル用）
-- Supabase SQL エディタで実行

ALTER TABLE t_projects
  ADD COLUMN IF NOT EXISTS project_title TEXT;

COMMENT ON COLUMN t_projects.project_title IS '案件名（表示・Google Drive 案件フォルダ名の優先）。空の場合は工事種別等で組み立て';
