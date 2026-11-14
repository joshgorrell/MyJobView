import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try {
 await db.exec(`CREATE SCHEMA techsafe_source;
  CREATE TABLE public.sales_orders(id integer PRIMARY KEY,status text,first_completion_date timestamptz);
  INSERT INTO public.sales_orders VALUES(1,'completed','2000-01-01'),(2,'planning','2000-01-01');`);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261114115511_techsafe_sales_order_completion_clock.sql',import.meta.url),'utf8'));
 const row=async id=>(await db.query('SELECT * FROM public.sales_orders WHERE id=$1',[id])).rows[0];
 for(const id of [1,2]){
  assert.equal((await row(id)).techsafe_completion_history_verified,false);
  assert.equal((await row(id)).techsafe_completed_at,null);
 }
 await db.exec(`INSERT INTO public.sales_orders(id,status,techsafe_completed_at,techsafe_completion_history_verified)
  VALUES(3,'planning','2099-01-01',false);`);
 assert.equal((await row(3)).techsafe_completed_at,null);
 assert.equal((await row(3)).techsafe_completion_history_verified,true);
 await db.exec("UPDATE public.sales_orders SET first_completion_date='2000-01-01' WHERE id=3");
 assert.equal((await row(3)).techsafe_completed_at,null,'Work Order completion must not start Sales Order clock');
 await db.exec("UPDATE public.sales_orders SET status='completed' WHERE id=3");
 const first=(await row(3)).techsafe_completed_at;
 assert.ok(first instanceof Date);
 await db.exec("UPDATE public.sales_orders SET status='planning',techsafe_completed_at=NULL,techsafe_completion_history_verified=false WHERE id=3");
 assert.deepEqual((await row(3)).techsafe_completed_at,first);
 await db.exec("UPDATE public.sales_orders SET status='completed',techsafe_completed_at='2099-01-01' WHERE id=3");
 assert.deepEqual((await row(3)).techsafe_completed_at,first,'re-completion cannot reset deadline');
 await db.exec("UPDATE public.sales_orders SET techsafe_completion_history_verified=true,techsafe_completed_at='2099-01-01' WHERE id=2");
 assert.equal((await row(2)).techsafe_completion_history_verified,false);
 assert.equal((await row(2)).techsafe_completed_at,null);
 console.log('PASS: real PostgreSQL Sales Order clock capture, immutability, reopen and historical holds');
} finally {await db.close();}
