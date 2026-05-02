-- t_projects: UPDATE ポリシーを1本化（論理削除が 403 になる重複ポリシー競合を解消）
-- 事前に 31_get_current_user_role_m_users_fallback.sql の適用を推奨。
-- Supabase SQL エディタで実行。

DROP POLICY IF EXISTS "t_projects_soft_delete" ON t_projects;
DROP POLICY IF EXISTS "t_projects_update" ON t_projects;

-- 未削除行のみ更新対象。WITH CHECK で「通常更新」と「admin/staff のみ論理削除」を明示。
CREATE POLICY "t_projects_update" ON t_projects
  FOR UPDATE USING (
    deleted_at IS NULL
    AND (
      get_current_user_role() IN ('admin', 'staff')
      OR (
        get_current_user_role() = 'sales'
        AND assigned_to = auth.uid()::UUID
      )
    )
  )
  WITH CHECK (
    (
      deleted_at IS NULL
      AND (
        get_current_user_role() IN ('admin', 'staff')
        OR (
          get_current_user_role() = 'sales'
          AND assigned_to = auth.uid()::UUID
        )
      )
    )
    OR (
      deleted_at IS NOT NULL
      AND get_current_user_role() IN ('admin', 'staff')
    )
  );

COMMENT ON POLICY "t_projects_update" ON t_projects IS
  '更新・論理削除: admin/staff は全件、sales は自分担当のみ。論理削除は admin/staff のみ。';
