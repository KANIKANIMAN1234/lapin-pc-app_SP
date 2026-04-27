-- =============================================================
-- 案件ステータスマスターの初期データ投入
-- Supabase SQL Editor で実行してください
-- =============================================================

-- project_status_options を m_settings に登録（存在する場合は上書き）
INSERT INTO m_settings (key, value, description, updated_at)
VALUES (
  'project_status_options',
  '["inquiry:問い合わせ","estimate:見積もり","followup_status:追客中","contract:契約","in_progress:施工中","completed:完成","lost:失注"]',
  '案件ステータス一覧。形式: "DBキー:表示ラベル"',
  NOW()
)
ON CONFLICT (key) DO UPDATE
  SET value       = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at  = NOW();

-- 確認
SELECT key, value FROM m_settings WHERE key = 'project_status_options';
