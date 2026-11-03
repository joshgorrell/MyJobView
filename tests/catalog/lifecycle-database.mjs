import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const org='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
const buyer='20000000-0000-0000-0000-000000000001',staff='20000000-0000-0000-0000-000000000002';
const id=n=>`30000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create table profiles(id uuid primary key,organization_id uuid,can_create_purchase_orders boolean);
insert into profiles values('${buyer}','${org}',true),('${staff}','${org}',false);
create function can_manage_purchasing() returns boolean language sql as $$select coalesce((select can_create_purchase_orders from public.profiles where id=auth.uid()),false)$$;
create table products(id uuid primary key,organization_id uuid,is_active boolean not null default true);
create table product_inventory(id uuid primary key default gen_random_uuid(),product_id uuid references products on delete cascade,quantity_on_hand numeric default 0,quantity_reserved numeric default 0);
create table catalog_item_default_tasks(id uuid default gen_random_uuid(),product_id uuid references products on delete set null);
create table proposal_line_items(id uuid primary key default gen_random_uuid(),product_id uuid references products on delete set null,organization_id uuid,proposal_id uuid,quantity numeric default 1);
create table invoice_line_items(id uuid primary key default gen_random_uuid(),product_id uuid references products on delete set null,organization_id uuid,invoice_id uuid,quantity numeric default 1);
create table change_order_line_items(id uuid primary key default gen_random_uuid(),product_id uuid references products on delete set null,organization_id uuid,change_order_id uuid,quantity numeric default 1);
create table po_items(id uuid primary key default gen_random_uuid(),product_id uuid references products on delete set null,organization_id uuid,po_id uuid,quantity numeric default 1);
create table purchase_order_items(id uuid primary key default gen_random_uuid(),product_id uuid references products,organization_id uuid,po_id uuid,quantity_ordered numeric default 1);
create table product_package_items(id uuid default gen_random_uuid(),product_id uuid references products on delete cascade);
create table serial_lot_tracking(id uuid default gen_random_uuid(),product_id uuid references products on delete cascade);
create function create_request_purchase_document(p_items jsonb,p_vendor_ids uuid[],p_warehouse_id uuid,p_quote boolean,p_header jsonb,p_retry uuid) returns uuid language plpgsql as $$
declare doc uuid:=p_retry; payload jsonb;
BEGIN
IF NOT public.can_manage_purchasing() THEN RAISE EXCEPTION 'Purchasing permission required'; END IF;
for payload in select * from jsonb_array_elements(p_items) loop
 insert into po_items(product_id,organization_id,po_id) values((payload->>'product_id')::uuid,'${org}',doc);
end loop;
RETURN doc;
END $$;
create function convert_purchase_quote(p_quote_id uuid,p_vendor_id uuid) returns uuid language plpgsql as $$begin insert into public.po_items(product_id,organization_id,po_id) values(p_quote_id,'${org}',p_vendor_id);return p_vendor_id;end$$;
select set_config('test.actor','${buyer}',false);
`);
await db.exec(fs.readFileSync('supabase/migrations/20261008222600_catalog_product_lifecycle.sql','utf8'));
for(let n=1;n<=10;n++)await db.query('insert into products(id,organization_id) values($1,$2)',[id(n),org]);
await db.query('insert into products(id,organization_id) values($1,$2)',[id(11),other]);
const fail=async(sql,params=[],pattern=/archived/i)=>assert.rejects(()=>db.query(sql,params),pattern);
for(const [table,parent] of [['proposal_line_items','proposal_id'],['invoice_line_items','invoice_id'],['change_order_line_items','change_order_id']]) {
 const product=id(table==='proposal_line_items'?1:table==='invoice_line_items'?2:3);
 await db.query(`insert into ${table}(product_id,organization_id,${parent}) values($1,$2,$3)`,[product,org,id(40)]);
 await db.query('update products set is_active=false where id=$1',[product]);
 await fail(`insert into ${table}(product_id,organization_id,${parent}) values($1,$2,$3)`,[product,org,id(41)]);
 await db.query(`update ${table} set quantity=2 where product_id=$1`,[product]);
 await fail(`update ${table} set ${parent}=$2 where product_id=$1`,[product,id(41)]);
 await fail('delete from products where id=$1',[product],/foreign key/);
}
await db.query('update products set is_discontinued=true where id=$1',[id(4)]);
await db.query('insert into proposal_line_items(product_id,organization_id,proposal_id) values($1,$2,$3)',[id(4),org,id(40)]);
await db.query('insert into invoice_line_items(product_id,organization_id,invoice_id) values($1,$2,$3)',[id(4),org,id(40)]);
await fail('insert into po_items(product_id,organization_id) values($1,$2)',[id(4),org],/explicitly override/);
await db.query('insert into po_items(product_id,organization_id,discontinued_override) values($1,$2,true)',[id(4),org]);
const audit=(await db.query('select discontinued_override_by,discontinued_override_at from po_items where product_id=$1',[id(4)])).rows[0];assert.equal(audit.discontinued_override_by,buyer);assert.ok(audit.discontinued_override_at);
await db.query('update po_items set discontinued_override_by=$2 where product_id=$1',[id(4),staff]);assert.equal((await db.query('select discontinued_override_by from po_items where product_id=$1',[id(4)])).rows[0].discontinued_override_by,buyer);
await db.exec(`select set_config('test.actor','${staff}',false);`);
await fail('insert into po_items(product_id,organization_id,discontinued_override) values($1,$2,true)',[id(4),org],/Purchasing permission/);
await db.exec(`select set_config('test.actor','${buyer}',false);`);
await fail('insert into invoice_line_items(product_id,organization_id) values($1,$2)',[id(11),org],/organization/);
for(const [table,n] of [['product_package_items',5],['serial_lot_tracking',6]]){await db.query(`insert into ${table}(product_id) values($1)`,[id(n)]);await fail('delete from products where id=$1',[id(n)],/foreign key/);}
await db.query('insert into product_inventory(product_id,quantity_on_hand) values($1,2)',[id(7)]);await fail('delete from products where id=$1',[id(7)],/stock or reservations/);
await db.query('insert into product_inventory(product_id,quantity_reserved) values($1,1)',[id(8)]);await fail('delete from products where id=$1',[id(8)],/stock or reservations/);
await db.query('insert into product_inventory(product_id) values($1)',[id(9)]);await db.query('insert into catalog_item_default_tasks(product_id) values($1)',[id(9)]);await db.query('delete from products where id=$1',[id(9)]);
// Exercise the established purchasing RPC integration, not just a direct flagged insert.
await fail('select create_request_purchase_document($1::jsonb,$2::uuid[],$3,false,$4::jsonb,$5)',[JSON.stringify([{product_id:id(4)}]),[],id(40),'{}',id(42)],/explicitly override/);
await db.query('select create_request_purchase_document($1::jsonb,$2::uuid[],$3,false,$4::jsonb,$5)',[JSON.stringify([{product_id:id(4)}]),[],id(40),'{"discontinued_override":true}',id(42)]);
assert.notEqual((await db.query("select current_setting('app.discontinued_purchase_override',true) as flag")).rows[0].flag,'true');
await db.query('select convert_purchase_quote($1,$2,true)',[id(4),id(43)]);
await fail('select convert_purchase_quote($1,$2,false)',[id(4),id(44)],/explicitly override/);
await db.query('update products set is_active=false where id=$1',[id(4)]);await fail('insert into po_items(product_id,organization_id,discontinued_override) values($1,$2,true)',[id(4),org]);
// Foreign-key restrictions protect records hidden by RLS; stock guard bypasses inventory RLS safely.
await db.exec(`alter table products enable row level security;create policy own_products on products to authenticated using(organization_id='${org}') with check(organization_id='${org}');alter table product_inventory enable row level security;alter table proposal_line_items enable row level security;
grant usage on schema auth to authenticated;grant select on profiles to authenticated;grant select,update,delete on products to authenticated;grant select on product_inventory,proposal_line_items to authenticated;set role authenticated;`);
await fail('delete from products where id=$1',[id(1)],/foreign key/);
await fail('delete from products where id=$1',[id(7)],/stock or reservations/);
await db.exec('reset role');
console.log('Archive selection, historical links, stock protection, tenant boundaries, RLS, discontinued sales and audited purchasing overrides passed.');
await db.close();
