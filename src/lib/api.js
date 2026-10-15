import { parseResponse } from './responses';
export const API = import.meta.env.VITE_API_URL || '/api/index.php';
export function endpoint(action, params = {}) {
  const url = new URL(API, window.location.href);
  url.search = new URLSearchParams({ action, ...params }).toString();
  return url.href;
}
let csrf = '';
export async function api(action, { method = 'GET', body, params } = {}) {
  const response = await fetch(endpoint(action, params), { method, credentials: 'same-origin', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const result = parseResponse(await response.text(), response.status, { development: import.meta.env.DEV, backend: import.meta.env.VITE_API_MODE });
  if (result.csrf) csrf = result.csrf;
  return result;
}
export function upload(form, onProgress, { id, signal } = {}) {
  if (import.meta.env.VITE_API_MODE === 'netlify') return import('./netlify-upload').then(({ netlifyUpload }) => netlifyUpload(form, onProgress, { id, signal, endpoint, csrf }));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint(id ? 'update' : 'create', id ? { id } : {}));
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
    xhr.upload.onprogress = e => e.lengthComputable && onProgress(Math.round(e.loaded / e.total * 100));
    xhr.onload = () => { try { resolve(parseResponse(xhr.responseText, xhr.status, { development: import.meta.env.DEV })); } catch (error) { reject(error); } };
    xhr.onerror = () => reject(new Error('Cannot reach the upload server. Check your connection.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
export function mediaUrl(path) { return endpoint('media', { file: path }); }
