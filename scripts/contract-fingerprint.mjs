import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function contractFingerprint(){const hash=createHash('sha256');for(const name of (await readdir('packages/contracts/src')).filter(n=>n.endsWith('.sol')).sort()){hash.update(name);hash.update(await readFile(`packages/contracts/src/${name}`));}return hash.digest('hex');}
