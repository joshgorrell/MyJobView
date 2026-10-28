import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/Production/TechStats.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
  module, exports: module.exports,
  require(name) {
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
    if (name === './TechProductionStats') return { default: 'ProductionStats' };
    throw new Error(name);
  },
});
assert.equal(module.exports.TechStats({}).type, 'ProductionStats');
console.log('Tech Stats route presents one production and utilization experience.');
