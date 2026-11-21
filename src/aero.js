/*! NodeGet Aero 主题 · 原创的 Frutiger Aero 风格展示页 · 无依赖 */
(() => {
'use strict';

const POLL = 2000;      // 实时数据的刷新间隔；只在页面可见时轮询
const OFFLINE = 30000;  // 超过这么久没有上报就算离线
const HIST = 90;        // 列表里每条趋势线保留的点数（约 3 分钟）
const DF = ['cpu_usage', 'used_memory', 'total_memory', 'used_swap', 'total_swap', 'total_space', 'available_space',
  'read_speed', 'write_speed', 'receive_speed', 'transmit_speed', 'total_received', 'total_transmitted',
  'load_one', 'load_five', 'load_fifteen', 'uptime', 'process_count', 'tcp_connections', 'udp_connections'];
const MK = ['metadata_name', 'metadata_region', 'metadata_tags', 'metadata_hidden', 'metadata_virtualization', 'metadata_order'];

const D = document, R = D.documentElement, NS = 'http://www.w3.org/2000/svg';
const $ = s => D.querySelector(s);
const el = (t, c, x) => { const e = D.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const sv = (t, a) => { const e = D.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
const txt = (e, v) => { if (e._v !== v) { e._v = v; e.textContent = v; } };
const push = (a, v, max) => { a.push(v); if (a.length > (max || HIST)) a.shift(); };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const ms = t => (t < 1e12 ? t * 1000 : t);

/* ---------- 格式 ---------- */
const UN = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
const fB = n => { if (!(n > 0)) return '0 B'; let i = 0; while (n >= 1024 && i < 5) { n /= 1024; i++; } return (i === 0 || n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + ' ' + UN[i]; };
const fS = n => fB(n) + '/s';
const fP = v => (v == null || !isFinite(v) ? '—' : v.toFixed(1) + '%');
const p2 = n => (n < 10 ? '0' : '') + n;
const fT = t => { const d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
const fUp = s => { if (!(s > 0)) return '—'; const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600); return d > 0 ? d + ' 天 ' + h + ' 小时' : h + ' 小时 ' + Math.floor(s % 3600 / 60) + ' 分'; };
const fUpS = s => { if (!(s > 0)) return '—'; const d = Math.floor(s / 86400); return d > 0 ? d + ' 天' : Math.floor(s / 3600) + ' 小时'; };
const fAgo = (t, now) => { if (!t) return '从未'; const s = Math.max(0, Math.round((now - t) / 1000)); return s < 60 ? s + ' 秒前' : s < 3600 ? Math.round(s / 60) + ' 分钟前' : Math.round(s / 3600) + ' 小时前'; };
const fMs = v => (v == null ? '—' : v < 10 ? v.toFixed(1) : String(Math.round(v)));
const nice = v => { if (!(v > 0)) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 1.2 ? 1.2 : m <= 1.6 ? 1.6 : m <= 2 ? 2 : m <= 2.4 ? 2.4 : m <= 3.2 ? 3.2 : m <= 4 ? 4 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p; };
const use = d => { const mt = d.total_memory || 0, dt = d.total_space || 0, st = d.total_swap || 0; return { cpu: d.cpu_usage, mem: mt ? d.used_memory / mt * 100 : null, disk: dt && d.available_space != null ? (dt - d.available_space) / dt * 100 : null, swap: st ? d.used_swap / st * 100 : null }; };

/* ---------- 旗帜：用 emoji，不发外部请求。flag_map 可以把某个地区的旗换成另一面（默认 TW=CN） ---------- */
let FLAG_AS = { TW: 'CN' }, RN = null;
try { RN = new Intl.DisplayNames(['zh-CN'], { type: 'region', style: 'short' }); } catch (e) {}
const setFlagMap = s => { if (typeof s !== 'string') return; FLAG_AS = {}; for (const p of s.split(/[,;\s]+/)) { const m = /^([A-Za-z]{2})=([A-Za-z]{2})$/.exec(p); if (m) FLAG_AS[m[1].toUpperCase()] = m[2].toUpperCase(); } };
const flag = c => { c = FLAG_AS[c] || c || ''; return /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(127397 + c.charCodeAt(0), 127397 + c.charCodeAt(1)) : ''; };
const rn1 = c => { try { return (RN && /^[A-Z]{2}$/.test(c) && RN.of(c)) || c; } catch (e) { return c; } };
const rname = c => (FLAG_AS[c] && FLAG_AS[c] !== c ? rn1(FLAG_AS[c]) + rn1(c) : rn1(c));

/* ---------- JSON-RPC over WebSocket：一条连接，断线自动重连，页面不可见时不重连 ---------- */
class Rpc {
  constructor(url, token) { this.url = url; this.token = token; this.id = 0; this.p = new Map(); this.q = []; this.ws = null; this.n = 0; this.t = 0; }
  open() {
    if (this.ws) return;
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { this.retry(); return; }
    this.ws = ws;
    ws.onopen = () => { this.n = 0; for (const m of this.q) ws.send(m); this.q = []; };
    ws.onmessage = e => {
      let d; try { d = JSON.parse(e.data); } catch (_) { return; }
      const p = this.p.get(d.id); if (!p) return;
      this.p.delete(d.id); clearTimeout(p.t);
      if (d.error) p.rej(new Error(d.error.message || 'rpc error')); else p.res(d.result);
    };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null; this.q = [];
      for (const p of this.p.values()) { clearTimeout(p.t); p.rej(new Error('closed')); }
      this.p.clear(); this.retry();
    };
  }
  retry() { if (this.t || D.hidden) return; this.t = setTimeout(() => { this.t = 0; this.open(); }, Math.min(15000, 1000 * 2 ** this.n++)); }
  sleep() { if (this.ws) try { this.ws.close(); } catch (e) {} }
  call(method, params, timeout) {
    return new Promise((res, rej) => {
      const id = ++this.id, body = this.token ? Object.assign({}, params, { token: this.token }) : params || {};
      const m = JSON.stringify({ jsonrpc: '2.0', id, method, params: body });
      const t = setTimeout(() => { this.p.delete(id); rej(new Error('timeout')); }, timeout || 20000);
      this.p.set(id, { res, rej, t });
      if (this.ws && this.ws.readyState === 1) this.ws.send(m); else { this.q.push(m); this.open(); }
    });
  }
}
async function pool(n, k, fn) { let i = 0; const w = async () => { while (i < n) { const j = i++; try { await fn(j); } catch (e) {} } }; await Promise.all(Array.from({ length: Math.min(k, n) }, w)); }

/* ---------- 状态 ---------- */
const bes = [], nodes = new Map(), gh = [];
let order = [], filter = '', lastOk = 0, W = null, MAP = null, gen = 0, timer = 0, sleepT = 0, busy = false;
const msg = t => { $('#msg').textContent = t; };

async function loadBackend(be) {
  be.uuids = [];
  const r = await be.rpc.call('nodeget-server_list_all_agent_uuid', {});
  const us = (r && r.uuids) || [];
  if (!us.length) return;
  const [kv, st] = await Promise.allSettled([
    be.rpc.call('kv_get_multi_value', { namespace_key: us.flatMap(u => MK.map(k => ({ namespace: u, key: k }))) }),
    be.rpc.call('agent_static_data_multi_last_query', { uuids: us, fields: ['cpu', 'system'] }),
  ]);
  const meta = new Map(), stat = new Map();
  if (kv.status === 'fulfilled') for (const it of kv.value || []) { if (!it || it.value == null) continue; let m = meta.get(it.namespace); if (!m) meta.set(it.namespace, m = {}); m[it.key] = it.value; }
  if (st.status === 'fulfilled') for (const it of st.value || []) if (it && it.uuid) stat.set(it.uuid, it);
  for (const u of us) {
    const m = meta.get(u) || {};
    if (m.metadata_hidden) continue;
    const s = stat.get(u) || {}, o = Number(m.metadata_order), rg = String(m.metadata_region || '').trim().toUpperCase();
    const old = nodes.get(u);
    nodes.set(u, Object.assign(old || { uuid: u, dyn: null, ts: 0, on: false, h: [], r: null }, {
      be, st: s, rg,
      name: String(m.metadata_name || (s.system && s.system.system_host_name) || u.slice(0, 8)),
      meta: { order: isFinite(o) ? o : 0, virt: m.metadata_virtualization ? String(m.metadata_virtualization) : '', tags: Array.isArray(m.metadata_tags) ? m.metadata_tags.filter(Boolean) : [] },
    }));
    be.uuids.push(u);
  }
}

/* ---------- 列表 ---------- */
function mkRow(n) {
  const a = el('a', 'row'); a.href = '#/n/' + n.uuid;
  const orb = el('i', 'orb'), nm = el('span', 'nm');
  nm.append(orb, el('b', '', n.name));
  if (n.rg) { const g = el('span', 'rg'), f = flag(n.rg); if (f) g.append(el('span', 'fl', f)); g.append(n.rg); nm.append(g); }
  const cell = (cls, kind, label) => { const s = el('span', 'm ' + cls), v = el('b', '', '—'), t = el('span', 'tube'), f = el('i', 'f ' + kind); s.dataset.l = label; t.append(f); s.append(v, t); return { s, v, f, kind }; };
  const c = cell('c', 'cpu', 'CPU'), me = cell('me', 'mem', '内存'), d = cell('d', 'dsk', '磁盘');
  const net = el('span', 'net'), up = el('span', 'up', '↑ —'), dn = el('span', 'dn', '↓ —'), ut = el('span', 'ut', '—');
  net.append(up, dn);
  const sp = sv('svg', { class: 'spark', viewBox: '0 0 100 28', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const ar = sv('polygon', { class: 'sa' }), ln = sv('polyline', { class: 'sl' });
  sp.append(ar, ln);
  a.append(nm, c.s, me.s, d.s, net, ut, sp);
  n.r = { a, orb, c, me, d, up, dn, ut, ar, ln, st: '' };
  return a;
}
function bar(c, p) {
  const v = p == null || !isFinite(p) ? 0 : Math.max(0, Math.min(100, p)), k = Math.round(v * 5);
  if (c.f._k !== k) { c.f._k = k; c.f.style.transform = 'scaleX(' + k / 500 + ')'; }
  const lv = v >= 90 ? 'bad' : v >= 75 ? 'warn' : '';
  if (c.f._l !== lv) { c.f._l = lv; c.f.className = 'f ' + c.kind + (lv ? ' ' + lv : ''); if (c.v) c.v.className = lv; }
}
function spark(ln, ar, a, floor) {
  const n = a.length; if (n < 2) return;
  let mx = floor || 1; for (let i = 0; i < n; i++) if (a[i] > mx) mx = a[i];
  const st = 100 / (HIST - 1), x0 = 100 - (n - 1) * st; let p = '';
  for (let i = 0; i < n; i++) p += (x0 + i * st).toFixed(1) + ',' + (26.5 - a[i] / mx * 24).toFixed(1) + ' ';
  ln.setAttribute('points', p); ar.setAttribute('points', x0.toFixed(1) + ',28 ' + p + '100,28');
}
function upRow(n, now) {
  const r = n.r, d = n.dyn, st = !d ? '' : n.on ? 'on' : 'off';
  if (r.st !== st) { r.st = st; r.orb.className = 'orb ' + st; r.a.classList.toggle('off', st === 'off'); r.a.setAttribute('aria-label', n.name + (st === 'off' ? '（离线）' : '')); }
  if (!d) return;
  const u = use(d);
  txt(r.c.v, fP(u.cpu)); bar(r.c, u.cpu); txt(r.me.v, fP(u.mem)); bar(r.me, u.mem); txt(r.d.v, fP(u.disk)); bar(r.d, u.disk);
  txt(r.up, '↑ ' + fS(d.transmit_speed)); txt(r.dn, '↓ ' + fS(d.receive_speed));
  txt(r.ut, n.on ? fUpS(d.uptime) : '离线 ' + fAgo(n.ts, now));
  spark(r.ln, r.ar, n.h, 10);
}
function setFilter(c) {
  filter = c;
  for (const b of $('#pills').children) b.setAttribute('aria-pressed', String(b.dataset.c === c));
  for (const n of order) n.r.a.hidden = !!c && (n.rg || '—') !== c;
}
function build() {
  order = [...nodes.values()].sort((a, b) => a.meta.order - b.meta.order || a.name.localeCompare(b.name));
  const rows = $('#rows'), pills = $('#pills'), reg = new Map(), f = D.createDocumentFragment();
  for (const n of order) { f.append(mkRow(n)); const c = n.rg || '—'; reg.set(c, (reg.get(c) || 0) + 1); }
  rows.textContent = ''; rows.append(f);
  const pill = (c, label, cnt) => { const b = el('button', 'pill'), fl = flag(c); b.type = 'button'; b.dataset.c = c; if (fl) b.append(el('span', 'fl', fl)); b.append(el('span', '', label), el('em', '', String(cnt))); b.onclick = () => setFilter(c); return b; };
  pills.textContent = ''; pills.append(pill('', '全部', order.length));
  for (const c of [...reg.keys()].sort()) pills.append(pill(c, c, reg.get(c)));
  if (filter && !reg.has(filter)) filter = '';
  setFilter(filter); msg('');
}

/* ---------- 轮询与总览 ---------- */
function feed(n, r) {
  const t = ms(r.timestamp || 0);
  if (n.dyn && n.ts === t) return;
  n.dyn = r; n.ts = t;
  const u = use(r); push(n.h, u.cpu || 0);
  if (W && W.n === n && W.live) W.live(r, u);
}
const S = {};
function render(fresh) {
  const now = Date.now(); let on = 0, cpu = 0, mem = 0, rx = 0, tx = 0, trx = 0, ttx = 0;
  for (const n of order) {
    const d = n.dyn; n.on = !!d && now - n.ts < OFFLINE;
    if (d) { trx += d.total_received || 0; ttx += d.total_transmitted || 0; }
    if (n.on) { const u = use(d); on++; cpu += u.cpu || 0; mem += u.mem || 0; rx += d.receive_speed || 0; tx += d.transmit_speed || 0; }
    upRow(n, now);
  }
  const tot = order.length, ac = on ? cpu / on : null, am = on ? mem / on : null;
  txt(S.on, String(on)); txt(S.tot, ' / ' + tot); txt(S.sub, on === tot ? '全部在线' : tot - on + ' 台离线');
  txt(S.cpu, fP(ac)); bar(S.cpuB, ac); txt(S.mem, fP(am)); bar(S.memB, am);
  txt(S.up, '↑ ' + fS(tx)); txt(S.dn, '↓ ' + fS(rx)); txt(S.tr, '累计 ↑ ' + fB(ttx) + ' ↓ ' + fB(trx));
  if (fresh) { push(gh, rx + tx); spark(S.gL, S.gA, gh, 1024); }
  const live = now - lastOk < 10000;
  if (S.lk._s !== live) { S.lk._s = live; S.lk.className = 'orb ' + (live ? 'on' : 'off'); txt(S.lkT, live ? '实时 · 每 2 秒刷新' : '连接中断，正在重连'); }
  txt(S.fN, '节点 ' + on + ' / ' + tot);
  if (W && W.tick) W.tick(now);
}
async function poll() {
  if (busy || D.hidden) return;
  busy = true; let ok = false;
  await Promise.all(bes.map(async b => {
    if (!b.uuids.length) return;
    try { const rows = await b.rpc.call('agent_dynamic_summary_multi_last_query', { uuids: b.uuids, fields: DF }, 8000); ok = true; for (const r of rows || []) { const n = nodes.get(r.uuid); if (n) feed(n, r); } } catch (e) {}
  }));
  busy = false; if (ok) lastOk = Date.now();
  render(ok);
}
function loop() {
  const g = ++gen; clearTimeout(timer);
  const step = async () => { if (g !== gen) return; await poll(); if (g === gen && !D.hidden) timer = setTimeout(step, POLL); };
  step();
}
D.addEventListener('visibilitychange', () => {
  clearTimeout(timer); clearTimeout(sleepT);
  if (D.hidden) { gen++; sleepT = setTimeout(() => bes.forEach(b => b.rpc.sleep()), 60000); } else if (order.length) loop();
});
// 进页面时给每条趋势线垫上最近一分钟的 CPU（每台只取一个字段、60 行）
function prefill() {
  const list = order.slice();
  return pool(list.length, 3, async i => {
    const n = list[i], now = Date.now();
    const rows = await n.be.rpc.call('agent_query_dynamic_summary', { query: { fields: ['cpu_usage'], condition: [{ uuid: n.uuid }, { timestamp_from_to: [now - 12e4, now] }, { limit: 60 }] } });
    if (!rows || !rows.length) return;
    rows.sort((a, b) => a.timestamp - b.timestamp);
    const pre = []; for (let j = rows.length % 2 ? 0 : 1; j < rows.length; j += 2) pre.push(rows[j].cpu_usage || 0);
    n.h = pre.concat(n.h).slice(-HIST);
  });
}

/* ---------- 窗口 ---------- */
function closeWin() { if (!W) return; W.root.remove(); W = null; R.classList.remove('lock'); }
const go = h => { if (h) location.hash = h; else { history.pushState(null, '', location.pathname + location.search); route(); } };
function shell(key) {
  closeWin();
  const root = el('div', 'win'), pane = el('div', 'pane'), tb = el('div', 'tbar'), tt = el('div', 'tt'), x = el('button', 'x'), body = el('div', 'wbody');
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
  x.type = 'button'; x.setAttribute('aria-label', '关闭'); x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  x.onclick = () => go('');
  root.addEventListener('mousedown', e => { if (e.target === root) go(''); });
  tb.append(tt, x); pane.append(tb, body); root.append(pane); D.body.append(root); R.classList.add('lock');
  W = { key, root, tt, body, n: null, tick: null, live: null };
  return W;
}
function route() {
  const h = location.hash;
  if (W && W.key === h) return;
  const m = /^#\/n\/([\w-]+)$/.exec(h), n = m && nodes.get(m[1]);
  if (n) openNode(n); else if (h === '#/map' && order.length) openMap(); else closeWin();
}
addEventListener('hashchange', route);
addEventListener('popstate', route);
addEventListener('keydown', e => { if (e.key === 'Escape' && W) go(''); });
const section = title => { const s = el('section', 'sec'), h = el('h3', '', title), b = el('div'); s.append(h, b); return { el: s, h, b }; };
const kv = pairs => { const dl = el('dl', 'kv'), refs = {}; for (const [k, label, v] of pairs) { const dd = el('dd', '', v == null || v === '' ? '—' : String(v)); dl.append(el('dt', '', label), dd); refs[k] = dd; } return { dl, refs }; };

// 水位球：一颗玻璃球，水面的高度就是占用
const OG = '<circle class="sh" cx="60" cy="60" r="54"/><g clip-path="url(#ocp)"><g class="lv"><path d="M-70 0q17.5-7 35 0t35 0 35 0 35 0 35 0 35 0 35 0V140H-70z"/></g></g><ellipse class="gl" cx="60" cy="33" rx="33" ry="19"/><circle class="rm" cx="60" cy="60" r="54"/><circle class="ed" cx="60" cy="60" r="56"/><text class="tv" x="60" y="67" text-anchor="middle">—</text>';
function gauge(kind, label) {
  const g = el('div', 'g'), s = sv('svg', { class: 'og ' + kind, viewBox: '0 0 120 120', role: 'img' });
  s.innerHTML = OG;
  const sm = el('small', '', '—'), lv = s.querySelector('.lv'), tv = s.querySelector('.tv');
  g.append(s, el('b', '', label), sm);
  return { g, set(p, sub) { const v = p == null || !isFinite(p) ? null : Math.max(0, Math.min(100, p)), y = (114 - (v || 0) * 1.08).toFixed(1); if (lv._y !== y) { lv._y = y; lv.style.transform = 'translateY(' + y + 'px)'; } txt(tv, v == null ? '—' : v.toFixed(1) + '%'); txt(sm, sub); } };
}
function mini(label, cls) {
  const b = el('div', 'tc'), th = el('div', 'th'), v = el('b', '', '—'), s = sv('svg', { class: 'ch ' + cls, viewBox: '0 0 300 64', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const a = sv('path', { class: 'ca' }), l = sv('path', { class: 'cl' });
  th.append(el('span', '', label), v); s.append(a, l); b.append(th, s);
  return { b, v, a, l };
}
function dmini(m, arr, max, floor) {
  const n = arr.length; if (n < 2) return;
  let mx = max || floor || 1; if (!max) for (let i = 0; i < n; i++) if (arr[i] > mx) mx = arr[i];
  let d = ''; for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + (i / (n - 1) * 300).toFixed(1) + ' ' + (62 - Math.min(1, arr[i] / mx) * 58).toFixed(1);
  m.l.setAttribute('d', d); m.a.setAttribute('d', d + 'L300 64L0 64Z');
}

/* ---------- 节点详情 ---------- */
function upSec(n, alive) {
  const sec = section('24 小时在线'), pct = el('b', '', ''), ub = el('div', 'ub'), ux = el('div', 'ubx'), cells = [];
  sec.h.append(el('span', 'sp'), pct);
  for (let i = 0; i < 48; i++) { const c = el('i'); cells.push(c); ub.append(c); }
  ux.append(el('span', '', '24 小时前'), el('span', '', '现在')); sec.b.append(ub, ux);
  const now = Date.now(), t0 = now - 864e5, step = 18e5, res = new Array(48).fill(null);
  pool(48, 6, async i => {
    const a = t0 + i * step;
    const r = await n.be.rpc.call('agent_query_dynamic_summary', { query: { fields: ['uptime'], condition: [{ uuid: n.uuid }, { timestamp_from_to: [a, Math.min(now, a + step)] }, { limit: 1 }] } });
    if (!alive()) return;
    res[i] = !!(r && r.length); cells[i].className = res[i] ? 'y' : 'n'; cells[i].title = fT(a) + ' – ' + fT(a + step) + (res[i] ? ' 在线' : ' 无数据');
  }).then(() => {
    if (!alive()) return;
    const first = res.indexOf(true);
    if (first < 0) { pct.textContent = '无数据'; return; }
    for (let i = 0; i < first; i++) cells[i].className = '';
    const seg = res.slice(first).filter(v => v != null);
    pct.textContent = (seg.filter(Boolean).length / seg.length * 100).toFixed(1) + '%';
  });
  return sec.el;
}

const RANGES = [{ l: '30 分钟', span: 18e5 }, { l: '6 小时', span: 216e5, slots: 36 }, { l: '24 小时', span: 864e5, slots: 48 }];
const prank = k => { const l = k.toLowerCase(); return [l.includes('cloudflare') ? 0 : l.includes('google') ? 1 : /北京/.test(k) ? 2 : /上海/.test(k) ? 3 : /广东|广州/.test(k) ? 4 : 9, /电信/.test(k) ? 0 : /移动/.test(k) ? 1 : /联通/.test(k) ? 2 : 9]; };
const pcmp = (a, b) => { const x = prank(a), y = prank(b); return x[0] - y[0] || x[1] - y[1] || a.localeCompare(b); };
const pstyle = (k, i) => { const l = k.toLowerCase(); return { c: 'var(--pc-' + (/电信/.test(k) ? 'ct' : /联通/.test(k) ? 'cu' : /移动/.test(k) ? 'cm' : l.includes('cloudflare') ? 'cf' : l.includes('google') ? 'gg' : 'x' + (i % 3 + 1)) + ')', d: /上海/.test(k) ? 1 : /广东|广州/.test(k) ? 2 : 0 }; };
const smooth = p => p.map((x, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(p.length - 1, i + 2); j++) { s += p[j][1]; c++; } return [x[0], s / c]; });
async function loadPing(n, rg) {
  const now = Date.now(), t0 = now - rg.span, S = new Map();
  const q = (a, b, lim) => n.be.rpc.call('task_query', { task_data_query: { condition: [{ type: 'tcp_ping' }, { uuid: n.uuid }, { timestamp_from_to: [a, b] }, { limit: lim }] } }, 30000)
    .then(rows => (rows || []).map(r => ({ t: ms(r.timestamp), k: String(r.cron_source || '未知').replace(/^tcping-/, ''), v: r.success && r.task_event_result && typeof r.task_event_result.tcp_ping === 'number' ? r.task_event_result.tcp_ping : null })).sort((x, y) => x.t - y.t));
  const get = k => { let s = S.get(k); if (!s) S.set(k, s = { pts: [], vals: [], tot: 0, bad: 0 }); return s; };
  const add = r => { const s = get(r.k); s.tot++; if (r.v == null) { s.bad++; return null; } s.vals.push(r.v); return s; };
  if (!rg.slots) { for (const r of await q(t0, now, 1500)) { const s = add(r); if (s) s.pts.push([r.t, r.v]); } }
  else {
    // 长时间段：每个时间格只取最后 60 秒的探测结果，避免一次拉回上万行
    const step = rg.span / rg.slots, buf = [];
    await pool(rg.slots, 6, async i => { const b = t0 + (i + 1) * step; buf[i] = await q(b - 60000, b, 120); });
    for (let i = 0; i < rg.slots; i++) {
      const by = new Map();
      for (const r of buf[i] || []) if (add(r)) { let g = by.get(r.k); if (!g) by.set(r.k, g = []); g.push(r.v); }
      for (const [k, g] of by) get(k).pts.push([t0 + (i + 1) * step, g.reduce((x, y) => x + y, 0) / g.length]);
    }
  }
  return { t0, t1: now, S };
}
function pingSec(n, alive) {
  const sec = section('TCP 延迟'), box = el('div'), seg = el('span', 'seg'), sm = el('span', 'seg'), bs = el('button', '', '平滑');
  const P = { rg: 0, smooth: true, hid: new Set(), data: null, seq: 0 };
  const draw = () => {
    box.textContent = '';
    const { t0, t1, S } = P.data, names = [...S.keys()].sort(pcmp);
    if (!names.length) { box.append(el('p', 'note', '这台节点暂时没有延迟探测数据')); return; }
    const all = []; for (const k of names) if (!P.hid.has(k)) for (const p of S.get(k).pts) all.push(p[1]);
    all.sort((a, b) => a - b);
    const top = nice((all.length ? all[Math.min(all.length - 1, Math.floor(all.length * .98))] : 10) * 1.1);
    const pw = el('div', 'pw'), svg = sv('svg', { viewBox: '0 0 1000 300', preserveAspectRatio: 'none', role: 'img', 'aria-label': 'TCP 延迟曲线' }), px = el('div', 'px'), chips = el('div', 'chips'), paths = new Map();
    for (let i = 0; i <= 4; i++) { const y = 300 - i * 75, lab = el('span', 'py', fMs(top * i / 4) + ' ms'); lab.style.top = 100 - i * 25 + '%'; svg.append(sv('line', { x1: 0, x2: 1000, y1: y, y2: y })); pw.append(lab); }
    for (let i = 0; i <= 4; i++) px.append(el('span', '', fT(t0 + (t1 - t0) * i / 4)));
    names.forEach((k, i) => {
      const s = S.get(k), st = pstyle(k, i), off = P.hid.has(k);
      if (!off && s.pts.length > 1) {
        const pts = P.smooth ? smooth(s.pts) : s.pts; let d = '';
        for (let j = 0; j < pts.length; j++) d += (j ? 'L' : 'M') + ((pts[j][0] - t0) / (t1 - t0) * 1000).toFixed(1) + ' ' + (300 - Math.min(1, pts[j][1] / top) * 300).toFixed(1);
        const p = sv('path', { class: 'ps', d }); p.style.setProperty('--c', st.c);
        if (st.d) p.setAttribute('stroke-dasharray', st.d === 1 ? '7 4' : '2 4');
        svg.append(p); paths.set(k, p);
      }
      const avg = s.vals.length ? s.vals.reduce((x, y) => x + y, 0) / s.vals.length : null;
      let jit = null; if (s.vals.length > 1) { jit = 0; for (let j = 1; j < s.vals.length; j++) jit += Math.abs(s.vals[j] - s.vals[j - 1]); jit /= s.vals.length - 1; }
      const loss = s.tot ? s.bad / s.tot * 100 : 0;
      const c = el('button', 'chip' + (off ? ' mute' : '')), nm = el('span', 'n'), sw = el('i', 'sw' + (st.d ? ' d' + st.d : '')), v = el('span', 'v'), lb = el('b', loss >= 5 ? 'hi' : '', loss.toFixed(1) + '%');
      c.type = 'button'; c.setAttribute('aria-pressed', String(!off)); c.title = '点击显示或隐藏这条线';
      sw.style.setProperty('--c', st.c); nm.append(sw, k);
      v.append('均 ', el('b', '', fMs(avg)), ' · 抖 ', el('b', '', fMs(jit)), ' · 丢 ', lb);
      c.append(nm, v);
      c.onclick = () => { if (off) P.hid.delete(k); else P.hid.add(k); draw(); };
      c.onmouseenter = () => { const p = paths.get(k); if (p) { pw.classList.add('dim'); p.classList.add('hot'); } };
      c.onmouseleave = () => { const p = paths.get(k); pw.classList.remove('dim'); if (p) p.classList.remove('hot'); };
      chips.append(c);
    });
    pw.append(svg); box.append(pw, px, chips);
  };
  const load = async () => {
    const my = ++P.seq;
    box.textContent = ''; box.append(el('p', 'note', '正在读取延迟数据…'));
    try { const data = await loadPing(n, RANGES[P.rg]); if (my !== P.seq || !alive()) return; P.data = data; draw(); }
    catch (e) { if (my === P.seq && alive()) { box.textContent = ''; box.append(el('p', 'note', '延迟数据读取失败')); } }
  };
  RANGES.forEach((r, i) => { const b = el('button', '', r.l); b.type = 'button'; b.setAttribute('aria-pressed', String(i === 0)); b.onclick = () => { if (P.rg === i) return; P.rg = i; for (const x of seg.children) x.setAttribute('aria-pressed', String(x === b)); load(); }; seg.append(b); });
  bs.type = 'button'; bs.setAttribute('aria-pressed', 'true');
  bs.onclick = () => { P.smooth = !P.smooth; bs.setAttribute('aria-pressed', String(P.smooth)); if (P.data) draw(); };
  sm.append(bs); sec.h.append(el('span', 'sp'), seg, sm); sec.b.append(box);
  load();
  return sec.el;
}
function openNode(n) {
  const s = shell('#/n/' + n.uuid), alive = () => W === s, orb = el('i', 'orb');
  const sys = (n.st && n.st.system) || {}, cpu = (n.st && n.st.cpu) || {}, virt = n.meta.virt || sys.virtualization || '';
  const tag = x => { if (x) s.tt.append(el('span', 'tag', x)); };
  s.n = n; s.tt.append(orb, el('span', '', n.name));
  if (n.rg) tag((flag(n.rg) + ' ' + n.rg).trim());
  tag(virt); for (const t of n.meta.tags) tag(String(t));

  const g1 = gauge('cpu', 'CPU'), g2 = gauge('mem', '内存'), g3 = gauge('dsk', '磁盘'), g4 = gauge('swp', 'SWAP'), sg = section('资源');
  sg.b.className = 'gs'; sg.b.append(g1.g, g2.g, g3.g, g4.g);
  const m1 = mini('CPU', 'c1'), m2 = mini('内存', 'c2'), m3 = mini('下行', 'c3'), m4 = mini('上行', 'c4'), sc = section('近 10 分钟');
  sc.b.className = 'tcs'; sc.b.append(m1.b, m2.b, m3.b, m4.b);
  const T = { cpu: [], mem: [], rx: [], tx: [] };
  const drawT = () => { dmini(m1, T.cpu, 0, 10); dmini(m2, T.mem, 100); dmini(m3, T.rx, 0, 1024); dmini(m4, T.tx, 0, 1024); };

  const brand = cpu.brand || (cpu.per_core && cpu.per_core[0] && cpu.per_core[0].brand) || '';
  const cores = [cpu.physical_cores && cpu.physical_cores + ' 物理', cpu.logical_cores && cpu.logical_cores + ' 逻辑'].filter(Boolean).join(' / ');
  const i1 = kv([['h', '主机名', sys.system_host_name], ['o', '操作系统', sys.system_os_long_version || [sys.system_name, sys.system_os_version].filter(Boolean).join(' ')], ['k', '内核', sys.system_kernel], ['a', '架构', sys.arch], ['v', '虚拟化', virt], ['c', 'CPU 型号', brand], ['n', '核心', cores]]);
  const i2 = kv([['rx', '累计接收'], ['tx', '累计发送'], ['dr', '磁盘读'], ['dw', '磁盘写'], ['pc', '进程数'], ['cn', 'TCP / UDP'], ['up', '运行时长'], ['ag', '数据更新']]);
  const s1 = section('系统'), s2 = section('网络与负载'), cols = el('div', 'cols');
  s1.b.append(i1.dl); s2.b.append(i2.dl); cols.append(s1.el, s2.el);
  s.body.append(sg.el, upSec(n, alive), sc.el, pingSec(n, alive), cols);

  s.tick = now => {
    const d = n.dyn; orb.className = 'orb ' + (!d ? '' : n.on ? 'on' : 'off');
    if (!d) return;
    const u = use(d), r = i2.refs, nz = v => (v == null ? '—' : v);
    g1.set(u.cpu, '负载 ' + [d.load_one, d.load_five, d.load_fifteen].map(x => (x || 0).toFixed(2)).join(' / '));
    g2.set(u.mem, fB(d.used_memory) + ' / ' + fB(d.total_memory));
    g3.set(u.disk, fB((d.total_space || 0) - (d.available_space || 0)) + ' / ' + fB(d.total_space));
    g4.set(u.swap, d.total_swap ? fB(d.used_swap) + ' / ' + fB(d.total_swap) : '未启用');
    txt(m1.v, fP(u.cpu)); txt(m2.v, fP(u.mem)); txt(m3.v, fS(d.receive_speed)); txt(m4.v, fS(d.transmit_speed));
    txt(r.rx, fB(d.total_received)); txt(r.tx, fB(d.total_transmitted)); txt(r.dr, fS(d.read_speed)); txt(r.dw, fS(d.write_speed));
    txt(r.pc, String(nz(d.process_count))); txt(r.cn, nz(d.tcp_connections) + ' / ' + nz(d.udp_connections));
    txt(r.up, fUp(d.uptime)); txt(r.ag, (n.on ? '' : '离线 · ') + fAgo(n.ts, now));
  };
  s.live = (d, u) => { push(T.cpu, u.cpu || 0, 300); push(T.mem, u.mem || 0, 300); push(T.rx, d.receive_speed || 0, 300); push(T.tx, d.transmit_speed || 0, 300); drawT(); };
  s.tick(Date.now());

  const now = Date.now();
  n.be.rpc.call('agent_query_dynamic_summary', { query: { fields: ['cpu_usage', 'used_memory', 'total_memory', 'receive_speed', 'transmit_speed'], condition: [{ uuid: n.uuid }, { timestamp_from_to: [now - 6e5, now] }, { limit: 600 }] } }).then(rows => {
    if (!alive() || !rows || !rows.length) return;
    rows.sort((a, b) => a.timestamp - b.timestamp);
    const H = { cpu: [], mem: [], rx: [], tx: [] };
    for (let i = rows.length % 2 ? 0 : 1; i < rows.length; i += 2) { const r = rows[i]; H.cpu.push(r.cpu_usage || 0); H.mem.push(r.total_memory ? r.used_memory / r.total_memory * 100 : 0); H.rx.push(r.receive_speed || 0); H.tx.push(r.transmit_speed || 0); }
    for (const k in T) T[k] = H[k].concat(T[k]).slice(-300);
    drawT();
  }).catch(() => {});
}

/* ---------- 地图：只在打开时才去取 map.json ---------- */
async function openMap() {
  const s = shell('#/map'), reg = new Map(), sm = section('世界地图'), sl = section('地区'), list = el('div', 'rl'), note = el('p', 'note', '正在载入地图…');
  s.tt.append(el('span', '', '节点分布'));
  for (const n of order) { const c = n.rg || '—'; let r = reg.get(c); if (!r) reg.set(c, r = { n: 0, on: 0 }); r.n++; if (n.on) r.on++; }
  const pick = c => { setFilter(c); go(''); };
  for (const c of [...reg.keys()].sort()) { const r = reg.get(c), b = el('button'), f = flag(c); b.type = 'button'; if (f) b.append(el('span', 'fl', f)); b.append(el('b', '', rname(c)), el('em', '', r.on + ' / ' + r.n + ' 在线')); b.onclick = () => pick(c); list.append(b); }
  sm.b.append(note); sl.b.append(list); s.body.append(sm.el, sl.el);
  try { if (!MAP) MAP = await (await fetch('./map.json?v=1')).json(); } catch (e) { note.textContent = '地图载入失败'; return; }
  if (W !== s) return;
  const svg = sv('svg', { class: 'map', viewBox: '0 0 ' + MAP.w + ' ' + MAP.h, role: 'img', 'aria-label': '节点分布地图' }), hi = [];
  let base = '';
  for (const c in MAP.p) if (reg.has(c)) hi.push(c); else base += MAP.p[c];
  svg.append(sv('path', { class: 'land', d: base }));
  for (const c of hi) svg.append(sv('path', { class: 'land hi', d: MAP.p[c] }));
  for (const [c, r] of reg) {
    const p = MAP.c[c]; if (!p) continue;
    const rad = 80 + 32 * Math.sqrt(r.n), g = sv('g', { class: 'mk' + (r.on < r.n ? ' warn' : ''), transform: 'translate(' + p[0] + ' ' + p[1] + ')' });
    const t = sv('text', { 'text-anchor': 'middle', y: (rad * .36).toFixed(0), 'stroke-width': (rad * .16).toFixed(0) }), ti = sv('title', {});
    t.style.fontSize = (rad * 1.05).toFixed(0) + 'px'; t.textContent = r.n; ti.textContent = rname(c) + ' · ' + r.on + ' / ' + r.n + ' 在线';
    g.append(ti, sv('circle', { class: 'b', r: rad.toFixed(0) }), sv('circle', { class: 'hl', cx: (-rad * .32).toFixed(0), cy: (-rad * .36).toFixed(0), r: (rad * .2).toFixed(0) }), t);
    g.addEventListener('click', () => pick(c)); svg.append(g);
  }
  sm.b.textContent = ''; sm.b.append(svg);
}

/* ---------- 顶栏：七段数字的钟、昼夜、动效 ---------- */
const SEG = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
const SP = { a: '4,1 20,1 17,5 7,5', b: '21,2.5 21,19 19,20 17,18 17,6.5', c: '21,21 21,37.5 17,33.5 17,22 19,20', d: '4,39 20,39 17,35 7,35', e: '3,21 3,37.5 7,33.5 7,22 5,20', f: '3,2.5 3,19 5,20 7,18 7,6.5', g: '5.5,20 7.5,18 16.5,18 18.5,20 16.5,22 7.5,22' };
function clock(root) {
  const ds = [];
  for (let i = 0; i < 6; i++) {
    if (i === 2 || i === 4) root.append(el('i', 'col'));
    const s = sv('svg', { class: 'dg' + (i > 3 ? ' sm' : ''), viewBox: '0 0 24 40' }), g = {};
    for (const k in SP) { g[k] = sv('polygon', { points: SP[k] }); s.append(g[k]); }
    root.append(s); ds.push({ g, v: -1 });
  }
  const tick = () => {
    const d = new Date(), str = p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
    for (let i = 0; i < 6; i++) { const v = +str[i], x = ds[i]; if (x.v === v) continue; x.v = v; for (const k in x.g) x.g[k].setAttribute('class', SEG[v].includes(k) ? 'on' : ''); }
  };
  tick(); setInterval(tick, 1000);
}
function tools() {
  const bp = $('#bPeek'), bd = $('#bMode'), bm = $('#bMotion');
  bm.setAttribute('aria-pressed', String(!R.classList.contains('still')));
  bm.onclick = () => { const off = R.classList.toggle('still'); save('aero.motion', off ? 'off' : 'on'); bm.setAttribute('aria-pressed', String(!off)); };
  const peek = on => { R.classList.toggle('peek', on); bp.setAttribute('aria-pressed', String(on)); };
  bp.onclick = () => peek(!R.classList.contains('peek'));
  bd.onclick = () => { const n = R.classList.toggle('night'); save('aero.mode', n ? 'night' : 'day'); bd.setAttribute('aria-pressed', String(n)); };
  bd.setAttribute('aria-pressed', String(R.classList.contains('night')));
  $('#bMap').onclick = () => { peek(false); go('#/map'); };
  addEventListener('keydown', e => { if (e.key === 'Escape' && !W) peek(false); });
}

/* ---------- 启动 ---------- */
async function start() {
  await Promise.all(bes.map(b => loadBackend(b).catch(() => {})));
  if (!nodes.size) { msg('暂时没有拿到节点，稍后自动重试…'); setTimeout(start, 5000); return; }
  build(); render(false); route(); loop(); prefill();
}
async function boot() {
  for (const [k, id] of [['on', 'sOn'], ['tot', 'sTot'], ['sub', 'sOnSub'], ['cpu', 'sCpu'], ['mem', 'sMem'], ['up', 'sUp'], ['dn', 'sDn'], ['tr', 'sTr'], ['gL', 'gL'], ['gA', 'gA'], ['lk', 'lk'], ['lkT', 'lkT'], ['fN', 'fN']]) S[k] = $('#' + id);
  S.cpuB = { f: $('#sCpuBar'), kind: 'cpu' }; S.memB = { f: $('#sMemBar'), kind: 'mem' };
  clock($('#clock')); tools();
  let cfg = {};
  try { cfg = await (await fetch('./config.json', { cache: 'no-cache' })).json(); } catch (e) {}
  const up = cfg.user_preferences || {}, name = up.site_name || 'NodeGet Status';
  $('#site').textContent = name; D.title = name; $('#ft').textContent = up.footer || 'Powered by NodeGet';
  if (up.site_logo) $('#logo').style.background = 'center/cover no-repeat url("' + String(up.site_logo).replace(/["\\\s]/g, '') + '")';
  setFlagMap(up.flag_map);
  if (typeof up.caption === 'string') $('#cap').textContent = up.caption;
  for (const b of cfg.site_tokens || []) if (b && b.backend_url) bes.push({ rpc: new Rpc(b.backend_url, b.token || ''), uuids: [] });
  if (!bes.length) { msg('config.json 里还没有配置后端地址'); return; }
  start();
}
boot();
})();
