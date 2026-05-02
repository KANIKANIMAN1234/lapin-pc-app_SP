-- 営業（sales）も顧客マスタを更新可能に（リピート案件登録時の連絡先修正用）
-- 16_m_customers_and_project_customer_id.sql 適用済みの環境で実行

DROP POLICY IF EXISTS "m_customers_update" ON m_customers;
CREATE POLICY "m_customers_update" ON m_customers
  FOR UPDATE USING (
    deleted_at IS NULL
    AND auth.uid() IS NOT NULL
    AND get_current_user_role() IN ('admin', 'staff', 'sales')
  );
