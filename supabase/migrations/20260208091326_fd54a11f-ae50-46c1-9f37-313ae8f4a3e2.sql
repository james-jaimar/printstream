-- Step 1: Drop dependent policies
DROP POLICY IF EXISTS "Staff can manage all customers" ON public.label_customers;
DROP POLICY IF EXISTS "Staff can create orders" ON public.label_orders;
DROP POLICY IF EXISTS "Staff can update orders" ON public.label_orders;
DROP POLICY IF EXISTS "Clients can view own orders" ON public.label_orders;
DROP POLICY IF EXISTS "Staff can manage all contacts" ON public.label_customer_contacts;

-- Step 2: Drop and recreate the function to check contacts table instead
DROP FUNCTION IF EXISTS public.is_label_client(uuid);

CREATE FUNCTION public.is_label_client(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.label_customer_contacts 
    WHERE user_id = check_user_id
      AND is_active = true
  )
$$;

-- Step 3: Recreate the RLS policies with the updated function
CREATE POLICY "Staff can manage all customers" ON public.label_customers
  FOR ALL USING (NOT is_label_client(auth.uid()));

CREATE POLICY "Staff can create orders" ON public.label_orders
  FOR INSERT WITH CHECK (NOT is_label_client(auth.uid()));

CREATE POLICY "Staff can update orders" ON public.label_orders
  FOR UPDATE USING (NOT is_label_client(auth.uid()));

CREATE POLICY "Clients can view own orders" ON public.label_orders
  FOR SELECT USING (
    customer_user_id = auth.uid() 
    OR NOT is_label_client(auth.uid())
  );

CREATE POLICY "Staff can manage all contacts" ON public.label_customer_contacts
  FOR ALL USING (NOT is_label_client(auth.uid()));