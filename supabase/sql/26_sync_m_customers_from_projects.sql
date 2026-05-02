-- =============================================================================
-- t_projects を参照して m_customers を登録し、customer_id を紐づける
-- =============================================================================
-- ■ Supabase SQL Editor で postgres 権限として実行してください。
-- ■ 対象: deleted_at IS NULL かつ customer_id IS NULL の案件のみ（既に紐づいている案件は変更しません）。
-- ■ 同一顧客のまとめ方:
--     1) 電話番号が空でない → 氏名（前後空白除き）+ 電話（前後空白除き）が一致する既存顧客があればその id に紐づけ
--     2) 電話が空などで 1) が無い → 氏名 + 住所（前後空白除き）が一致する既存顧客があれば紐づけ
--     3) どちらも無ければ m_customers に新規 INSERT（顧客番号はトリガー採番）
-- ■ 複数回実行しても、未紐づけ案件がなくなるまで手動で流せばよいだけです（冪等に近い）。
-- =============================================================================

DO $$
DECLARE
  p            RECORD;
  new_cid      uuid;
  existing_cid uuid;
  pn           text;
  pname        text;
  padd         text;
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
      created_by,
      created_at,
      updated_at
    FROM t_projects
    WHERE deleted_at IS NULL
      AND customer_id IS NULL
    ORDER BY created_at
  LOOP
    existing_cid := NULL;
    pname := TRIM(COALESCE(p.customer_name, ''));
    padd := TRIM(COALESCE(p.address, ''));
    pn := TRIM(COALESCE(p.phone, ''));

    -- 氏名 + 電話（電話が入っているとき）
    IF pn <> '' THEN
      SELECT c.id
      INTO existing_cid
      FROM m_customers c
      WHERE c.deleted_at IS NULL
        AND TRIM(COALESCE(c.customer_name, '')) = pname
        AND TRIM(COALESCE(c.phone, '')) = pn
      LIMIT 1;
    END IF;

    -- 氏名 + 住所（電話一致が無く、住所があるとき）
    IF existing_cid IS NULL AND padd <> '' THEN
      SELECT c.id
      INTO existing_cid
      FROM m_customers c
      WHERE c.deleted_at IS NULL
        AND TRIM(COALESCE(c.customer_name, '')) = pname
        AND TRIM(COALESCE(c.address, '')) = padd
      LIMIT 1;
    END IF;

    IF existing_cid IS NOT NULL THEN
      UPDATE t_projects
      SET customer_id = existing_cid
      WHERE id = p.id;
    ELSE
      INSERT INTO m_customers (
        customer_name,
        customer_name_kana,
        postal_code,
        address,
        phone,
        email,
        created_by,
        created_at,
        updated_at,
        notes
      ) VALUES (
        p.customer_name,
        p.customer_name_kana,
        p.postal_code,
        p.address,
        p.phone,
        p.email,
        p.created_by,
        p.created_at,
        p.updated_at,
        '26_sync: t_projects から自動登録'
      )
      RETURNING id INTO new_cid;

      UPDATE t_projects
      SET customer_id = new_cid
      WHERE id = p.id;
    END IF;
  END LOOP;
END $$;
