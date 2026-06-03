
/*
  # Enable Realtime for Pipeline and Fishbowl Tables

  ## Summary
  Enables Supabase realtime publication for the key tables used by the
  Pipeline Board and Fishbowl view so that new records (e.g. kiosk leads,
  new contacts, connections) appear automatically without a manual refresh.

  ## Tables Added to Realtime
  - `leads` - Fishbowl leads and pipeline lead widgets
  - `contacts` - Prospect/contact pipeline cards
  - `connections` - Connection activity widget

  ## How It Works
  The frontend already has `postgres_changes` subscriptions wired up for
  these tables. Adding them to the `supabase_realtime` publication is all
  that is needed to make those subscriptions fire.
*/

ALTER PUBLICATION supabase_realtime ADD TABLE leads;
ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE connections;
