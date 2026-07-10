/**
 * Baidu API CORS Proxy — Vercel Serverless Function
 * 部署到 Vercel 后可在国内访问（vercel.app 通常不被墙）
 *
 * 部署方式：在 vercel-proxy 目录下运行 `vercel --prod`
 *
 * 使用格式（与 Cloudflare Worker 版完全兼容）：
 *   https://your-proxy.vercel.app/api/openapi.baidu.com/oauth/2.0/token
 *   https://your-proxy.vercel.app/api/pan.baidu.com/rest/2.0/xpan/file?method=upload
 */
export default async function handler(req, res) {
  // CORS — 允许所有来源
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 路径格式：/api/pan.baidu.com/rest/2.0/xpan/file?method=upload
  const proxyPath = req.query.proxy || '';
  const pathParts = proxyPath.filter(Boolean);

  if (pathParts.length < 2) {
    return res.status(400).json({ error: 'Invalid path. Use /api/<baidu-host>/<api-path>' });
  }

  const targetHost = pathParts[0];
  const targetPath = '/' + pathParts.slice(1).join('/');

  // 安全白名单
  const ALLOWED_HOSTS = ['pan.baidu.com', 'openapi.baidu.com', 'aip.baidubce.com'];
  if (!ALLOWED_HOSTS.includes(targetHost)) {
    return res.status(403).json({ error: `Host "${targetHost}" not allowed` });
  }

  // 构建目标 URL
  const targetUrl = new URL(`https://${targetHost}${targetPath}`);
  Object.entries(req.query).forEach(([k, v]) => {
    if (k !== 'proxy') targetUrl.searchParams.set(k, v);
  });

  try {
    // 转发请求到百度
    const fetchOpts = {
      method: req.method,
      headers: {},
      redirect: 'follow',
    };

    // 转发相关请求头
    const forwardHeaders = ['content-type', 'authorization', 'accept'];
    for (const [k, v] of Object.entries(req.headers)) {
      if (forwardHeaders.includes(k.toLowerCase())) {
        fetchOpts.headers[k] = v;
      }
    }

    // POST/PUT 请求转发 body
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOpts.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (!fetchOpts.headers['content-type']) {
        fetchOpts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    const baiduRes = await fetch(targetUrl.toString(), fetchOpts);
    const data = await baiduRes.text();

    res.status(baiduRes.status);
    // 转发响应头
    for (const [k, v] of baiduRes.headers.entries()) {
      if (k.toLowerCase() !== 'access-control-allow-origin') {
        res.setHeader(k, v);
      }
    }

    // 尝试解析为 JSON 返回，失败则返回文本
    try {
      res.json(JSON.parse(data));
    } catch {
      res.send(data);
    }
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
}
