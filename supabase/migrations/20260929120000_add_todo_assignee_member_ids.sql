-- Multi-assignee support: additive list of household_members ids.
-- Legacy assignee_member_id / assignee columns are kept for fallback and rollback.
ALTER TABLE public.todos
ADD COLUMN IF NOT EXISTS assignee_member_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE public.todos
SET assignee_member_ids = ARRAY[assignee_member_id]
WHERE assignee_member_id IS NOT NULL
  AND assignee_member_ids = '{}';
