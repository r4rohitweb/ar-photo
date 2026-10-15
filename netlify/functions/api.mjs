import { getStore } from '@netlify/blobs';
import { openStores } from '../../server/netlify/storage.mjs';
import { createHandler } from '../../server/netlify/api.mjs';
import deployment from '../../server/netlify/generated-deployment.mjs';
export default async (request, context) => {
  if (deployment.mode === 'php') return new Response('PHP proxy mode is enabled.', { status: 404 });
  const env = { ...process.env, CONTEXT: deployment.context, DEPLOY_ID: deployment.deployId, URL: deployment.url || process.env.URL };
  try { return await createHandler({ stores: openStores(getStore, env), env })(request, context); }
  catch (error) {
    console.error('Stillmotion storage initialization:', error.message);
    return new Response(JSON.stringify({ error: 'Netlify storage is unavailable. Deploy the complete project with Functions and Blobs support enabled.' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
};
