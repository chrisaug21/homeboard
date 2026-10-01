# DayColumn

A day in the Upcoming view (and, smaller, a Month cell or Meal card), colored by how soon it is.

- **Consumer provides:** the date label, events (time, title, optional owner color), and the tier.
- **Tiers:** today = solid `time-today` with a dark "TODAY" tag (meals say "TONIGHT"); the next 3 days = `time-soon` with a 5px `time-soon-edge` top border; everything else plain `card`. Month cells use the same rule and fade past days to 70%.
- **Events:** `card-sunken` chips (translucent white on today's fill, `time-soon-chip` on soon columns), time in `caption`/`muted`, title in bold `ui`. An owner shows as a 3px left bar in their person color.
- **Don't:** use the aubergine week tier here; in a week view every column is already this week.
