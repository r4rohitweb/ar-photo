import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export function openStores(getStore, env = process.env) {
  const scope = !env.CONTEXT || env.CONTEXT === 'production' ? 'production' : `preview-${hash(env.DEPLOY_ID || env.CONTEXT).slice(0, 16)}`;
  return Object.fromEntries(['records', 'media', 'uploads', 'sessions', 'limits'].map(name => [name, getStore({ name: `stillmotion-v1-${scope}-${name}`, consistency: 'strong' })]));
}
export async function atomic(store, key, update) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const existing = await store.getWithMetadata(key, { type: 'json' });
    const next = await update(existing?.data ?? null);
    if (next === undefined) return existing?.data ?? null;
    const result = await store.setJSON(key, next, { ...(existing ? { onlyIfMatch: existing.etag } : { onlyIfNew: true }), metadata: next.expires ? { expires: next.expires } : {} });
    if (result.modified) return next;
    await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 20));
  }
  throw Object.assign(new Error('This memory is busy. Please try again.'), { status: 409 });
}
export async function* entries(store) {
  for await (const page of store.list({ paginate: true })) for (const blob of page.blobs) yield blob.key;
}
export async function removeMedia(store, name) {
  const manifest = await store.get(`${name}/manifest`, { type: 'json' });
  if (!manifest) return;
  for (let start = 0; start < manifest.parts; start += 8) {
    await Promise.all(Array.from({ length: Math.min(8, manifest.parts - start) }, (_, i) => store.delete(`${name}/chunk/${start + i}`)));
  }
  await store.delete(`${name}/manifest`);
}
export async function removePendingMedia(store, file) {
  // Pending uploads have no published manifest yet.
  for (let start = 0; start < file.parts; start += 8) await Promise.all(Array.from({ length: Math.min(8, file.parts - start) }, (_, i) => store.delete(`${file.name}/chunk/${start + i}`)));
  await store.delete(`${file.name}/manifest`);
}
export async function cleanupExpired(stores, { limit = 200, now = Date.now(), maxMilliseconds = 20000 } = {}) {
  let processed = 0;
  const deadline = Date.now() + maxMilliseconds;
  for (const name of ['uploads', 'sessions', 'limits']) {
    for await (const key of entries(stores[name])) {
      if (processed >= limit || Date.now() >= deadline) return processed;
      const entry = await stores[name].get(key, { type: 'json' });
      if (!entry?.expires || entry.expires > now) continue;
      if (name === 'uploads') {
        // Only terminal, unpublished uploads can be removed. A committed upload keeps its media.
        if (entry.state === 'committing') {
          if (entry.lease > now) continue;
          const published = await stores.records.get(entry.experience_id, { type: 'json' });
          if (published?._upload_id === key) {
            await stores[name].delete(key); processed++; continue;
          }
          // A timed-out finalization with no committed record cannot be resumed after expiry.
          await atomic(stores.uploads, key, value => value?.state === 'committing' && value.lease <= now && value.expires <= now ? { ...value, state: 'expired' } : undefined);
        }
        if (entry.state === 'garbage') for (const file of entry.names) await removeMedia(stores.media, file);
        else if (entry.state !== 'complete') {
          const claimed = await atomic(stores.uploads, key, value => {
            if (!value || value.state === 'complete' || value.state === 'committing' || value.expires > now) return;
            return { ...value, state: 'expired' };
          });
          if (!claimed || claimed.state !== 'expired') continue;
          for (const file of Object.values(claimed.files)) await removePendingMedia(stores.media, file);
        }
      }
      await stores[name].delete(key); processed++;
    }
  }
  for await (const key of entries(stores.records)) {
    if (processed >= limit || Date.now() >= deadline) return processed;
    const value = await stores.records.get(key, { type: 'json' });
    if (value?._deleted && value._deleted_at < now - 86400000) {
      for (const name of [value.image_path, value.video_path]) await removeMedia(stores.media, name);
      await stores.records.delete(key); processed++;
    }
  }
  return processed;
}
