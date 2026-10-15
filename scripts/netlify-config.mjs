export function netlifyProxyRule(value) {
  if (!value?.trim()) throw new Error('Netlify cannot run the PHP backend. Set PHP_BACKEND_URL to a separately hosted HTTPS PHP endpoint (for example https://backend.example.com/api/index.php), or deploy the entire app on PHP/MySQL hosting.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('PHP_BACKEND_URL must be a complete HTTPS URL ending in /api/index.php.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/index.php')) throw new Error('PHP_BACKEND_URL must be a complete HTTPS PHP endpoint ending in /index.php, without credentials, query, or fragment.');
  if (url.hostname === 'localhost' || /^(127\.|10\.|192\.168\.|0\.)/.test(url.hostname) || url.hostname === '[::1]' || url.hostname.endsWith('.local')) throw new Error('PHP_BACKEND_URL must be publicly reachable; a local XAMPP address cannot be reached by Netlify.');
  if (url.hostname.endsWith('.netlify.app')) throw new Error('A netlify.app frontend address cannot execute this PHP API. Use a PHP-capable backend host for PHP_BACKEND_URL.');
  return `/api/index.php ${url.href} 200!\n`;
}
