-- m_customers: Google Drive 顧客フォルダ（案件フォルダの親）
-- Supabase SQL エディタで実行してください。

ALTER TABLE m_customers
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

ALTER TABLE m_customers
  ADD COLUMN IF NOT EXISTS drive_folder_url TEXT;

COMMENT ON COLUMN m_customers.drive_folder_id  IS 'Google Drive 顧客ルートフォルダID（ルート直下の顧客フォルダ）';
COMMENT ON COLUMN m_customers.drive_folder_url IS 'Google Drive 顧客ルートフォルダURL';
