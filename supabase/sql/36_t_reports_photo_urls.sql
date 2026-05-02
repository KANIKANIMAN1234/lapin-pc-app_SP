-- 日報添付写真のメタ情報: 公開URLのJSON配列（Google Drive のみ使用。
--   形式例: https://drive.google.com/uc?export=view&id=...
-- スマホは案件の drive_folder_id 直下「日報」フォルダへアップロードし、そのURLを保存する。

ALTER TABLE t_reports
  ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN t_reports.photo_urls IS '添付画像の公開URL配列（Google Drive 表示用URL）';
