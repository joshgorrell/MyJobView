/*
# Add Date Needed to Product Requests and Purchasing Notification Preference

## Purpose
1. Add a `date_needed` column to `product_requests` so requesters can specify when items are needed by.
2. Add a `notify_on_product_requests` boolean column to `profiles` so each user can opt in/out of purchasing notification emails.

## Changes to product_requests
- Add `date_needed` (date, nullable) — the date the requester needs the items by.

## Changes to profiles
- Add `notify_on_product_requests` (boolean, default true) — whether this user receives email notifications when new product requests are submitted.

## Security
- No new tables. Existing RLS policies on product_requests and profiles cover the new columns.
- The profiles UPDATE policy already allows users to update their own profile row, so they can toggle the notification preference.

## Notes
1. `date_needed` is nullable so existing requests are not affected.
2. `notify_on_product_requests` defaults to true so current behavior (notify purchasing roles) is preserved unless a user opts out.
*/

DO $$ BEGIN
  ALTER TABLE product_requests ADD COLUMN date_needed date;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN notify_on_product_requests boolean DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
