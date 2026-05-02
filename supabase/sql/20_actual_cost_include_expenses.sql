-- t_projects.actual_cost = t_budgets の実際金額合計 + t_expenses（pending/approved）の合計
-- 経費の INSERT/UPDATE/DELETE でも再計算。rejected は集計から除外。
-- 実行後: 既存データ整合のため末尾の SELECT 相当を SQL エディタで任意実行可

CREATE OR REPLACE FUNCTION recalc_project_actual_cost(p_project_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bsum NUMERIC;
  esum NUMERIC;
BEGIN
  IF p_project_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(COALESCE(actual_amount, 0)), 0) INTO bsum
  FROM t_budgets
  WHERE project_id = p_project_id
    AND deleted_at IS NULL;

  SELECT COALESCE(SUM(amount), 0) INTO esum
  FROM t_expenses
  WHERE project_id = p_project_id
    AND deleted_at IS NULL
    AND status IN ('pending', 'approved');

  UPDATE t_projects
  SET actual_cost = bsum + esum
  WHERE id = p_project_id;
END;
$$;

COMMENT ON FUNCTION recalc_project_actual_cost(UUID) IS '予算の実績額＋案件紐づけ経費（未承認・承認）で t_projects.actual_cost を更新';

-- 既存: t_budgets 用トリガ
CREATE OR REPLACE FUNCTION sync_actual_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM recalc_project_actual_cost(COALESCE(NEW.project_id, OLD.project_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 経費変更時
CREATE OR REPLACE FUNCTION sync_actual_cost_from_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_project_actual_cost(OLD.project_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.project_id IS NOT NULL AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN
      PERFORM recalc_project_actual_cost(OLD.project_id);
    END IF;
    PERFORM recalc_project_actual_cost(NEW.project_id);
  ELSE
    PERFORM recalc_project_actual_cost(NEW.project_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS t_expenses_recalc_actual_cost ON t_expenses;
CREATE TRIGGER t_expenses_recalc_actual_cost
  AFTER INSERT OR UPDATE OR DELETE ON t_expenses
  FOR EACH ROW
  EXECUTE FUNCTION sync_actual_cost_from_expense();

-- 既存行の actual_cost を再計算
SELECT recalc_project_actual_cost(id)
FROM t_projects
WHERE deleted_at IS NULL;

-- RLS: 営業は自分が担当（または作成）した案件に紐づく他者の経費も参照可
DROP POLICY IF EXISTS "t_expenses_select" ON t_expenses;

CREATE POLICY "t_expenses_select" ON t_expenses
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      get_current_user_role() IN ('admin', 'staff')
      OR user_id = auth.uid()::UUID
      OR (
        get_current_user_role() = 'sales'
        AND project_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM t_projects p
          WHERE p.id = t_expenses.project_id
            AND p.deleted_at IS NULL
            AND (
              p.assigned_to = auth.uid()::UUID
              OR p.created_by = auth.uid()::UUID
            )
        )
      )
    )
  );
