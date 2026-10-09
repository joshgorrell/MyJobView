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
const { chromium } = await import(
  process.env.USER_SETUP_PLAYWRIGHT_MODULE || "playwright"
);
const dir = await mkdtemp(join(tmpdir(), "mjv-flow-workspace-"));
const fixture = `import{useState}from'react';export const useAuth=()=>({profile:{id:'rep',organization_id:'org',full_name:'Josh'},user:{id:'rep'}});export const useDepartments=()=>({hasModuleAccess:()=>true});window.calls=[];window.fail=false;
const records=Array.from({length:50},(_,i)=>({id:i+1,created_at:new Date(Date.now()-i*60000).toISOString(),customer_name:'Customer with a long company name '+i,project_name:'Home theater project',actor_name:'Josh Gorrell',category:'sales',source_table:'connections',source_id:'interaction-'+i,summary:'Phone call: a longer note about the next steps for the customer',details:'Original notes',viewed:false}));
export function useFlow(filters){const [events,setEvents]=useState(records);return{events,loading:false,loadingMore:false,hasMore:false,error:'',pending:0,connected:true,refresh:async()=>window.calls.push({name:'refresh'}),markViewed:async(ids)=>setEvents(old=>old.map(e=>ids.includes(e.id)?{...e,viewed:true}:e))};}
export const supabase={from(table){const q=new Proxy({},{get(_,key){if(key==='then')return(a,b)=>Promise.resolve({data:[],error:null}).then(a,b);return()=>q;}});return q;},channel(){const c={on(){return c},subscribe(){return c},unsubscribe(){}};return c;},removeChannel(){},async rpc(name,input){window.calls.push({name,input});if(name==='search_flow_targets')return{data:[{kind:'contact',id:'c1',label:'Test Customer'}],error:null};if(name==='get_flow_followups')return{data:{items:[{id:'reminder1',kind:'reminder',contact_id:'c1',label:'Test Customer',type:'call',due:new Date().toISOString(),reason:'Discuss next steps'}],schedules:[{id:'schedule1',label:'Test Customer',recurrence_pattern:'weekly',is_active:true}]},error:null};return window.fail?{error:{message:'Fixture save rejected'}}:{data:'new',error:null};}};`;
const source = `import React from'react';import{createRoot}from'react-dom/client';import Flow from'./src/components/Flow/Flow';createRoot(document.getElementById('root')).render(<Flow/>);`;
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
  res.end(await readFile(join(dir, file)));
});
let browser;
try {
  await build({
    stdin: { contents: source, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true,
    format: "iife",
    jsx: "automatic",
    outfile: join(dir, "app.js"),
    plugins: [
      {
        name: "fixture",
        setup(b) {
          b.onResolve(
            {
              filter:
                /contexts\/(AuthContext|DepartmentContext)$|supabase$|lib\/flow\/useFlow$/,
            },
            () => ({ path: "fixture", namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: fixture,
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
    join(dir, "style.css"),
    (await readFile("dist/assets/" + css, "utf8")) +
      "\n" +
      (await readFile(join(dir, "app.css"), "utf8")),
  );
  await writeFile(
    join(dir, "index.html"),
    '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"><style>body{margin:0}.shell{height:100dvh;display:flex;flex-direction:column}header.chrome{height:100px;flex-shrink:0}.workspace{display:flex;flex:1;min-height:0}aside{width:256px;flex-shrink:0}main{min-width:0;flex:1;overflow:auto;padding:16px}main>#root{min-width:0}@media(max-width:800px){aside{display:none}}</style></head><body><div class="shell theme-workspace"><header class="chrome">Application header and bookmarks</header><div class="workspace"><aside>Department sidebar</aside><main><div id="root"></div></main></div></div><script src="app.js"></script></body></html>',
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [1280, 600],
    [1024, 768],
    [768, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(url);
    await page.locator(".flow-row").first().waitFor();
    await page.waitForTimeout(150);
    const bounds = await page.evaluate(() => ({
      card: document.querySelector(".flow").getBoundingClientRect().toJSON(),
      main: document.querySelector("main").getBoundingClientRect().toJSON(),
      scroll: document.querySelector(".flow-content").scrollHeight,
      client: document.querySelector(".flow-content").clientHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.equal(bounds.overflow, false);
    assert.ok(
      bounds.card.bottom <= bounds.main.bottom,
      JSON.stringify({ width, bounds }),
    );
    assert.ok(bounds.client > 200, JSON.stringify({ width, bounds }));
    assert.ok(bounds.scroll > bounds.client);
    const plus = page.getByRole("button", {
      name: "Create in Flow",
      exact: true,
    });
    await plus.click();
    const dialog = page.getByRole("dialog", {
      name: "Create in Flow",
      exact: true,
    });
    await dialog.waitFor();
    assert.equal(
      await dialog.getByRole("button", { name: /Internal chat/ }).count(),
      1,
    );
    await page.waitForTimeout(250);
    const box = await dialog.boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.x + box.width <= width &&
        box.y >= 0 &&
        box.y + box.height <= height + 1,
      JSON.stringify({ width, height, box }),
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(
      await plus.evaluate((el) => document.activeElement === el),
      true,
    );
    await plus.click();
    await page.getByRole("button", { name: /Log interaction Calls/ }).click();
    await page
      .getByRole("textbox", { name: "Find a customer, project, or work order" })
      .fill("Test");
    await page.getByRole("button", { name: "Test Customer contact" }).click();
    const notes = page.getByRole("textbox", { name: "Interaction notes" });
    await notes.fill("Customer asked for the next steps");
    await page.getByLabel("Follow-up date (optional)").fill("2026-10-20");
    await page.getByLabel("Repeat", { exact: true }).selectOption("weekly");
    await page.evaluate(() => (window.fail = true));
    await page
      .getByRole("button", { name: "Save interaction", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Fixture save rejected" })
      .waitFor();
    assert.equal(await notes.inputValue(), "Customer asked for the next steps");
    await page.evaluate(() => (window.fail = false));
    await page
      .getByRole("button", { name: "Save interaction", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.ok(
      await page.evaluate(() =>
        window.calls.some(
          (c) =>
            c.name === "save_flow_interaction" &&
            c.input.p_repeat === "weekly" &&
            c.input.p_scope.contact_id === "c1",
        ),
      ),
    );
    if (
      await page
        .getByRole("tab", { name: "Follow-ups", exact: true })
        .isVisible()
    )
      await page.getByRole("tab", { name: "Follow-ups", exact: true }).click();
    else
      await page
        .getByRole("combobox", { name: "Flow view", exact: true })
        .selectOption("followups");
    await page.getByRole("button", { name: "Complete", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Interaction notes" })
      .fill("Called customer back");
    await page
      .getByRole("button", { name: "Complete follow-up", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.ok(
      await page.evaluate(() =>
        window.calls.some(
          (c) =>
            c.name === "complete_flow_followup" && c.input.p_id === "reminder1",
        ),
      ),
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.waitForFunction(() =>
      window.calls.some(
        (c) =>
          c.name === "set_flow_schedule_active" && c.input.p_active === false,
      ),
    );
    if (process.env.FLOW_SCREENSHOT_DIR) {
      await mkdir(process.env.FLOW_SCREENSHOT_DIR, { recursive: true });
      await page.goto(url);
      await page.locator(".flow-row").first().waitFor();
      await page.screenshot({
        path: join(
          process.env.FLOW_SCREENSHOT_DIR,
          "flow-workspace-" + width + ".png",
        ),
      });
      await plus.click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: join(
          process.env.FLOW_SCREENSHOT_DIR,
          "flow-create-" + width + ".png",
        ),
      });
    }
    console.log(
      width +
        "x" +
        height +
        ": workspace/sidebar fit, scrolling, modal/focus, retained errors, logging and follow-ups passed",
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
