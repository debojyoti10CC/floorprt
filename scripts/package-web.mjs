import {cp,mkdir} from 'node:fs/promises';
await mkdir('dist',{recursive:true});await cp('apps/web/out','dist',{recursive:true});
console.log('Packaged static terminal in dist/.');
