-- Add DELETE policy for label_orders (missing - causing deletes to silently fail)
CREATE POLICY "Authenticated users can delete orders"
ON public.label_orders
FOR DELETE
USING (auth.uid() IS NOT NULL);