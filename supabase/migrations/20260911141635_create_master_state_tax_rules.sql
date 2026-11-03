CREATE TABLE public.master_state_tax_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    state char(2) NOT NULL,
    classification_id uuid NOT NULL REFERENCES public.master_classifications(id),
    is_taxable boolean NOT NULL,
    explanation text,
    qualifier_environment text CHECK (qualifier_environment IN ('residential', 'commercial')),
    qualifier_project_type text,
    qualifier_separately_stated boolean,
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_through date,
    statutory_effective_date date,
    rule_version integer NOT NULL DEFAULT 1,
    is_active boolean NOT NULL DEFAULT true,
    superseded_by uuid REFERENCES public.master_state_tax_rules(id),
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX master_state_tax_rules_lookup_idx
    ON public.master_state_tax_rules (state, classification_id, is_active, effective_from, effective_through);

CREATE UNIQUE INDEX master_state_tax_rules_no_overlap_idx
    ON public.master_state_tax_rules (
        state,
        classification_id,
        effective_from,
        COALESCE(qualifier_environment, ''),
        COALESCE(qualifier_project_type, ''),
        COALESCE(qualifier_separately_stated::text, '')
    )
    WHERE is_active = true;

ALTER TABLE public.master_state_tax_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view master state tax rules"
    ON public.master_state_tax_rules
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Global admins can insert master state tax rules"
    ON public.master_state_tax_rules
    FOR INSERT
    TO authenticated
    WITH CHECK ((select public.is_global_admin()));

CREATE POLICY "Global admins can update master state tax rules"
    ON public.master_state_tax_rules
    FOR UPDATE
    TO authenticated
    USING ((select public.is_global_admin()))
    WITH CHECK ((select public.is_global_admin()));

CREATE POLICY "Global admins can delete master state tax rules"
    ON public.master_state_tax_rules
    FOR DELETE
    TO authenticated
    USING ((select public.is_global_admin()));
