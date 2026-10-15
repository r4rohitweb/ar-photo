import { writeFileSync } from 'node:fs';
import { build, loadEnv } from 'vite';
import { netlifyProxyRule } from './netlify-config.mjs';
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const redirects = netlifyProxyRule(env.PHP_BACKEND_URL);
// Keep requests, session cookies, QR images and canvas exports on the frontend origin.
await build({ define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/index.php') } });
writeFileSync('dist/_redirects', redirects);
console.log('Netlify frontend built with a proxy to the configured PHP backend.');
