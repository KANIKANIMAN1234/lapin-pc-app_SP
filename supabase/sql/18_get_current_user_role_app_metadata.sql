-- get_current_user_role: JWT の role を user_metadata / app_metadata から取得し、
-- なければ m_users.role を参照（LINE 認証で JWT に role が無いと RLS が 403 になるのを防ぐ）
-- 実行順序: 03_functions_triggers.sql の後（m_users 作成後）

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

COMMENT ON FUNCTION get_current_user_role() IS 'RLS 用。user_metadata → app_metadata → m_users.role の順で解決';
