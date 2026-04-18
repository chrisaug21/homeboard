WITH canonical_members AS (
  SELECT DISTINCT ON (hm.household_id, lower(hm.display_name))
    hm.id,
    hm.household_id,
    lower(hm.display_name) AS display_name_key
  FROM public.household_members AS hm
  WHERE hm.is_active = true
  ORDER BY hm.household_id, lower(hm.display_name), hm.created_at ASC, hm.id ASC
)
UPDATE public.todos AS t
SET assignee_member_id = canonical_members.id
FROM canonical_members
WHERE t.household_id = canonical_members.household_id
  AND lower(t.assignee) = canonical_members.display_name_key
  AND t.assignee_member_id IS NULL;

CREATE INDEX IF NOT EXISTS todos_assignee_member_id_idx
ON public.todos (assignee_member_id);
