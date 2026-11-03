import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
 await db.exec(`create table public.profiles(id text primary key);`);
 await db.exec(await readFile('supabase/migrations/20260923171814_add_ui_theme_preference.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260923181009_add_classic_gradient_theme.sql','utf8'));
 await db.exec(`insert into public.profiles(id,ui_theme) values ('old','system'),('light','light'),('dark','dark'),('classic','classic');`);
 const sql=await readFile('supabase/migrations/20261003174429_add_mjv_theme.sql','utf8');await db.exec(sql);
 assert.equal((await db.query("select ui_theme from public.profiles where id='old'")).rows[0].ui_theme,'mjv');
 await db.exec("insert into public.profiles(id,ui_theme) values ('new','mjv')");
 await assert.rejects(()=>db.exec("update public.profiles set ui_theme='invalid' where id='new'"));
 await db.exec(sql);
 assert.equal((await db.query("select count(*)::int as count from public.profiles where ui_theme='mjv'")).rows[0].count,2);
 console.log('MJV migration accepts new theme, converts legacy System and rejects invalid values; rerun passes');
} finally {await db.close();}
