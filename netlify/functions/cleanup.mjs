import { getStore } from '@netlify/blobs';
import { openStores, cleanupExpired } from '../../server/netlify/storage.mjs';
import deployment from '../../server/netlify/generated-deployment.mjs';
export default async () => {
  if (deployment.mode === 'php') return new Response('PHP proxy mode is enabled.');
  const env = { ...process.env, CONTEXT: deployment.context, DEPLOY_ID: deployment.deployId };
  const removed = await cleanupExpired(openStores(getStore, env), { limit: 100, maxMilliseconds: 20000 });
  console.log(`Stillmotion: removed ${removed} expired uploads/sessions/limits.`);
  return new Response(JSON.stringify({ removed }), { headers: { 'Content-Type': 'application/json' } });
};
export const config = { schedule: '17 * * * *' };
