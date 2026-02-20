
-- Add output_rolls_count and abg_speed_m_per_min to label_orders
ALTER TABLE label_orders
  ADD COLUMN IF NOT EXISTS output_rolls_count integer,
  ADD COLUMN IF NOT EXISTS abg_speed_m_per_min integer DEFAULT 30;

-- Rename 'finishing' stage_group to 'die_cutting_finishing' on existing stages
UPDATE label_production_stages
  SET stage_group = 'die_cutting_finishing'
  WHERE stage_group = 'finishing';
