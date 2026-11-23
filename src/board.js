/**
 * 排行榜 · 单一全局实例（Durable Object）
 *
 * 全站只有一份数据，所有设备都写进这里；写入天然串行，不会互相覆盖。
 * 表在首次唤醒时自建，不需要额外跑迁移。
 *
 * 口径：
 *   高分榜 —— 只收正分，按分数降序
 *   低分榜 —— 只收负分，按分数升序
 *   0 分   —— 两榜都不收，也不参与任何统计
 */

const MODE_LABEL = { classic: '经典', zen: '禅意', gale: '疾风' };
const MAX_SCORE = 100000;
const MAX_ROWS = 100;

const PROVINCE = {
  'beijing': '北京', 'tianjin': '天津', 'hebei': '河北', 'shanxi': '山西',
  'inner mongolia': '内蒙古', 'liaoning': '辽宁', 'jilin': '吉林', 'heilongjiang': '黑龙江',
  'shanghai': '上海', 'jiangsu': '江苏', 'zhejiang': '浙江', 'anhui': '安徽',
  'fujian': '福建', 'jiangxi': '江西', 'shandong': '山东', 'henan': '河南',
  'hubei': '湖北', 'hunan': '湖南', 'guangdong': '广东', 'guangxi': '广西',
  'hainan': '海南', 'chongqing': '重庆', 'sichuan': '四川', 'guizhou': '贵州',
  'yunnan': '云南', 'tibet': '西藏', 'xizang': '西藏', 'shaanxi': '陕西',
  'gansu': '甘肃', 'qinghai': '青海', 'ningxia': '宁夏', 'xinjiang': '新疆',
  'hong kong': '香港', 'macau': '澳门', 'macao': '澳门', 'taiwan': '台湾'
};

/* 将请求头中的地理位置转换为展示文本 */
function placeOf(cf) {
  if (!cf) return '未知地区';

  const country = (cf.country || '').toUpperCase();
  const region = String(cf.region || '').trim();

  if (country === 'CN' || country === 'HK' || country === 'MO' || country === 'TW') {
    if (country === 'HK') return '中国 · 香港';
    if (country === 'MO') return '中国 · 澳门';
    if (country === 'TW') return '中国 · 台湾';

    const cn = PROVINCE[region.toLowerCase()];
    if (cn) return '中国 · ' + cn;
    return region ? '中国 · ' + region : '中国';
  }

  if (!country) return '未知地区';
  return region ? country + ' · ' + region : country;
}

export class Board {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.hits = new Map();          // ip → { 分钟, 次数 }，只做兜底限流

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        dev       TEXT PRIMARY KEY,
        hi        INTEGER,
        hi_mode   TEXT,
        hi_at     INTEGER,
        lo        INTEGER,
        lo_mode   TEXT,
        lo_at     INTEGER,
        place     TEXT,
        last_at   INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_hi ON devices (hi DESC, hi_at ASC);
      CREATE INDEX IF NOT EXISTS idx_lo ON devices (lo ASC, lo_at ASC);
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 管理动作须携带 Worker 注入的内部标记，否则按普通请求处理
    const admin = url.searchParams.get('admin');
    if (admin && request.headers.get('X-Board-Admin') === '1') {
      if (admin === 'list') return this.adminList(url);
      if (admin === 'del') return this.adminDel(url);
    }

    if (request.method === 'POST') return this.submit(request, url);
    if (request.method === 'GET') return this.rank(url);
    return this.json({ ok: false, reason: 'method' }, 405);
  }

  /* ---------- 管理：看原始行 ---------- */
  adminList(url) {
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10) || 200));
    const q = (url.searchParams.get('q') || '').trim();
    const rows = q
      ? this.sql.exec(
          `SELECT dev, hi, hi_mode, lo, lo_mode, place, last_at
             FROM devices WHERE dev LIKE ? ORDER BY last_at DESC LIMIT ?`, q + '%', limit
        ).toArray()
      : this.sql.exec(
          `SELECT dev, hi, hi_mode, lo, lo_mode, place, last_at
             FROM devices ORDER BY last_at DESC LIMIT ?`, limit
        ).toArray();
    const total = this.sql.exec(`SELECT COUNT(*) AS n FROM devices`).one().n;
    return this.json({ ok: true, total, rows });
  }

  /* ---------- 管理：删一台，或清空 ---------- */
  adminDel(url) {
    const dev = url.searchParams.get('dev');
    const wipe = url.searchParams.get('all') === '1' && url.searchParams.get('confirm') === 'YES';

    if (wipe) {
      this.sql.exec(`DELETE FROM devices`);
      return this.json({ ok: true, cleared: true });
    }
    if (!dev) return this.json({ ok: false, reason: 'dev' }, 400);
    const cur = this.sql.exec(`DELETE FROM devices WHERE dev = ?`, dev);
    return this.json({ ok: true, deleted: cur.rowsWritten });
  }

  /* ---------- 取榜 ---------- */
  rank(url) {
    const tab = url.searchParams.get('tab') === 'low' ? 'low' : 'high';
    const limit = Math.min(MAX_ROWS, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
    const dev = (url.searchParams.get('dev') || '').slice(0, 64);

    const col = tab === 'high' ? 'hi' : 'lo';
    const dir = tab === 'high' ? 'DESC' : 'ASC';
    const cmp = tab === 'high' ? '>' : '<';

    // 0 分不入榜：hi > 0 / lo < 0 为最终过滤条件
    const rows = this.sql.exec(
      `SELECT ${col} AS score, ${col}_mode AS mode, place
         FROM devices
        WHERE ${col} IS NOT NULL AND ${col} ${tab === 'high' ? '>' : '<'} 0
        ORDER BY ${col} ${dir}, ${col}_at ASC
        LIMIT ?`, limit
    ).toArray();

    const total = this.sql.exec(
      `SELECT COUNT(*) AS n FROM devices
        WHERE ${col} IS NOT NULL AND ${col} ${tab === 'high' ? '>' : '<'} 0`
    ).one().n;

    let me = null;
    if (dev) {
      const row = this.sql.exec(`SELECT ${col} AS s, ${col}_mode AS m, ${col}_at AS t FROM devices WHERE dev = ?`, dev).toArray()[0];
      if (row && row.s != null && row.s !== 0) {
        const better = this.sql.exec(
          `SELECT COUNT(*) AS n FROM devices
            WHERE ${col} IS NOT NULL AND ${col} ${tab === 'high' ? '>' : '<'} 0
              AND (${col} ${cmp} ? OR (${col} = ? AND ${col}_at < ?))`,
          row.s, row.s, row.t
        ).one().n;
        me = { rank: better + 1, score: row.s, mode: row.m };
      }
    }

    return this.json({ ok: true, total, rows, me });
  }

  /* ---------- 交成绩 ---------- */
  async submit(request, url) {
    const ip = request.headers.get('CF-Connecting-IP') || '';

    // 兜底限流：单 IP 每分钟 120 次，正常玩家一分钟最多三局
    const minute = Math.floor(Date.now() / 60000);
    const hit = this.hits.get(ip);
    if (hit && hit.minute === minute) {
      if (hit.count >= 120) return this.json({ ok: false, reason: 'busy' }, 429);
      hit.count++;
    } else {
      this.hits.set(ip, { minute, count: 1 });
      if (this.hits.size > 2000) this.hits.clear();
    }

    let body;
    try { body = await request.json(); } catch (e) { return this.json({ ok: false, reason: 'bad' }, 400); }

    const dev = String(body && body.dev || '').trim();
    const score = Number(body && body.score);
    const mode = String(body && body.mode || '').trim();

    if (!dev || dev.length > 64) return this.json({ ok: false, reason: 'device' }, 400);
    if (!Number.isInteger(score) || Math.abs(score) > MAX_SCORE) return this.json({ ok: false, reason: 'score' }, 400);
    if (!MODE_LABEL[mode]) return this.json({ ok: false, reason: 'mode' }, 400);
    if (score === 0) return this.json({ ok: false, reason: 'zero' }, 400);   // 0 分不入榜

    const now = Date.now();
    const place = placeOf(request.cf);

    const row = this.sql.exec(
      `SELECT hi, hi_mode, hi_at, lo, lo_mode, lo_at, place, last_at FROM devices WHERE dev = ?`, dev
    ).toArray()[0];

    // 同一设备 1.5 秒内只收一次，防误触与脚本空转；正常一局远超这个间隔
    if (row && now - (row.last_at || 0) < 1500) {
      return this.json({ ok: false, reason: 'fast' }, 429);
    }

    let hi = row ? row.hi : null, hiMode = row ? row.hi_mode : null, hiAt = row ? row.hi_at : null;
    let lo = row ? row.lo : null, loMode = row ? row.lo_mode : null, loAt = row ? row.lo_at : null;

    if (score > 0 && (hi === null || score > hi)) { hi = score; hiMode = MODE_LABEL[mode]; hiAt = now; }
    if (score < 0 && (lo === null || score < lo)) { lo = score; loMode = MODE_LABEL[mode]; loAt = now; }

    // 地区以最近一次有效解析为准，解析不到就保留旧值
    const newPlace = (row && row.place && place === '未知地区') ? row.place : place;

    this.sql.exec(
      `INSERT INTO devices (dev, hi, hi_mode, hi_at, lo, lo_mode, lo_at, place, last_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(dev) DO UPDATE SET
         hi = excluded.hi, hi_mode = excluded.hi_mode, hi_at = excluded.hi_at,
         lo = excluded.lo, lo_mode = excluded.lo_mode, lo_at = excluded.lo_at,
         place = excluded.place, last_at = excluded.last_at`,
      dev, hi, hiMode, hiAt, lo, loMode, loAt, newPlace, now
    );

    return this.json({ ok: true, hi, lo });
  }

  json(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }
}
