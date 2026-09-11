/*
# Stage 5 Fix: Set search_path on validate_tm_inheritance function

## Purpose
The Supabase security advisor flagged that validate_tm_inheritance has a mutable search_path.
This sets an explicit search_path to resolve the security warning.

## Change
- Recreate validate_tm_inheritance() with SET search_path = public, extensions
*/

CREATE OR REPLACE FUNCTION validate_tm_inheritance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
    source_row record;
BEGIN
    IF NEW.inherited_from_modifier_id IS NOT NULL THEN
        SELECT modifier_key, organization_id, proposal_id, change_order_id
        INTO source_row
        FROM transaction_modifiers
        WHERE id = NEW.inherited_from_modifier_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'inherited_from_modifier_id % does not exist',
                NEW.inherited_from_modifier_id;
        END IF;

        -- Rule 1: source must be Proposal-owned (proposal_id NOT NULL, change_order_id NULL)
        IF source_row.proposal_id IS NULL OR source_row.change_order_id IS NOT NULL THEN
            RAISE EXCEPTION
                'inherited_from_modifier_id must reference a Proposal-owned modifier, '
                'but id % is not Proposal-owned',
                NEW.inherited_from_modifier_id;
        END IF;

        -- Rule 2: modifier_key must match
        IF source_row.modifier_key <> NEW.modifier_key THEN
            RAISE EXCEPTION
                'inherited_from_modifier_id has modifier_key %, but child has %',
                source_row.modifier_key, NEW.modifier_key;
        END IF;

        -- Rule 3: organization_id must match
        IF source_row.organization_id <> NEW.organization_id THEN
            RAISE EXCEPTION
                'inherited_from_modifier_id has organization_id %, but child has %',
                source_row.organization_id, NEW.organization_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;