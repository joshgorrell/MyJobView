/*
# Re-activate Security Onboarding sidebar module

The 20260824 navigation consolidation deactivated `security_onboarding`
expecting it to be a tab inside Contract Management. However, Contract
Management only shows approved/active/cancelled contracts and lacks the
create / send / resend / delete / manual-entry workflow that lived on the
Security Onboarding page. This re-activates the standalone sidebar entry
so users can reach the full onboarding workflow again.
*/

UPDATE department_modules
SET is_active = true
WHERE module_key = 'security_onboarding';
