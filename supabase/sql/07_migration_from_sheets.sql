-- ==============================================================
-- 07_migration_from_sheets.sql
-- スプレッドシート → Supabase データ移行
--
-- 【実行手順】
--   STEP 1: 井上さん(管理者)がまず LINE ログインする
--           → auth.users と m_users にレコードが自動作成される
--   STEP 2: 以下の「STEP2: 管理者権限設定」を実行
--   STEP 3: GAS の generateMigrationSQL() を実行し、生成された SQL を実行
--           → projects / expenses / reports が投入される
--   STEP 4: 他のユーザーも LINE ログイン後、「STEP4: ユーザーロール設定」を実行
-- ==============================================================


-- ==============================================================
-- STEP 2: 管理者権限設定
-- 【井上剛聡】を管理者 (admin) に設定する
-- LINE ログイン後に実行してください
-- ==============================================================

-- LINE ログイン後に m_users に name='井上剛聡' のレコードが作成されます
UPDATE m_users
SET
  role       = 'admin',
  updated_at = NOW()
WHERE name = '井上剛聡';

-- 実行確認
SELECT id, name, role, email, status, created_at
FROM m_users
WHERE name = '井上剛聡';


-- ==============================================================
-- STEP 4: 全ユーザーのロール設定
-- 各ユーザーが LINE ログイン後に実行してください
-- ユーザー名と role を実際の値に合わせて修正してください
-- ==============================================================

/*
-- ── 社内スタッフのロール設定 ─────────────────────────────────
UPDATE m_users SET role = 'admin',  updated_at = NOW() WHERE name = '中山社長名前';
UPDATE m_users SET role = 'staff',  updated_at = NOW() WHERE name = '内勤スタッフ名前';
UPDATE m_users SET role = 'sales',  updated_at = NOW() WHERE name = '営業担当名前1';
UPDATE m_users SET role = 'sales',  updated_at = NOW() WHERE name = '営業担当名前2';
-- 追加のユーザーはここに追加してください

-- ── 設定確認 ─────────────────────────────────────────────────
SELECT id, name, role, status, created_at FROM m_users ORDER BY role, name;
*/


-- ==============================================================
-- STEP 3-B: GAS スクリプト実行前の手動案件投入（任意）
-- GAS generateMigrationSQL() の実行が困難な場合、
-- 下記テンプレートに従って手動で案件を登録してください
-- ==============================================================

/*
-- ── t_projects（案件）手動投入テンプレート ───────────────────
INSERT INTO t_projects (
  project_number,
  customer_name, customer_name_kana,
  postal_code, address, phone, email,
  work_description, work_type,
  estimated_amount, contract_amount,
  acquisition_route, assigned_to,
  status,
  inquiry_date, estimate_date, contract_date,
  start_date, completion_date,
  planned_budget, actual_cost,
  gross_profit, gross_profit_rate,
  notes, drive_folder_url
)
VALUES
  (
    '2026-001',                                                    -- project_number
    '田中一郎', 'タナカイチロウ',                                    -- 顧客名・フリガナ
    '350-1234', '埼玉県狭山市○○1-2-3', '04-2900-XXXX', '',        -- 住所・電話・メール
    '外壁・屋根の塗装工事', ARRAY['外壁塗装', '屋根塗装'],            -- 工事内容・種別
    1500000, 1380000,                                              -- 見積額・契約額
    'チラシ',                                                       -- 獲得経路
    (SELECT id FROM m_users WHERE name = '担当者名' LIMIT 1),      -- ← 担当者名を入力
    'completed',                                                   -- status
    '2024-03-01', '2024-03-15', '2024-04-01',                    -- 問合・見積・契約日
    '2024-05-01', '2024-06-30',                                   -- 着工・完工日
    800000, 750000,                                               -- 予算・実費
    630000, 45.7,                                                  -- 粗利・粗利率
    '', ''                                                         -- 備考・Driveフォルダ
  ),
  -- ここに追加の案件を入力（カンマ区切り）
  (
    '2026-002',
    '鈴木花子', 'スズキハナコ',
    '350-5678', '埼玉県所沢市△△4-5-6', '04-2900-YYYY', '',
    '浴室・キッチンリフォーム', ARRAY['水回り'],
    2000000, 1850000,
    '紹介',
    (SELECT id FROM m_users WHERE name = '担当者名' LIMIT 1),
    'in_progress',
    '2025-01-10', '2025-01-25', '2025-02-05',
    '2025-03-01', NULL,
    1200000, NULL,
    NULL, NULL,
    '', ''
  )
ON CONFLICT (project_number) DO NOTHING;
*/


-- ==============================================================
-- 確認用クエリ（移行後に実行）
-- ==============================================================

/*
-- ユーザー数確認
SELECT role, COUNT(*) as count FROM m_users GROUP BY role;

-- 案件数確認
SELECT status, COUNT(*) as count FROM t_projects WHERE deleted_at IS NULL GROUP BY status;

-- 経費数確認
SELECT category, COUNT(*) as count, SUM(amount) as total
FROM t_expenses WHERE deleted_at IS NULL
GROUP BY category ORDER BY total DESC;

-- 最新案件10件
SELECT project_number, customer_name, status, inquiry_date, assigned_to
FROM t_projects
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 10;
*/
