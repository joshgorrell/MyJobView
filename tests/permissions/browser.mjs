import { build } from "esbuild";
import {
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  rm,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.USER_SETUP_PLAYWRIGHT_MODULE || "playwright"
);
const directory = await mkdtemp(join(tmpdir(), "mjv-permissions-"));
const fixture = `
window.calls=[];
const roles=[{id:'sales',role_key:'sales',display_name:'Sales Representative',description:'Sales',is_active:true},{id:'tech',role_key:'tech',display_name:'Technician',description:'Tech',is_active:true},{id:'admin',role_key:'admin',display_name:'Administrator',description:'Admin',is_system_role:true,is_active:true},{id:'finance',role_key:'finance',display_name:'Finance',description:'Finance',is_active:true}];
const departments=[{id:'salesdept',display_name:'Sales',is_active:true},{id:'financedept',display_name:'Finance',is_active:true},{id:'admindept',display_name:'Admin',is_active:true}];
const modules=[{id:'invoice1',department_id:'salesdept',module_key:'invoices',display_name:'Invoices',is_active:true},{id:'invoice2',department_id:'financedept',module_key:'invoices',display_name:'Invoices',is_active:true},{id:'feed',department_id:'salesdept',module_key:'feed',display_name:'Flow',is_active:true},{id:'messages',department_id:'salesdept',module_key:'messages',display_name:'Messages',is_active:true},{id:'tasks',department_id:'salesdept',module_key:'tasks',display_name:'My Tasks',is_active:true},{id:'office',department_id:'salesdept',module_key:'by_office',display_name:'By Office',is_active:true},{id:'legacy',department_id:'salesdept',module_key:'tech_status',display_name:'Legacy Dashboard',is_active:false},{id:'settings',department_id:'admindept',module_key:'settings',display_name:'Admin',is_active:true},{id:'preferences',department_id:'admindept',module_key:'preferences',display_name:'My Settings',is_active:true},{id:'payroll',department_id:'financedept',module_key:'payroll',display_name:'Payroll',is_active:true},{id:'pto',department_id:'financedept',module_key:'my_time_off',display_name:'My Time Off',is_active:true}];
let grants=[{role_id:'sales',module_id:'invoice1',has_access:true},{role_id:'sales',module_id:'invoice2',has_access:false},{role_id:'sales',module_id:'feed',has_access:true},{role_id:'tech',module_id:'tasks',has_access:true},{role_id:'finance',module_id:'payroll',has_access:true}];
let overrides=[];let revisions={sales:0,tech:0,admin:0,finance:0};
export const supabase={from(table){const filters=[];let one=false;let operation='select';const result=()=>{let data=({roles,departments,department_modules:modules,role_module_access:grants,user_permission_overrides:overrides,profiles:[{id:'user',role:'sales',employment_classification:location.search.includes('nonemployee')?'non_employee':'employee'}]})[table]||[];for(const [key,value] of filters)data=data.filter(row=>row[key]===value);return Promise.resolve({data:one?(data[0]||null):data,error:null})};const q=new Proxy({},{get(_,key){if(key==='then')return (resolve,reject)=>result().then(resolve,reject);if(key==='eq')return(k,v)=>{filters.push([k,v]);return q};if(key==='single')return()=>{one=true;return result()};return()=>q}});return q},async rpc(name,input){window.calls.push({name,input});if(name==='get_role_page_permissions'){if(input.p_role_id==='tech')await new Promise(r=>setTimeout(r,180));return {data:{revision:revisions[input.p_role_id],modules:grants.filter(g=>g.role_id===input.p_role_id)},error:null}}if(window.failSave)return {error:{message:'Fixture save rejected; no permissions changed'}};if(name==='save_role_page_permissions'){for(const p of input.p_permissions)for(const m of modules.filter(m=>m.module_key===p.module_key)){const old=grants.find(g=>g.role_id===input.p_role_id&&g.module_id===m.id);if(old)old.has_access=p.has_access;else grants.push({role_id:input.p_role_id,module_id:m.id,has_access:p.has_access})}revisions[input.p_role_id]++}if(name==='set_user_page_permissions'){const ids=modules.filter(m=>input.p_module_keys.includes(m.module_key)).map(m=>m.id);overrides=overrides.filter(o=>!ids.includes(o.module_id));if(input.p_has_access!==null)overrides.push(...ids.map(module_id=>({module_id,user_id:'user',override_type:input.p_has_access?'grant':'revoke'})))}return {data:null,error:null}}};`;
const source = `import React from 'react';import{createRoot}from'react-dom/client';import{RolePermissionManagement}from'./src/components/Admin/RolePermissionManagement';import{UserModuleAccess}from'./src/components/Admin/UserModuleAccess';createRoot(document.getElementById('root')).render(location.search.includes('user')?<UserModuleAccess userId="user" userName="Michael" userRoleId="sales" onClose={()=>{window.didClose=true}}/>:<RolePermissionManagement/>);`;
let browser;
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
          b.onResolve({ filter: /lib\/supabase$/ }, () => ({
            path: "fixture",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: fixture,
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
    '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root" style="padding:16px"></div><script src="app.js"></script></body></html>',
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
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url);
    const invoice = page.getByRole("checkbox", {
      name: "Invoices",
      exact: true,
    });
    await invoice.waitFor();
    assert.equal(await invoice.count(), 1);
    assert.equal(await invoice.isChecked(), true);
    if (width === 390 && process.env.PERMISSION_SCREENSHOTS) {
      await mkdir(process.env.PERMISSION_SCREENSHOTS, { recursive: true });
      await page.screenshot({
        path: join(process.env.PERMISSION_SCREENSHOTS, "role-phone.png"),
        fullPage: true,
      });
    }
    for (const label of ["By Office", "Legacy Dashboard", "My Settings"])
      assert.equal(
        await page.getByRole("checkbox", { name: label, exact: true }).count(),
        0,
      );
    assert.equal(
      await page
        .getByRole("checkbox", { name: "System Administration" })
        .isEnabled(),
      false,
    );
    await page.getByLabel("Role to configure").selectOption("tech");
    await page.getByLabel("Role to configure").selectOption("sales");
    await page.waitForTimeout(250);
    assert.equal(await invoice.isChecked(), true);
    await invoice.uncheck();
    await page.evaluate(() => (window.failSave = true));
    await page
      .getByRole("button", { name: "Save Permissions", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Fixture save rejected" })
      .waitFor();
    assert.equal(await invoice.isChecked(), false);
    await page.evaluate(() => (window.failSave = false));
    await page
      .getByRole("button", { name: "Save Permissions", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Permissions saved" })
      .waitFor();
    assert.ok(
      await page.evaluate(() =>
        window.calls.some(
          (c) =>
            c.name === "save_role_page_permissions" &&
            c.input.p_permissions.filter((p) => p.module_key === "invoices")
              .length === 1,
        ),
      ),
    );
    await page
      .getByRole("button", { name: "View Matrix", exact: true })
      .click();
    assert.equal(
      await page.getByRole("cell", { name: "Invoices", exact: true }).count(),
      1,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page
      .getByRole("button", { name: "Edit Permissions", exact: true })
      .click();
    await page.getByLabel("Role to configure").selectOption("admin");
    await page
      .getByText("Administrator page defaults cannot be unchecked.")
      .waitFor();
    assert.equal(await invoice.isEnabled(), false);
    await page.goto(url + "/?user");
    await page.getByRole("button", { name: /Sales ·/ }).click();
    const userInvoice = page.getByRole("button", {
      name: "Access Invoices",
      exact: true,
    });
    assert.equal(await userInvoice.getAttribute("aria-pressed"), "true");
    await userInvoice.click();
    await page.waitForFunction(() =>
      window.calls.some(
        (c) =>
          c.name === "set_user_page_permissions" &&
          c.input.p_has_access === false,
      ),
    );
    await page.getByRole("button", { name: /Sales ·/ }).waitFor();
    await page.waitForFunction(
      () =>
        !document.body.textContent.includes("Loading saved page permissions"),
    );
    assert.equal(await userInvoice.getAttribute("aria-pressed"), "false");
    await page
      .getByRole("button", { name: "Use Role Default", exact: true })
      .click();
    await page.waitForFunction(() =>
      window.calls.some(
        (c) =>
          c.name === "set_user_page_permissions" &&
          c.input.p_has_access === null,
      ),
    );
    await page.waitForFunction(
      () =>
        !document.body.textContent.includes("Loading saved page permissions"),
    );
    assert.equal(await userInvoice.getAttribute("aria-pressed"), "true");
    const dialog = page.getByRole("dialog");
    assert.equal(
      await dialog.evaluate((el) => el.scrollHeight >= el.clientHeight),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    if (width === 390 && process.env.PERMISSION_SCREENSHOTS)
      await page.screenshot({
        path: join(process.env.PERMISSION_SCREENSHOTS, "user-phone.png"),
        fullPage: true,
      });
    await page.getByRole("button", { name: "Close page access" }).click();
    assert.equal(await page.evaluate(() => window.didClose), true);
  }
  await page.goto(url + "/?user&nonemployee");
  await page.getByRole("button", { name: /Finance ·/ }).click();
  assert.equal(
    await page.getByRole("button", { name: "Access My Time Off" }).isEnabled(),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Roles and unified user permissions passed on desktop, iPad and 390px phone: stale loads, canonical invoice, hidden legacy pages, atomic RPC feedback, matrix refresh, admin rules, exceptions/reset, and non-employee PTO.",
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await rm(directory, { recursive: true, force: true });
}
