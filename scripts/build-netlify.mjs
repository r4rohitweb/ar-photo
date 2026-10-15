import { writeFileSync } from 'node:fs';
import { build, loadEnv } from 'vite';
import { netlifyBuildConfig } from './netlify-config.mjs';
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const config = netlifyBuildConfig(env.NETLIFY_BACKEND || 'netlify', env.PHP_BACKEND_URL);
// Build-time context is pinned into the function bundle; preview deployments never
// fall back to production storage when a runtime omits CONTEXT or DEPLOY_ID.
writeFileSync('server/netlify/generated-deployment.mjs', `export default ${JSON.stringify({ mode: config.mode, context: env.CONTEXT || 'production', deployId: env.DEPLOY_ID || 'local', url: env.URL || '' })};\n`);
// Keep requests, session cookies, QR images and canvas exports on the frontend origin.
await build({ define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/index.php'), 'import.meta.env.VITE_API_MODE': JSON.stringify(config.mode) } });
writeFileSync('dist/_redirects', config.redirects);
console.log(`Netlify frontend built for ${config.mode === 'netlify' ? 'Netlify Functions and persistent Blobs storage' : 'the configured PHP backend'}.`);
