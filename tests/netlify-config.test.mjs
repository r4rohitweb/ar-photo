import test from 'node:test';
import assert from 'node:assert/strict';
import { netlifyProxyRule, netlifyBuildConfig } from '../scripts/netlify-config.mjs';
test('Netlify deployments use a real serverless backend by default, with no PHP host required', () => {
  assert.deepEqual(netlifyBuildConfig(), { mode: 'netlify', redirects: '/api/index.php /.netlify/functions/api 200!\n' });
  assert.equal(netlifyBuildConfig('php', 'https://backend.example.com/api/index.php').mode, 'php');
});
test('Netlify proxy retains the exact hosted API endpoint and same-origin frontend path', () => {
  assert.equal(netlifyProxyRule('https://backend.example.com/memories/api/index.php'), '/api/index.php https://backend.example.com/memories/api/index.php 200!\n');
});
test('Netlify configuration rejects the missing PHP runtime and unreachable local addresses', () => {
  assert.throws(() => netlifyProxyRule(''), /cannot run the PHP backend/);
  assert.throws(() => netlifyProxyRule('https://ar-photo25.netlify.app/api/index.php'), /cannot execute this PHP API/);
  assert.throws(() => netlifyProxyRule('https://localhost/api/index.php'), /publicly reachable/);
  assert.throws(() => netlifyProxyRule('http://backend.example.com/api/index.php'), /HTTPS/);
  assert.throws(() => netlifyProxyRule('https://user:password@backend.example.com/api/index.php'), /without credentials/);
});
