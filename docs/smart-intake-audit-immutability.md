# Audit immutability implementation

The staged migration adds database triggers rejecting updates/deletes on intake events, messages, delivery events and processing attempts, and changes inbound evidence foreign keys to restrict cascading deletion.

Do not apply until verifying how retention, privacy redaction, and migrations interact with these restrictions. An authorized retention/archive process must be designed before production activation. This is a staging-only schema improvement, not proof of compliance or full audit immutability: the intake_items parent row remains mutable to support workflow state changes.
