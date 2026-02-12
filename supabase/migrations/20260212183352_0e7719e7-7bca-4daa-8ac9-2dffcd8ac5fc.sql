UPDATE label_dielines
SET name = label_width_mm || 'x' || label_height_mm || 'mm - ' || columns_across || ' Across x ' || rows_around || ' Around',
    updated_at = now();