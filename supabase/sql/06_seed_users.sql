-- ==============================================================
-- 06_seed_users.sql
-- 初期ユーザーデータ投入（テスト用）
-- 実行順序: 05_indexes.sql の後に実行してください
--
-- 注意:
--   本番運用では LINE認証 → Edge Function が自動で m_users に INSERT するため、
--   このSQLは開発・テスト環境のみで使用してください。
--   実際の LINE_USER_ID に置き換えて使用してください。
-- ==============================================================


-- --------------------------------------------------------------
-- 初期管理者ユーザー（社長）
-- Supabase Auth に先にユーザー登録後、auth.users の UUID を確認し
-- 下記の id を差し替えてから実行してください。
-- --------------------------------------------------------------

/*
INSERT INTO m_users (id, line_user_id, email, name, role, phone, status)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',  -- Supabase Auth の UUID に変更
    'Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',     -- LINE の Uから始まる UID に変更
    'nakayama@example.com',
    '中山社長',
    'admin',
    '090-0000-0001',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000000002',  -- Supabase Auth の UUID に変更
    'Uyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',     -- LINE の Uから始まる UID に変更
    'yamada@example.com',
    '山田太郎',
    'sales',
    '090-0000-0002',
    'active'
  )
ON CONFLICT (id) DO UPDATE SET
  name   = EXCLUDED.name,
  role   = EXCLUDED.role,
  phone  = EXCLUDED.phone,
  status = EXCLUDED.status;
*/


-- ==============================================================
-- テスト用サンプル案件データ（開発環境のみ）
-- m_users に管理者ユーザーを先に投入してから実行
-- ==============================================================

/*
-- サンプル案件（実際の m_users.id に変更してください）
INSERT INTO t_projects (
  customer_name, customer_name_kana, postal_code, address, phone,
  work_description, work_type,
  estimated_amount, acquisition_route,
  assigned_to, inquiry_date, status
)
VALUES (
  'テスト顧客',
  'テストコキャク',
  '123-4567',
  '東京都新宿区西新宿1-1-1',
  '03-0000-0001',
  '外壁・屋根の塗装工事',
  ARRAY['外壁塗装', '屋根塗装'],
  1500000,
  'チラシ',
  '00000000-0000-0000-0000-000000000001',  -- assigned_to: m_users.id
  CURRENT_DATE,
  'inquiry'
);
*/
