import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(join(tmpdir(), "loss-feedback-browser-"));
const fixtures = `const org='org1';const base={organization_id:org,created_by:'rep1',created_by_name:'Sales rep',status:'declined',total:1000,declined_at:'2026-09-20T12:00:00Z'};
const tables={proposal_activity:[],
 proposals:[{...base,id:'p1',proposal_number:'P1',title:'Theater',decline_reason:'no_response',declined_by:'rep',contact:{full_name:'Customer One'}}, {...base,id:'p2',proposal_number:'P2',total:2000,status:'archived',archived_loss_status:'declined',declined_at:'2026-10-03T12:00:00Z',contact:{full_name:'Needs Feedback'}}, {...base,id:'p3',proposal_number:'P3',total:99999,status:'cancelled',decline_reason:'duplicate'}, {...base,id:'p5',proposal_number:'P5',total:3000,declined_at:'2026-10-19T12:00:00Z',decline_reason:'price_too_high',declined_by:'customer',contact:{full_name:'Portal Customer'}}, {...base,id:'p6',proposal_number:'P6',status:'archived',archived_loss_status:'cancelled',total:99999}, {...base,id:'p8',proposal_number:'P8',status:'sent',declined_at:null,total:500,contact:{full_name:'Linked loss pending status'}}],
 proposal_loss_feedback:[{id:'m1',organization_id:org,proposal_id:'p1',source:'staff_assessment',reasons:['timing'],notes:'Staff opinion',created_at:'2026-10-15T12:00:00Z'}],
 lost_review_details:[{request_id:'r1',organization_id:org,proposal_id:'p1'},{request_id:'r2',organization_id:org,proposal_id:'p1'},{request_id:'r3',organization_id:org,proposal_id:null,opportunity_name:'External quote'},{request_id:'r8',organization_id:org,proposal_id:'p8'}],
 review_requests:[{id:'r1',organization_id:org,request_type:'lost_opportunity',sent_at:'2026-09-21T12:00:00Z'},{id:'r2',organization_id:org,request_type:'lost_opportunity',sent_at:'2026-09-25T12:00:00Z'},{id:'r3',organization_id:org,request_type:'lost_opportunity',sent_at:'2026-10-01T12:00:00Z',recipient_name:'External Customer'},{id:'r8',organization_id:org,request_type:'lost_opportunity',sent_at:'2026-10-01T12:00:00Z'}],
 lost_review_responses:[{request_id:'r1',reasons:['company'],message:'Earlier answer',source:'customer',created_at:'2026-09-22T12:00:00Z'},{request_id:'r2',reasons:['price'],message:'Customer confirmed price',source:'customer',created_at:'2026-10-01T12:00:00Z'},{request_id:'r3',reasons:['design'],message:'Different design',source:'customer',created_at:'2026-10-02T12:00:00Z'},{request_id:'r8',reasons:['communication'],message:'Slow follow-up',source:'customer',created_at:'2026-10-02T12:00:00Z'}]};
window.savedFeedback=[];window.rpcCalls=[];window.endpointCalls=[];
export const supabase={functions:{invoke:async(name,{body})=>{window.endpointCalls.push(body);return {data:{success:true},error:null};}},rpc:async(name,args)=>{window.rpcCalls.push({name,args});return {data:'new-feedback',error:null};},from(table){let filters=[],offset=0,end=Infinity,insert;const q={throwOnError:()=>q,select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},in:(k,v)=>{filters.push(r=>v.includes(r[k]));return q;},order:()=>q,range:(a,b)=>{offset=a;end=b;return q;},insert:v=>{insert=v;return q;},then(resolve,reject){return Promise.resolve().then(()=>{if(insert){if(window.failFeedback)return {error:{message:'Save failed; try again'}};const row={...insert,id:'saved',recorded_by:'admin1',created_at:new Date().toISOString()};tables[table].push(row);window.savedFeedback.push(row);return {data:null,error:null};}return {data:tables[table].filter(r=>filters.every(f=>f(r))).slice(offset,end+1),error:null};}).then(resolve,reject);}};return q;}};
export const useAuth=()=>({profile:{id:'admin1',organization_id:org,role:'admin',can_view_lost_opportunity_submissions:true}});`;
const source = `import React from 'react';import {createRoot} from 'react-dom/client';import {DeclinedProposalsReport} from './src/components/Sales/DeclinedProposalsReport';import {DeclineProposalModal} from './src/components/Proposals/DeclineProposalModal';import {RecordLostFeedback} from './src/components/Reviews/RecordLostFeedback';function Harness(){const [open,setOpen]=React.useState(false);return <><button onClick={()=>setOpen(true)}>Initial decline</button><DeclinedProposalsReport/>{open&&<DeclineProposalModal proposalId="initial-proposal" proposalNumber="P7" customerName="New loss" mode="decline" onClose={()=>setOpen(false)} onSuccess={()=>setOpen(false)}/>}<RecordLostFeedback requestId="external-request" onSaved={()=>window.manualSaved=true}/></>};createRoot(document.getElementById('root')).render(<Harness/>);`;
let browser;
const server = createServer(async (req, res) => {
  const name =
    req.url === "/app.js"
      ? "app.js"
      : req.url === "/style.css"
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
  res.end(await readFile(join(dir, name)));
});
try {
  await build({
    stdin: { contents: source, loader: "tsx", resolveDir: process.cwd() },
    bundle: true,
    format: "iife",
    jsx: "automatic",
    outfile: join(dir, "app.js"),
    plugins: [
      {
        name: "fixtures",
        setup(b) {
          b.onResolve({ filter: /AuthContext$|supabase$/ }, () => ({
            path: "fixtures",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: fixtures,
            loader: "js",
          }));
        },
      },
    ],
  });
  const css = (await readdir("dist/assets")).find(
    (n) => n.startsWith("index-") && n.endsWith(".css"),
  );
  await writeFile(join(dir, "style.css"), await readFile("dist/assets/" + css));
  await writeFile(
    join(dir, "index.html"),
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"></head><body style="background:#111827"><div id="root"></div><script src="app.js"></script></body></html>',
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  for (const width of [375, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page
      .getByRole("heading", { name: "Proposals and feedback (5)" })
      .waitFor();
    const table = page.getByRole("table", { name: "Loss reasons" });
    await table
      .getByRole("row")
      .filter({ hasText: "Price too high" })
      .getByRole("cell", { name: "2", exact: true })
      .waitFor();
    assert.ok(!(await table.innerText()).includes("Project postponed"));
    assert.ok(!(await page.locator("body").innerText()).includes("$99,999"));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.getByLabel("Loss date range").selectOption("last_month");
    await page
      .getByRole("heading", { name: "Proposals and feedback (1)" })
      .waitFor();
    await page.getByLabel("Loss date range").selectOption("this_year");
    await page.getByLabel("Feedback status").selectOption("needed");
    await page.getByRole("button", { name: /Needs Feedback/ }).click();
    await page
      .getByRole("button", {
        name: "Record customer call / feedback",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", { name: "Record loss feedback" });
    await dialog.getByLabel("Chose another company", { exact: true }).check();
    await dialog
      .getByLabel("Customer comments / notes")
      .fill("Customer confirmed by phone");
    await page.evaluate(() => (window.failFeedback = true));
    await dialog
      .getByRole("button", { name: "Save feedback", exact: true })
      .click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(
      await dialog.getByLabel("Customer comments / notes").inputValue(),
      "Customer confirmed by phone",
    );
    await page.evaluate(() => (window.failFeedback = false));
    await dialog
      .getByRole("button", { name: "Save feedback", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => window.savedFeedback.length), 1);
    assert.equal(
      await page.evaluate(() => window.savedFeedback[0].source),
      "phone",
    );
    await page.getByLabel("Feedback status").selectOption("all");
    await page
      .getByRole("heading", { name: "Proposals and feedback (5)" })
      .waitFor();
    await page
      .getByText("Customer confirmed by phone", { exact: true })
      .waitFor();
    if (process.env.LOSS_FEEDBACK_SCREENSHOTS)
      await page.screenshot({
        path: join(
          process.env.LOSS_FEEDBACK_SCREENSHOTS,
          "report-" + width + ".png",
        ),
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Initial decline", exact: true })
      .click();
    await page.getByLabel("Decline feedback source").selectOption("phone");
    await page.locator("select").last().selectOption("price_too_high");
    await page
      .getByRole("button", { name: "Mark as Declined", exact: true })
      .click();
    await page
      .getByLabel("Decline feedback source")
      .waitFor({ state: "detached" });
    assert.equal(
      await page.evaluate(() => window.rpcCalls[0].name),
      "record_proposal_decline",
    );
    assert.equal(
      await page.evaluate(() => window.rpcCalls[0].args.p_source),
      "phone",
    );
    await page
      .getByRole("button", {
        name: "Record customer feedback",
        exact: true,
      })
      .click();
    await page.getByLabel("Customer feedback source").selectOption("in_person");
    await page.getByLabel("Price was too high", { exact: true }).check();
    await page.getByLabel("Recovery opportunity").selectOption("no");
    await page
      .getByRole("button", { name: "Save customer feedback", exact: true })
      .click();
    await page.waitForFunction(() => window.manualSaved === true);
    assert.equal(
      await page.evaluate(() => window.endpointCalls[0].source),
      "in_person",
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Phone/desktop browser checks passed: deduplication, source priority, archived and linked losses, cancellations, date filtering, call entry, failed-save recovery, initial decline and external feedback.",
  );
} finally {
  await browser?.close();
  server.close();
  await rm(dir, { recursive: true, force: true });
}
