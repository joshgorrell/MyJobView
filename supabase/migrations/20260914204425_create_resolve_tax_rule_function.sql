/*
# Create resolve_tax_rule function

## Purpose
Creates a single authoritative database function that answers one question:
under a state's tax rules, how is a specific classification treated for a
given Environment + Project Type, accounting for dealer-specific overrides?

This function does NOT check nexus, origin address, destination address,
exemption status, or calculation readiness. It answers taxability only.

## New Function
- `resolve_tax_rule(p_state text, p_organization_id uuid, p_environment text, p_project_type text, p_classification_code text)`
  - SECURITY DEFINER, STABLE, search_path = 'public'
  - Returns jsonb with: taxability_status, explanation, rule_id, rule_version, source

## Resolution Algorithm
1. Filter master_state_tax_rules by state, classification (via master_classifications.code),
   is_active = true, and current date within effective range
2. Score each candidate by qualifier specificity:
   - qualifier_environment matches transaction environment: +1 if non-null and matches
   - qualifier_project_type matches transaction project type: +1 if non-null and matches
   - qualifier_separately_stated matches: +1 if non-null and matches
   A rule with null qualifiers is the broadest (score 0) and serves as state default.
   Rules with non-null qualifiers that DON'T match the transaction are filtered out.
3. Select the highest-scoring match. Ties broken by highest rule_version.
4. If no master rule matches, check state_tax_rules_matrix for an org-specific override
   using the same algorithm (via tax_classifications.code).
5. If still no match: return 'needs_review'.

## Security
- SECURITY DEFINER so it can read both master (global) and matrix (org-scoped) tables
  regardless of the caller's RLS context.
- search_path = 'public' to prevent path injection.

## Notes
- master_state_tax_rules uses master_classifications IDs (global).
- state_tax_rules_matrix uses tax_classifications IDs (org-specific).
- The function joins via the classification code to bridge both ID spaces.
- The function is STABLE — it does not modify any data.
*/

CREATE OR REPLACE FUNCTION public.resolve_tax_rule(
  p_state text,
  p_organization_id uuid,
  p_environment text DEFAULT NULL,
  p_project_type text DEFAULT NULL,
  p_classification_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rule_id uuid;
  v_taxability_status text;
  v_explanation text;
  v_rule_version int;
  v_source text := 'master';
  v_best_score int := -1;
  v_candidate_score int;
  v_row record;
BEGIN
  -- ── 1. Search master_state_tax_rules ────────────────────────────────
  FOR v_row IN
    SELECT m.id, m.taxability_status, m.explanation, m.rule_version,
           m.qualifier_environment, m.qualifier_project_type, m.qualifier_separately_stated
    FROM master_state_tax_rules m
    JOIN master_classifications mc ON mc.id = m.classification_id
    WHERE m.state = p_state
      AND mc.code = p_classification_code
      AND m.is_active = true
      AND m.effective_from <= CURRENT_DATE
      AND (m.effective_through IS NULL OR m.effective_through >= CURRENT_DATE)
      -- Filter out rules whose non-null qualifiers don't match the transaction
      AND (m.qualifier_environment IS NULL OR m.qualifier_environment = p_environment)
      AND (m.qualifier_project_type IS NULL OR m.qualifier_project_type = p_project_type)
  LOOP
    v_candidate_score := 0;
    IF v_row.qualifier_environment IS NOT NULL THEN
      v_candidate_score := v_candidate_score + 1;
    END IF;
    IF v_row.qualifier_project_type IS NOT NULL THEN
      v_candidate_score := v_candidate_score + 1;
    END IF;
    IF v_row.qualifier_separately_stated IS NOT NULL THEN
      v_candidate_score := v_candidate_score + 1;
    END IF;

    IF v_candidate_score > v_best_score
       OR (v_candidate_score = v_best_score AND v_row.rule_version > COALESCE(v_rule_version, 0))
    THEN
      v_best_score := v_candidate_score;
      v_rule_id := v_row.id;
      v_taxability_status := v_row.taxability_status;
      v_explanation := v_row.explanation;
      v_rule_version := v_row.rule_version;
      v_source := 'master';
    END IF;
  END LOOP;

  -- ── 2. If no master match, search state_tax_rules_matrix (dealer override) ──
  IF v_rule_id IS NULL THEN
    FOR v_row IN
      SELECT s.id, s.taxability_status, s.explanation, s.rule_version,
             s.environment AS qual_env, s.project_type AS qual_pt
      FROM state_tax_rules_matrix s
      JOIN tax_classifications tc ON tc.id = s.tax_classification_id
      WHERE s.organization_id = p_organization_id
        AND s.state = p_state
        AND tc.code = p_classification_code
        AND s.is_active = true
        AND s.effective_from <= CURRENT_DATE
        AND (s.effective_through IS NULL OR s.effective_through >= CURRENT_DATE)
        AND (s.environment IS NULL OR s.environment = p_environment OR s.environment = 'both')
        AND (s.project_type IS NULL OR s.project_type = p_project_type)
    LOOP
      v_candidate_score := 0;
      IF v_row.qual_env IS NOT NULL AND v_row.qual_env <> 'both' THEN
        v_candidate_score := v_candidate_score + 1;
      END IF;
      IF v_row.qual_pt IS NOT NULL THEN
        v_candidate_score := v_candidate_score + 1;
      END IF;

      IF v_candidate_score > v_best_score
         OR (v_candidate_score = v_best_score AND v_row.rule_version > COALESCE(v_rule_version, 0))
      THEN
        v_best_score := v_candidate_score;
        v_rule_id := v_row.id;
        v_taxability_status := v_row.taxability_status;
        v_explanation := v_row.explanation;
        v_rule_version := v_row.rule_version;
        v_source := 'dealer_override';
      END IF;
    END LOOP;
  END IF;

  -- ── 3. If still no match, return needs_review ─────────────────────────
  IF v_rule_id IS NULL THEN
    RETURN jsonb_build_object(
      'taxability_status', 'needs_review',
      'explanation', 'No tax rule found for state ' || COALESCE(p_state, '(null)') ||
        ', classification ' || COALESCE(p_classification_code, '(null)') ||
        ', environment ' || COALESCE(p_environment, '(any)') ||
        ', project type ' || COALESCE(p_project_type, '(any)') ||
        '. Manual review required.',
      'rule_id', NULL::uuid,
      'rule_version', NULL::integer,
      'source', NULL::text
    );
  END IF;

  RETURN jsonb_build_object(
    'taxability_status', v_taxability_status,
    'explanation', v_explanation,
    'rule_id', v_rule_id,
    'rule_version', v_rule_version,
    'source', v_source
  );
END;
$function$;
