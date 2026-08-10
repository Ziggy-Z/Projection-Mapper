import http from 'node:http';
import os from 'node:os';
import type { RemoteCommand, RemoteState, RemoteStatus } from '../src/model/desktop';

/**
 * The LAN remote, living inside the app rather than the separate Node
 * script it grew up as. Phones still speak HTTP + SSE; the app side is
 * plain IPC, so there is no localhost fetch, no EventSource and no CORS in
 * the renderer any more.
 *
 * Still opt-in — nothing binds a socket until the user enables it.
 */

const PORT = 9270;

let server: http.Server | null = null;
let onCommand: ((cmd: RemoteCommand) => void) | null = null;
const phones = new Set<http.ServerResponse>();
let lastState: RemoteState = { name: 'Wall', scenes: [], brightness: 1, blackout: false };

export function setCommandHandler(fn: (cmd: RemoteCommand) => void): void {
  onCommand = fn;
}

export function pushState(state: RemoteState): void {
  lastState = state;
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of phones) res.write(payload);
}

function lanUrls(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
    }
  }
  return out.length > 0 ? out : [`http://localhost:${PORT}`];
}

export function status(): RemoteStatus {
  return { running: server !== null, port: PORT, urls: server ? lanUrls() : [] };
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
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
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Wall</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0a0b0d; color: #e8eaee;
         font-family: system-ui, -apple-system, sans-serif; padding: 20px;
         display: flex; flex-direction: column; gap: 18px; min-height: 100vh;
         -webkit-user-select: none; user-select: none; }
  h1 { font-size: 10px; letter-spacing: .13em; text-transform: uppercase;
       color: #8a929f; font-weight: 600; margin: 0; }
  button { background: #1b1e24; border: 1px solid #262a32; color: #e8eaee;
           border-radius: 10px; padding: 16px; font-size: 15px; width: 100%;
           text-align: left; -webkit-tap-highlight-color: transparent; }
  button:active { background: #242832; }
  button.blackout { color: #ff5c5c; border-color: rgba(255,92,92,.32);
                    background: rgba(255,92,92,.08); text-align: center;
                    margin-top: auto; font-weight: 700; letter-spacing: .13em;
                    text-transform: uppercase; font-size: 12px; padding: 18px; }
  button.blackout.on { background: #ff5c5c; color: #1a0505; border-color: #ff5c5c; }
  input[type=range] { width: 100%; accent-color: #f2a93b; height: 34px; }
  .pct { font-variant-numeric: tabular-nums; color: #f2a93b;
         font-size: 26px; font-weight: 500; }
  .row { display: flex; justify-content: space-between; align-items: baseline; }
  #scenes { display: flex; flex-direction: column; gap: 8px; }
  .empty { color: #5b6472; font-size: 13px; }
</style>
</head>
<body>
<h1 id="name">Wall</h1>
<div id="scenes"></div>
<div>
  <div class="row"><h1>Master</h1><span class="pct" id="pct">100</span></div>
  <input type="range" id="master" min="0" max="100" value="100">
</div>
<button class="blackout" id="blackout">Blackout</button>
<script>
  let state = { scenes: [], brightness: 1, blackout: false, name: 'Wall' };
  const send = (cmd) => fetch('/command', { method: 'POST', body: JSON.stringify(cmd) });
  function render() {
    document.getElementById('name').textContent = state.name || 'Wall';
    const holder = document.getElementById('scenes');
    holder.innerHTML = '';
    if (state.scenes.length === 0) {
      const p = document.createElement('div');
      p.className = 'empty';
      p.textContent = 'No scenes captured yet.';
      holder.appendChild(p);
    }
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

export function start(): Promise<RemoteStatus> {
  if (server) return Promise.resolve(status());
  return new Promise((resolve, reject) => {
    const s = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
      try {
        if (req.method === 'GET' && url.pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(PHONE_PAGE);
        } else if (req.method === 'GET' && url.pathname === '/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          res.write(':ok\n\n');
          phones.add(res);
          res.write(`data: ${JSON.stringify(lastState)}\n\n`);
          req.on('close', () => phones.delete(res));
        } else if (req.method === 'POST' && url.pathname === '/command') {
          onCommand?.((await readBody(req)) as RemoteCommand);
          res.writeHead(204);
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
    s.on('error', (e) => {
      server = null;
      reject(e);
    });
    s.listen(PORT, () => {
      server = s;
      resolve(status());
    });
  });
}

export function stop(): void {
  for (const res of phones) res.end();
  phones.clear();
  server?.close();
  server = null;
}
