import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResponse } from '../src/lib/responses.js';
test('an HTML 404 identifies incorrect API routing rather than upload limits', () => {
  assert.throws(() => parseResponse('<html>404 Page Not Found</html>', 404), /PHP API was not found/);
  assert.throws(() => parseResponse('<html>too large</html>', 413), /upload size/);
  assert.throws(() => parseResponse('', 502), /backend is unavailable/);
});
test('JSON API errors retain their specific server message', () => {
  assert.throws(() => parseResponse('{"error":"Database unavailable"}', 503), /Database unavailable/);
  assert.deepEqual(parseResponse('{"experience":{"unique_id":"abc"}}', 201), { experience: { unique_id: 'abc' } });
  assert.throws(() => parseResponse('<html>unexpected error</html>', 500), /HTTP 500/);
});
test('hosted deployment errors give deployment guidance while local errors retain Vite guidance', () => {
  assert.throws(() => parseResponse('<html>Not found</html>', 404, { backend: 'netlify' }), /including its functions/);
  assert.throws(() => parseResponse('<html>Not found</html>', 404), /hosted PHP backend/);
  assert.throws(() => parseResponse('<html>Not found</html>', 404, { development: true }), /Vite proxy/);
  assert.throws(() => parseResponse('', 502), /hosted backend service/);
  assert.throws(() => parseResponse('', 502, { development: true }), /npm run dev/);
});
