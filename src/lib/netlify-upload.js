import { parseResponse } from './responses';

export async function netlifyUpload(form, onProgress, { id, signal, endpoint, csrf }) {
  function cancelled() { if (signal?.aborted) throw new Error('Upload cancelled.'); }
  async function json(action, { params, body, token, method = 'POST', retry = true } = {}) {
    for (let attempt = 0;; attempt++) {
      cancelled();
      try {
        const response = await fetch(endpoint(action, params), { method, signal, credentials: 'same-origin', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(token ? { 'X-Upload-Token': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
        const result = parseResponse(await response.text(), response.status, { backend: 'netlify' });
        return result;
      } catch (error) {
        cancelled();
        // Completion is idempotent, so a lost response can be retried safely.
        if (!retry || attempt >= 2 || (error.message && !/fetch|network|unavailable|still being created|storage/i.test(error.message))) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  const image = form.get('image'), video = form.get('video');
  const files = { ...(image instanceof File && image.size ? { image } : {}), ...(video instanceof File && video.size ? { video } : {}) };
  const spec = file => ({ type: file.type, size: file.size });
  const init = await json('upload-init', { params: id ? { id } : {}, retry: false, body: { operation: id ? 'update' : 'create', title: form.get('title') || '', ...Object.fromEntries(Object.entries(files).map(([kind, file]) => [kind, spec(file)])) } });
  const params = { upload_id: init.upload_id }, total = Object.values(files).reduce((sum, file) => sum + file.size, 0);
  let uploaded = 0;
  async function part(kind, file, index) {
    const start = index * init.chunk_size, bytes = file.slice(start, Math.min(file.size, start + init.chunk_size));
    for (let attempt = 0;; attempt++) {
      cancelled();
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const abort = () => xhr.abort();
          const finish = callback => value => { signal?.removeEventListener('abort', abort); callback(value); };
          const done = finish(resolve), fail = finish(reject);
          xhr.open('PUT', endpoint('upload-chunk', { ...params, kind, index }));
          xhr.setRequestHeader('Content-Type', 'application/octet-stream'); xhr.setRequestHeader('X-Upload-Token', init.token);
          if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
          xhr.timeout = 55000;
          xhr.upload.onprogress = event => { if (event.lengthComputable && total) onProgress(Math.min(99, Math.round((uploaded + event.loaded) / total * 100))); };
          xhr.onload = () => { try { done(parseResponse(xhr.responseText, xhr.status, { backend: 'netlify' })); } catch (error) { error.retryable = xhr.status >= 500 || xhr.status === 408 || xhr.status === 429; fail(error); } };
          xhr.onerror = () => fail(Object.assign(new Error('Network interrupted during upload.'), { retryable: true }));
          xhr.ontimeout = () => fail(Object.assign(new Error('An upload part timed out.'), { retryable: true }));
          xhr.onabort = () => fail(new Error('Upload cancelled.'));
          signal?.addEventListener('abort', abort, { once: true });
          if (signal?.aborted) { fail(new Error('Upload cancelled.')); return; }
          xhr.send(bytes);
        });
        uploaded += bytes.size; if (total) onProgress(Math.round(uploaded / total * 100));
        return;
      } catch (error) {
        cancelled();
        if (!error.retryable || attempt >= 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  try {
    for (const [kind, file] of Object.entries(files)) {
      const count = Math.ceil(file.size / init.chunk_size);
      for (let index = 0; index < count; index++) await part(kind, file, index);
    }
    onProgress(100);
    return await json('upload-complete', { params, token: init.token });
  } catch (error) {
    // Abandoned chunks are also swept by the scheduled cleanup function.
    fetch(endpoint('upload-abort', params), { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'X-Upload-Token': init.token } }).catch(() => {});
    if (signal?.aborted) throw new Error('Upload cancelled.');
    throw error;
  }
}
