# TaskCard

A to-do card whose whole surface shows how soon it's due.

- **Consumer provides:** title, due date, optional assignee (name + person color), and the tier: `overdue`, `today`, `soon` (1-3 days), `week` (4-7 days) or `later`.
- **Tiers:** overdue and today are solid fills (`time-overdue` / `time-today` with their `on-` text); soon and week are soft fills with a 6px left edge (`time-soon*`, `time-week*`); later is a plain `card`.
- **Meta line:** date as text in the tier's color (`meta` style), never a pill; overdue starts with ⚠. The assignee is a 9px dot + name in their person color, or in the card's text color on solid fills.
- **Done:** the check fills with `done` during the celebration, then the card leaves the list.
- **Don't:** add pills for dates or people, or color a card for anything but time.
