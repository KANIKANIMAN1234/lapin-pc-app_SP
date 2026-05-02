-- 案件番号4桁化、m_settings の閲覧拡張（営業も可）、Driveフォルダテンプレ初期値
-- Supabase SQL Editor で既存DBに適用してください

-- 1) 採番: YYYY-NNNN
CREATE OR REPLACE FUNCTION generate_project_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  current_year TEXT;
  max_num      INTEGER;
  new_number   TEXT;
BEGIN
  IF NEW.project_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  current_year := TO_CHAR(NOW(), 'YYYY');

  SELECT COALESCE(
    MAX(CAST(SPLIT_PART(project_number, '-', 2) AS INTEGER)),
    0
  )
  INTO max_num
  FROM t_projects
  WHERE project_number LIKE current_year || '-%';

  new_number := current_year || '-' || LPAD((max_num + 1)::TEXT, 4, '0');
  NEW.project_number := new_number;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION generate_project_number() IS 'INSERT時 project_number 自動採番（YYYY-NNNN）';

-- 2) 営業・全ログインユーザーが m_settings を参照可能（既に存在する場合は一度削除して再作成）
DROP POLICY IF EXISTS "m_settings_select_any_logged_in" ON m_settings;
CREATE POLICY "m_settings_select_any_logged_in" ON m_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 3) 新規案件用 Google Drive サブフォルダ定義（JSON配列・相対パス / で階層）
INSERT INTO m_settings (key, value, description) VALUES
  (
    'drive_folder_template',
    '["01_見積書","02_契約書","03_施工写真/着工前","03_施工写真/施工中","03_施工写真/完工後","04_報告書","05_請求書","06_議事メモ","07_図面・資料"]',
    '新規案件作成時のDriveサブフォルダ相対パス（JSON配列）。管理画面マスターで編集。'
  )
ON CONFLICT (key) DO NOTHING;
