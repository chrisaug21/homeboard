-- Meal Library entries are now scoped to a meal type (breakfast/lunch/dinner) in
-- addition to the existing cooking-style meal_type, so typeahead suggestions don't
-- leak across meal types (e.g. a lunch name showing up while editing dinner).
-- Nullable so existing rows aren't broken; backfilled to 'dinner' below since all
-- current rows were saved back when the Meal Plan only supported dinner.
alter table meal_library
  add column if not exists meal_slot text
  check (meal_slot is null or meal_slot in ('breakfast', 'lunch', 'dinner'));

update meal_library
set meal_slot = 'dinner'
where meal_slot is null;
