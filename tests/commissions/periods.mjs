import ts from "typescript";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const source = await readFile("src/lib/commissionPeriods.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { commissionPeriods } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);
const weekly = commissionPeriods("weekly", "2026-07-03", "2026-10-02");
assert.equal(weekly[0].start, "2026-10-02");
assert.equal(weekly[0].end, "2026-10-08");
const biweekly = commissionPeriods("bi-weekly", "2026-07-03", "2026-10-02");
assert.equal(biweekly[0].start, "2026-09-25");
assert.equal(biweekly[0].end, "2026-10-08");
assert.deepEqual(
  commissionPeriods("bi-weekly", null, "2026-10-02"),
  [],
  "missing anchor is not guessed",
);
assert.deepEqual(commissionPeriods("custom", null, "2026-10-02"), []);
const semi = commissionPeriods("semi-monthly", null, "2026-10-02");
assert.equal(semi[0].start, "2026-10-01");
assert.equal(semi[0].end, "2026-10-15", "defaults current period, not future");
assert.equal(semi[1].start, "2026-09-16");
assert.equal(semi[1].end, "2026-09-30");
assert.equal(
  commissionPeriods("semi-monthly", null, "2024-02-29")[0].end,
  "2024-02-29",
);
assert.equal(
  commissionPeriods("monthly", null, "2026-01-02")[1].start,
  "2025-12-01",
);
for (const list of [weekly, biweekly, semi])
  for (let i = 1; i < list.length; i++)
    assert.equal(
      Date.parse(list[i - 1].start) - Date.parse(list[i].end),
      86400000,
      "no missing/overlapping dates",
    );
console.log(
  "Commission periods: anchored weekly/14-day, current semimonthly, leap/year boundaries and contiguous periods passed.",
);
