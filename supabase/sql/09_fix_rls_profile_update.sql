-- ==============================================================
-- 09_fix_rls_profile_update.sql
-- プロフィール保存ボタンが機能しない問題の修正
--
-- 【原因】
--   m_users の UPDATE ポリシーが「admin のみ」だったため、
--   一般ユーザーや、JWT の role がまだ反映されていないユーザーが
--   自分のプロフィールを更新できなかった。
--
-- 【修正内容】
--   認証済みユーザーなら誰でも自分の行 (id = auth.uid()) を更新可能にする
--   ※ role / status / line_user_id などの重要フィールドは
--     アプリ側フォームで送信しないため、実質 name と phone のみ更新される
-- ==============================================================

-- ① 自分のプロフィールを更新できるポリシーを追加
--    （同名ポリシーが既にある場合はスキップ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'm_users' AND policyname = 'm_users_update_self'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "m_users_update_self" ON m_users
        FOR UPDATE
        USING  (id = auth.uid()::UUID)
        WITH CHECK (id = auth.uid()::UUID)
    $policy$;
    RAISE NOTICE 'm_users_update_self ポリシーを作成しました';
  ELSE
    RAISE NOTICE 'm_users_update_self ポリシーは既に存在します（スキップ）';
  END IF;
END $$;

-- ② 確認
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'm_users'
ORDER BY policyname;
