-- ==============================================================
-- t_notices: 連絡通知先（全員 / 個別 / 事務員 / 営業）
-- Supabase SQL エディタで実行してください（t_notices が既にある前提）
-- ==============================================================

ALTER TABLE t_notices
  ADD COLUMN IF NOT EXISTS notify_target TEXT NOT NULL DEFAULT 'all';

ALTER TABLE t_notices
  ADD COLUMN IF NOT EXISTS notify_user_id UUID REFERENCES m_users(id) ON DELETE SET NULL;

ALTER TABLE t_notices
  ADD COLUMN IF NOT EXISTS notify_user_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 't_notices_notify_target_check'
  ) THEN
    ALTER TABLE t_notices ADD CONSTRAINT t_notices_notify_target_check
      CHECK (notify_target IN ('all', 'individual', 'office', 'sales'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 't_notices_individual_requires_user'
  ) THEN
    ALTER TABLE t_notices ADD CONSTRAINT t_notices_individual_requires_user
      CHECK (notify_target <> 'individual' OR notify_user_id IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN t_notices.notify_target IS 'all=全員, individual=個別, office=事務員(admin/staff), sales=営業';
COMMENT ON COLUMN t_notices.notify_user_id IS 'individual のときの宛先ユーザー';
