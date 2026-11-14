-- No secret values are generated or seeded by this migration. Operators create
-- encrypted Vault entries in SQL and transfer only their SHA-256 fingerprints.
CREATE TABLE techsafe_source.sandbox_receiver_credentials (
 connection_id uuid NOT NULL REFERENCES techsafe_source.integration_connections(connection_id) ON DELETE CASCADE,
 organization_id uuid NOT NULL,generation bigint NOT NULL CHECK(generation>0),
 environment text NOT NULL DEFAULT 'sandbox' CHECK(environment='sandbox'),
 vault_secret_id uuid NOT NULL UNIQUE REFERENCES vault.secrets(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'staged' CHECK(status IN ('staged','active','revoked')),
 PRIMARY KEY(connection_id,generation)
);
ALTER TABLE techsafe_source.sandbox_receiver_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE techsafe_source.sandbox_receiver_credentials FORCE ROW LEVEL SECURITY;
REVOKE ALL ON techsafe_source.sandbox_receiver_credentials FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION techsafe_source.guard_sandbox_receiver_credential()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c techsafe_source.integration_connections%ROWTYPE;secret_name text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM techsafe_source.integration_connections WHERE connection_id=OLD.connection_id) THEN
   RAISE EXCEPTION 'Revoke managed credentials; do not remove their authority record' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.connection_id IS DISTINCT FROM OLD.connection_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  OR NEW.generation IS DISTINCT FROM OLD.generation OR NEW.vault_secret_id IS DISTINCT FROM OLD.vault_secret_id) THEN
  RAISE EXCEPTION 'Sandbox credential scope is immutable' USING ERRCODE='23514';
 END IF;
 SELECT * INTO c FROM techsafe_source.integration_connections WHERE connection_id=NEW.connection_id FOR UPDATE;
 IF NOT FOUND OR c.organization_id IS DISTINCT FROM NEW.organization_id
   OR (NEW.status<>'revoked' AND (c.connection_generation IS DISTINCT FROM NEW.generation OR c.dispatch_environment IS DISTINCT FROM 'sandbox')) THEN
  RAISE EXCEPTION 'Sandbox credential connection scope invalid' USING ERRCODE='23514';
 END IF;
 SELECT name INTO secret_name FROM vault.secrets WHERE id=NEW.vault_secret_id;
 IF secret_name IS DISTINCT FROM 'techsafe_receiver_'||NEW.connection_id::text||'_g'||NEW.generation::text THEN
  RAISE EXCEPTION 'Sandbox Vault secret ownership invalid' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.guard_sandbox_receiver_credential() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_guard_sandbox_receiver_credential BEFORE INSERT OR UPDATE OR DELETE
ON techsafe_source.sandbox_receiver_credentials FOR EACH ROW EXECUTE FUNCTION techsafe_source.guard_sandbox_receiver_credential();
CREATE FUNCTION techsafe_source.cleanup_sandbox_receiver_secret()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM vault.secrets WHERE id=OLD.vault_secret_id
  AND name='techsafe_receiver_'||OLD.connection_id::text||'_g'||OLD.generation::text;
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.cleanup_sandbox_receiver_secret() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER techsafe_cleanup_sandbox_receiver_secret AFTER DELETE ON techsafe_source.sandbox_receiver_credentials
FOR EACH ROW EXECUTE FUNCTION techsafe_source.cleanup_sandbox_receiver_secret();

-- Privileged SQL operator only. The raw token is generated, encrypted and
-- fingerprinted on the server; only public scope/hash metadata is returned.
CREATE FUNCTION techsafe_source.stage_sandbox_receiver_credential(p_connection uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE conn techsafe_source.integration_connections%ROWTYPE;
 binding techsafe_source.sandbox_receiver_credentials%ROWTYPE;secret_id uuid;fingerprint text;
BEGIN
 SELECT * INTO conn FROM techsafe_source.integration_connections WHERE connection_id=p_connection FOR UPDATE;
 IF NOT FOUND OR conn.dispatch_environment IS DISTINCT FROM 'sandbox' THEN
  RAISE EXCEPTION 'Explicit sandbox connection required' USING ERRCODE='23514';
 END IF;
 SELECT * INTO binding FROM techsafe_source.sandbox_receiver_credentials
  WHERE connection_id=p_connection AND generation=conn.connection_generation FOR UPDATE;
 IF FOUND THEN
  IF binding.status='revoked' THEN RAISE EXCEPTION 'Revoked credential requires generation rotation' USING ERRCODE='23514'; END IF;
 ELSE
  secret_id:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),
   'techsafe_receiver_'||p_connection::text||'_g'||conn.connection_generation::text,'Private Techsafe sandbox receiver credential');
  INSERT INTO techsafe_source.sandbox_receiver_credentials(connection_id,organization_id,generation,vault_secret_id)
   VALUES(p_connection,conn.organization_id,conn.connection_generation,secret_id) RETURNING * INTO binding;
 END IF;
 SELECT encode(sha256(convert_to(v.decrypted_secret,'UTF8')),'hex') INTO fingerprint FROM vault.decrypted_secrets v
  WHERE v.id=binding.vault_secret_id AND v.name='techsafe_receiver_'||p_connection::text||'_g'||conn.connection_generation::text
   AND v.decrypted_secret ~ '^[a-f0-9]{64}$';
 IF fingerprint IS NULL THEN RAISE EXCEPTION 'Sandbox Vault credential invalid' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('connectionId',p_connection,'organizationId',conn.organization_id,
  'generation',conn.connection_generation,'environment','sandbox','tokenSha256',fingerprint);
END;
$$;
REVOKE ALL ON FUNCTION techsafe_source.stage_sandbox_receiver_credential(uuid) FROM PUBLIC,anon,authenticated,service_role;
