const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const testsRoot = __dirname;
const projectRoot = path.resolve(testsRoot, '..');
const testFiles = fs.readdirSync(testsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name !== 'manual' && entry.name !== 'node_modules')
  .flatMap(entry => fs.readdirSync(path.join(testsRoot, entry.name))
    .filter(name => name.endsWith('.cjs'))
    .map(name => path.join(entry.name, name)))
  .sort();

async function run(file) {
  process.stdout.write(`\nRUN ${file}\n`);
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(testsRoot, file)], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    child.once('error', error => { console.error(error); resolve(false); });
    child.once('exit', code => resolve(code === 0));
  });
}

(async () => {
  const failed = [];
  for (const file of testFiles) if (!await run(file)) failed.push(file);
  console.log(`\n${testFiles.length - failed.length}/${testFiles.length} tests passed.`);
  if (failed.length) {
    console.error(`Failed: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
