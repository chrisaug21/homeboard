ALTER TABLE todos
ADD COLUMN IF NOT EXISTS assignee_member_id uuid REFERENCES household_members(id);

UPDATE todos AS t
SET assignee_member_id = hm.id
FROM household_members AS hm
JOIN households AS h
  ON h.id = hm.household_id
WHERE t.household_id = h.id
  AND lower(t.assignee) = lower(hm.display_name)
  AND hm.is_active = true
  AND t.assignee_member_id IS NULL;
