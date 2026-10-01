# PlayerCard

A scorecard player: person color for identity, marigold for the lead.

- **Consumer provides:** player name and person color, score, the value buttons, and whether they lead.
- **Leading:** 2px `time-today` border and a marigold "Leading" tag. Past-game winners use the same marigold as a pill.
- **Score changes** flash `success` (up) or `danger` (down). Bonus-round results say "Correct" / "Incorrect" in `success` / `danger`.
- **Don't:** color the whole card by player; identity lives in the name only.
