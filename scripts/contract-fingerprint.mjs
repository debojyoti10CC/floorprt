import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function contractFingerprint(lineEnding = '\n') {
  const hash = createHash('sha256');
  const names = (await readdir('packages/contracts/src')).filter(name => name.endsWith('.sol') && name !== 'TraderCreditDesk.sol');
  for (const name of names.sort()) {
    const source = await readFile('packages/contracts/src/' + name, 'utf8');
    hash.update(name).update(source.replace(/\r?\n/g, lineEnding));
  }
  return hash.digest('hex');
}
