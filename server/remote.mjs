#!/usr/bin/env node
/**
 * Optional LAN remote for the projection mapper — a separate Node script,
 * not part of the static bundle. Zero dependencies.
 *
 *   node server/remote.mjs [port]
 *
 * The app (with "LAN remote" enabled in the Output panel) connects over SSE
 * and pushes its state; phones on the same network open http://<host>:9270
 * for scene selection, grand master, and blackout. The server only relays —
 * it holds no state beyond the app's last report.
 */

import http from 'node:http';

const PORT = Number(process.argv[2]) || 9270;

/** @type {Set<import('node:http').ServerResponse>} */
const appClients = new Set();
/** @type {Set<import('node:http').ServerResponse>} */
const phoneClients = new Set();
let lastState = { scenes: [], brightness: 1, blackout: false, name: '' };

function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(':ok\n\n');
}

function broadcast(clients, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const PHONE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wall</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0b0d12; color: #e6e9ef;
         font-family: system-ui, sans-serif; padding: 20px;
         display: flex; flex-direction: column; gap: 16px; min-height: 90vh; }
  h1 { font-size: 12px; letter-spacing: .14em; text-transform: uppercase;
       color: #7c8798; font-weight: 500; margin: 0; }
  button { background: #1c2230; border: 1px solid #2a3243; color: #e6e9ef;
           border-radius: 2px; padding: 14px; font-size: 15px; width: 100%;
           text-align: left; }
  button.active { border-color: #f2a93b; color: #f2a93b; }
  button.blackout { color: #e2564b; text-align: center; margin-top: auto; }
  button.blackout.on { background: #e2564b; color: #0b0d12; border-color: #e2564b; }
  input[type=range] { width: 100%; accent-color: #f2a93b; }
  .pct { font-variant-numeric: tabular-nums; color: #4fd1e0; font-size: 13px; }
  .row { display: flex; justify-content: space-between; align-items: baseline; }
  #scenes { display: flex; flex-direction: column; gap: 8px; }
  .off { opacity: .4; }
</style>
</head>
<body>
<h1 id="name">Wall</h1>
<div id="scenes"></div>
<div>
  <div class="row"><span style="font-size:12px;color:#7c8798">MASTER</span>
  <span class="pct" id="pct">100</span></div>
  <input type="range" id="master" min="0" max="100" value="100">
</div>
<button class="blackout" id="blackout">BLACKOUT</button>
<script>
  let state = { scenes: [], brightness: 1, blackout: false, name: 'Wall' };
  const send = (cmd) => fetch('/command', { method: 'POST', body: JSON.stringify(cmd) });
  function render() {
    document.getElementById('name').textContent = state.name || 'Wall';
    const holder = document.getElementById('scenes');
    holder.innerHTML = '';
    for (const scene of state.scenes) {
      const b = document.createElement('button');
      b.textContent = scene.name;
      b.onclick = () => send({ type: 'scene', sceneId: scene.id });
      holder.appendChild(b);
    }
    if (!document.getElementById('master').matches(':active')) {
      document.getElementById('master').value = Math.round(state.brightness * 100);
    }
    document.getElementById('pct').textContent = Math.round(state.brightness * 100);
    document.getElementById('blackout').className =
      'blackout' + (state.blackout ? ' on' : '');
  }
  document.getElementById('master').oninput = (e) =>
    send({ type: 'brightness', value: Number(e.target.value) / 100 });
  document.getElementById('blackout').onclick = () =>
    send({ type: 'blackout', value: !state.blackout });
  const es = new EventSource('/events?role=phone');
  es.onmessage = (e) => { state = JSON.parse(e.data); render(); };
  render();
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(PHONE_PAGE);
    } else if (req.method === 'GET' && url.pathname === '/events') {
      const role = url.searchParams.get('role');
      const pool = role === 'app' ? appClients : phoneClients;
      sse(res);
      pool.add(res);
      if (role !== 'app') res.write(`data: ${JSON.stringify(lastState)}\n\n`);
      req.on('close', () => pool.delete(res));
    } else if (req.method === 'POST' && url.pathname === '/state') {
      lastState = await readBody(req);
      broadcast(phoneClients, lastState);
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
      res.end();
    } else if (req.method === 'POST' && url.pathname === '/command') {
      broadcast(appClients, await readBody(req));
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  } catch {
    res.writeHead(400);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`projection-mapper remote listening on http://0.0.0.0:${PORT}`);
  console.log('open this address from a phone on the same network');
});
