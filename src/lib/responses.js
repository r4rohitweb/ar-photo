export function parseResponse(text, status, { development = false } = {}) {
  let data;
  try { data = JSON.parse(text); } catch {
    if (status === 404) throw new Error(development
      ? 'The PHP API was not found. Start the backend and check the Vite proxy address.'
      : 'The PHP API was not found on this hosted site. Connect a hosted PHP backend and redeploy the frontend.');
    if (status === 413) throw new Error('The server rejected the upload size. Increase PHP post_max_size and upload_max_filesize.');
    if (status === 502 || status === 503 || status === 504 || status === 0) throw new Error(development
      ? 'The PHP backend is unavailable. Start the project with npm run dev and try again.'
      : 'The PHP backend is unavailable. Check the hosted backend service and try again.');
    throw new Error(`The server returned an invalid response (HTTP ${status}). Check PHP routing and the server error log.`);
  }
  if (status < 200 || status >= 300) throw new Error(data?.error || `The request failed (HTTP ${status}). Please try again.`);
  if (!data || typeof data !== 'object') throw new Error('The server returned an invalid API response.');
  return data;
}
