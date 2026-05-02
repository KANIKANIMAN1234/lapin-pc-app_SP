-- get_current_user_role: JWT の role を user_metadata に加え app_metadata からも取得する
-- （LINE 認証等で role が app_metadata のみのとき、anon と判定され RLS が誤動作するのを防ぐ）
-- Supabase SQL エディタで 1 回実行

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(trim(auth.jwt() -> 'user_metadata' ->> 'role'), ''),
    NULLIF(trim(auth.jwt() -> 'app_metadata' ->> 'role'), ''),
    'anon'
  );
$$;

COMMENT ON FUNCTION get_current_user_role() IS 'RLS 用。user_metadata.role を優先し、なければ app_metadata.role';
