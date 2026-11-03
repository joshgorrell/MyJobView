import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const org = "10000000-0000-0000-0000-000000000001",
  other = "10000000-0000-0000-0000-000000000002",
  staff = "20000000-0000-0000-0000-000000000001",
  viewer = "20000000-0000-0000-0000-000000000002",
  va = "30000000-0000-0000-0000-000000000001",
  vb = "30000000-0000-0000-0000-000000000002",
  foreign = "30000000-0000-0000-0000-000000000003",
  warehouse = "40000000-0000-0000-0000-000000000001",
  office = "50000000-0000-0000-0000-000000000001",
  product = "60000000-0000-0000-0000-000000000001";
const ids = [1, 2, 3].map((n) => "70000000-0000-0000-0000-00000000000" + n),
  reqs = [1, 2, 3].map((n) => "80000000-0000-0000-0000-00000000000" + n),
  jobs = [1, 2, 3].map((n) => "90000000-0000-0000-0000-00000000000" + n);
await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema private;
create function auth.uid() returns uuid language sql as $$select coalesce(nullif(current_setting('test.actor',true),''),'${staff}')::uuid$$;
create table organizations(id uuid primary key);insert into organizations values('${org}'),('${other}');
create table profiles(id uuid primary key,organization_id uuid,role text,can_create_purchase_orders boolean);insert into profiles values('${staff}','${org}','technician',true),('${viewer}','${org}','technician',false);
create function get_user_org_id() returns uuid language sql set search_path=public as $$select organization_id from profiles where id=auth.uid()$$;
create table work_orders(id uuid primary key);create table projects(id uuid primary key);create table sales_orders(id uuid primary key);create table service_requests(id uuid primary key);
create table products(id uuid primary key,organization_id uuid,is_active boolean not null default true);
insert into products(id,organization_id) values('${product}','${org}');
create table purchase_order_items(id uuid primary key default gen_random_uuid(),product_id uuid references products,po_id uuid,organization_id uuid,quantity_ordered numeric);
create table contacts(id uuid primary key,organization_id uuid);
create table vendors(id uuid primary key,organization_id uuid,vendor_name text);insert into vendors values('${va}','${org}','Vendor A'),('${vb}','${org}','Vendor B'),('${foreign}','${other}','Foreign');
create table warehouses(id uuid primary key,organization_id uuid);insert into warehouses values('${warehouse}','${org}');
create table company_offices(id uuid primary key,organization_id uuid,office_name text,address_line1 text,city text,state text,zip text);insert into company_offices values('${office}','${org}','HQ','Address','Topeka','KS','66601');
create table purchase_orders(id uuid primary key default gen_random_uuid(),organization_id uuid,po_number text default gen_random_uuid()::text,vendor_id uuid,warehouse_id uuid,status text default 'draft',created_by uuid,order_date date,expected_date date,subtotal numeric,total numeric,shipping_cost numeric default 0,tax_amount numeric default 0,internal_note text,external_note text,bill_to_office_id uuid,ship_to_office_id uuid,ship_to_contact_id uuid,bill_to_name text,bill_to_address text,bill_to_city text,bill_to_state text,bill_to_zip text,ship_to_name text,ship_to_address text,ship_to_city text,ship_to_state text,ship_to_zip text,received_date date);
create table product_requests(id uuid primary key,organization_id uuid,status text default 'pending',work_order_id uuid,project_id uuid,sales_order_id uuid,service_request_id uuid);
create table product_request_items(id uuid primary key,organization_id uuid,request_id uuid,product_id uuid,product_name text,model_number text,vendor text,quantity_requested integer,purchase_order_id uuid,ordered_quantity integer,ordered_status text,work_order_id uuid,project_id uuid,sales_order_id uuid,service_request_id uuid);
create table po_items(id uuid primary key default gen_random_uuid(),po_id uuid references purchase_orders on delete cascade,organization_id uuid,product_id uuid,product_name text,model_number text,vendor text,quantity integer,unit_price numeric,total_price numeric,product_request_item_id uuid,quantity_received integer default 0,received_at timestamptz,created_at timestamptz default now());
create table product_inventory(id uuid default gen_random_uuid(),organization_id uuid,product_id uuid,warehouse_id uuid,quantity_on_hand numeric,quantity_reserved numeric,quantity_available numeric generated always as (quantity_on_hand-quantity_reserved) stored,unique(product_id,warehouse_id));
create table stock_movements(organization_id uuid,product_id uuid,warehouse_id uuid,movement_type text,quantity numeric,quantity_before numeric,quantity_after numeric,reference_type text,reference_id uuid,notes text,created_by uuid);
alter table purchase_orders enable row level security;alter table po_items enable row level security;create policy baseline on purchase_orders for all to authenticated using(true) with check(true);create policy baseline on po_items for all to authenticated using(true) with check(true);
alter table product_requests enable row level security;alter table product_request_items enable row level security;
`);
for (let n = 0; n < 3; n++) {
  await db.query("insert into work_orders values($1)", [jobs[n]]);
  await db.query(
    "insert into product_requests(id,organization_id,work_order_id) values($1,$2,$3)",
    [reqs[n], org, jobs[n]],
  );
  await db.query(
    "insert into product_request_items(id,organization_id,request_id,product_id,product_name,model_number,vendor,quantity_requested) values($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      ids[n],
      org,
      reqs[n],
      product,
      "Same Product",
      "MODEL",
      "Vendor A",
      [3, 5, 1][n],
    ],
  );
}
await db.exec(
  await readFile(
    "supabase/migrations/20261006185842_purchasing_quote_requests.sql",
    "utf8",
  ),
);
await db.exec(await readFile("supabase/migrations/20261008222600_catalog_product_lifecycle.sql", "utf8"));
await db.exec(
  "grant usage on schema public,auth to authenticated;grant select on profiles,vendors,warehouses,company_offices,product_requests,product_request_items to authenticated;grant all on purchase_orders,po_items to authenticated;set role authenticated",
);
const sources = ids.map((id, n) => ({
  id,
  job_reference: ["Jones", "Weller", "Wilson"][n],
  unit_price: 10,
}));
const create = async (quote, vendors, retry) =>
  (
    await db.query(
      "select create_request_purchase_document($1,$2,$3,$4,$5,$6) id",
      [sources, vendors, warehouse, quote, { office_id: office }, retry],
    )
  ).rows[0].id;
const quote = await create(
  true,
  [va, vb],
  "a0000000-0000-0000-0000-000000000001",
);
assert.equal(
  await create(true, [va, vb], quote),
  quote,
  "Creation retry returns same quote",
);
assert.equal(
  (
    await db.query(
      "select count(*) n from product_request_items where purchase_order_id is not null",
    )
  ).rows[0].n,
  0,
  "RFQs never place orders",
);
assert.deepEqual(
  (
    await db.query(
      "select job_reference,quantity from po_items where po_id=$1 order by job_reference",
      [quote],
    )
  ).rows.map((x) => [x.job_reference, x.quantity]),
  [
    ["Jones", 3],
    ["Weller", 5],
    ["Wilson", 1],
  ],
);
await assert.rejects(
  db.query("select convert_purchase_quote($1,$2)", [quote, va]),
  /complete vendor quote/,
);
const ls = (
  await db.query("select id,job_reference from po_items where po_id=$1", [
    quote,
  ])
).rows;
const prices = Object.fromEntries(
  ls.map((l) => [l.id, { Jones: 10, Weller: 9, Wilson: 8 }[l.job_reference]]),
);
await db.query(
  "update purchase_quote_vendors set unit_prices=$1,shipping_cost=12,tax_amount=2,quoted_at=now() where quote_id=$2 and vendor_id=$3",
  [prices, quote, vb],
);
const po = (
  await db.query("select convert_purchase_quote($1,$2) id", [quote, vb])
).rows[0].id;
assert.equal(
  (await db.query("select total from purchase_orders where id=$1", [po]))
    .rows[0].total,
  "97.00",
);
assert.equal(
  (await db.query("select convert_purchase_quote($1,$2) id", [quote, vb]))
    .rows[0].id,
  po,
  "Conversion retry is idempotent",
);
assert.equal(
  (
    await db.query(
      "select count(*) n from product_request_items where ordered_status='po_created'",
    )
  ).rows[0].n,
  3,
);
await assert.rejects(
  create(false, [va], "a0000000-0000-0000-0000-000000000002"),
  /already on a PO/,
);
assert.equal(
  (await db.query("select count(*) n from purchase_orders")).rows[0].n,
  2,
  "Failed order rolls back entirely",
);
await db.query("update purchase_orders set status='submitted' where id=$1", [
  po,
]);
assert.equal(
  (
    await db.query(
      "select count(*) n from product_request_items where ordered_status='ordered'",
    )
  ).rows[0].n,
  3,
);
const polines = (
  await db.query("select id,job_reference from po_items where po_id=$1", [po])
).rows;
const quantities = polines.map((l) => ({
  id: l.id,
  quantity: { Jones: 2, Weller: 5, Wilson: 1 }[l.job_reference],
}));
const receipt = "b0000000-0000-0000-0000-000000000001";
await db.query("select receive_purchase_document($1,$2,$3)", [
  po,
  quantities,
  receipt,
]);
await db.query("select receive_purchase_document($1,$2,$3)", [
  po,
  quantities,
  receipt,
]);
assert.equal(
  (await db.query("select status from purchase_orders where id=$1", [po]))
    .rows[0].status,
  "partial",
);
await db.exec("reset role");
assert.equal(
  (
    await db.query(
      "select quantity_on_hand,quantity_available from product_inventory",
    )
  ).rows[0].quantity_on_hand,
  "8",
);
assert.equal(
  (await db.query("select count(*) n from purchase_receipt_lines")).rows[0].n,
  3,
);
await db.exec("set role authenticated");
await assert.rejects(
  db.query("select receive_purchase_document($1,$2,$3)", [
    po,
    [{ id: polines.find((l) => l.job_reference === "Jones").id, quantity: 2 }],
    "b0000000-0000-0000-0000-000000000002",
  ]),
  /Invalid receipt quantity/,
);
await db.query("select receive_purchase_document($1,$2,$3)", [
  po,
  [{ id: polines.find((l) => l.job_reference === "Jones").id, quantity: 1 }],
  "b0000000-0000-0000-0000-000000000003",
]);
assert.equal(
  (await db.query("select status from purchase_orders where id=$1", [po]))
    .rows[0].status,
  "received",
);
await assert.rejects(
  create(true, [foreign], "a0000000-0000-0000-0000-000000000003"),
  /Invalid vendor/,
);
const manual = (
  await db.query(
    "select create_request_purchase_document($1,$2,$3,$4,$5,$6) id",
    [
      [
        {
          product_name: "Catalog item",
          quantity: 2,
          unit_price: 7.5,
          job_reference: "Stock",
        },
      ],
      [va, vb],
      warehouse,
      true,
      { office_id: office },
      "a0000000-0000-0000-0000-000000000005",
    ],
  )
).rows[0].id;
assert.equal(
  (
    await db.query(
      "select quantity,job_reference from po_items where po_id=$1",
      [manual],
    )
  ).rows[0].quantity,
  2,
);
await assert.rejects(
  db.query("select receive_purchase_document($1,$2,$3)", [
    manual,
    [{ id: polines[0].id, quantity: 1 }],
    "b0000000-0000-0000-0000-000000000004",
  ]),
  /Only issued purchase orders/,
);
await db.query("delete from purchase_orders where id=$1", [manual]);
const fresh = "70000000-0000-0000-0000-000000000004";
await db.exec("reset role");
await db.query(
  "insert into product_request_items(id,organization_id,request_id,product_name,vendor,quantity_requested) values($1,$2,$3,$4,$5,$6)",
  [fresh, org, reqs[0], "New request", "Vendor A", 2],
);
await db.exec("set role authenticated");
const freshCreate = async (vendor, retry) =>
  (
    await db.query(
      "select create_request_purchase_document($1,$2,$3,$4,$5,$6) id",
      [
        [{ id: fresh, unit_price: 10, job_reference: "Jones" }],
        [vendor],
        warehouse,
        false,
        { office_id: office },
        retry,
      ],
    )
  ).rows[0].id;
await assert.rejects(
  freshCreate(vb, "a0000000-0000-0000-0000-000000000006"),
  /selected vendor/,
);
const draft = await freshCreate(va, "a0000000-0000-0000-0000-000000000007");
await assert.rejects(
  db.query("select receive_purchase_document($1,$2,$3)", [
    draft,
    [{ id: polines[0].id, quantity: 1 }],
    "b0000000-0000-0000-0000-000000000005",
  ]),
  /Only issued purchase orders/,
);
await db.query("delete from purchase_orders where id=$1", [draft]);
assert.equal(
  (
    await db.query(
      "select purchase_order_id from product_request_items where id=$1",
      [fresh],
    )
  ).rows[0].purchase_order_id,
  null,
);
// Real purchasing RPCs: discontinued RFQ and PO require an explicit purchasing choice.
await db.exec('reset role');
await db.query('update products set is_discontinued=true where id=$1',[product]);
await db.exec('set role authenticated');
const overrideRetry='a0000000-0000-0000-0000-000000000020';
const stockPayload=[{product_id:product,product_name:'Remaining vendor stock',model_number:'OLD',quantity:2,unit_price:10}];
const overrideCreate=override=>db.query('select create_request_purchase_document($1,$2,$3,true,$4,$5) id',[stockPayload,[va],warehouse,{office_id:office,discontinued_override:override},overrideRetry]);
await assert.rejects(overrideCreate(false),/explicitly override/);
await overrideCreate(true);
const overrideLines=(await db.query('select * from po_items where po_id=$1',[overrideRetry])).rows;
assert.equal(overrideLines[0].discontinued_override_by,staff);
await db.query('update purchase_quote_vendors set unit_prices=$1,quoted_at=now() where quote_id=$2',[{[overrideLines[0].id]:10},overrideRetry]);
await assert.rejects(db.query('select convert_purchase_quote($1,$2,false)',[overrideRetry,va]),/explicitly override/);
const overridePO=(await db.query('select convert_purchase_quote($1,$2,true) id',[overrideRetry,va])).rows[0].id;
assert.equal((await db.query('select discontinued_override_by from po_items where po_id=$1',[overridePO])).rows[0].discontinued_override_by,staff);
await db.exec('reset role');await db.query('update products set is_active=false where id=$1',[product]);await db.exec('set role authenticated');
await assert.rejects(db.query('select create_request_purchase_document($1,$2,$3,false,$4,$5)',[stockPayload,[va],warehouse,{office_id:office,discontinued_override:true},'a0000000-0000-0000-0000-000000000021']),/Archived/);
await db.exec(`set test.actor='${viewer}'`);
assert.equal(
  (await db.query("select count(*) n from purchase_orders")).rows[0].n,
  0,
  "Permissionless users cannot read purchasing",
);
await assert.rejects(
  create(true, [va], "a0000000-0000-0000-0000-000000000004"),
  /Purchasing permission/,
);
await db.close();
console.log(
  "RFQ vendor comparison, job-separated PO conversion, permission boundary, atomic receiving and duplicate protection passed.",
);
