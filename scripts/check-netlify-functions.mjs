import { zipFunctions } from '@netlify/zip-it-and-ship-it';
const functions = await zipFunctions('netlify/functions', '.netlify/verified-functions', {
  archiveFormat: 'zip',
  config: { '*': { nodeBundler: 'esbuild', nodeVersion: '22.x' } },
});
for (const fn of functions) {
  console.log(`${fn.name}: API v${fn.runtimeAPIVersion || 1}, bundled successfully${fn.schedule ? `, schedule ${fn.schedule}` : ''}`);
  if (fn.runtimeAPIVersion !== 2) throw new Error(`${fn.name} was not packaged as a modern Netlify function.`);
}
if (functions.length !== 2) throw new Error('Expected API and cleanup functions.');
