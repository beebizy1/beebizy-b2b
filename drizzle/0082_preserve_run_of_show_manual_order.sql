-- Preserve the order users already see before sort_order becomes authoritative.
-- Existing rows were displayed chronologically, even when their stored sort values
-- reflected creation order. Rank every event day once so enabling drag-and-drop does
-- not visibly rearrange a live Run of Show.
with ranked as (
  select
    id,
    row_number() over (
      partition by workspace_id, event_id, day_number
      order by start_time, sort_order, created_at, id
    ) as next_sort_order
  from run_of_show_items
)
update run_of_show_items as cue
set
  sort_order = ranked.next_sort_order,
  updated_at = now()
from ranked
where cue.id = ranked.id
  and cue.sort_order is distinct from ranked.next_sort_order;
