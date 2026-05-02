-- 見込み金額（新規時のおおよその金額）。正式な見積は estimated_amount
ALTER TABLE t_projects
  ADD COLUMN IF NOT EXISTS prospect_amount NUMERIC(12,0) NOT NULL DEFAULT 0;

COMMENT ON COLUMN t_projects.prospect_amount IS '見込み金額（登録時の概算）。見積提示後の金額は estimated_amount';
