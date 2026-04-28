-- =============================================================
-- m_users に can_register_project 列を追加
-- SP（モバイル）版の「新規案件登録」タブの表示権限フラグ
-- Supabase SQL Editor で実行してください
-- =============================================================

-- 列を追加（既に存在する場合はスキップ）
ALTER TABLE m_users
  ADD COLUMN IF NOT EXISTS can_register_project BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN m_users.can_register_project
  IS 'SP（モバイル）版の新規案件登録タブ表示権限。trueのユーザーのみボトムナビに「新規登録」タブが表示される';

-- admin ロールのユーザーは初期値を true に設定
UPDATE m_users
  SET can_register_project = true
  WHERE role = 'admin';

-- 確認
SELECT id, name, role, can_register_project
  FROM m_users
  ORDER BY role, name;
