-- 見積提示時に入力するスケジュール・見込み情報
ALTER TABLE t_projects
  ADD COLUMN IF NOT EXISTS implementation_period TEXT,
  ADD COLUMN IF NOT EXISTS expected_order_month DATE,
  ADD COLUMN IF NOT EXISTS expected_revenue_month DATE;

COMMENT ON COLUMN t_projects.implementation_period IS '工事・対応の実施時期（見積時の想定。自由記述または時期表現）';
COMMENT ON COLUMN t_projects.expected_order_month IS '受注予定月（見積時。月初日で保存推奨）';
COMMENT ON COLUMN t_projects.expected_revenue_month IS '完工・売上計上予定月（見積時。月初日で保存推奨）';
