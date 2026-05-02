-- ==============================================================
-- m_customers（顧客マスタ）+ t_projects.customer_id
-- 案件番号（YYYY-NNNN）は t_projects に継続。顧客管理番号は C-YYYY-NNNN。
-- 既存データ: 有効案件ごとに顧客1件を生成し customer_id を紐づけ（重複は後で手マージ可）
-- Supabase SQL エディタで実行してください。
-- ==============================================================

-- --------------------------------------------------------------
-- 1) m_customers
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS m_customers (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_number     TEXT          UNIQUE,
  customer_name       TEXT          NOT NULL,
  customer_name_kana  TEXT,
  postal_code         TEXT,
  address             TEXT          NOT NULL,
  phone               TEXT          NOT NULL,
  email               TEXT,
  notes               TEXT,
  created_by          UUID          REFERENCES m_users(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

COMMENT ON TABLE  m_customers                 IS '顧客マスタ（案件の上位エンティティ）';
COMMENT ON COLUMN m_customers.customer_number IS '顧客管理番号（自動採番: C-YYYY-NNNN）。案件番号とは別';
COMMENT ON COLUMN m_customers.deleted_at      IS 'NULL=有効, 値あり=論理削除';

CREATE INDEX IF NOT EXISTS idx_m_customers_customer_number
  ON m_customers(customer_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_m_customers_customer_name
  ON m_customers(customer_name) WHERE deleted_at IS NULL;


-- --------------------------------------------------------------
-- 2) 顧客番号自動採番（C-YYYY-NNNN）
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  current_year TEXT;
  max_num      INTEGER;
  new_number   TEXT;
BEGIN
  IF NEW.customer_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  current_year := TO_CHAR(NOW(), 'YYYY');

  SELECT COALESCE(
    MAX(CAST(SPLIT_PART(customer_number, '-', 3) AS INTEGER)),
    0
  )
  INTO max_num
  FROM m_customers
  WHERE customer_number LIKE 'C-' || current_year || '-%';

  new_number := 'C-' || current_year || '-' || LPAD((max_num + 1)::TEXT, 4, '0');
  NEW.customer_number := new_number;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS m_customers_set_number ON m_customers;
CREATE TRIGGER m_customers_set_number
  BEFORE INSERT ON m_customers
  FOR EACH ROW EXECUTE FUNCTION generate_customer_number();

DROP TRIGGER IF EXISTS m_customers_updated_at ON m_customers;
CREATE TRIGGER m_customers_updated_at
  BEFORE UPDATE ON m_customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- --------------------------------------------------------------
-- 3) t_projects.customer_id
-- --------------------------------------------------------------
ALTER TABLE t_projects
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES m_customers(id) ON DELETE RESTRICT;

COMMENT ON COLUMN t_projects.customer_id IS '顧客マスタへのFK。案件は顧客配下のトランザクション';

CREATE INDEX IF NOT EXISTS idx_t_projects_customer_id
  ON t_projects(customer_id) WHERE deleted_at IS NULL;


-- --------------------------------------------------------------
-- 4) 既存案件 → 顧客マスタ生成・紐づけ
-- --------------------------------------------------------------
DO $$
DECLARE
  p        RECORD;
  new_cid  UUID;
BEGIN
  FOR p IN
    SELECT
      id,
      customer_name,
      customer_name_kana,
      postal_code,
      address,
      phone,
      email,
      created_at,
      updated_at,
      created_by
    FROM t_projects
    WHERE deleted_at IS NULL
      AND customer_id IS NULL
    ORDER BY created_at
  LOOP
    INSERT INTO m_customers (
      customer_name,
      customer_name_kana,
      postal_code,
      address,
      phone,
      email,
      created_at,
      updated_at,
      created_by
    ) VALUES (
      p.customer_name,
      p.customer_name_kana,
      p.postal_code,
      p.address,
      p.phone,
      p.email,
      p.created_at,
      p.updated_at,
      p.created_by
    )
    RETURNING id INTO new_cid;

    UPDATE t_projects
    SET customer_id = new_cid
    WHERE id = p.id;
  END LOOP;
END $$;


-- --------------------------------------------------------------
-- 5) RLS（t_projects と同等のロールが参照・登録可能）
-- --------------------------------------------------------------
ALTER TABLE m_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "m_customers_select" ON m_customers;
CREATE POLICY "m_customers_select" ON m_customers
  FOR SELECT USING (
    deleted_at IS NULL
    AND auth.uid() IS NOT NULL
    AND get_current_user_role() IN ('admin', 'staff', 'sales')
  );

DROP POLICY IF EXISTS "m_customers_insert" ON m_customers;
CREATE POLICY "m_customers_insert" ON m_customers
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND get_current_user_role() IN ('admin', 'staff', 'sales')
  );

DROP POLICY IF EXISTS "m_customers_update" ON m_customers;
CREATE POLICY "m_customers_update" ON m_customers
  FOR UPDATE USING (
    deleted_at IS NULL
    AND get_current_user_role() IN ('admin', 'staff')
  );

DROP POLICY IF EXISTS "m_customers_soft_delete" ON m_customers;
CREATE POLICY "m_customers_soft_delete" ON m_customers
  FOR UPDATE USING (get_current_user_role() IN ('admin', 'staff'))
  WITH CHECK (deleted_at IS NOT NULL);
