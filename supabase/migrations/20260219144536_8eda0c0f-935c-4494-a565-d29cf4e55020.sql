UPDATE label_items
SET needs_rotation = true
WHERE order_id = 'b63f2a5a-8880-4748-95b9-f17ba5d60c3b'
  AND parent_item_id IS NOT NULL
  AND needs_rotation = false;