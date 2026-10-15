import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFile, LIMITS } from '../src/lib/media.js';
test('photo validation rejects spoofed types, empty files and excessive sizes', () => {
  assert.equal(validateFile({ type: 'image/jpeg', size: 100 }, 'image'), '');
  assert.match(validateFile({ type: 'image/svg+xml', size: 100 }, 'image'), /JPG/);
  assert.match(validateFile({ type: 'image/png', size: 0 }, 'image'), /empty/);
  assert.match(validateFile({ type: 'image/webp', size: LIMITS.image + 1 }, 'image'), /10 MB/);
});
test('video validation enforces the supported formats and independent 100 MB limit', () => {
  assert.equal(validateFile({ type: 'video/mp4', size: LIMITS.video }, 'video'), '');
  assert.equal(validateFile({ type: 'video/webm', size: 100 }, 'video'), '');
  assert.match(validateFile({ type: 'video/quicktime', size: 100 }, 'video'), /MP4/);
  assert.match(validateFile({ type: 'video/mp4', size: LIMITS.video + 1 }, 'video'), /100 MB/);
});
