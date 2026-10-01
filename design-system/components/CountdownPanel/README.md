# CountdownPanel

The text panel of a countdown screen, colored by anticipation.

- **Consumer provides:** name, target date, days remaining, optional icon and photo (the photo takes the left 40%).
- **States, warming as the day nears:** 31+ days = `countdown-far` (neutral card) with `ink`; 8-30 days = `countdown-later` (sage) with `ink`; 1-7 days = `countdown-soon` (fern) with white text at display sizes (date line bold 17px+); 0 days = `time-today` panel reading **Today!** (never "0 days"). Use "1 day", singular.
- **Don't:** rotate decorative tints between countdowns, or use gradients.
