import { randomBytes, timingSafeEqual } from 'node:crypto';
import { atomic, entries, hash, removeMedia } from './storage.mjs';
import { CHUNK_SIZE, fileSpec, validateMedia, serveMedia, problem } from './media.mjs';

const nowText = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const publicRecord = record => Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith('_')));
const equal = (left, right) => { const a = Buffer.from(String(left)), b = Buffer.from(String(right)); return a.length === b.length && timingSafeEqual(a, b); };
const idPattern = /^[a-f0-9]{32}$/;
const filenamePattern = /^[a-f0-9]{48}\.(jpg|png|webp|mp4|webm)$/;
function title(value) {
  if (typeof value !== 'string') problem('Please enter a valid memory name.');
  value = value.trim() || 'An unforgettable moment';
  if ([...value].length > 120 || /[\x00-\x1f]/.test(value)) problem('Memory names must contain at most 120 characters.');
  return value;
}
async function readBody(request, max) {
  if (Number(request.headers.get('content-length')) > max) problem('The request is too large.', 413);
  const chunks = []; let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const result = await reader.read(); if (result.done) break;
      size += result.value.byteLength;
      if (size > max) { await reader.cancel(); problem('The request is too large.', 413); }
      chunks.push(Buffer.from(result.value));
    }
  }
  return Buffer.concat(chunks);
}
async function jsonBody(request) {
  let data; try { data = JSON.parse((await readBody(request, 16384)).toString('utf8')); } catch (error) { if (error.status) throw error; problem('Expected a JSON request.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) problem('Expected a JSON object.');
  return data;
}
function method(request, allowed) { if (![].concat(allowed).includes(request.method)) problem('Method not allowed.', 405); }

export function createHandler({ stores, env = process.env, logger = console }) {
  async function record(id) {
    if (!idPattern.test(id || '')) problem('This memory could not be found.', 404);
    const result = await stores.records.get(id, { type: 'json' });
    if (!result || result._deleted) problem('This memory could not be found. It may have been removed.', 404);
    return result;
  }
  async function consume(key, max, interval) {
    const now = Date.now();
    return atomic(stores.limits, key, old => {
      const count = old?.expires > now ? old.count : 0;
      if (count >= max) problem('Too many requests. Please try again later.', 429);
      return { count: count + 1, expires: old?.expires > now ? old.expires : now + interval };
    });
  }
  return async function handler(request, context = {}) {
    let cookie;
    const url = new URL(request.url), action = url.searchParams.get('action') || 'health', id = url.searchParams.get('id');
    const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Stillmotion': 'netlify', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
    let loadedSession;
    const sessionCookie = token => `stillmotion_netlify=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${url.protocol === 'https:' ? '; Secure' : ''}`;
    async function session(create = false) {
      if (loadedSession) return loadedSession;
      const token = /(?:^|;\s*)stillmotion_netlify=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie') || '')?.[1];
      if (token) {
        const key = hash(token), data = await stores.sessions.get(key, { type: 'json' });
        if (data?.expires > Date.now()) return loadedSession = { key, data };
      }
      if (!create) return null;
      const fresh = randomBytes(32).toString('hex'), key = hash(fresh);
      const data = { csrf: randomBytes(32).toString('hex'), admin: false, expires: Date.now() + 28800000 };
      await stores.sessions.setJSON(key, data, { metadata: { expires: data.expires } });
      cookie = sessionCookie(fresh); return loadedSession = { key, data };
    }
    async function admin(mutation = false) {
      const current = await session();
      if (!current?.data.admin) problem('Please sign in to manage experiences.', 401);
      if (mutation && !equal(current.data.csrf, request.headers.get('x-csrf-token') || '')) problem('Your session expired. Refresh and try again.', 403);
      return current;
    }
    async function uploadEntry() {
      const uploadId = url.searchParams.get('upload_id');
      if (!idPattern.test(uploadId || '')) problem('Upload not found.', 404);
      const upload = await stores.uploads.get(uploadId, { type: 'json' });
      if (!upload || !equal(upload.token_hash, hash(request.headers.get('x-upload-token') || ''))) problem('Upload not found.', 404);
      if (upload.expires < Date.now() || ['failed', 'expired', 'cancelled'].includes(upload.state)) problem('This upload expired. Please upload your files again.', 410);
      return { uploadId, upload };
    }
    async function queueGarbage(key, names) {
      if (names.length) await stores.uploads.setJSON(`cleanup/${key}`, { state: 'garbage', names, expires: Date.now() - 1 });
    }
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        const origin = request.headers.get('origin');
        const allowed = [url.origin];
        for (const value of [env.URL, env.STILLMOTION_PUBLIC_URL]) if (value) allowed.push(new URL(value).origin);
        if (origin && !allowed.includes(origin)) problem('Cross-origin writes are not allowed.', 403);
      }
      switch (action) {
        case 'health': {
          method(request, 'GET');
          // This read proves storage access without creating a new object on each health check.
          await stores.records.get('_health');
          return respond({ ok: true, backend: 'netlify', database: 'netlify-blobs' });
        }
        case 'session': {
          method(request, 'GET'); const current = await session(true);
          return respond({ authenticated: current.data.admin, csrf: current.data.csrf });
        }
        case 'login': {
          method(request, 'POST');
          if (!env.STILLMOTION_ADMIN_PASSWORD || env.STILLMOTION_ADMIN_PASSWORD.length < 12) problem('Administrator sign-in is not configured. Set STILLMOTION_ADMIN_PASSWORD in the Netlify environment settings.', 503);
          await consume(`login/${hash(context.ip || 'unknown')}`, 8, 900000);
          const input = await jsonBody(request);
          if (typeof input.password !== 'string' || !equal(hash(input.password), hash(env.STILLMOTION_ADMIN_PASSWORD))) problem('That password is not correct.', 401);
          const previous = await session();
          const token = randomBytes(32).toString('hex'), key = hash(token);
          const data = { admin: true, csrf: randomBytes(32).toString('hex'), expires: Date.now() + 28800000 };
          await stores.sessions.setJSON(key, data, { metadata: { expires: data.expires } });
          if (previous) await stores.sessions.delete(previous.key);
          cookie = sessionCookie(token);
          return respond({ authenticated: true, csrf: data.csrf });
        }
        case 'logout': {
          method(request, 'POST'); const current = await admin(true); await stores.sessions.delete(current.key);
          cookie = `stillmotion_netlify=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}`;
          return respond({ ok: true });
        }
        case 'get': method(request, 'GET'); return respond({ experience: publicRecord(await record(id)) });
        case 'list': {
          method(request, 'GET'); await admin(); const results = [];
          for await (const key of entries(stores.records)) {
            if (!idPattern.test(key)) continue;
            const value = await stores.records.get(key, { type: 'json' });
            if (value && !value._deleted) results.push(publicRecord(value));
          }
          results.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.unique_id.localeCompare(a.unique_id));
          return respond({ experiences: results });
        }
        case 'scan': {
          method(request, 'POST'); await record(id); const current = await session(true);
          let count = false;
          await atomic(stores.limits, `scan/${id}/${current.key}`, previous => {
            count = false;
            if (previous?.expires > Date.now()) return;
            count = true; return { count: 1, expires: Date.now() + 1800000 };
          });
          if (count) await atomic(stores.records, id, value => {
            if (!value || value._deleted) problem('This memory was removed.', 404);
            return { ...value, scan_count: value.scan_count + 1 };
          });
          return respond({ ok: true });
        }
        case 'upload-init': {
          method(request, 'POST'); const input = await jsonBody(request), updating = input.operation === 'update';
          if (!['create', 'update'].includes(input.operation)) problem('Invalid upload operation.');
          if (updating) await admin(true);
          else await consume(`uploads/${hash(context.ip || 'unknown')}`, 10, 3600000);
          const previous = updating ? await record(id) : null;
          const files = {};
          for (const kind of ['image', 'video']) {
            if (input[kind]) files[kind] = fileSpec(input[kind], kind);
            else if (!updating) problem(`Please upload a ${kind}.`);
          }
          const uploadId = randomBytes(16).toString('hex'), token = randomBytes(32).toString('hex');
          const experienceId = updating ? id : randomBytes(16).toString('hex');
          let publicUrl = (env.STILLMOTION_PUBLIC_URL || (env.CONTEXT === 'production' ? env.URL : '') || url.origin).replace(/\/$/, '');
          if (!/^https?:\/\//.test(publicUrl)) problem('The public site address is not configured correctly.', 503);
          const upload = { state: 'open', token_hash: hash(token), experience_id: experienceId, title: title(input.title ?? previous?.title ?? ''), files, updating, revision: previous?._revision || 0, previous_files: previous ? { image: previous.image_path, video: previous.video_path } : {}, public_url: publicUrl, expires: Date.now() + 3600000 };
          await stores.uploads.setJSON(uploadId, upload, { onlyIfNew: true, metadata: { expires: upload.expires } });
          return respond({ upload_id: uploadId, token, chunk_size: CHUNK_SIZE, files }, 201);
        }
        case 'upload-chunk': {
          method(request, 'PUT'); const { upload } = await uploadEntry();
          if (upload.state !== 'open') problem('This upload is already being processed.', 409);
          const kind = url.searchParams.get('kind'), indexText = url.searchParams.get('index');
          const file = upload.files[kind];
          if (!file || !/^(0|[1-9]\d*)$/.test(indexText || '')) problem('Invalid upload part.');
          const index = Number(indexText);
          if (!Number.isSafeInteger(index) || index >= file.parts) problem('Invalid upload part.');
          const bytes = await readBody(request, CHUNK_SIZE), size = Math.min(CHUNK_SIZE, file.size - index * CHUNK_SIZE);
          if (bytes.length !== size) problem('An upload part has the wrong size. Please retry.');
          const key = `${file.name}/chunk/${index}`, digest = hash(bytes);
          const saved = await stores.media.set(key, bytes, { onlyIfNew: true, metadata: { digest, size } });
          if (!saved.modified) {
            const existing = await stores.media.getMetadata(key);
            if (existing?.metadata?.digest !== digest) problem('This upload part conflicts with an existing part.', 409);
          }
          return respond({ ok: true, bytes: size });
        }
        case 'upload-complete': {
          method(request, 'POST'); const { uploadId, upload } = await uploadEntry();
          if (upload.updating) await admin(true);
          const already = await stores.records.get(upload.experience_id, { type: 'json' });
          if (upload.state === 'complete' || (already && !already._deleted && already._upload_id === uploadId)) {
            if (!already || already._deleted) problem('This memory was removed.', 404);
            if (upload.state !== 'complete') await queueGarbage(uploadId, Object.keys(upload.files).map(kind => upload.previous_files[kind]).filter(Boolean));
            await stores.uploads.setJSON(uploadId, { ...upload, state: 'complete', expires: Date.now() + 86400000 });
            return respond({ experience: publicRecord(already) });
          }
          const claimed = await atomic(stores.uploads, uploadId, value => {
            if (!value || ['failed', 'expired', 'cancelled', 'complete'].includes(value.state)) problem('This upload is no longer available.', 410);
            if (value.state === 'committing' && value.lease > Date.now()) problem('Your experience is still being created. Please try again in a moment.', 409);
            return { ...value, state: 'committing', lease: Date.now() + 120000 };
          });
          let committed = false;
          try {
            const validated = {};
            for (const [kind, file] of Object.entries(claimed.files)) validated[kind] = await validateMedia(stores.media, file, kind);
            const moment = nowText();
            const value = await atomic(stores.records, claimed.experience_id, previous => {
              if (previous?._upload_id === uploadId && !previous._deleted) return;
              if (claimed.updating && (!previous || previous._deleted || previous._revision !== claimed.revision)) problem('This memory changed during the upload. Refresh and try again.', 409);
              if (!claimed.updating && previous) problem('This experience already exists.', 409);
              return {
                ...(previous || {}), id: previous?.id || claimed.experience_id, unique_id: claimed.experience_id, title: claimed.title,
                image_path: validated.image?.name || previous.image_path, video_path: validated.video?.name || previous.video_path,
                image_width: validated.image?.width || previous.image_width, image_height: validated.image?.height || previous.image_height,
                qr_code_url: previous?.qr_code_url || `${claimed.public_url}/#/watch/${claimed.experience_id}`,
                scan_count: previous?.scan_count || 0, created_at: previous?.created_at || moment, updated_at: moment,
                _revision: (previous?._revision || 0) + 1, _upload_id: uploadId, _deleted: false,
              };
            });
            committed = true;
            const old = Object.keys(validated).map(kind => claimed.previous_files[kind]).filter(Boolean);
            await queueGarbage(uploadId, old);
            await stores.uploads.setJSON(uploadId, { ...claimed, state: 'complete', expires: Date.now() + 86400000 });
            // Cleanup is also queued so a function timeout cannot permanently strand old media.
            try { for (const name of old) await removeMedia(stores.media, name); if (old.length) await stores.uploads.delete(`cleanup/${uploadId}`); } catch (error) { logger.error('Deferred replaced media cleanup:', error.message); }
            return respond({ experience: publicRecord(value) }, claimed.updating ? 200 : 201);
          } catch (error) {
            if (!committed) await stores.uploads.setJSON(uploadId, { ...claimed, state: error.status && error.status < 500 ? 'failed' : 'open', lease: 0, expires: Date.now() + 3600000 }).catch(() => {});
            throw error;
          }
        }
        case 'upload-abort': {
          method(request, 'POST'); const { uploadId, upload } = await uploadEntry();
          await atomic(stores.uploads, uploadId, value => {
            if (!value || value.state !== 'open') problem('This upload is already being processed.', 409);
            return { ...value, state: 'cancelled', expires: Date.now() - 1 };
          });
          return respond({ ok: true });
        }
        case 'media': method(request, ['GET', 'HEAD']); return await serveMedia(request, stores.media, url.searchParams.get('file'));
        case 'delete': {
          method(request, 'DELETE'); await admin(true); await record(id);
          const removed = await atomic(stores.records, id, value => {
            if (!value || value._deleted) problem('This memory was removed.', 404);
            return { ...value, _deleted: true, _deleted_at: Date.now(), _revision: value._revision + 1, updated_at: nowText() };
          });
          const names = [removed.image_path, removed.video_path].filter(name => filenamePattern.test(name));
          await queueGarbage(`delete-${id}`, names);
          try { for (const name of names) await removeMedia(stores.media, name); await stores.uploads.delete(`cleanup/delete-${id}`); } catch (error) { logger.error('Deferred deleted media cleanup:', error.message); }
          return respond({ ok: true });
        }
        default: problem('Endpoint not found.', 404);
      }
    } catch (error) {
      if (error.status) return respond({ error: error.message }, error.status);
      logger.error('Stillmotion Netlify API:', error);
      return respond({ error: 'The memory service could not access its storage. Check Netlify function logs and redeploy with Netlify Blobs enabled.' }, 503);
    }
  };
}
