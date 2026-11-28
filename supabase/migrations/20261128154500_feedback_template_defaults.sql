-- Draft content only. No enrollment or delivery changes.
INSERT INTO public.email_templates (organization_id,template_type,subject,body,is_active)
SELECT o.id,v.template_type,v.subject,v.body,true
FROM public.organizations o CROSS JOIN (VALUES
 ('feedback_proposal_check','Any questions about your proposal?','Hi {{customer_name}},

We wanted to check in on your proposal. Is there anything we can clarify or help you with?

Share your feedback: {{feedback_url}}

Thank you,
The {{company_name}} Team'),
 ('feedback_lost_opportunity','Could we have done anything differently?','Hi {{customer_name}},

Thank you for considering us. We would appreciate any feedback about your decision.

Share your feedback: {{feedback_url}}

Thank you,
The {{company_name}} Team'),
 ('feedback_job_completion','How did we do?','Hi {{customer_name}},

Your project has reached substantial completion. We would love to hear how our team did and whether anything needs attention.

Share your feedback: {{feedback_url}}

Thank you,
The {{company_name}} Team'),
 ('feedback_service_completion','How was your service experience?','Hi {{customer_name}},

Your service request has been closed. Is everything working as expected?

Share your feedback: {{feedback_url}}

Thank you,
The {{company_name}} Team'),
 ('feedback_support_completion','Did we resolve your support request?','Hi {{customer_name}},

We have completed your support request. Please let us know if you need any further assistance.

Share your feedback: {{feedback_url}}

Thank you,
The {{company_name}} Team'),
 ('feedback_test_tune','How did Test & Tune go?','Hi {{customer_name}},

Your Test & Tune period has ended. We would love to hear how your system is working and how the experience went.

Share your feedback: {{feedback_url}}

Thank you,
The {{company_name}} Team'),
 ('feedback_one_year','How is your system working after a year?','Hi {{customer_name}},

It has been about a year since your project was completed. We would love to hear how everything is working.

Share your feedback: {{feedback_url}}

Thank you,
The {{company_name}} Team')
) AS v(template_type,subject,body)
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates e WHERE e.organization_id=o.id AND e.template_type=v.template_type);
