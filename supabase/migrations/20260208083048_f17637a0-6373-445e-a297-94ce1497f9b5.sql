-- Fix infinite recursion in label_customers RLS policies
-- The issue: checking label_customers from within its own policy causes recursion

-- Drop the problematic policies
DROP POLICY IF EXISTS "Staff can manage all customers" ON label_customers;
DROP POLICY IF EXISTS "Clients can view own customer record" ON label_customers;

-- Create a security definer function to check if user is a label client
-- This avoids RLS recursion by bypassing RLS within the function
CREATE OR REPLACE FUNCTION public.is_label_client(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM label_customers 
    WHERE user_id = check_user_id
  );
$$;

-- Now recreate policies using the function
-- Clients can view their own customer record
CREATE POLICY "Clients can view own customer record"
  ON label_customers
  FOR SELECT
  USING (user_id = auth.uid());

-- Staff (non-clients) can manage all customers
CREATE POLICY "Staff can manage all customers"
  ON label_customers
  FOR ALL
  USING (NOT public.is_label_client(auth.uid()));

-- Also fix the label_orders policies that have the same issue
DROP POLICY IF EXISTS "Staff can create orders" ON label_orders;
DROP POLICY IF EXISTS "Staff can update orders" ON label_orders;
DROP POLICY IF EXISTS "Clients can view own orders" ON label_orders;

-- Recreate with the function
CREATE POLICY "Staff can create orders"
  ON label_orders
  FOR INSERT
  WITH CHECK (NOT public.is_label_client(auth.uid()));

CREATE POLICY "Staff can update orders"
  ON label_orders
  FOR UPDATE
  USING (NOT public.is_label_client(auth.uid()));

-- Clients can view their own orders OR staff can view all
CREATE POLICY "Clients can view own orders"
  ON label_orders
  FOR SELECT
  USING (
    customer_user_id = auth.uid() 
    OR NOT public.is_label_client(auth.uid())
  );