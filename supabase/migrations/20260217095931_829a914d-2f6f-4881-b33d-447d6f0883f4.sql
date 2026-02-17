ALTER TABLE label_orders
  ADD COLUMN orientation smallint NOT NULL DEFAULT 1,
  ADD COLUMN orientation_confirmed boolean NOT NULL DEFAULT false;