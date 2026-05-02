-- 写真フェーズを m_settings（photo_phase_options）で自由定義可能にする。
-- 既存 CHECK (type IN (...)) を解除し、英語コードを日本語ラベルへ移行。マスタ初期行を投入。

ALTER TABLE t_photos DROP CONSTRAINT IF EXISTS t_photos_type_check;

UPDATE t_photos
SET type = CASE type
  WHEN 'before' THEN '施工前'
  WHEN 'inspection' THEN '現調'
  WHEN 'undercoat' THEN '下塗り'
  WHEN 'completed' THEN '完成'
  ELSE type
END
WHERE type IN ('before', 'inspection', 'undercoat', 'completed');

COMMENT ON COLUMN t_photos.type IS '写真フェーズ（m_settings key=photo_phase_options の JSON 配列と一致するラベル文字列）';

INSERT INTO m_settings (key, value, description)
VALUES (
  'photo_phase_options',
  '["施工前","現調","下塗り","完成"]',
  '案件写真・現場写真の撮影フェーズ（管理画面マスターで編集）'
)
ON CONFLICT (key) DO NOTHING;
