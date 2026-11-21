#!/usr/bin/env node
// 本地预览服务（无依赖），只用于开发，不随主题部署：
//   1. 提供 src/ 下的静态文件，改动后页面自动刷新；
//   2. 把页面发出的 WebSocket 原样隧道到 src/config.json 里配置的后端，并把 Origin 改成后端的域名，
//      这样本地预览也能看到真实数据（后端或它前面的代理如果校验 Origin，本地页面直连会被拒）；
//   3. /__scene/ 下是场景出图工具，/__save 把它渲染的成片存进 src/。
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const SCENE = path.resolve(ROOT, '../tools/scene');
const PORT = +(process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.frag': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
};
// 后端主机名：环境变量 AERO_UPSTREAM，否则取 config.json 里第一个 backend_url 的主机
function upstream() {
  if (process.env.AERO_UPSTREAM) return process.env.AERO_UPSTREAM;
  try { const m = /"backend_url"\s*:\s*"wss?:\/\/([^"/]+)/.exec(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); return m ? m[1] : ''; } catch { return ''; }
}

const watchers = new Set();
let timer = 0;
const ping = () => { clearTimeout(timer); timer = setTimeout(() => { for (const res of watchers) res.write('data: reload\n\n'); }, 80); };
fs.watch(ROOT, { recursive: true }, ping);
fs.watch(SCENE, { recursive: true }, ping);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__live') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 500\n\n');
    watchers.add(res);
    req.on('close', () => watchers.delete(res));
    return;
  }
  if (url.pathname === '/__save' && req.method === 'POST') {
    // 出图工具把成片存进 src/，只接受 scene-*.jpg / .png / .webp
    const name = url.searchParams.get('name') || '';
    if (!/^scene-[a-z0-9-]+\.(webp|jpg|png)$/.test(name)) { res.writeHead(400).end('bad name'); return; }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => fs.writeFile(path.join(ROOT, name), Buffer.concat(chunks), err => res.writeHead(err ? 500 : 200).end(err ? 'error' : 'saved')));
    return;
  }
  let p = path.normalize(decodeURIComponent(url.pathname));
  if (p.endsWith('/')) p += 'index.html';
  const base = p.startsWith('/__scene/') ? SCENE : ROOT;
  if (base === SCENE) p = p.slice(8);
  const file = path.join(base, p);
  if (!file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    if (base === ROOT && p === '/index.html') {
      buf = Buffer.from(buf.toString().replace('</body>', '<script>new EventSource("/__live").onmessage=()=>location.reload()</script></body>'));
    } else if (base === ROOT && p === '/config.json') {
      buf = Buffer.from(buf.toString().replace(/wss?:\/\/[^"/]+/g, `ws://localhost:${PORT}`));   // 让页面连本机，由下面的隧道转给后端
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
});

server.on('upgrade', (req, sock, head) => {
  const host = upstream();
  if (!host) { sock.destroy(); return; }
  const up = https.request({ host, port: 443, path: req.url, headers: { ...req.headers, host, origin: 'https://' + host } });
  up.on('upgrade', (r, us, uhead) => {
    sock.write('HTTP/1.1 101 Switching Protocols\r\n' + Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    if (uhead.length) sock.write(uhead);
    if (head.length) us.write(head);
    us.pipe(sock); sock.pipe(us);
    const end = () => { us.destroy(); sock.destroy(); };
    us.on('error', end); sock.on('error', end); us.on('close', end); sock.on('close', end);
  });
  up.on('response', r => sock.end(`HTTP/1.1 ${r.statusCode} upstream\r\n\r\n`));
  up.on('error', () => sock.destroy());
  up.end();
});

server.listen(PORT, '127.0.0.1', () => console.log(`aero preview → http://localhost:${PORT}` + (upstream() ? '' : '（src/config.json 里还没有配置后端）')));
