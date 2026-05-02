-- 2026年の賞与評価期間を「上半期・下半期」（各6か月）の2期に統一する
-- ① 2026-01-01 〜 2026-06-30
-- ② 2026-07-01 〜 2026-12-31
-- 既存DBは本ファイルを Supabase で実行。第3期（4ヶ月制）行は削除。

INSERT INTO m_bonus_periods (year, period_number, period_label, period_start, period_end, months_label, fixed_cost, distribution_rate, target_amount)
VALUES
  (2026, 1, '2026年 第1期', '2026-01-01', '2026-06-30', '1月〜6月', 2000000, 10.00, 5000000),
  (2026, 2, '2026年 第2期', '2026-07-01', '2026-12-31', '7月〜12月', 2000000, 10.00, 5000000)
ON CONFLICT (year, period_number) DO UPDATE SET
  period_label    = EXCLUDED.period_label,
  period_start    = EXCLUDED.period_start,
  period_end      = EXCLUDED.period_end,
  months_label    = EXCLUDED.months_label,
  fixed_cost      = EXCLUDED.fixed_cost,
  distribution_rate = EXCLUDED.distribution_rate,
  target_amount   = EXCLUDED.target_amount,
  updated_at      = now();

DELETE FROM m_bonus_periods WHERE year = 2026 AND period_number = 3;
