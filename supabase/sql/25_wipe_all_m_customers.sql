-- =============================================================================
-- 顧客マスタ（m_customers）の全件物理削除（開発用・リセット用）
-- =============================================================================
-- ■ 本リポジトリに t_customers テーブルはありません。顧客は m_customers です。
-- ■ 実行前にバックアップを推奨します。
-- ■ Supabase SQL Editor で postgres 権限として実行してください。
--
-- 内容:
--   1) t_projects.customer_id をすべて NULL に（FK: ON DELETE RESTRICT のため必須）
--   2) m_customers を全行 DELETE
--
-- 残るもの:
--   - t_projects（顧客マスタとの紐付けのみ外れる。案件データ自体は残ります）
--   - 案件をまとめて消す場合は 23_wipe_all_projects.sql を利用してください。
--
-- 採番: 顧客番号（C-YYYY-NNNN）は次回 INSERT 時にトリガーが続きから採番します。
-- =============================================================================

BEGIN;

UPDATE t_projects
SET customer_id = NULL
WHERE customer_id IS NOT NULL;

DELETE FROM m_customers;

COMMIT;
