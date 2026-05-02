-- =============================================================================
-- 全案件データの物理削除（開発用・リセット用）
-- =============================================================================
-- ■ 実行前に必ずバックップを取ってください。取り消しできません。
-- ■ Supabase の SQL Editor で postgres 権限として実行してください。
--
-- 消えるもの:
--   - t_projects の全行（論理削除済み・未削除の区別なし）
--   - ON DELETE CASCADE により: t_photos, t_budgets, t_meetings の該当行
--
-- 残すもの:
--   - t_expenses: 案件紐付けのみ解除（project_id → NULL）。経費行自体は残ります。
--   - t_receipts: 同上（project_id → NULL）
--   - m_customers のうち、24_seed_test_projects_10 以外の顧客レコード
--   - m_users, t_reports, t_bonus, t_attendance など
--
-- 新規案件の project_number は、トリガーが「当年の最大番号+1」で採番するため、
-- 全削除後は 当年の 0001 から再開されます。
-- =============================================================================

BEGIN;

-- FK が NO ACTION のテーブル: 先に参照を外す
UPDATE t_expenses
SET project_id = NULL
WHERE project_id IS NOT NULL;

UPDATE t_receipts
SET project_id = NULL
WHERE project_id IS NOT NULL;

-- 案件本体（子の photos / budgets / meetings は CASCADE で削除）
DELETE FROM t_projects;

-- 24_seed_test_projects_10 で投入したテスト顧客のみ削除（notes で判定）
DELETE FROM m_customers
WHERE notes LIKE '%24_seed_test_projects_10%';

COMMIT;

-- -----------------------------------------------------------------------------
-- （任意）顧客マスタも空にする場合のみ、上記 COMMIT の後に別トランザクションで実行:
-- -----------------------------------------------------------------------------
-- BEGIN;
-- DELETE FROM m_customers;
-- COMMIT;
-- ※ t_projects が空でないと customer_id RESTRICT で失敗するため、必ず案件削除後に実行。
