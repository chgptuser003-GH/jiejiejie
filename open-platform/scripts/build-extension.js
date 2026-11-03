import { cp, copyFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workspace = resolve(import.meta.dirname, '../..');
const source = resolve(workspace, 'extension');
const output = resolve(workspace, 'dist/extension');
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true, force: true });
await copyFile(resolve(workspace, 'open-platform/src/calculator.js'), resolve(output, 'calculator.js'));
await copyFile(resolve(workspace, 'open-platform/src/budget-rule.js'), resolve(output, 'budget-rule.js'));
const manifest = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3 || !manifest.action?.default_popup) {
  throw new Error('extension manifest is invalid');
}
process.stdout.write(`${output}\n`);
