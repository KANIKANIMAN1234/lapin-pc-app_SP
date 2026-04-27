-- ============================================================
-- Supabase 移行 SQL（修正版）
-- 生成日時: 2026-04-27 10:20:33
-- 修正日時: 2026-04-27（gross_profit 生成列エラー・assigned_to 修正）
-- 実行順序: ①m_users → ②t_projects → ③t_reports
-- ============================================================

-- ※ Supabase SQL Editor で実行してください


-- ============================================================
-- ① m_users（ユーザーロール設定）
-- LINE ログイン後に role を正しく設定する
-- ============================================================

-- 井上剛聡（管理者・あなた自身）
UPDATE m_users SET
  role       = 'admin',
  status     = 'active',
  updated_at = NOW()
WHERE name = '井上剛聡';

-- 中山 隆志
UPDATE m_users SET
  role       = 'staff',
  status     = 'active',
  updated_at = NOW()
WHERE name = '中山 隆志';

-- 事務太郎
UPDATE m_users SET
  role       = 'staff',
  status     = 'active',
  updated_at = NOW()
WHERE name = '事務太郎';

-- 山田太郎
UPDATE m_users SET
  role       = 'sales',
  status     = 'active',
  updated_at = NOW()
WHERE name = '山田太郎';

-- 佐藤花子
UPDATE m_users SET
  role       = 'sales',
  status     = 'active',
  updated_at = NOW()
WHERE name = '佐藤花子';

-- 鈴木一郎
UPDATE m_users SET
  role       = 'sales',
  status     = 'active',
  updated_at = NOW()
WHERE name = '鈴木一郎';

-- 高橋次郎
UPDATE m_users SET
  role       = 'sales',
  status     = 'active',
  updated_at = NOW()
WHERE name = '高橋次郎';

-- 確認
SELECT id, name, role, status, created_at FROM m_users ORDER BY role, name;


-- ============================================================
-- ② t_projects（案件）
-- gross_profit / gross_profit_rate は生成列のため省略
-- （contract_amount と actual_cost から自動計算されます）
-- assigned_to: 担当者未ログインの場合は井上剛聡にフォールバック
-- ============================================================

-- フォールバック用: 井上剛聡のIDを取得
DO $$
DECLARE v_inoue UUID;
BEGIN
  SELECT id INTO v_inoue FROM m_users WHERE name = '井上剛聡' LIMIT 1;
  IF v_inoue IS NULL THEN
    RAISE EXCEPTION '井上剛聡がm_usersに存在しません。先にLINEログインしてください。';
  END IF;
END $$;

INSERT INTO t_projects (
  project_number, customer_name, customer_name_kana,
  postal_code, address, phone, email,
  work_description, work_type,
  estimated_amount, contract_amount,
  acquisition_route, assigned_to,
  status, inquiry_date, estimate_date, contract_date,
  start_date, completion_date,
  planned_budget, actual_cost,
  notes, drive_folder_url, lat, lng,
  created_at, updated_at
) VALUES
  (
    '2026-001', '田中太郎', 'タナカタロウ',
    '5500001', '大阪府大阪市西区土佐堀1-1-1', '06-1234-5678', 'tanaka@example.com',
    '外壁塗装・屋根塗装', '{"外壁塗装","屋根塗装"}',
    2500000, 2300000,
    'チラシ', COALESCE((SELECT id FROM m_users WHERE name = '山田太郎' LIMIT 1), (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1)),
    'inquiry', '2026-01-15', '2026-01-20', '2026-02-01',
    '2026-02-15', NULL,
    1800000, 30837,
    NULL, NULL, 34.6937, 135.4933,
    '2026-01-15 10:00:00+09', '2026-02-28 04:27:00+09'
  ),
  (
    '2026-002', '佐藤様邸', 'サトウサマテイ',
    '5300001', '大阪府大阪市北区梅田2-2-2', '06-9876-5432', NULL,
    '和室→洋室リフォーム', '{"内装リフォーム"}',
    1800000, NULL,
    '紹介', COALESCE((SELECT id FROM m_users WHERE name = '佐藤花子' LIMIT 1), (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1)),
    'estimate', '2026-02-10', '2026-02-15', NULL,
    NULL, NULL,
    NULL, 5900,
    '畳→フローリング', NULL, NULL, NULL,
    '2026-02-15 11:00:00+09', '2026-03-01 22:06:23+09'
  ),
  (
    '2026-003', '山本一郎', 'ヤマモトイチロウ',
    '5500002', '大阪府大阪市西区江戸堀3-3-3', '06-5555-1234', 'yamamoto@example.com',
    '屋根塗装', '{"屋根塗装"}',
    1200000, 1100000,
    'ホームページ', COALESCE((SELECT id FROM m_users WHERE name = '鈴木一郎' LIMIT 1), (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1)),
    'completed', '2026-01-20', '2026-01-25', '2026-02-05',
    '2026-02-20', NULL,
    900000, NULL,
    NULL, NULL, 34.6889, 135.4867,
    '2026-01-20 11:00:00+09', '2026-02-20 09:00:00+09'
  ),
  (
    '2026-004', '高橋花子', 'タカハシハナコ',
    '5300002', '大阪府大阪市北区天神橋4-4-4', '06-7777-8888', NULL,
    '外壁塗装', '{"外壁塗装"}',
    2200000, NULL,
    'チラシ', COALESCE((SELECT id FROM m_users WHERE name = '高橋次郎' LIMIT 1), (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1)),
    'lost', '2026-02-25', NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    NULL, NULL, 34.7103, 135.5121,
    '2026-02-25 16:00:00+09', '2026-02-28 04:34:16+09'
  ),
  (
    '2026-005', '井上剛聡', 'イノウエタケアキ',
    '1950062', '東京都町田市大蔵町382-4', '090-3969-9117', 'kanikaniman1234@gmail.com',
    'その他', '{"その他"}',
    500000, NULL,
    'その他', (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    'inquiry', '2026-03-01', NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    NULL, 'https://drive.google.com/drive/folders/1ZQOExgdnmmAlFAmvS5RlQ5XSeMaEzPBg', NULL, NULL,
    '2026-03-01 17:52:09+09', '2026-03-01 17:58:11+09'
  ),
  (
    '2026-006', '井上剛聡', 'イノウエタケアキ',
    '350-1113', '埼玉県川越市田町19-7', '090-3969-9117', 'kanikaniman1234@gmail.com',
    '1F106号室で2階から水漏れ事故発生、緊急対応の要請あり', '{"水回り"}',
    300000, NULL,
    'その他', (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    'inquiry', '2026-03-01', NULL, NULL,
    NULL, NULL,
    NULL, 3324,
    '所有者は中山社長ご友人、本業務管理アプリ作成者でもある。', 'https://drive.google.com/drive/folders/1J1LeWlfsFAecOkmXuYLN5hDL9fuMt1K9', NULL, NULL,
    '2026-03-01 18:05:30+09', '2026-03-01 22:07:03+09'
  ),
  (
    '2026-007', '川辺様', 'カワベ',
    NULL, '狭山市南入曽', '429075022', NULL,
    '雨漏り', '{"水回り（トイレ）","水回り（浴室）","内装リフォーム"}',
    1200000, NULL,
    '紹介', (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    'inquiry', '2026-03-01', NULL, NULL,
    NULL, NULL,
    NULL, 1000,
    NULL, 'https://drive.google.com/drive/folders/1uXLajTWCMz2LgLlVXhIRrA0AnlKR4JSu', NULL, NULL,
    '2026-03-01 22:14:14+09', '2026-03-04 11:21:20+09'
  ),
  (
    '2026-008', '井上邸', 'イノウエテイ',
    NULL, '東京都町田市大蔵町382-4', '9039699117', NULL,
    '故人様がご使用されていた戸建て2階の約4畳の居室（納戸）における壁紙張り替え工事です。長年の喫煙により付着したヤニ汚れと臭いの除去を目的とします。', '{"内装リフォーム"}',
    100000, NULL,
    'LINE', (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    'inquiry', '2026-03-01', NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    NULL, 'https://drive.google.com/drive/folders/1K00JGSrndG-sgr48G-qcZMIc2l7m1DRk', NULL, NULL,
    '2026-03-02 03:34:22+09', '2026-03-02 03:34:22+09'
  ),
  (
    '2026-009', 'TAKE', 'タケ',
    NULL, '埼玉県川口市蕨', '123456789', NULL,
    '壁紙はりかえました。', '{"内装リフォーム"}',
    30000, NULL,
    'LINE', (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    'inquiry', '2026-03-01', NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    NULL, 'https://drive.google.com/drive/folders/1pNg1h2TlnIxBQ3UECkH091pCEaQMu7cy', NULL, NULL,
    '2026-03-02 03:41:55+09', '2026-03-02 03:41:55+09'
  ),
  (
    '2026-010', 'テスト', 'テスト',
    NULL, 'テスト住所', '123456', NULL,
    'てすと', '{"内装リフォーム"}',
    10, NULL,
    'チラシ', (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    'inquiry', '2026-03-01', NULL, NULL,
    NULL, NULL,
    NULL, 4000,
    NULL, 'https://drive.google.com/drive/folders/1JtXpQnH60_R_mxHQglGpe8Cv1z2fQhEc', NULL, NULL,
    '2026-03-02 03:45:59+09', '2026-04-08 22:09:40+09'
  ),
  (
    '2026-011', '井上邸', 'イノウエテイ',
    NULL, '町田', '123456789', NULL,
    'テストテスト', '{"内装リフォーム"}',
    1000, NULL,
    'チラシ', (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    'inquiry', '2026-03-01', NULL, NULL,
    NULL, NULL,
    NULL, 50000,
    NULL, 'https://drive.google.com/drive/folders/1vWBkcGNb6MWBGGUfw1YfJmpY1enkgO4j', NULL, NULL,
    '2026-03-02 03:53:05+09', '2026-04-08 22:03:07+09'
  ),
  (
    '2026-012', 'TEST案件', NULL,
    '333-0851', '川口市芝新町12-13', '9039699117', 'kanikaniman1234@gmail.com',
    '外壁塗装', '{"外壁塗装"}',
    2000000, NULL,
    '紹介', (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    'inquiry', '2026-03-04', NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    NULL, 'https://drive.google.com/drive/folders/1LYxO9hNebSp6AozlK9_akWM2w-D8GlSj', NULL, NULL,
    '2026-03-05 01:26:19+09', '2026-03-05 01:26:19+09'
  ),
  (
    '2026-013', 'TEST佐久間家', 'サクマ',
    NULL, '北海道', '11123456', NULL,
    'おお、色々なところの修繕が必要です。', '{"外壁塗装","屋根塗装","水回り（キッチン）","内装リフォーム","水回り（トイレ）"}',
    10000000, NULL,
    '紹介', (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    'inquiry', '2026-03-08', NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    NULL, 'https://drive.google.com/drive/folders/1UWuNockYXB2KMpEnVdwjmC2ScvojDKTi', NULL, NULL,
    '2026-03-08 10:39:39+09', '2026-03-08 10:39:39+09'
  ),
  (
    '2026-014', 'TEST椎葉家', 'シイバ',
    NULL, '浦和', '123456789', NULL,
    'TESTEST', '{"水回り（トイレ）"}',
    100000, NULL,
    '紹介', (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    'inquiry', '2026-03-08', NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    NULL, 'https://drive.google.com/drive/folders/1yrPgFjO7av_JnYC9yvCWfF3KX66jcm-5', NULL, NULL,
    '2026-03-08 20:20:32+09', '2026-03-08 20:20:32+09'
  ),
  (
    '2026-015', '中山家', 'ナカヤマ',
    NULL, '狭山市', '123456789', NULL,
    '外壁塗装,水回り（キッチン）', '{"外壁塗装","水回り（キッチン）"}',
    200000, NULL,
    '紹介', (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    'inquiry', '2026-03-27', NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    NULL, 'https://drive.google.com/drive/folders/1pdn3G-VjAoARQjSr7TyQX9ZbjdGl9c7s', NULL, NULL,
    '2026-03-27 09:52:10+09', '2026-03-27 09:52:10+09'
  ),
  (
    '2026-016', 'TEST', 'TEST',
    NULL, 'TEST', '1230456', NULL,
    '水回り（浴室）,内装リフォーム', '{"水回り（浴室）","内装リフォーム"}',
    2000000, NULL,
    'チラシ', (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    'inquiry', '2026-03-27', NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    NULL, 'https://drive.google.com/drive/folders/1k42tdrXfSOL6rWT5tGko9g4j0QLtoq7y', NULL, NULL,
    '2026-03-27 21:32:19+09', '2026-03-27 21:32:19+09'
  )
ON CONFLICT (project_number) DO NOTHING;


-- ============================================================
-- ③ t_reports（日報）
-- user_id: 記録から担当者が判別できないものは NULL
-- ============================================================

INSERT INTO t_reports (
  user_id, report_date, title, content,
  created_at, updated_at
) VALUES
  (
    (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    '2026-02-20', '2/20 営業日報',
    '【記録①】午前：田中様邸現地調査。外壁のチョーキング現象を確認。屋根は苔が多く塗装が必要。午後：佐藤様邸見積提出。フローリング材の見本を持参して説明。前向きな反応。
【記録②】午前：事務作業。見積書2件作成。午後：山本様邸の契約手続き。無事に契約完了。',
    '2026-02-20 18:00:00+09', NOW()
  ),
  (
    (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    '2026-02-21', '2/21 営業日報',
    '終日：山本一郎様邸の屋根塗装施工。下地処理完了。明日から塗装開始予定。天候は晴れ。',
    '2026-02-21 17:30:00+09', NOW()
  ),
  (
    (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    '2026-03-01', '2026-03-01 日報',
    '足立　打ち合わせ　手直し',
    '2026-03-01 22:00:38+09', NOW()
  ),
  (
    (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    '2026-03-01', '2026-03-01 日報',
    '■ 本日の業務内容
*   午前中、実家にて壁紙張り替え前のパテ処理を実施しました。
*   午後、ホームセンターにて壁紙張り替えに必要な部材を調達しました。
*   帰宅後、壁紙張り作業に着手しました。

■ 成果・進捗
*   壁紙張り替えのための下地処理（パテ処理）が完了しました。
*   必要な部材の購入が完了し、作業準備が整いました。
*   壁紙張り作業を開始しました。

■ 課題・懸念点
特になし。

■ 明日の予定
特になし。',
    '2026-03-02 03:29:06+09', NOW()
  ),
  (
    (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    '2026-03-04', '2026-03-04 日報',
    '■ 本日の業務内容
- 特になし（入力された音声はテスト発言のみでした）

■ 成果・進捗
特になし

■ 課題・懸念点
特になし

■ 明日の予定
特になし',
    '2026-03-04 11:22:49+09', NOW()
  ),
  (
    (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    '2026-03-05', '2026-03-05 日報',
    '■ 本日の業務内容
* 問い合わせ対応を実施しました。
* 電話にて顧客へ連絡を行いました。

■ 成果・進捗
* 訪問対応可能日について、改めて顧客から連絡をいただくことになりました。

■ 課題・懸念点
（特なし）

■ 明日の予定
（特になし）',
    '2026-03-05 01:36:00+09', NOW()
  ),
  (
    (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    '2026-03-03', '2026-03-03 日報',
    '■ 本日の業務内容
・10時よりAI研修3日目に参加。
・プロンプトの内容について学習し、深津式、七里式、俊介式、鍋式の4つのスタイルについて学んだ。

■ 成果・進捗
・各プロンプトスタイルの特徴を理解できた。

■ 課題・懸念点
（特になし）

■ 明日の予定
（特になし）',
    '2026-03-05 11:03:22+09', NOW()
  ),
  (
    (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    '2026-03-08', '2026-03-08 日報',
    '■ 本日の業務内容
* 午前8時30分より現場にて現地調査を実施。
* 現地調査の結果、水回りの配管見直しが必要と判明。
* お客様へ配管見直しの必要性を報告し、別途候補日程を連絡する旨を調整。
* 外壁塗装箇所の写真撮影を実施。

■ 成果・進捗
* 現地調査が完了し、水回りの配管見直しが必要な点が明確になった。
* お客様への報告と今後の対応について調整済み。
* 外壁塗装の報告書作成に必要な写真撮影が完了した。

■ 課題・懸念点
* 水回りの配管見直しによる追加工事の発生と、それに伴うお客様への詳細な説明および日程調整。
* 外壁は修繕が必要な箇所が多いため、お客様へ明確な修繕内容と費用を提示する必要がある。

■ 明日の予定
* 来週月曜日までに外壁塗装に関する報告書を作成・提出。
* 水回りの配管見直しに関する候補日程をお客様へ連絡。',
    '2026-03-08 10:37:10+09', NOW()
  ),
  (
    (SELECT id FROM m_users WHERE name = '井上剛聡' LIMIT 1),
    '2026-04-25', '2026-04-25 日報',
    '■ 本日の業務内容（箇条書き）
  - 日報として整形できる業務内容の報告はありませんでした。

■ 成果・進捗
  - 報告された成果や進捗はありませんでした。

■ 課題・懸念点（あれば）
  - 報告された課題や懸念点はありませんでした。

■ 明日の予定（あれば）
  - 報告された明日の予定はありませんでした。',
    '2026-04-25 17:36:23+09', NOW()
  )
ON CONFLICT (user_id, report_date) DO NOTHING;


-- ============================================================
-- ④ 確認クエリ（全て実行後に確認）
-- ============================================================

SELECT 'users'    AS tbl, COUNT(*) FROM m_users    WHERE status = 'active'
UNION ALL
SELECT 'projects' AS tbl, COUNT(*) FROM t_projects WHERE deleted_at IS NULL
UNION ALL
SELECT 'reports'  AS tbl, COUNT(*) FROM t_reports  WHERE deleted_at IS NULL;
