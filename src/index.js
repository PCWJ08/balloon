/**
 * 服务入口。
 *
 * /api/board  → 排行榜接口，读写全站共用的一份数据
 * 其余路径    → public/ 下的静态资源，找不到时按 404 处理
 */

export { Board } from './board.js';

const TTL = 30;   // 榜单响应的缓存时长（秒），30 秒内的重复读取走缓存

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api/board') return board(request, env);
    if (path === '/api/board/admin') return admin(request, env, url);

    return env.ASSETS.fetch(request);
  }
};

async function board(request, env) {
  // 榜单接口不解释管理参数，避免借公开入口触达管理能力
  if (new URL(request.url).searchParams.has('admin')) {
    return new Response('Not Found', { status: 404 });
  }

  // 商店版是 ms-appx-web:// 的宿主，属于跨源请求，必须放行预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const stub = env.BOARD.get(env.BOARD.idFromName('global'));
  const res = await stub.fetch(request);

  const headers = new Headers(CORS);
  headers.set('Content-Type', 'application/json; charset=utf-8');

  // 响应内含调用方自身名次，因人而异，不可进共享缓存，否则他人会读到别人的名次
  const personal = new URL(request.url).searchParams.has('dev');
  headers.set('Cache-Control', request.method === 'GET' && res.ok && !personal
    ? 'public, max-age=' + TTL
    : 'no-store');

  return new Response(res.body, { status: res.status, headers });
}

/* 管理接口：未配置凭据或校验失败时一律返回 404，不暴露该路径的存在性 */
async function admin(request, env, url) {
  const token = url.searchParams.get('token') || request.headers.get('X-Admin-Token') || '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response('Not Found', { status: 404 });
  }
  const stub = env.BOARD.get(env.BOARD.idFromName('global'));
  const inner = new Headers(request.headers);
  inner.set('X-Board-Admin', '1');
  const res = await stub.fetch(new Request(request.url, {
    method: request.method, headers: inner, body: request.body
  }));
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(res.body, { status: res.status, headers });
}
