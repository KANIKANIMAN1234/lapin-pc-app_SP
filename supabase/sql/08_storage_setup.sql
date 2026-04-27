-- ==============================================================
-- 08_storage_setup.sql
-- レシート画像アップロード用 Supabase Storage バケット設定
-- Supabase SQL Editor で実行してください
-- ==============================================================

-- ── バケット作成 ──────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  true,                                -- 公開バケット（URLで直接参照可能）
  5242880,                             -- 最大5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS ポリシー ──────────────────────────────────────────────

-- 認証ユーザーはアップロード可能（自分のフォルダのみ）
CREATE POLICY "expense_receipts_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 全員閲覧可能（公開バケットのため）
CREATE POLICY "expense_receipts_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'expense-receipts');

-- 本人のみ削除可能
CREATE POLICY "expense_receipts_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 確認 ─────────────────────────────────────────────────────
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'expense-receipts';
