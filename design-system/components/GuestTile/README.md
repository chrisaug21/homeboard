# GuestTile

One invited party on the Wedding pulse guest list.

- **Consumer provides:** party name, guest count, and status: attending, undercount, declined or pending.
- **States:** attending = sage (`countdown-later`) with the count in `success`; undercount = sage with a marigold left edge and "⚠ 1 of 2"; declined = plain, faded, struck through; pending = plain with a dashed border.
- **The one call to action** on this screen ("Review RSVPs" when above zero) is a solid `time-today` tile; every other stat tile stays neutral.
