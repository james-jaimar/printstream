ALTER TABLE label_orders 
ADD COLUMN ink_config text NOT NULL DEFAULT 'CMYK';

ALTER TABLE label_orders 
ADD CONSTRAINT label_orders_ink_config_check 
CHECK (ink_config IN ('CMY', 'CMYK', 'CMYKW', 'CMYKO'));