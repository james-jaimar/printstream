-- =====================================================
-- LABELS DIVISION - DATABASE FOUNDATION
-- Create the updated_at trigger function first, then all tables
-- =====================================================

-- Create the updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. label_dielines - Die Template Library
CREATE TABLE public.label_dielines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  roll_width_mm NUMERIC NOT NULL,
  label_width_mm NUMERIC NOT NULL,
  label_height_mm NUMERIC NOT NULL,
  columns_across INTEGER NOT NULL DEFAULT 1,
  rows_around INTEGER NOT NULL DEFAULT 1,
  horizontal_gap_mm NUMERIC NOT NULL DEFAULT 3,
  vertical_gap_mm NUMERIC NOT NULL DEFAULT 2.5,
  corner_radius_mm NUMERIC,
  dieline_pdf_url TEXT,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. label_stock - Roll Stock Inventory
CREATE TABLE public.label_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  substrate_type TEXT NOT NULL DEFAULT 'Paper',
  finish TEXT NOT NULL DEFAULT 'Gloss',
  width_mm NUMERIC NOT NULL,
  gsm INTEGER,
  roll_length_meters NUMERIC NOT NULL DEFAULT 1000,
  current_stock_meters NUMERIC NOT NULL DEFAULT 0,
  reorder_level_meters NUMERIC NOT NULL DEFAULT 500,
  cost_per_meter NUMERIC,
  supplier TEXT,
  last_stock_take TIMESTAMPTZ,
  barcode TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. label_orders - Main Order/Quote Record
CREATE TABLE public.label_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  quickeasy_wo_no TEXT,
  customer_id UUID,
  customer_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'quote' CHECK (status IN ('quote', 'pending_approval', 'approved', 'in_production', 'completed', 'cancelled')),
  dieline_id UUID REFERENCES public.label_dielines(id),
  roll_width_mm NUMERIC,
  substrate_id UUID REFERENCES public.label_stock(id),
  total_label_count INTEGER NOT NULL DEFAULT 0,
  estimated_meters NUMERIC,
  estimated_frames INTEGER,
  due_date DATE,
  client_approved_at TIMESTAMPTZ,
  client_approved_by TEXT,
  proof_token TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. label_items - Individual Label Artworks within Order
CREATE TABLE public.label_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.label_orders(id) ON DELETE CASCADE,
  item_number INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  artwork_pdf_url TEXT,
  artwork_thumbnail_url TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  width_mm NUMERIC,
  height_mm NUMERIC,
  preflight_status TEXT NOT NULL DEFAULT 'pending' CHECK (preflight_status IN ('pending', 'passed', 'failed', 'warnings')),
  preflight_report JSONB,
  is_cmyk BOOLEAN,
  min_dpi NUMERIC,
  has_bleed BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id, item_number)
);

-- 5. label_runs - AI-Calculated Production Runs
CREATE TABLE public.label_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.label_orders(id) ON DELETE CASCADE,
  run_number INTEGER NOT NULL DEFAULT 1,
  slot_assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
  meters_to_print NUMERIC,
  frames_count INTEGER,
  estimated_duration_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'approved', 'printing', 'completed', 'cancelled')),
  ai_optimization_score NUMERIC,
  ai_reasoning TEXT,
  imposed_pdf_url TEXT,
  imposed_pdf_with_dielines_url TEXT,
  actual_meters_printed NUMERIC,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id, run_number)
);

-- 6. label_schedule - Production Schedule Board
CREATE TABLE public.label_schedule (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.label_runs(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  scheduled_start_time TIME,
  scheduled_end_time TIME,
  printer_id UUID REFERENCES public.printers(id),
  operator_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. label_stock_transactions - Track stock movements
CREATE TABLE public.label_stock_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_id UUID NOT NULL REFERENCES public.label_stock(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.label_runs(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('receipt', 'usage', 'adjustment', 'waste')),
  meters NUMERIC NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_label_orders_status ON public.label_orders(status);
CREATE INDEX idx_label_orders_customer ON public.label_orders(customer_name);
CREATE INDEX idx_label_orders_due_date ON public.label_orders(due_date);
CREATE INDEX idx_label_orders_proof_token ON public.label_orders(proof_token);
CREATE INDEX idx_label_items_order_id ON public.label_items(order_id);
CREATE INDEX idx_label_runs_order_id ON public.label_runs(order_id);
CREATE INDEX idx_label_runs_status ON public.label_runs(status);
CREATE INDEX idx_label_schedule_date ON public.label_schedule(scheduled_date);
CREATE INDEX idx_label_schedule_run_id ON public.label_schedule(run_id);
CREATE INDEX idx_label_stock_active ON public.label_stock(is_active);
CREATE INDEX idx_label_dielines_active ON public.label_dielines(is_active);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.label_dielines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_stock_transactions ENABLE ROW LEVEL SECURITY;

-- Dielines: All authenticated users can read, admins can write
CREATE POLICY "Anyone can view active dielines" ON public.label_dielines
  FOR SELECT USING (is_active = true);

CREATE POLICY "Authenticated users can insert dielines" ON public.label_dielines
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update dielines" ON public.label_dielines
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Stock: All authenticated users can read and manage
CREATE POLICY "Authenticated users can view stock" ON public.label_stock
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage stock" ON public.label_stock
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Orders: Authenticated users can manage
CREATE POLICY "Authenticated users can view orders" ON public.label_orders
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create orders" ON public.label_orders
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update orders" ON public.label_orders
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Public proof access via token
CREATE POLICY "Public can view orders by proof token" ON public.label_orders
  FOR SELECT USING (proof_token IS NOT NULL AND proof_token != '');

-- Items: Follow order access
CREATE POLICY "Authenticated users can view items" ON public.label_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage items" ON public.label_items
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Public can view items for orders with proof tokens
CREATE POLICY "Public can view items by order proof token" ON public.label_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.label_orders 
      WHERE id = label_items.order_id 
      AND proof_token IS NOT NULL 
      AND proof_token != ''
    )
  );

-- Runs: Authenticated users can manage
CREATE POLICY "Authenticated users can view runs" ON public.label_runs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage runs" ON public.label_runs
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Schedule: Authenticated users can manage
CREATE POLICY "Authenticated users can view schedule" ON public.label_schedule
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage schedule" ON public.label_schedule
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Stock transactions: Authenticated users can manage
CREATE POLICY "Authenticated users can view transactions" ON public.label_stock_transactions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create transactions" ON public.label_stock_transactions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE TRIGGER update_label_dielines_updated_at
  BEFORE UPDATE ON public.label_dielines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_label_stock_updated_at
  BEFORE UPDATE ON public.label_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_label_orders_updated_at
  BEFORE UPDATE ON public.label_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_label_items_updated_at
  BEFORE UPDATE ON public.label_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_label_runs_updated_at
  BEFORE UPDATE ON public.label_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_label_schedule_updated_at
  BEFORE UPDATE ON public.label_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- FUNCTION: Generate next order number
-- =====================================================

CREATE OR REPLACE FUNCTION public.generate_label_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year TEXT;
  next_seq INTEGER;
  order_num TEXT;
BEGIN
  current_year := to_char(now(), 'YYYY');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM 'LBL-' || current_year || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_seq
  FROM public.label_orders
  WHERE order_number LIKE 'LBL-' || current_year || '-%';
  
  order_num := 'LBL-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
  
  RETURN order_num;
END;
$$;

-- =====================================================
-- FUNCTION: Update stock on run completion
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_label_stock_on_run_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_substrate_id UUID;
  v_meters NUMERIC;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    SELECT substrate_id INTO v_substrate_id
    FROM public.label_orders
    WHERE id = NEW.order_id;
    
    v_meters := COALESCE(NEW.actual_meters_printed, NEW.meters_to_print);
    
    IF v_substrate_id IS NOT NULL AND v_meters IS NOT NULL THEN
      UPDATE public.label_stock
      SET current_stock_meters = current_stock_meters - v_meters,
          updated_at = now()
      WHERE id = v_substrate_id;
      
      INSERT INTO public.label_stock_transactions 
        (stock_id, run_id, transaction_type, meters, notes)
      VALUES 
        (v_substrate_id, NEW.id, 'usage', -v_meters, 'Auto-deducted on run completion');
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_stock_on_run_complete
  AFTER UPDATE ON public.label_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_label_stock_on_run_complete();

-- =====================================================
-- SEED DATA: Common Roll Widths and Substrates
-- =====================================================

INSERT INTO public.label_stock (name, substrate_type, finish, width_mm, gsm, roll_length_meters, current_stock_meters, reorder_level_meters) VALUES
  ('PP White Gloss 80gsm - 250mm', 'PP', 'Gloss', 250, 80, 1000, 2500, 500),
  ('PP White Gloss 80gsm - 280mm', 'PP', 'Gloss', 280, 80, 1000, 2000, 500),
  ('PP White Gloss 80gsm - 320mm', 'PP', 'Gloss', 320, 80, 1000, 3000, 500),
  ('PP White Gloss 80gsm - 330mm', 'PP', 'Gloss', 330, 80, 1000, 1500, 500),
  ('PP White Matt 80gsm - 320mm', 'PP', 'Matt', 320, 80, 1000, 1000, 300),
  ('Paper White Gloss 90gsm - 320mm', 'Paper', 'Gloss', 320, 90, 500, 800, 200),
  ('PE White - 280mm', 'PE', 'Gloss', 280, 0, 500, 500, 200),
  ('Clear PP - 320mm', 'PP', 'Gloss', 320, 50, 1000, 600, 300);

INSERT INTO public.label_dielines (name, roll_width_mm, label_width_mm, label_height_mm, columns_across, rows_around, horizontal_gap_mm, vertical_gap_mm) VALUES
  ('6 Across x 4 Around - 50x30mm (320mm roll)', 320, 50, 30, 6, 4, 3, 2.5),
  ('4 Across x 4 Around - 75x50mm (320mm roll)', 320, 75, 50, 4, 4, 3, 2.5),
  ('3 Across x 3 Around - 100x80mm (320mm roll)', 320, 100, 80, 3, 3, 3, 3),
  ('8 Across x 6 Around - 35x25mm (280mm roll)', 280, 35, 25, 8, 6, 2, 2),
  ('5 Across x 4 Around - 50x50mm (280mm roll)', 280, 50, 50, 5, 4, 3, 2.5),
  ('2 Across x 2 Around - 150x100mm (330mm roll)', 330, 150, 100, 2, 2, 5, 5),
  ('10 Across x 8 Around - 24x20mm (250mm roll)', 250, 24, 20, 10, 8, 1, 1);