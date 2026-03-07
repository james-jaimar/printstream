
CREATE TABLE public.paper_size_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_weight_id uuid NOT NULL REFERENCES public.print_specifications(id) ON DELETE CASCADE,
  paper_type_id uuid REFERENCES public.print_specifications(id) ON DELETE CASCADE,
  default_paper_size_id uuid NOT NULL REFERENCES public.hp12000_paper_sizes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_paper_size_defaults_weight_type 
  ON public.paper_size_defaults (paper_weight_id, COALESCE(paper_type_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.paper_size_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read paper_size_defaults"
  ON public.paper_size_defaults FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage paper_size_defaults"
  ON public.paper_size_defaults FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
