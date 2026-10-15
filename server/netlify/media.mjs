import { fileTypeFromBuffer } from 'file-type';
import { imageSize } from 'image-size';
import { randomBytes } from 'node:crypto';
export const CHUNK_SIZE = 2 * 1024 * 1024;
export const RESPONSE_LIMIT = 4 * 1024 * 1024;
const types = { image: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }, video: { 'video/mp4': 'mp4', 'video/webm': 'webm' } };
export function problem(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function fileSpec(value, kind) {
  if (!value || typeof value !== 'object' || !types[kind][value.type]) problem(`Choose a supported ${kind} format.`);
  const max = (kind === 'image' ? 10 : 100) * 1024 * 1024;
  if (!Number.isSafeInteger(value.size) || value.size < 1 || value.size > max) problem(`Your ${kind} must be between 1 byte and ${kind === 'image' ? 10 : 100} MB.`);
  return { type: value.type, size: value.size, name: `${randomBytes(24).toString('hex')}.${types[kind][value.type]}`, parts: Math.ceil(value.size / CHUNK_SIZE), chunk_size: CHUNK_SIZE };
}
export async function validateMedia(store, file, kind) {
  const imageChunks = []; let first, total = 0;
  for (let i = 0; i < file.parts; i++) {
    const value = await store.get(`${file.name}/chunk/${i}`, { type: 'arrayBuffer' });
    if (!value) problem('The upload is incomplete. Please upload both files again.');
    const chunk = Buffer.from(value), expected = Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE);
    if (chunk.length !== expected) problem('An uploaded part has the wrong size. Please retry.');
    if (i === 0) first = chunk;
    if (kind === 'image') imageChunks.push(chunk);
    total += chunk.length;
  }
  let detected;
  try { detected = await fileTypeFromBuffer(first); } catch { problem(`The ${kind} content is not valid.`); }
  if (detected?.mime !== file.type) problem(`The ${kind} content does not match its file type.`);
  const manifest = { ...file, size: total, kind };
  if (kind === 'image') {
    let size;
    try { size = imageSize(Buffer.concat(imageChunks)); } catch { problem('The photo could not be decoded. Choose a valid JPG, PNG, or WEBP.'); }
    let { width, height } = size;
    if (!width || !height || width * height > 40000000) problem('Choose a photo of at most 40 megapixels.');
    if ([5, 6, 7, 8].includes(size.orientation)) [width, height] = [height, width];
    manifest.width = width; manifest.height = height;
  }
  await store.setJSON(`${file.name}/manifest`, manifest, { onlyIfNew: true });
  return manifest;
}
export function byteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value || '');
  if (!match || (!match[1] && !match[2])) return null;
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
  end = Math.min(end, start + RESPONSE_LIMIT - 1);
  return { start, end };
}
export async function serveMedia(request, store, name) {
  if (!/^[a-f0-9]{48}\.(jpg|png|webp|mp4|webm)$/.test(name || '')) problem('Media not found.', 404);
  const file = await store.get(`${name}/manifest`, { type: 'json' });
  if (!file) problem('Media not found.', 404);
  const rangeHeader = request.headers.get('range');
  const headers = { 'Content-Type': file.type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600, immutable', 'X-Content-Type-Options': 'nosniff' };
  if (request.method === 'HEAD') return new Response(null, { headers: { ...headers, 'Content-Length': String(file.size) } });
  let selected = { start: 0, end: file.size - 1 };
  if (rangeHeader) {
    selected = byteRange(rangeHeader, file.size);
    if (!selected) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${file.size}` } });
    headers['Content-Range'] = `bytes ${selected.start}-${selected.end}/${file.size}`;
  } else if (file.kind === 'video' && file.size > RESPONSE_LIMIT) {
    // Browsers request video ranges. Avoid exceeding the function's response-size limit for generic full-file clients.
    return new Response('Use an HTTP Range header to download this video.', { status: 416, headers: { ...headers, 'Content-Range': `bytes */${file.size}` } });
  }
  headers['Content-Length'] = String(selected.end - selected.start + 1);
  let index = Math.floor(selected.start / CHUNK_SIZE);
  const last = Math.floor(selected.end / CHUNK_SIZE);
  const body = new ReadableStream({
    async pull(controller) {
      if (index > last) { controller.close(); return; }
      try {
        const value = await store.get(`${name}/chunk/${index}`, { type: 'arrayBuffer' });
        if (!value) throw new Error('A media part is missing.');
        const bytes = new Uint8Array(value), base = index * CHUNK_SIZE;
        controller.enqueue(bytes.slice(Math.max(0, selected.start - base), Math.min(bytes.length, selected.end - base + 1)));
        index++;
      } catch (error) { controller.error(error); }
    },
  });
  return new Response(body, { status: rangeHeader ? 206 : 200, headers });
}
