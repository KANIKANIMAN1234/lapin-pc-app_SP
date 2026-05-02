-- 日報に添付写真の公開URL配列を保存する列（主に Google Drive 直リンク。
--   形式: https://drive.google.com/uc?export=view&id=... ）
-- レガシー: 以前は Supabase Storage report-photos の URL が入る場合あり。
-- Storage バケット report-photos は任意（スマホ日報は案件 Drive の「日報」フォルダを使用）。

ALTER TABLE t_reports
  ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN t_reports.photo_urls IS '添付画像の公開URL配列（Google Drive 表示用URL。Storage のレガシーURL可）';

-- ── Storage: report-photos（認証ユーザは自分の uid 配下のみアップロード）──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-photos',
  'report-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "report_photos_insert" ON storage.objects;
CREATE POLICY "report_photos_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'report-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "report_photos_select" ON storage.objects;
CREATE POLICY "report_photos_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'report-photos');

DROP POLICY IF EXISTS "report_photos_delete" ON storage.objects;
CREATE POLICY "report_photos_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'report-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
