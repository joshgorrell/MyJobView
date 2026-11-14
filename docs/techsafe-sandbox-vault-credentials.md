# Database-managed sandbox receiver credentials

The sandbox sender can now resolve a private Supabase Vault credential bound to
the exact connection, organization and current generation. The raw bearer token
is generated and encrypted in Vault; only its SHA-256 verification fingerprint
needs to cross to the paired Techsafe database. No Edge-secret editing, browser
session, plaintext credential file or credential-bearing request is required.

The three source entrypoints use the same private reader. Sandbox scopes with
no managed binding retain the existing environment reader. A staged or revoked
binding is authoritative and cannot fall through to an older environment key.
Production continues to use its existing environment credential path. An active
Vault binding also requires an active connection explicitly classified sandbox,
the matching organization/generation and the exact owned Vault secret name.
Readiness diagnostics report presence only and are scoped to the signed-in
admin's organization; they never retrieve a token for the response.

## Privileged provisioning after both changes are deployed

1. Apply the paired Techsafe sandbox credential-registry migration and receiver
   code, then this migration and all three matching source function graphs.
2. Verify the dedicated source and receiver sandbox connection IDs, source
   instance, organization and generation match. Classify only that source
   connection as sandbox. Leave automatic delivery disabled during the smoke test.
3. Call private `techsafe_source.stage_sandbox_receiver_credential(connection_id)`
   through privileged SQL. It generates 32 random bytes with pgcrypto, stores the
   token through `vault.create_secret`, and creates a staged scoped binding. Its
   result contains only connection/organization/generation/environment/hash.
4. Pass that public scope/fingerprint to Techsafe's private sandbox registration
   function. It rejects production, mismatched generations, conflicting hashes
   and accidental reactivation of revoked keys. Verify receiver registration.
5. Activate the exact staged MJV binding and invoke the existing one-use sandbox
   runner. Inspect the real source certificate and receiver receipt/native draft.
   Only then consider enabling queued delivery for the verified environment.

Identical staging retries retain the key; revoked credentials require generation
rotation. The helper returns no raw token or Vault plaintext. Do not query a
decrypted secret into tool output, chat, logs, repository files or user artifacts.
For revocation, revoke the receiver verifier first so in-flight requests are
rejected at commit, then revoke the source binding. Connection pause/generation
checks remain part of the existing sender/receiver authorization.

## Permissions and ownership

The registry forces RLS, denies all API roles, and has no public issuance RPC.
The provisioning helper is SECURITY INVOKER in the private schema with API
EXECUTE revoked. Its caller must already have privileged database/Vault rights.
The reader runs only on the server over the existing private SQL connection.

Bindings and uniquely named Vault entries are owned by their integration
connection, not the native sale. Direct removal of a binding while its parent
exists is denied to prevent revocation falling back to an environment key.
Permitted connection deletion cascades the binding and deletes only its exact
owned Vault entry transactionally. Failed deletion/rollback restores both;
other connections' keys and independent native Sales Orders are preserved.
There are no Flow, note, notification, attachment or external-copy children.

No key is seeded, connection enabled, order approved, delivery scheduled, price
calculated or coverage purchased by migration. Vault supplies authenticated
encryption in production. The isolated test uses a plaintext Vault API fixture
to test scope/lifecycle behavior; it does not implement or certify encryption.
