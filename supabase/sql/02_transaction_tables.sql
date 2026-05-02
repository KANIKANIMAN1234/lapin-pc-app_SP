-- ==============================================================
-- 02_transaction_tables.sql
-- トランザクションテーブル作成（t_ プレフィックス）
-- 実行順序: 01_master_tables.sql の後に実行してください
-- ==============================================================


-- --------------------------------------------------------------
-- t_projects: 案件（工事案件の中核テーブル）
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_projects (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number       TEXT          UNIQUE,                   -- TRIGGER で自動採番（例: 2026-0001）
  customer_name        TEXT          NOT NULL,
  customer_name_kana   TEXT,
  postal_code          TEXT,
  address              TEXT          NOT NULL,
  phone                TEXT          NOT NULL,
  email                TEXT,
  work_description     TEXT          NOT NULL DEFAULT '',
  work_type            TEXT[]        NOT NULL DEFAULT '{}',    -- 配列（複数工事種別可）
  estimated_amount     NUMERIC(12,0) NOT NULL DEFAULT 0,
  contract_amount      NUMERIC(12,0),
  actual_cost          NUMERIC(12,0),
  gross_profit         NUMERIC(12,0) GENERATED ALWAYS AS      -- 自動計算（Generated Column）
                         (contract_amount - actual_cost) STORED,
  gross_profit_rate    NUMERIC(5,2)  GENERATED ALWAYS AS      -- 自動計算（Generated Column）
                         (CASE WHEN contract_amount > 0
                          THEN ROUND((contract_amount - actual_cost)::NUMERIC / contract_amount * 100, 2)
                          ELSE NULL END) STORED,
  acquisition_route    TEXT          NOT NULL DEFAULT '',
  flyer_area           TEXT,
  flyer_distributor_id UUID          REFERENCES m_users(id),
  assigned_to          UUID          NOT NULL REFERENCES m_users(id),
  status               TEXT          NOT NULL DEFAULT 'inquiry'
                         CHECK (status IN (
                           'inquiry',       -- 問い合わせ
                           'estimate',      -- 見積中
                           'followup_status', -- フォロー中（追加）
                           'contract',      -- 契約
                           'in_progress',   -- 施工中
                           'completed',     -- 完工
                           'lost'           -- 失注
                         )),
  inquiry_date         DATE          NOT NULL DEFAULT CURRENT_DATE,
  estimate_date        DATE,
  contract_date        DATE,
  start_date           DATE,
  completion_date      DATE,
  planned_budget       NUMERIC(12,0),
  actual_budget        NUMERIC(12,0),
  thankyou_flag        BOOLEAN       NOT NULL DEFAULT FALSE,   -- サンキューレター送付済み
  followup_flag        BOOLEAN       NOT NULL DEFAULT FALSE,   -- フォローアップ完了
  inspection_flag      BOOLEAN       NOT NULL DEFAULT FALSE,   -- 定期点検実施済み
  lat                  NUMERIC(9,6),
  lng                  NUMERIC(9,6),
  drive_folder_id      TEXT,                                   -- Google Drive フォルダID
  drive_folder_url     TEXT,                                   -- Google Drive フォルダURL
  notes                TEXT,
  created_by           UUID          REFERENCES m_users(id),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);

COMMENT ON TABLE  t_projects                   IS '顧客の工事案件情報（システムの中核データ）';
COMMENT ON COLUMN t_projects.project_number    IS '管理番号（TRIGGER自動採番: YYYY-NNNN形式）';
COMMENT ON COLUMN t_projects.work_type         IS '工事種別配列（例: {"外壁塗装","屋根塗装"}）';
COMMENT ON COLUMN t_projects.gross_profit      IS '粗利額（Generated Column: contract_amount - actual_cost）';
COMMENT ON COLUMN t_projects.gross_profit_rate IS '粗利率（Generated Column: %, 小数2桁）';
COMMENT ON COLUMN t_projects.thankyou_flag     IS 'サンキューレター送付済みフラグ';
COMMENT ON COLUMN t_projects.followup_flag     IS 'フォローアップ完了フラグ';
COMMENT ON COLUMN t_projects.inspection_flag   IS '定期点検実施済みフラグ';
COMMENT ON COLUMN t_projects.deleted_at        IS 'NULL=有効, 値あり=論理削除済み';


-- --------------------------------------------------------------
-- t_photos: 写真メタデータ
-- 実ファイルは Google Drive。URLのみ Supabase に保存
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_photos (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        NOT NULL REFERENCES t_projects(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL
                     CHECK (type IN (
                       'before',      -- 着工前
                       'inspection',  -- 現地調査
                       'undercoat',   -- 下地・途中
                       'completed'    -- 完工後
                     )),
  file_id          TEXT        NOT NULL,    -- Google Drive ファイルID
  drive_url        TEXT        NOT NULL,    -- 表示用URL: https://drive.google.com/uc?export=view&id={file_id}
  thumbnail_url    TEXT        NOT NULL,    -- サムネイルURL: https://drive.google.com/thumbnail?id={file_id}&sz=w800
  file_name        TEXT,
  file_size        BIGINT,                  -- バイト単位
  uploaded_by      UUID        NOT NULL REFERENCES m_users(id),
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  progress_status  TEXT
                     CHECK (progress_status IN ('ahead', 'on_schedule', 'delayed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

COMMENT ON TABLE  t_photos                  IS '案件に紐づく写真のメタデータ（実ファイルはGoogle Drive）';
COMMENT ON COLUMN t_photos.type             IS 'before=着工前, inspection=現調, undercoat=下地, completed=完工後';
COMMENT ON COLUMN t_photos.file_id          IS 'Google Drive ファイルID。URL再生成に使用';
COMMENT ON COLUMN t_photos.drive_url        IS '表示用URL: https://drive.google.com/uc?export=view&id={file_id}';
COMMENT ON COLUMN t_photos.thumbnail_url    IS 'サムネイルURL: https://drive.google.com/thumbnail?id={file_id}&sz=w800';
COMMENT ON COLUMN t_photos.progress_status  IS 'ahead=順調, on_schedule=予定通り, delayed=遅延';


-- --------------------------------------------------------------
-- t_budgets: 予算・原価管理
-- 案件の項目別予算と実績を管理
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_budgets (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID          NOT NULL REFERENCES t_projects(id) ON DELETE CASCADE,
  item             TEXT          NOT NULL,                     -- 工事項目名
  item_category    TEXT
                     CHECK (item_category IN ('材料費', '労務費', '外注費', '経費', 'その他')),
  planned_amount   NUMERIC(12,0) NOT NULL DEFAULT 0,
  planned_vendor   TEXT,
  actual_amount    NUMERIC(12,0),
  actual_vendor    TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

COMMENT ON TABLE  t_budgets               IS '案件の予算情報（工事項目ごと）';
COMMENT ON COLUMN t_budgets.item_category IS '材料費/労務費/外注費/経費/その他';


-- --------------------------------------------------------------
-- t_receipts: 領収書
-- OCR・AI自動仕訳対応
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_receipts (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID          REFERENCES t_projects(id),     -- NULL=未紐付け
  store_name     TEXT,
  purchase_date  DATE,
  amount         NUMERIC(12,0) NOT NULL,
  items          TEXT,
  ocr_result     JSONB,                                        -- Cloud Vision OCR結果
  ai_candidates  JSONB,                                        -- AI推定候補案件（配列）
  confirmed_by   UUID          REFERENCES m_users(id),
  confirmed_at   TIMESTAMPTZ,
  image_url      TEXT          NOT NULL,                       -- Google Drive URL
  status         TEXT          NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_by     UUID          REFERENCES m_users(id),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

COMMENT ON TABLE  t_receipts               IS '領収書情報とOCR結果を管理';
COMMENT ON COLUMN t_receipts.ocr_result    IS '{"store_name":"...", "amount":1500, "confidence":0.95}';
COMMENT ON COLUMN t_receipts.ai_candidates IS '[{"project_id":"uuid", "confidence":0.85, "reason":"..."}]';
COMMENT ON COLUMN t_receipts.image_url     IS '領収書画像のGoogle Drive URL';


-- --------------------------------------------------------------
-- t_meetings: 商談記録
-- 録音・文字起こし・AI要約を格納
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_meetings (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID        NOT NULL REFERENCES t_projects(id) ON DELETE CASCADE,
  meeting_date       DATE        NOT NULL,
  meeting_type       TEXT
                       CHECK (meeting_type IN (
                         '初回商談', '現地調査', '見積提出',
                         '契約', '工事確認', '完工確認', 'その他'
                       )),
  audio_url          TEXT,                                     -- Google Drive 録音URL
  transcript         TEXT,                                     -- 文字起こし全文
  summary            TEXT,                                     -- AI要約
  customer_requests  JSONB,                                    -- 顧客の要望（配列）
  promises           JSONB,                                    -- 約束した内容（配列）
  next_actions       JSONB,                                    -- 次回アクション（配列）
  recorded_by        UUID        NOT NULL REFERENCES m_users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);

COMMENT ON TABLE  t_meetings                    IS '商談・現場での会話記録';
COMMENT ON COLUMN t_meetings.customer_requests  IS '["外壁の色はベージュ系", "屋根は遮熱塗料で"]';
COMMENT ON COLUMN t_meetings.next_actions       IS '["1週間以内に見積提出", "現地調査日程調整"]';


-- --------------------------------------------------------------
-- t_reports: 日報
-- 1ユーザー・1日・1件制約
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES m_users(id),
  report_date   DATE        NOT NULL,
  title         TEXT,
  content       TEXT        NOT NULL,
  audio_url     TEXT,
  visits        JSONB,                                         -- 訪問先情報
  activities    JSONB,                                         -- 活動内容
  achievements  JSONB,                                         -- 成果
  issues        JSONB,                                         -- 課題
  next_actions  JSONB,                                         -- 次回アクション
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,

  UNIQUE (user_id, report_date)                                -- 1日1件制約
);

COMMENT ON TABLE t_reports IS '営業の日報（1ユーザー・1日・1件）';


-- --------------------------------------------------------------
-- t_expenses: 経費申請
-- 経費の申請・承認フローを管理
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_expenses (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES m_users(id),
  project_id        UUID          REFERENCES t_projects(id),  -- NULL=案件非紐付け
  expense_date      DATE          NOT NULL,
  category          TEXT          NOT NULL
                      CHECK (category IN (
                        '交通費', '接待交際費', '消耗品費',
                        '通信費', '駐車場代', '材料費', '外注費', 'その他'
                      )),
  memo              TEXT,
  amount            NUMERIC(12,0) NOT NULL,
  receipt_image_url TEXT,                                      -- Google Drive URL
  status            TEXT          NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by       UUID          REFERENCES m_users(id),
  approved_at       TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

COMMENT ON TABLE  t_expenses          IS '従業員の経費申請・承認管理';
COMMENT ON COLUMN t_expenses.category IS '交通費/接待交際費/消耗品費/通信費/駐車場代/材料費/外注費/その他';


-- --------------------------------------------------------------
-- t_bonus: ボーナス計算結果
-- 社長のみアクセス可（RLSで制御）
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_bonus (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID          NOT NULL REFERENCES m_users(id),
  year                 INTEGER       NOT NULL,
  period_number        INTEGER       NOT NULL CHECK (period_number BETWEEN 1 AND 3),
  target_gross_profit  NUMERIC(12,0) NOT NULL,
  actual_gross_profit  NUMERIC(12,0) NOT NULL,
  achievement_rate     NUMERIC(5,2)  GENERATED ALWAYS AS    -- 自動計算
                         (ROUND(actual_gross_profit::NUMERIC / NULLIF(target_gross_profit, 0) * 100, 2)) STORED,
  bonus_base           NUMERIC(12,0) NOT NULL,
  cut_rate             NUMERIC(5,2)  NOT NULL DEFAULT 0,
  final_bonus          NUMERIC(12,0) NOT NULL,
  contribution_details JSONB,                                  -- {"営業":0.6, "管理":0.2, "フォロー":0.2}
  is_finalized         BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ,

  UNIQUE (user_id, year, period_number)
);

COMMENT ON TABLE  t_bonus                      IS '営業のボーナス計算結果（社長のみアクセス可）';
COMMENT ON COLUMN t_bonus.achievement_rate     IS '達成率（Generated Column: actual/target × 100）';
COMMENT ON COLUMN t_bonus.contribution_details IS '{"営業":0.6, "管理":0.2, "フォロー":0.2}';
COMMENT ON COLUMN t_bonus.is_finalized         IS 'TRUE=確定済み（変更不可）';
