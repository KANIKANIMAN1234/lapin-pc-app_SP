-- get_current_user_role: JWT に role が無い場合でも m_users を参照する
-- （UI は m_users からロールを復元するため一覧は見えるが、PATCH が 403 になる不一致を防ぐ）
-- Supabase SQL エディタで実行。18_get_current_user_role_app_metadata.sql の後でも可（上書き）

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(trim(auth.jwt() -> 'user_metadata' ->> 'role'), ''),
    NULLIF(trim(auth.jwt() -> 'app_metadata' ->> 'role'), ''),
    (
      SELECT u.role::text
      FROM m_users u
      WHERE u.id = auth.uid()
        AND u.deleted_at IS NULL
      LIMIT 1
    ),
    'anon'
  );
$$;

COMMENT ON FUNCTION get_current_user_role() IS
  'RLS 用。user_metadata → app_metadata → m_users.role の順で解決（JWT 欠落時の 403 を防ぐ）';
