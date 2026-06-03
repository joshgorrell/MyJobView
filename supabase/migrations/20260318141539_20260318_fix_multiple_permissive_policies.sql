/*
  # Fix Multiple Permissive Policies

  ## Summary
  Removes redundant legacy policies on commission_adjustments that duplicate
  functionality already covered by the newer _same_org policies. Multiple
  permissive policies on the same table+command cause all policies to be
  evaluated, reducing performance.

  ## Changes
  - commission_adjustments: Remove legacy "Admin and Finance" policies
    (covered by commission_adjustments_select_same_org and _insert_same_org)

  ## Notes
  Most other "multiple permissive" entries in the system are intentional
  (portal users + internal users need separate policies), so only removing
  the clearly redundant ones.
*/

DROP POLICY IF EXISTS "Admin and Finance can create commission adjustments" ON public.commission_adjustments;
DROP POLICY IF EXISTS "Admin and Finance can view commission adjustments" ON public.commission_adjustments;
