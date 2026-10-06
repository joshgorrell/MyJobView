import { build } from "esbuild";
import { mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";
import assert from "node:assert/strict";
const directory = await mkdtemp(join(tmpdir(), "purchasing-"));
const fixture = `export const useAuth=()=>({profile:{organization_id:'org',can_create_purchase_orders:true}});
window.saved=[];const lines=['Jones','Weller','Wilson'].map((job_reference,n)=>({id:'line'+n,product_name:'Same Product',model_number:'MODEL',quantity:[3,5,1][n],quantity_requested:[3,5,1][n],unit_price:10,estimated_cost:[30,50,10][n],job_reference,vendor:'Vendor A'}));
const vendors=[{id:'a',vendor_name:'Vendor A'},{id:'b',vendor_name:'Vendor B'}];let bids=vendors.map(v=>({id:'bid'+v.id,vendor_id:v.id,unit_prices:{},shipping_cost:0,tax_amount:0,quoted_at:null}));
const doc=()=>({id:'quote',document_type:'rfq',po_number:'PO-100',status:'draft',bill_to_name:'HQ',ship_to_name:'Warehouse',po_items:lines,purchase_quote_vendors:bids,converted:[]});
export const supabase={rpc:async(name,args)=>{window.saved.push({name,args});return{data:args.p_quote?'quote':'po',error:null};},functions:{invoke:async(name,args)=>{window.saved.push({name,args});return{data:{},error:null};}},from(table){let id;let patch;const q={select:()=>q,eq:(k,v)=>{if(k==='id')id=v;return q;},in:()=>q,order:()=>q,update:p=>{patch=p;return q;},single:async()=>({data:id==='po'?{...doc(),document_type:'po',vendors:{vendor_name:'Vendor B'},total:97}:doc(),error:null}),then:resolve=>{if(patch){bids=bids.map(b=>b.id===id?{...b,...patch}:b);window.saved.push({name:'saveBid',patch});}return Promise.resolve({data:table==='vendors'?vendors:table==='warehouses'?[{id:'warehouse',name:'Main'}]:table==='company_offices'?[{id:'office',office_name:'HQ',is_headquarters:true}]:table==='product_request_items'?lines:[],error:null}).then(resolve);}};return q;}};`;
const source = `import React from 'react';import{createRoot}from'react-dom/client';import{PurchasingDocumentModal}from'./src/components/Inventory/PurchasingDocumentModal';const compare=new URLSearchParams(location.search).has('compare');createRoot(document.getElementById('root')).render(<PurchasingDocumentModal documentId={compare?'quote':undefined} requestItems={['Jones','Weller','Wilson'].map((job_reference,n)=>({id:'line'+n,job_reference}))} onClose={()=>{}} onSuccess={()=>{}}/>);`;
let browser;
const failures = [];
const server = createServer(async (req, res) => {
  const name = req.url.includes("app.js")
    ? "app.js"
    : req.url.includes("style.css")
      ? "style.css"
      : "index.html";
  res.setHeader(
    "Content-Type",
    name.endsWith(".js")
      ? "text/javascript"
      : name.endsWith(".css")
        ? "text/css"
        : "text/html",
  );
  res.end(await readFile(join(directory, name)));
});
try {
  await build({
    stdin: { contents: source, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true,
    format: "iife",
    jsx: "automatic",
    outfile: join(directory, "app.js"),
    plugins: [
      {
        name: "fixture",
        setup(b) {
          b.onResolve(
            { filter: /lib\/supabase$|contexts\/AuthContext$/ },
            () => ({ path: "fixture", namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: fixture,
            loader: "tsx",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  const css = (await readdir("dist/assets")).find(
    (p) => p.startsWith("index-") && p.endsWith(".css"),
  );
  await writeFile(
    join(directory, "style.css"),
    await readFile("dist/assets/" + css),
  );
  await writeFile(
    join(directory, "index.html"),
    '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>',
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.CHROMIUM_EXECUTABLE,
          args: ["--no-sandbox"],
        }
      : {}),
  });
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", (e) => failures.push(e.message));
    const url = "http://127.0.0.1:" + server.address().port;
    await page.goto(url);
    await page.getByRole("cell", { name: "Jones", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("cell", { name: "Same Product MODEL" }).count(),
      3,
    );
    await page
      .getByRole("button", { name: "Request Quotes", exact: true })
      .click();
    await page.getByLabel("Vendor B").check();
    await page.getByRole("button", { name: "Save Quote Request" }).click();
    const created = await page.evaluate(() => window.saved[0]);
    assert.equal(created.name, "create_request_purchase_document");
    assert.equal(created.args.p_quote, true);
    assert.deepEqual(created.args.p_vendor_ids, ["a", "b"]);
    assert.deepEqual(
      created.args.p_items.map((l) => l.job_reference),
      ["Jones", "Weller", "Wilson"],
    );
    await page.goto(url + "?compare");
    await page.getByRole("heading", { name: "Vendor quotes" }).waitFor();
    const cards = page.locator("section");
    assert.equal(await cards.count(), 2);
    assert.ok(
      await cards
        .nth(1)
        .getByRole("button", { name: "Select Vendor & Create PO" })
        .isDisabled(),
    );
    for (const [n, job] of ["Jones", "Weller", "Wilson"].entries())
      await page
        .getByLabel("Quote price b " + job, { exact: true })
        .fill(String([10, 9, 8][n]));
    await cards.nth(1).getByLabel("Shipping cost").fill("12");
    await cards.nth(1).getByLabel("Tax amount").fill("2");
    await cards
      .nth(1)
      .getByRole("button", { name: "Save Vendor Quote" })
      .click();
    await cards
      .nth(1)
      .getByRole("button", { name: "Select Vendor & Create PO" })
      .waitFor();
    await page.waitForFunction(() =>
      document.querySelectorAll("section")[1].textContent.includes("$97.00"),
    );
    await cards
      .nth(1)
      .getByRole("button", { name: "Select Vendor & Create PO" })
      .click();
    await page.getByRole("button", { name: "Email PO to Vendor B" }).waitFor();
    assert.equal(
      await page.evaluate(() => window.saved.at(-1).args.p_vendor_id),
      "b",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.close();
  }
  assert.deepEqual(failures, []);
  console.log(
    "Purchasing browser passed at mobile and desktop widths: combined lines, multi-vendor RFQ, saved quote comparison and conversion.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
