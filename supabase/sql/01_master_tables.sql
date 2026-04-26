-- ==============================================================
-- 01_master_tables.sql
-- マスターテーブル作成（m_ プレフィックス）
-- 実行順序: このファイルを最初に実行してください
-- 対象: Supabase SQL Editor または psql
-- ==============================================================


-- --------------------------------------------------------------
-- m_users: ユーザーマスター
-- LINE認証で登録されたシステム利用者（従業員）
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS m_users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id    TEXT        UNIQUE,                          -- LINE UID（Uから始まる文字列）
  email           TEXT        UNIQUE,
  name            TEXT        NOT NULL,
  role            TEXT        NOT NULL DEFAULT 'sales'
                                CHECK (role IN ('admin', 'staff', 'sales')),
  phone           TEXT,
  avatar_url      TEXT,                                        -- LINEプロフィール画像URL
  status          TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'retired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

COMMENT ON TABLE  m_users                IS 'システム利用者（従業員）マスター';
COMMENT ON COLUMN m_users.role           IS 'admin=社長, staff=事務, sales=営業担当';
COMMENT ON COLUMN m_users.line_user_id   IS 'LINE連携用UID（Uから始まる文字列）';
COMMENT ON COLUMN m_users.status         IS 'active=在籍, retired=退職';
COMMENT ON COLUMN m_users.deleted_at     IS 'NULL=有効, 値あり=論理削除済み';


-- --------------------------------------------------------------
-- m_settings: システム設定
-- キー・バリュー形式の設定値管理
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS m_settings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        NOT NULL UNIQUE,
  value       TEXT        NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID        REFERENCES m_users(id)
);

COMMENT ON TABLE  m_settings             IS 'システム全体の設定値（キー・バリュー形式）';
COMMENT ON COLUMN m_settings.key         IS '設定キー（例: project_number_prefix）';
COMMENT ON COLUMN m_settings.value       IS '設定値（テキスト形式）';
COMMENT ON COLUMN m_settings.description IS '設定内容の説明';


-- --------------------------------------------------------------
-- m_bonus_periods: ボーナス期間設定マスター
-- 各ボーナス期の固定費・配分率・目標金額を管理
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS m_bonus_periods (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  year                  INTEGER     NOT NULL,
  period_number         INTEGER     NOT NULL CHECK (period_number BETWEEN 1 AND 3),
  period_label          TEXT        NOT NULL,                  -- "2026年 第1期"
  period_start          DATE        NOT NULL,
  period_end            DATE        NOT NULL,
  months_label          TEXT        NOT NULL,                  -- "1月〜4月"
  fixed_cost            NUMERIC(12,0) NOT NULL DEFAULT 0,      -- 固定費合計（円）
  distribution_rate     NUMERIC(5,2)  NOT NULL DEFAULT 10.0,   -- ボーナス配分率（%）
  target_amount         NUMERIC(12,0) NOT NULL DEFAULT 0,      -- 目標粗利額（円）
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (year, period_number)
);

COMMENT ON TABLE  m_bonus_periods                 IS 'ボーナス計算期間の固定費・配分率・目標金額マスター';
COMMENT ON COLUMN m_bonus_periods.period_label    IS '表示ラベル（例: 2026年 第1期）';
COMMENT ON COLUMN m_bonus_periods.months_label    IS '月ラベル（例: 1月〜4月）';
COMMENT ON COLUMN m_bonus_periods.fixed_cost      IS '期間中の固定費合計（円）';
COMMENT ON COLUMN m_bonus_periods.distribution_rate IS 'ボーナス配分率（%）';
COMMENT ON COLUMN m_bonus_periods.target_amount   IS '目標粗利額（円）';


-- ==============================================================
-- 初期マスターデータ
-- ==============================================================

-- m_settings 初期値
INSERT INTO m_settings (key, value, description) VALUES
  ('project_number_prefix',       'YYYY',  '管理番号の年プレフィックス（自動生成）'),
  ('gross_profit_alert_threshold', '20',   '粗利率アラート閾値（%）。この値以下でアラート'),
  ('bonus_base_rate',              '0.10', 'ボーナス基本配分率（デフォルト10%）'),
  ('drive_root_folder_id',         '',     'Google Drive ルートフォルダID（設定必須）'),
  ('line_channel_id',              '',     'LINE Loginチャンネル ID（設定必須）'),
  ('line_channel_secret',          '',     'LINE Loginチャンネル シークレット（Vault推奨）'),
  ('header_display',               'trade', '画面ヘッダー表示（company=法人名, trade=屋号）'),
  ('company_name',                 'ラパンリフォーム', '会社名・屋号')
ON CONFLICT (key) DO NOTHING;

-- m_bonus_periods 2026年度初期値
INSERT INTO m_bonus_periods (year, period_number, period_label, period_start, period_end, months_label, fixed_cost, distribution_rate, target_amount) VALUES
  (2026, 1, '2026年 第1期', '2026-01-01', '2026-04-30', '1月〜4月', 2000000, 10.00, 5000000),
  (2026, 2, '2026年 第2期', '2026-05-01', '2026-08-31', '5月〜8月', 2000000, 10.00, 5000000),
  (2026, 3, '2026年 第3期', '2026-09-01', '2026-12-31', '9月〜12月', 2000000, 10.00, 5000000)
ON CONFLICT (year, period_number) DO NOTHING;
