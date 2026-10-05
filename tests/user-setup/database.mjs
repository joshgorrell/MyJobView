import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
await db.exec(`CREATE ROLE authenticated;CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,role text,is_active boolean);
INSERT INTO profiles VALUES('${id(1)}','${id(10)}','admin',true),('${id(2)}','${id(10)}','tech',true),('${id(3)}','${id(20)}','admin',true),('${id(4)}','${id(10)}','admin',false);
GRANT SELECT ON profiles TO authenticated;`);
await db.exec(await readFile('supabase/migrations/20261001201849_user_setup_reviews.sql', 'utf8'));
async function as(user, sql) {
  await db.exec(`RESET ROLE;SELECT set_config('test.uid','${user}',false);SET ROLE authenticated;`);
  return db.query(sql);
}
await as(
  id(1),
  `INSERT INTO user_setup_reviews(user_id,reviewed_sections)VALUES('${id(2)}',ARRAY['profile','permissions'])`,
);
assert.equal((await as(id(1), 'SELECT * FROM user_setup_reviews')).rows.length, 1);
for (const actor of [id(2), id(3), id(4)]) {
  assert.equal((await as(actor, 'SELECT * FROM user_setup_reviews')).rows.length, 0);
  await assert.rejects(() => as(actor, `INSERT INTO user_setup_reviews(user_id)VALUES('${id(1)}')`));
}
await assert.rejects(() => as(id(1), `INSERT INTO user_setup_reviews(user_id)VALUES('${id(3)}')`));
await assert.rejects(() => as(id(1), `UPDATE user_setup_reviews SET user_id='${id(3)}'`));
await assert.rejects(() => as(id(1), `UPDATE user_setup_reviews SET reviewed_sections=ARRAY['made_up']`));
await as(
  id(1),
  `UPDATE user_setup_reviews SET reviewed_sections=ARRAY['profile','access','permissions','notifications','pay','sales']`,
);
assert.equal((await as(id(1), 'SELECT reviewed_sections FROM user_setup_reviews')).rows[0].reviewed_sections.length, 6);
await db.close();
console.log('User setup review RLS, tenant isolation, inactive admin and section validation passed.');
