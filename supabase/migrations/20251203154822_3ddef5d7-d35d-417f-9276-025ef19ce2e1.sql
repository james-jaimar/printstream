-- Create T250 Schedulers user group for users who manage T250 printing schedule
INSERT INTO user_groups (name, description) 
VALUES ('T250 Schedulers', 'Users who manage T250 printing schedule')
ON CONFLICT (name) DO NOTHING;

-- Add T250 stage permissions for this group (can_view and can_manage)
INSERT INTO user_group_stage_permissions (user_group_id, production_stage_id, can_view, can_manage)
SELECT 
  (SELECT id FROM user_groups WHERE name = 'T250 Schedulers'),
  ps.id,
  true,
  true
FROM production_stages ps
WHERE ps.name ILIKE '%T250%' AND ps.is_active = true
ON CONFLICT (user_group_id, production_stage_id) DO UPDATE 
SET can_view = true, can_manage = true;

-- Add Ikram to T250 Schedulers group
INSERT INTO user_group_memberships (user_id, group_id)
SELECT 
  '5c83f364-0e68-4cf0-a9ff-e6453419b16c',
  (SELECT id FROM user_groups WHERE name = 'T250 Schedulers')
ON CONFLICT (user_id, group_id) DO NOTHING;