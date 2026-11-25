import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../../src/lib/websiteWidgets.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { websiteWidgetKinds, websiteWidgetEmbed, websiteWidgetAllowed, normalizeWebsiteOrigin } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const snippets = websiteWidgetKinds.map((kind, i) => websiteWidgetEmbed(kind, 'public_widget_id_' + i, 'https://widgets.example.com', 'https://api.example.com'));
assert.equal(new Set(snippets).size, 6);
for (const [i, kind] of websiteWidgetKinds.entries()) assert.ok(snippets[i].includes('/website-widgets/' + kind + '.js'));
assert.throws(() => websiteWidgetEmbed('chat', '" onclick="bad"', 'https://widgets.example.com', 'https://api.example.com'));
assert.throws(() => websiteWidgetEmbed('unknown', 'public_widget_id_0', 'https://widgets.example.com', 'https://api.example.com'));
for (const bad of ['http://example.com', 'https://example.com/path', 'https://user@example.com', 'https://example.com/?x=1', 'null']) assert.throws(() => normalizeWebsiteOrigin(bad));
const config = { enabled: true, allowedOrigins: ['https://example.com'] };
assert.equal(websiteWidgetAllowed(config, 'https://example.com'), true);
for (const bad of ['https://example.com.evil.test', 'https://other.example.com', 'null', 'https://example.com:444']) assert.equal(websiteWidgetAllowed(config, bad), false);
assert.equal(websiteWidgetAllowed({ ...config, enabled: false }, 'https://example.com'), false);
console.log('Website widget foundation checks passed');

for (const snippet of snippets) assert.ok(snippet.includes('data-config="https://api.example.com/functions/v1/website-widget-config"'));
for (const kind of websiteWidgetKinds) { const entry = await readFile(new URL('../../public/website-widgets/' + kind + '.js', import.meta.url), 'utf8'); assert.ok(entry.includes("'" + kind + "'")); assert.ok(entry.includes('runtime.js')); }
