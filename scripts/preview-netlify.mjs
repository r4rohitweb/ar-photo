// QA-only local runtime using Netlify's own SDK and persistent Blobs emulator.
// Production uses the actual Netlify Functions runtime and managed storage.
import { createTestRuntime } from '../tests/helpers/netlify-runtime.mjs';
const runtime = await createTestRuntime({ directory: '.local/netlify-emulator', port: Number(process.env.NETLIFY_PREVIEW_PORT || 5190), staticDirectory: 'dist', password: process.env.STILLMOTION_ADMIN_PASSWORD || 'netlify-test-password' });
console.log(`Netlify backend preview: ${runtime.origin}`);
async function stop() { await runtime.close(); process.exit(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
