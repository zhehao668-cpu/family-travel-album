/**
 * Baidu API CORS Proxy for Family Travel Album
 *
 * Usage from browser:
 *   fetch(`${PROXY_URL}/<baidu-host>/<path>?<query>`, { method, headers, body })
 *
 * Example:
 *   fetch(`${PROXY_URL}/pan.baidu.com/rest/2.0/xpan/file?method=list&access_token=xxx`)
 *   fetch(`${PROXY_URL}/openapi.baidu.com/oauth/2.0/token`, { method: 'POST', body: params })
 */

// Whitelist of allowed Baidu API hosts
const ALLOWED_HOSTS = [
  'pan.baidu.com',
  'openapi.baidu.com',
  'aip.baidubce.com',
];

// Allowed request methods
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

// Your deployed site — set this to your GitHub Pages URL to restrict access
const ALLOWED_ORIGINS = [
  'https://zhehao668-cpu.github.io',
  'http://localhost:*',        // local development — wildcard ports handled below
  'null',                       // file:// protocol
];

function matchOrigin(origin) {
  if (!origin || origin === 'null') return true;
  for (const pattern of ALLOWED_ORIGINS) {
    if (pattern === origin) return true;
    if (pattern.includes(':*')) {
      const base = pattern.replace(':*', '');
      if (origin.startsWith(base + ':')) return true;
    }
  }
  // During development, allow all localhost variants
  if (origin.startsWith('http://localhost:')) return true;
  if (origin.startsWith('http://127.0.0.1:')) return true;
  return false;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', '),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // --- Handle CORS preflight ---
    if (request.method === 'OPTIONS') {
      if (!matchOrigin(origin)) {
        return new Response('Origin not allowed', { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // --- Parse target from path ---
    // Path format: /<baidu-host>/<api-path>
    // E.g.: /pan.baidu.com/rest/2.0/xpan/file?method=list
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Invalid path. Use /<host>/<api-path>' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    const targetHost = pathParts[0];
    const targetPath = '/' + pathParts.slice(1).join('/');

    // Security: only allow whitelisted Baidu hosts
    if (!ALLOWED_HOSTS.includes(targetHost)) {
      return new Response(
        JSON.stringify({ error: `Host "${targetHost}" is not allowed` }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    if (!matchOrigin(origin)) {
      return new Response(
        JSON.stringify({ error: 'Origin not allowed' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    // --- Build and forward request to Baidu ---
    const targetUrl = new URL(`https://${targetHost}${targetPath}`);
    // Copy all query params from our request to the target
    url.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v));

    // Prepare headers for Baidu (forward most, remove host/origin)
    const forwardHeaders = new Headers();
    for (const [k, v] of request.headers.entries()) {
      const lk = k.toLowerCase();
      if (lk === 'host' || lk === 'origin' || lk === 'referer') continue;
      forwardHeaders.set(k, v);
    }
    // Always set content-type for POST requests if not present
    if (request.method === 'POST' && !forwardHeaders.has('content-type')) {
      forwardHeaders.set('Content-Type', 'application/x-www-form-urlencoded');
    }

    const forwardRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: forwardHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'follow',
    });

    try {
      const baiduResponse = await fetch(forwardRequest);

      // Build response with CORS headers
      const responseHeaders = new Headers(baiduResponse.headers);
      const cHeaders = corsHeaders(origin);
      for (const [k, v] of Object.entries(cHeaders)) {
        responseHeaders.set(k, v);
      }
      // Expose additional headers that the browser might need
      responseHeaders.set('Access-Control-Expose-Headers', '*');

      return new Response(baiduResponse.body, {
        status: baiduResponse.status,
        statusText: baiduResponse.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Proxy request failed', detail: err.message }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }
  },
};
