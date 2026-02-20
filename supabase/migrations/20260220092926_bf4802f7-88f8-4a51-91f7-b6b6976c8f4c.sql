
-- ============================================================
-- Labels Division: Finishing, Services & Post-Print Workflow
-- Fully isolated from digital division — label_ prefix only
-- ============================================================

-- 1. New columns on label_orders (all nullable, non-breaking)
ALTER TABLE label_orders
  ADD COLUMN IF NOT EXISTS core_size_mm integer,
  ADD COLUMN IF NOT EXISTS qty_per_roll integer,
  ADD COLUMN IF NOT EXISTS roll_direction text,
  ADD COLUMN IF NOT EXISTS delivery_method text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_notes text;

-- 2. Master stage library (labels-only)
CREATE TABLE IF NOT EXISTS label_production_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  stage_group text NOT NULL,
  color text DEFAULT '#6B7280',
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  is_conditional boolean DEFAULT false,
  default_duration_minutes integer,
  speed_per_hour numeric,
  speed_unit text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE label_production_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "label_production_stages_select" ON label_production_stages
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "label_production_stages_insert" ON label_production_stages
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND NOT is_label_client(auth.uid()));

CREATE POLICY "label_production_stages_update" ON label_production_stages
  FOR UPDATE USING (auth.uid() IS NOT NULL AND NOT is_label_client(auth.uid()));

CREATE POLICY "label_production_stages_delete" ON label_production_stages
  FOR DELETE USING (auth.uid() IS NOT NULL AND NOT is_label_client(auth.uid()));

-- 3. Finishing option library
CREATE TABLE IF NOT EXISTS label_finishing_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL,
  description text,
  properties jsonb DEFAULT '{}',
  triggers_stage_id uuid REFERENCES label_production_stages(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE label_finishing_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "label_finishing_options_select" ON label_finishing_options
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "label_finishing_options_insert" ON label_finishing_options
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND NOT is_label_client(auth.uid()));

CREATE POLICY "label_finishing_options_update" ON label_finishing_options
  FOR UPDATE USING (auth.uid() IS NOT NULL AND NOT is_label_client(auth.uid()));

CREATE POLICY "label_finishing_options_delete" ON label_finishing_options
  FOR DELETE USING (auth.uid() IS NOT NULL AND NOT is_label_client(auth.uid()));

-- 4. Quoted service lines on an order
CREATE TABLE IF NOT EXISTS label_order_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES label_orders(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  finishing_option_id uuid REFERENCES label_finishing_options(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES label_production_stages(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  quantity numeric,
  quantity_unit text,
  notes text,
  estimated_cost numeric,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE label_order_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "label_order_services_select" ON label_order_services
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "label_order_services_insert" ON label_order_services
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND NOT is_label_client(auth.uid()));

CREATE POLICY "label_order_services_update" ON label_order_services
  FOR UPDATE USING (auth.uid() IS NOT NULL AND NOT is_label_client(auth.uid()));

CREATE POLICY "label_order_services_delete" ON label_order_services
  FOR DELETE USING (auth.uid() IS NOT NULL AND NOT is_label_client(auth.uid()));

-- 5. Live stage tracking per order
CREATE TABLE IF NOT EXISTS label_order_stage_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES label_orders(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES label_production_stages(id),
  service_line_id uuid REFERENCES label_order_services(id) ON DELETE SET NULL,
  stage_order integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  started_by uuid,
  completed_by uuid,
  assigned_operator_id uuid,
  estimated_duration_minutes integer,
  actual_duration_minutes integer,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE label_order_stage_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "label_order_stage_instances_select" ON label_order_stage_instances
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "label_order_stage_instances_insert" ON label_order_stage_instances
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND NOT is_label_client(auth.uid()));

CREATE POLICY "label_order_stage_instances_update" ON label_order_stage_instances
  FOR UPDATE USING (auth.uid() IS NOT NULL AND NOT is_label_client(auth.uid()));

CREATE POLICY "label_order_stage_instances_delete" ON label_order_stage_instances
  FOR DELETE USING (auth.uid() IS NOT NULL AND NOT is_label_client(auth.uid()));

-- 6. Updated_at trigger function (reuse pattern)
CREATE OR REPLACE FUNCTION update_label_finishing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_label_production_stages_updated_at
  BEFORE UPDATE ON label_production_stages
  FOR EACH ROW EXECUTE FUNCTION update_label_finishing_updated_at();

CREATE TRIGGER trg_label_finishing_options_updated_at
  BEFORE UPDATE ON label_finishing_options
  FOR EACH ROW EXECUTE FUNCTION update_label_finishing_updated_at();

CREATE TRIGGER trg_label_order_stage_instances_updated_at
  BEFORE UPDATE ON label_order_stage_instances
  FOR EACH ROW EXECUTE FUNCTION update_label_finishing_updated_at();

-- 7. Seed default label production stages
INSERT INTO label_production_stages (name, description, stage_group, color, order_index, is_active, is_conditional) VALUES
  ('Gloss Lamination',        'Apply gloss film lamination',           'finishing', '#3B82F6', 10, true, true),
  ('Matt Lamination',         'Apply matt film lamination',            'finishing', '#6366F1', 20, true, true),
  ('Soft Touch Lamination',   'Apply soft touch film lamination',      'finishing', '#8B5CF6', 30, true, true),
  ('Full UV Varnish',         'Apply full UV varnish coating',         'finishing', '#F59E0B', 40, true, true),
  ('Spot UV Varnish',         'Apply spot UV varnish coating',         'finishing', '#EF4444', 50, true, true),
  ('Sheeting / Cut to Sheet', 'Cut roll labels into sheets',           'finishing', '#10B981', 60, true, true),
  ('Rewinding',               'Rewind labels to specified core size',  'services',  '#06B6D4', 70, true, true),
  ('Joining Rolls',           'Join multiple rolls into one',          'services',  '#0EA5E9', 80, true, true),
  ('Handwork',                'Manual label application or sorting',   'services',  '#F97316', 90, true, true),
  ('Quality Inspection',      'QA check of printed labels',            'qa',        '#22C55E', 100, true, false),
  ('Labelling & Boxing',      'Box and label finished product',        'packaging', '#84CC16', 110, true, false),
  ('Shrink Wrapping',         'Shrink wrap finished rolls',            'packaging', '#A3E635', 120, true, true),
  ('Collection',              'Customer collection from premises',     'dispatch',  '#94A3B8', 130, true, true),
  ('Local Delivery',          'Local delivery by company vehicle',     'dispatch',  '#64748B', 140, true, true),
  ('Courier',                 'Dispatch via courier service',          'dispatch',  '#475569', 150, true, true)
ON CONFLICT DO NOTHING;

-- 8. Seed default finishing options (linked to stages seeded above)
INSERT INTO label_finishing_options (name, display_name, category, description, triggers_stage_id, sort_order)
SELECT 'gloss_lamination', 'Gloss Lamination', 'lamination', 'High-gloss film laminate', id, 10
FROM label_production_stages WHERE name = 'Gloss Lamination' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO label_finishing_options (name, display_name, category, description, triggers_stage_id, sort_order)
SELECT 'matt_lamination', 'Matt Lamination', 'lamination', 'Matt film laminate', id, 20
FROM label_production_stages WHERE name = 'Matt Lamination' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO label_finishing_options (name, display_name, category, description, triggers_stage_id, sort_order)
SELECT 'soft_touch_lamination', 'Soft Touch Lamination', 'lamination', 'Soft touch film laminate', id, 30
FROM label_production_stages WHERE name = 'Soft Touch Lamination' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO label_finishing_options (name, display_name, category, description, triggers_stage_id, sort_order)
SELECT 'full_uv_varnish', 'Full UV Varnish', 'uv_varnish', 'Full surface UV varnish coating', id, 10
FROM label_production_stages WHERE name = 'Full UV Varnish' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO label_finishing_options (name, display_name, category, description, triggers_stage_id, sort_order)
SELECT 'spot_uv_varnish', 'Spot UV Varnish', 'uv_varnish', 'Spot UV varnish on selected areas', id, 20
FROM label_production_stages WHERE name = 'Spot UV Varnish' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO label_finishing_options (name, display_name, category, description, triggers_stage_id, sort_order)
SELECT 'cut_to_sheet', 'Cut to Sheet', 'sheeting', 'Cut roll into flat sheets', id, 10
FROM label_production_stages WHERE name = 'Sheeting / Cut to Sheet' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO label_finishing_options (name, display_name, category, description, triggers_stage_id, sort_order)
SELECT 'fan_fold', 'Fan-fold / Z-fold', 'sheeting', 'Fan-fold / Z-fold sheet format', id, 20
FROM label_production_stages WHERE name = 'Sheeting / Cut to Sheet' LIMIT 1
ON CONFLICT DO NOTHING;

-- 9. Schema cache reload
NOTIFY pgrst, 'reload schema';
