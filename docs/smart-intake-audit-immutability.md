# Audit immutability status

Append-only database triggers are **not implemented**. The staged audit-history migration creates tables and enables RLS, but does not prevent privileged updates or deletes. Some related child tables also have cascading foreign-key deletes.

Before activation, implement and test retention and authorized redaction, append-only enforcement, deletion behavior, and recovery of audit events after partial failures. No migration has been applied to production.
