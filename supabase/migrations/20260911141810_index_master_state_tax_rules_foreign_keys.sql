CREATE INDEX master_state_tax_rules_classification_idx
    ON public.master_state_tax_rules (classification_id);

CREATE INDEX master_state_tax_rules_superseded_by_idx
    ON public.master_state_tax_rules (superseded_by)
    WHERE superseded_by IS NOT NULL;
