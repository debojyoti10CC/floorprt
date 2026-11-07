import { cp, mkdir, readFile, readdir, writeFile, access } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const output = 'work/arc-studio-handoff';
if (process.argv.includes('--help')) {
  console.log('pnpm arc:studio:prepare — creates a new source/test handoff under ' + output + ', without keys, node state or deployment authority.');
  process.exit(0);
}
if (process.argv.length > 2) throw new Error('No arguments supported.');
try { await access(output); throw new Error('Handoff already exists. Preserve it and move it before preparing a new snapshot.'); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
for (const path of [
  'packages/contracts/src', 'packages/contracts/vendor', 'packages/contracts/foundry.toml',
  'packages/contracts/test/ArcIntegration.t.sol', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
  'arc/STUDIO_PROMPT.md', 'arc/README.md', 'docs/ARC_CHAINLINK.md',
]) {
  const to = join(output, path);
  await mkdir(join(to, '..'), { recursive: true });
  await cp(path, to, { recursive: true, dereference: true });
}
// Only pinned contract dependencies; never copy root node_modules, work/, .env or a deployer journal.
for (const name of ['@openzeppelin/contracts', '@gnosis.pm/conditional-tokens-contracts']) {
  const to = join(output, 'node_modules', name);
  await mkdir(join(to, '..'), { recursive: true });
  await cp(join('node_modules', name), to, { recursive: true, dereference: true });
}
await writeFile(join(output, 'package.json'), JSON.stringify({
  name: 'aqra-arc-studio-handoff', private: true,
  dependencies: { '@openzeppelin/contracts': '5.6.1', '@gnosis.pm/conditional-tokens-contracts': '1.0.3' },
}, null, 2) + '\n');
const files: { path: string; sha256: string }[] = [];
async function fingerprint(directory: string) {
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error('Unexpected symlink in handoff: ' + path);
    if (item.isDirectory()) await fingerprint(path);
    else files.push({ path: relative(output, path), sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
  }
}
await fingerprint(output);
await writeFile(join(output, 'source-manifest.json'), JSON.stringify({
  schema: 'aqra.studio-handoff/v1', files,
  limits: 'Source handoff only. Not evidence of Arc Studio authorship, tests, deployment, event eligibility or new CRE delivery.',
}, null, 2) + '\n');
console.log(`Prepared ${files.length} fingerprinted files at ${output}. No private keys, .env, actors or deployment state copied.`);
console.log('Open arc/STUDIO_PROMPT.md in an authenticated Studio project, disclose prior work and record actual Studio build/test/deploy output.');
