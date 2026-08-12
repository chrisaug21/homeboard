ALTER TABLE public.invited_parties
  ADD COLUMN low_confidence_confirmed_rsvp_id uuid REFERENCES public.rsvps(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invited_parties.low_confidence_confirmed_rsvp_id IS
  'RSVP id whose low-confidence name match was explicitly confirmed by an admin. Cleared whenever the party is relinked to a different RSVP.';
