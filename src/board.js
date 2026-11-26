/**
 * 排行榜的存储与查询。
 *
 * 全站共用一份数据，写入串行执行，不会互相覆盖；数据表在首次使用时
 * 自动建立，不需要额外的迁移步骤。每台设备只保留一组记录（历史最高分
 * 与历史最低分），重复提交只更新，不新增行。
 *
 * 收录规则：
 *   高分榜 —— 仅收录正分，按分数降序
 *   低分榜 —— 仅收录负分，按分数升序
 *   0 分   —— 两榜均不收录，也不计入人数统计
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

/* 常用国家：代码 → [中文, English]。只到国家，不再细分地区 */
const COUNTRY = {
  US: ['美国', 'United States'], CA: ['加拿大', 'Canada'], MX: ['墨西哥', 'Mexico'],
  BR: ['巴西', 'Brazil'], AR: ['阿根廷', 'Argentina'], CL: ['智利', 'Chile'],
  CO: ['哥伦比亚', 'Colombia'], PE: ['秘鲁', 'Peru'], VE: ['委内瑞拉', 'Venezuela'],
  EC: ['厄瓜多尔', 'Ecuador'], UY: ['乌拉圭', 'Uruguay'], PY: ['巴拉圭', 'Paraguay'],
  BO: ['玻利维亚', 'Bolivia'], CU: ['古巴', 'Cuba'], DO: ['多米尼加', 'Dominican Republic'],

  GB: ['英国', 'United Kingdom'], IE: ['爱尔兰', 'Ireland'], FR: ['法国', 'France'],
  DE: ['德国', 'Germany'], IT: ['意大利', 'Italy'], ES: ['西班牙', 'Spain'],
  PT: ['葡萄牙', 'Portugal'], NL: ['荷兰', 'Netherlands'], BE: ['比利时', 'Belgium'],
  LU: ['卢森堡', 'Luxembourg'], CH: ['瑞士', 'Switzerland'], AT: ['奥地利', 'Austria'],
  SE: ['瑞典', 'Sweden'], NO: ['挪威', 'Norway'], DK: ['丹麦', 'Denmark'],
  FI: ['芬兰', 'Finland'], IS: ['冰岛', 'Iceland'], PL: ['波兰', 'Poland'],
  CZ: ['捷克', 'Czechia'], SK: ['斯洛伐克', 'Slovakia'], HU: ['匈牙利', 'Hungary'],
  RO: ['罗马尼亚', 'Romania'], BG: ['保加利亚', 'Bulgaria'], GR: ['希腊', 'Greece'],
  HR: ['克罗地亚', 'Croatia'], RS: ['塞尔维亚', 'Serbia'], SI: ['斯洛文尼亚', 'Slovenia'],
  UA: ['乌克兰', 'Ukraine'], RU: ['俄罗斯', 'Russia'], BY: ['白俄罗斯', 'Belarus'],
  LT: ['立陶宛', 'Lithuania'], LV: ['拉脱维亚', 'Latvia'], EE: ['爱沙尼亚', 'Estonia'],
  TR: ['土耳其', 'Turkey'], CY: ['塞浦路斯', 'Cyprus'], MT: ['马耳他', 'Malta'],

  JP: ['日本', 'Japan'], KR: ['韩国', 'South Korea'], SG: ['新加坡', 'Singapore'],
  MY: ['马来西亚', 'Malaysia'], TH: ['泰国', 'Thailand'], VN: ['越南', 'Vietnam'],
  PH: ['菲律宾', 'Philippines'], ID: ['印度尼西亚', 'Indonesia'], IN: ['印度', 'India'],
  PK: ['巴基斯坦', 'Pakistan'], BD: ['孟加拉国', 'Bangladesh'], LK: ['斯里兰卡', 'Sri Lanka'],
  NP: ['尼泊尔', 'Nepal'], MM: ['缅甸', 'Myanmar'], KH: ['柬埔寨', 'Cambodia'],
  LA: ['老挝', 'Laos'], BN: ['文莱', 'Brunei'], MN: ['蒙古', 'Mongolia'],
  KZ: ['哈萨克斯坦', 'Kazakhstan'],

  AU: ['澳大利亚', 'Australia'], NZ: ['新西兰', 'New Zealand'],

  AE: ['阿联酋', 'United Arab Emirates'], SA: ['沙特阿拉伯', 'Saudi Arabia'],
  QA: ['卡塔尔', 'Qatar'], KW: ['科威特', 'Kuwait'], IL: ['以色列', 'Israel'],
  JO: ['约旦', 'Jordan'], LB: ['黎巴嫩', 'Lebanon'], IR: ['伊朗', 'Iran'], IQ: ['伊拉克', 'Iraq'],

  EG: ['埃及', 'Egypt'], ZA: ['南非', 'South Africa'], NG: ['尼日利亚', 'Nigeria'],
  KE: ['肯尼亚', 'Kenya'], ET: ['埃塞俄比亚', 'Ethiopia'], MA: ['摩洛哥', 'Morocco'],
  DZ: ['阿尔及利亚', 'Algeria'], TN: ['突尼斯', 'Tunisia'], GH: ['加纳', 'Ghana'],
  TZ: ['坦桑尼亚', 'Tanzania']
};

/* 中文名反查英文，供新写入的记录用 */
const COUNTRY_EN = {};
for (const code in COUNTRY) COUNTRY_EN[COUNTRY[code][0]] = COUNTRY[code][1];

/* 地区名若已包含国家名（Central Singapore、Singapore 之类），就不再重复 */
function regionText(countryEn, region) {
  const r = String(region || '').trim();
  if (!r) return false;
  const c = String(countryEn || '').toLowerCase();
  if (r.toLowerCase() === c) return false;
  if (c && r.toLowerCase().indexOf(c) !== -1) return false;
  return true;
}

/* 常见外国一级行政区的中文名：命中就用中文，否则保留英文原名 */
const REGION_ZH = {
  // 美国
  'alabama':'阿拉巴马','alaska':'阿拉斯加','arizona':'亚利桑那','arkansas':'阿肯色',
  'california':'加利福尼亚','colorado':'科罗拉多','connecticut':'康涅狄格','delaware':'特拉华',
  'district of columbia':'哥伦比亚特区','florida':'佛罗里达','georgia':'佐治亚','hawaii':'夏威夷',
  'idaho':'爱达荷','illinois':'伊利诺伊','indiana':'印第安纳','iowa':'艾奥瓦','kansas':'堪萨斯',
  'kentucky':'肯塔基','louisiana':'路易斯安那','maine':'缅因','maryland':'马里兰',
  'massachusetts':'马萨诸塞','michigan':'密歇根','minnesota':'明尼苏达','mississippi':'密西西比',
  'missouri':'密苏里','montana':'蒙大拿','nebraska':'内布拉斯加','nevada':'内华达',
  'new hampshire':'新罕布什尔','new jersey':'新泽西','new mexico':'新墨西哥','new york':'纽约',
  'north carolina':'北卡罗来纳','north dakota':'北达科他','ohio':'俄亥俄','oklahoma':'俄克拉何马',
  'oregon':'俄勒冈','pennsylvania':'宾夕法尼亚','rhode island':'罗得岛','south carolina':'南卡罗来纳',
  'south dakota':'南达科他','tennessee':'田纳西','texas':'得克萨斯','utah':'犹他','vermont':'佛蒙特',
  'virginia':'弗吉尼亚','washington':'华盛顿','west virginia':'西弗吉尼亚','wisconsin':'威斯康星',
  'wyoming':'怀俄明',
  // 加拿大
  'alberta':'艾伯塔','british columbia':'不列颠哥伦比亚','manitoba':'曼尼托巴',
  'new brunswick':'新不伦瑞克','newfoundland and labrador':'纽芬兰与拉布拉多','nova scotia':'新斯科舍',
  'ontario':'安大略','prince edward island':'爱德华王子岛','quebec':'魁北克','saskatchewan':'萨斯喀彻温',
  'northwest territories':'西北地区','nunavut':'努纳武特','yukon':'育空',
  // 澳大利亚 / 新西兰
  'new south wales':'新南威尔士','queensland':'昆士兰','south australia':'南澳大利亚',
  'tasmania':'塔斯马尼亚','victoria':'维多利亚','western australia':'西澳大利亚',
  'australian capital territory':'首都领地','northern territory':'北领地',
  'auckland':'奥克兰','wellington':'惠灵顿','canterbury':'坎特伯雷',
  // 英国 / 爱尔兰
  'england':'英格兰','scotland':'苏格兰','wales':'威尔士','northern ireland':'北爱尔兰',
  'leinster':'伦斯特','munster':'芒斯特','connacht':'康诺特','ulster':'阿尔斯特',
  // 日本
  'hokkaido':'北海道','aomori':'青森','iwate':'岩手','miyagi':'宫城','akita':'秋田','yamagata':'山形',
  'fukushima':'福岛','ibaraki':'茨城','tochigi':'栃木','gunma':'群马','saitama':'埼玉','chiba':'千叶',
  'tokyo':'东京','kanagawa':'神奈川','niigata':'新潟','toyama':'富山','ishikawa':'石川','fukui':'福井',
  'yamanashi':'山梨','nagano':'长野','gifu':'岐阜','shizuoka':'静冈','aichi':'爱知','mie':'三重',
  'shiga':'滋贺','kyoto':'京都','osaka':'大阪','hyogo':'兵库','nara':'奈良','wakayama':'和歌山',
  'tottori':'鸟取','shimane':'岛根','okayama':'冈山','hiroshima':'广岛','yamaguchi':'山口',
  'tokushima':'德岛','kagawa':'香川','ehime':'爱媛','kochi':'高知','fukuoka':'福冈','saga':'佐贺',
  'nagasaki':'长崎','kumamoto':'熊本','oita':'大分','miyazaki':'宫崎','kagoshima':'鹿儿岛','okinawa':'冲绳',
  // 韩国
  'seoul':'首尔','busan':'釜山','incheon':'仁川','daegu':'大邱','daejeon':'大田','gwangju':'光州',
  'ulsan':'蔚山','sejong':'世宗','gyeonggi':'京畿','gangwon':'江原','chungcheongbuk':'忠清北',
  'chungcheongnam':'忠清南','jeollabuk':'全罗北','jeollanam':'全罗南','gyeongsangbuk':'庆尚北',
  'gyeongsangnam':'庆尚南','jeju':'济州',
  // 德国
  'baden-wurttemberg':'巴登-符腾堡','bavaria':'巴伐利亚','berlin':'柏林','brandenburg':'勃兰登堡',
  'bremen':'不来梅','hamburg':'汉堡','hesse':'黑森','lower saxony':'下萨克森',
  'mecklenburg-vorpommern':'梅克伦堡-前波美拉尼亚','north rhine-westphalia':'北莱茵-威斯特法伦',
  'rhineland-palatinate':'莱茵兰-普法尔茨','saarland':'萨尔','saxony':'萨克森',
  'saxony-anhalt':'萨克森-安哈尔特','schleswig-holstein':'石勒苏益格-荷尔斯泰因','thuringia':'图林根',
  // 法国
  'ile-de-france':'法兰西岛','normandy':'诺曼底','brittany':'布列塔尼','occitanie':'奥克西塔尼',
  'nouvelle-aquitaine':'新阿基坦','auvergne-rhone-alpes':'奥弗涅-罗讷-阿尔卑斯',
  'provence-alpes-cote d\'azur':'普罗旺斯-阿尔卑斯-蓝色海岸','hauts-de-france':'上法兰西',
  'grand est':'大东部','pays de la loire':'卢瓦尔河地区','centre-val de loire':'中央-卢瓦尔河谷',
  'bourgogne-franche-comte':'勃艮第-弗朗什-孔泰','corsica':'科西嘉',
  // 荷兰 / 其它常见
  'north holland':'北荷兰','south holland':'南荷兰','utrecht':'乌得勒支','gelderland':'海尔德兰',
  'noord-brabant':'北布拉班特','limburg':'林堡','overijssel':'上艾瑟尔','friesland':'弗里斯兰',
  'groningen':'格罗宁根','drenthe':'德伦特','zeeland':'泽兰','flevoland':'弗莱福兰'
};

/* 地区名转中文，没收录就保留英文 */
function regionLabel(region) {
  const r = String(region || '').trim();
  if (!r) return '';
  return REGION_ZH[r.toLowerCase()] || r;
}

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
  const c = COUNTRY[country];
  if (!c) return '海外';
  if (!region) return c[0];
  return regionText(c[1], region) ? c[0] + ' · ' + regionLabel(region) : c[0];
}

/* 读取时归一化：把旧的「SG」「US · California」等统一成国家名，历史数据不必改写 */
function displayPlace(raw) {
  const v = String(raw || '').trim();
  if (!v) return { zh: '未知地区', en: 'Unknown' };
  if (v === '未知地区') return { zh: '未知地区', en: 'Unknown' };

  // 国内记录保持「中国 · 省份」，英文由前端按省名映射
  if (v.indexOf('中国') === 0) return { zh: v, en: null };

  const pure = /^[A-Za-z]{2}$/.exec(v);
  if (pure) {
    const c = COUNTRY[v.toUpperCase()];
    return c ? { zh: c[0], en: c[1] } : { zh: '海外', en: 'Overseas' };
  }

  // 「国家 · 地区」：国家可能是旧的两字代码，也可能是新写入的中文名
  const parts = v.split('·');
  if (parts.length === 2) {
    const head = parts[0].trim();
    const region = parts[1].trim();
    const code = /^[A-Za-z]{2}$/.test(head) ? head.toUpperCase() : null;
    const byCode = code ? COUNTRY[code] : null;
    const zhHead = byCode ? byCode[0] : (COUNTRY_EN[head] ? head : null);
    if (zhHead) {
      const enHead = byCode ? byCode[1] : COUNTRY_EN[head];
      if (!regionText(enHead, region)) return { zh: zhHead, en: enHead };
      return { zh: zhHead + ' · ' + regionLabel(region), en: enHead + ' · ' + region };
    }
    return { zh: '海外', en: 'Overseas' };
  }

  if (/[\u4e00-\u9fa5]/.test(v)) {
    if (v === '海外') return { zh: '海外', en: 'Overseas' };
    return { zh: v, en: COUNTRY_EN[v] || null };
  }
  return { zh: '海外', en: 'Overseas' };
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

    // 管理动作须携带服务端注入的内部标记；缺少标记时按普通请求处理
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

    // 0 分不入榜：hi > 0 与 lo < 0 是查询层的最终过滤条件
    const rows = this.sql.exec(
      `SELECT ${col} AS score, ${col}_mode AS mode, place
         FROM devices
        WHERE ${col} IS NOT NULL AND ${col} ${tab === 'high' ? '>' : '<'} 0
        ORDER BY ${col} ${dir}, ${col}_at ASC
        LIMIT ?`, limit
    ).toArray();

    const shaped = rows.map(r => {
      const d = displayPlace(r.place);
      return { score: r.score, mode: r.mode, place: d.zh, place_en: d.en };
    });

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

    return this.json({ ok: true, total, rows: shaped, me });
  }

  /* ---------- 交成绩 ---------- */
  async submit(request, url) {
    const ip = request.headers.get('CF-Connecting-IP') || '';

    // 访问频次上限：按来源地址统计。正常玩家一分钟最多三局，阈值留足余量
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

    // 同一设备的写入间隔下限：过滤重复提交与脚本空转，正常对局的间隔远大于此
    if (row && now - (row.last_at || 0) < 1500) {
      return this.json({ ok: false, reason: 'fast' }, 429);
    }

    let hi = row ? row.hi : null, hiMode = row ? row.hi_mode : null, hiAt = row ? row.hi_at : null;
    let lo = row ? row.lo : null, loMode = row ? row.lo_mode : null, loAt = row ? row.lo_at : null;

    if (score > 0 && (hi === null || score > hi)) { hi = score; hiMode = MODE_LABEL[mode]; hiAt = now; }
    if (score < 0 && (lo === null || score < lo)) { lo = score; loMode = MODE_LABEL[mode]; loAt = now; }

    // 地区以最近一次解析成功的结果为准；本次解析失败时保留原值，避免信息退化
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

export { placeOf, displayPlace, COUNTRY };
