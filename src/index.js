/**
 * Worker 入口。
 *
 * /api/board  → 排行榜（转到 Durable Object，全站共用一份数据）
 * 其余        → public/ 下的静态资源
 */

export { Board } from './board.js';

const TTL = 30;   // 榜是「看」的东西，30 秒缓存足够，也省额度

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
  // 普通榜单一律不认 admin 参数，避免绕过口令
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

  // 带 dev 的响应含「自己的名次」，一人一份，缓存会让人看到旧名次
  const personal = new URL(request.url).searchParams.has('dev');
  headers.set('Cache-Control', request.method === 'GET' && res.ok && !personal
    ? 'public, max-age=' + TTL
    : 'no-store');

  return new Response(res.body, { status: res.status, headers });
}

/* 管理接口：没配口令或口令不对，一律当作不存在 */
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
