import { build } from "esbuild";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const directory = await mkdtemp(join(tmpdir(), "mjv-production-"));
const fixture = `
const role=new URLSearchParams(location.search).get('role')||'admin';
export const useAuth=()=>({profile:{id:'admin',organization_id:'org',role},loading:false});
export const getOrganizationTimezone=async()=> 'America/Chicago';
window.requests=[];window.fail=false;
const roster=[{id:'a',name:'Ada Carter'},{id:'b',name:'Ben Wilson'},{id:'c',name:'Casey Miller'}];
const bundle={timezone:'America/Chicago',roster,configs:roster.map(p=>({profile_id:p.id,compensation_type:'hourly',expected_weekly_hours:40,effective_from:'2026-01-01',work_days:null})),mappings:roster.flatMap((p,i)=>[{profile_id:p.id,source:'ipoint',external_employee_id:p.name},{profile_id:p.id,source:'quickbooks_time',external_employee_id:String(i+1)}]),sources:[{source:'ipoint',native_from:'2026-10-21'},{source:'quickbooks_time',native_from:'2026-10-21'}],holidays:[],snapshots:[],native_jobs:[],native_payroll:[],project_snapshot:null,native_projects:[],latest_job_day:'2026-10-22',latest_payroll_day:'2026-10-22'};
for(let day=12;day<=22;day++) { const date='2026-10-'+day; bundle.snapshots.push({kind:'technician',day:date,payload:{records:[{technician:roster[0].name,job_hours:7.41666666667},{technician:roster[1].name,job_hours:9}]}},{kind:'payroll',day:date,payload:{records:[{user_id:1,worked_hours:8,leave_hours:0,unknown_hours:0,flags:[]},{user_id:2,worked_hours:12,leave_hours:0,unknown_hours:0,flags:[]}]}}); if(day>=21)for(const [i,p]of roster.slice(0,2).entries()){bundle.native_jobs.push({profile_id:p.id,day:date,hours:i?9:7.41666666667});bundle.native_payroll.push({profile_id:p.id,day:date,hours:i?12:8,leave_hours:0,needs_review:false});} }
const entries=[{id:'entry-1',technician_id:'a',entry_date:'2026-10-22',clock_in:'2026-10-22T13:00:00Z',clock_out:'2026-10-22T20:25:00Z',total_hours:7.416666666667,notes:'Completed installation and customer walkthrough.',work_order_id:'wo-1',project_id:'project-1',contact_id:'contact-1',work_order:{title:'Living room installation',work_order_number:'WO-1042'},project:{name:'Home theater'},contact:{full_name:'Sample Customer',company_name:''}}];
export const supabase={auth:{onAuthStateChange(){}},rpc(name,args){window.requests.push({name,args});return{abortSignal:async()=>{await new Promise(r=>setTimeout(r,80));return{data:bundle,error:window.fail?{message:'Test report unavailable'}:null};}};},from(table){const filters={};let offset=0;const q={select(){return q;},eq(k,v){filters[k]=v;return q;},in(){return q;},gte(){return q;},lte(){return q;},or(){return q;},not(){return q;},order(){return q;},range(from){offset=from;return q;},abortSignal(){return q;},then(resolve,reject){window.requests.push({table,filters});let data=table==='profiles'?roster.map(p=>({id:p.id,full_name:p.name,employment_type:'hourly'})):table==='time_entries'?entries:table==='daily_clock_entries'?[{id:'clock',technician_id:'a',entry_date:'2026-10-22',total_hours:8,status:'clocked_out',leave_type:null}]:[];return Promise.resolve({data:offset?[]:data,error:null}).then(resolve,reject);}};return q;}};
`;
const source = `import React from 'react';import{createRoot}from'react-dom/client';import Stats from './src/components/Production/TechProductionStats';document.documentElement.dataset.theme=new URLSearchParams(location.search).get('theme')||'light';createRoot(document.getElementById('root')).render(<div className="theme-workspace min-h-screen bg-elevated"><Stats/></div>);`;
const server = createServer(async (req, res) => {
  const file = req.url.startsWith("/app.js")
    ? "app.js"
    : req.url.startsWith("/style.css")
      ? "style.css"
      : "index.html";
  res.setHeader(
    "Content-Type",
    file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".css")
        ? "text/css"
        : "text/html",
  );
  res.end(await readFile(join(directory, file)));
});
let browser;
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
            {
              filter:
                /lib\/supabase$|contexts\/AuthContext$|\.\/supabase$|timezoneUtils$/,
            },
            () => ({ path: "fixture", namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: fixture,
            loader: "js",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  const css = (await readdir("dist/assets")).find(
    (file) => file.startsWith("index-") && file.endsWith(".css"),
  );
  await writeFile(
    join(directory, "style.css"),
    await readFile("dist/assets/" + css),
  );
  await writeFile(
    join(directory, "index.html"),
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox"],
  });
  const screenshots = "/tmp/mjv-tech-production-validation";
  await mkdir(screenshots, { recursive: true });
  for (const theme of ["light", "dark"])
    for (const width of [390, 1440]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        colorScheme: theme,
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.clock.install({ time: new Date("2026-10-23T15:00:00Z") });
      await page.goto(
        "http://127.0.0.1:" + server.address().port + "/?theme=" + theme,
      );
      await page
        .getByRole("heading", { name: "Technician rankings", exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () =>
            window.requests.filter((r) => r.name === "get_tech_production")
              .length,
        ),
        1,
      );
      assert.ok(
        !/payroll|bonus|travel|leave balance|needs review/i.test(
          await page.locator("body").innerText(),
        ),
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "overview fits viewport",
      );
      await page.screenshot({
        path: join(screenshots, theme + "-" + width + "-overview.png"),
        fullPage: true,
      });
      await page
        .getByRole("combobox", { name: "Trend grouping" })
        .selectOption("week");
      await page
        .getByRole("combobox", { name: "Trend grouping" })
        .selectOption("day");
      const rankings = page.getByRole("region", {
        name: "Technician rankings",
      });
      assert.match(
        await rankings.getByRole("button").first().innerText(),
        /Ada Carter/,
      );
      await page
        .getByRole("combobox", { name: "Rank technicians by" })
        .selectOption("job");
      assert.match(
        await rankings.getByRole("button").first().innerText(),
        /Ben Wilson/,
      );
      await page
        .getByRole("textbox", { name: "Search technicians" })
        .fill("Ada");
      assert.equal(await rankings.getByRole("button").count(), 1);
      await rankings.getByRole("button").first().click();
      await page
        .getByRole("heading", { name: "Ada Carter", exact: true })
        .waitFor();
      await page.getByText("Loading job entries…", { exact: true }).waitFor({ state: "hidden" });
      await page.locator("summary").filter({ hasText: "Oct 22, 2026" }).click();
      await page
        .getByRole("heading", { name: "Living room installation" })
        .waitFor();
      assert.match(
        await page
          .getByRole("link", { name: "Open work order" })
          .getAttribute("href"),
        /workOrderId=wo-1/,
      );
      assert.ok((await page.locator("body").innerText()).includes("7h 25m"));
      assert.ok(!(await page.locator("body").innerText()).includes("7.416666"));
      await page.locator("summary").filter({ hasText: "Oct 20, 2026" }).click();
      await page
        .getByText("Historical reports provide daily totals.", { exact: false })
        .first()
        .waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "detail fits viewport",
      );
      await page.screenshot({
        path: join(screenshots, theme + "-" + width + "-detail.png"),
        fullPage: true,
      });
      await page.emulateMedia({ media: "print" });
      assert.equal(await page.locator(".tech-stats-print").isVisible(), true);
      assert.equal(await page.locator("#root").isVisible(), false);
      await page.emulateMedia({ media: "screen" });
      await page.getByRole("button", { name: "All technicians" }).click();
      assert.equal(
        await page.evaluate(
          () =>
            window.requests.filter((r) => r.name === "get_tech_production")
              .length,
        ),
        1,
        "sort, search, detail do not reload the report",
      );
      if (theme === "light" && width === 390) {
        await page.evaluate(() => { window.fail = true; });
        await page.getByRole("button", { name: "Refresh", exact: true }).click();
        await page.getByRole("alert").filter({hasText: "Test report unavailable"}).waitFor();
        assert.equal(await page.getByRole("heading", {name: "Technician rankings", exact: true}).count(), 1, "refresh failure preserves same-date data");
        await page.evaluate(() => { window.fail = false; });
        await page.getByRole("button", {name: "Retry loading"}).click();
        await page.getByRole("alert").waitFor({state: "hidden"});
      }
      await page.getByRole("button", { name: "Custom", exact: true }).click();
      await page.getByLabel("Report start date").fill("2026-10-23");
      await page
        .getByRole("alert")
        .filter({ hasText: "Choose a completed date range" })
        .waitFor();
      assert.equal(
        await page
          .getByRole("heading", { name: "Technician rankings", exact: true })
          .count(),
        0,
        "invalid dates do not show a stale report",
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
  const staff = await browser.newPage();
  await staff.clock.install({ time: new Date("2026-10-23T15:00:00Z") });
  await staff.goto("http://127.0.0.1:" + server.address().port + "/?role=tech");
  await staff
    .getByRole("heading", { name: "Technician rankings", exact: true })
    .waitFor();
  assert.equal(
    await staff.evaluate(() => window.requests.filter((r) => r.name === "get_tech_production").length),
    1,
    "authorized staff use the same permission-checked production RPC",
  );
  await staff.close();
  console.log(
    "Production browser: mobile/desktop, light/dark, ranking order, search, job links, clean duration, historical limitations, print, invalid dates and shared permission-checked staff reporting passed. Screenshots: " +
      screenshots,
  );
} finally {
  await browser?.close();
  server.close();
  await rm(directory, { recursive: true, force: true });
}
