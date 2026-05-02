-- 1年・3年点検の対象とする工事種別（案件の work_type に1つでも含まれる完工案件のみ点検一覧に出す）
-- 管理画面 > マスター管理 で編集可能。工事種別マスタのラベルと完全一致で指定すること。

INSERT INTO m_settings (key, value, description)
VALUES (
  'inspection_eligible_work_types',
  '["外壁塗装","屋根塗装"]',
  '点検スケジュール（1年・3年）に表示する完工案件の条件。いずれかの工事種別が案件に含まれる場合のみ対象'
)
ON CONFLICT (key) DO NOTHING;
