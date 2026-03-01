ALTER TABLE production_stages ADD COLUMN size_class TEXT DEFAULT NULL;

UPDATE production_stages SET size_class = 'A2' WHERE id = '968c2e44-9fd1-452b-b497-fa29edda389c';
UPDATE production_stages SET size_class = 'A2' WHERE id = '18e39cec-1083-4b62-96fd-afd2caafc1d3';
UPDATE production_stages SET size_class = 'A3' WHERE id = '906cd851-9c55-4694-bad8-7bffcfb10f45';