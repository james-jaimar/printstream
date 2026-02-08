-- Label Customers table - links auth users to label orders
CREATE TABLE public.label_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    company_name TEXT NOT NULL,
    contact_name TEXT,
    contact_email TEXT NOT NULL,
    contact_phone TEXT,
    billing_address TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.label_customers ENABLE ROW LEVEL SECURITY;

-- Clients can read their own customer record
CREATE POLICY "Clients can view own customer record"
    ON public.label_customers FOR SELECT
    USING (user_id = auth.uid());

-- Admins (staff) can manage all customer records
-- Note: Staff are identified by NOT having a label_customers record
CREATE POLICY "Staff can manage all customers"
    ON public.label_customers FOR ALL
    USING (
        NOT EXISTS (
            SELECT 1 FROM public.label_customers lc 
            WHERE lc.user_id = auth.uid()
        )
    );

-- Add customer_id to label_orders to link orders to customers
ALTER TABLE public.label_orders 
ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES auth.users(id);

-- Update RLS on label_orders to allow clients to see their orders
DROP POLICY IF EXISTS "Authenticated users can view label orders" ON public.label_orders;
DROP POLICY IF EXISTS "Authenticated users can create label orders" ON public.label_orders;
DROP POLICY IF EXISTS "Authenticated users can update label orders" ON public.label_orders;

-- Clients can view their own orders
CREATE POLICY "Clients can view own orders"
    ON public.label_orders FOR SELECT
    USING (
        customer_user_id = auth.uid() OR
        NOT EXISTS (
            SELECT 1 FROM public.label_customers lc 
            WHERE lc.user_id = auth.uid()
        )
    );

-- Staff can create/update all orders
CREATE POLICY "Staff can create orders"
    ON public.label_orders FOR INSERT
    WITH CHECK (
        NOT EXISTS (
            SELECT 1 FROM public.label_customers lc 
            WHERE lc.user_id = auth.uid()
        )
    );

CREATE POLICY "Staff can update orders"
    ON public.label_orders FOR UPDATE
    USING (
        NOT EXISTS (
            SELECT 1 FROM public.label_customers lc 
            WHERE lc.user_id = auth.uid()
        )
    );

-- Clients can update their own orders (for proof approval only)
CREATE POLICY "Clients can approve own orders"
    ON public.label_orders FOR UPDATE
    USING (customer_user_id = auth.uid())
    WITH CHECK (customer_user_id = auth.uid());

-- Allow clients to view items for their orders
DROP POLICY IF EXISTS "Authenticated users can view label items" ON public.label_items;

CREATE POLICY "Users can view label items for accessible orders"
    ON public.label_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.label_orders lo
            WHERE lo.id = order_id
            AND (
                lo.customer_user_id = auth.uid() OR
                NOT EXISTS (
                    SELECT 1 FROM public.label_customers lc 
                    WHERE lc.user_id = auth.uid()
                )
            )
        )
    );

-- Allow clients to view runs for their orders
DROP POLICY IF EXISTS "Authenticated users can view label runs" ON public.label_runs;

CREATE POLICY "Users can view label runs for accessible orders"
    ON public.label_runs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.label_orders lo
            WHERE lo.id = order_id
            AND (
                lo.customer_user_id = auth.uid() OR
                NOT EXISTS (
                    SELECT 1 FROM public.label_customers lc 
                    WHERE lc.user_id = auth.uid()
                )
            )
        )
    );

-- Proof approval log table
CREATE TABLE public.label_proof_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.label_orders(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
    comment TEXT,
    approved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.label_proof_approvals ENABLE ROW LEVEL SECURITY;

-- Clients can create approvals for their orders
CREATE POLICY "Clients can create approval for own orders"
    ON public.label_proof_approvals FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.label_orders lo
            WHERE lo.id = order_id
            AND lo.customer_user_id = auth.uid()
        )
    );

-- Users can view approvals for accessible orders
CREATE POLICY "Users can view approvals for accessible orders"
    ON public.label_proof_approvals FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.label_orders lo
            WHERE lo.id = order_id
            AND (
                lo.customer_user_id = auth.uid() OR
                NOT EXISTS (
                    SELECT 1 FROM public.label_customers lc 
                    WHERE lc.user_id = auth.uid()
                )
            )
        )
    );

-- Staff can view all approvals
CREATE POLICY "Staff can view all approvals"
    ON public.label_proof_approvals FOR SELECT
    USING (
        NOT EXISTS (
            SELECT 1 FROM public.label_customers lc 
            WHERE lc.user_id = auth.uid()
        )
    );

-- Trigger for updated_at
CREATE TRIGGER update_label_customers_updated_at
    BEFORE UPDATE ON public.label_customers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for customer lookups
CREATE INDEX idx_label_orders_customer_user_id ON public.label_orders(customer_user_id);
CREATE INDEX idx_label_customers_user_id ON public.label_customers(user_id);