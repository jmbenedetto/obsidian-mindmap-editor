import fs from 'node:fs';
const host = JSON.parse(fs.readFileSync(new URL('./authority-lab/host.json', import.meta.url)));
const targets = await fetch(`http://127.0.0.1:${host.port}/json/list`, { signal: AbortSignal.timeout(3000) }).then(r => r.json());
const page = targets.find(t => t.type === 'page' && t.url === 'app://obsidian.md/index.html');
if (!page) throw new Error('No isolated Obsidian renderer');
const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map(); let seq = 0;
socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') { console.error('HOST_ERROR', ...message.params.args.map(arg => String(arg.value ?? arg.description ?? '').slice(0, 2000))); } });
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}, do not replay mutations`)); }, 30000);
  pending.set(id, value => { clearTimeout(timer); resolve(value); });
  socket.send(JSON.stringify({ id, method, params }));
});
try {
  await call('Runtime.enable');
  const check = await call('Runtime.evaluate', { expression: 'JSON.stringify({vault:app.vault.adapter.basePath,home:process.env.HOME})', returnByValue: true });
  const identity = JSON.parse(check.result.result.value);
  if (identity.vault !== host.vault || identity.home !== host.home) throw new Error(`Host identity mismatch ${JSON.stringify(identity)}`);
  console.log('IDENTITY', JSON.stringify(identity));
  if (process.argv[4]) await call('Page.bringToFront');
  if (process.argv[5] === 'close-modal') {
    for (const type of ['keyDown', 'keyUp']) await call('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  }
  const source = fs.readFileSync(process.argv[2], 'utf8');
  const result = await call('Runtime.evaluate', { expression: `(async()=>{if(app.vault.adapter.basePath!==${JSON.stringify(host.vault)})throw Error('Wrong vault');${source}\n})()`, awaitPromise: true, returnByValue: true });
  if (result.result?.exceptionDetails || result.error) throw new Error(JSON.stringify(result.result?.exceptionDetails ?? result.error));
  console.log(JSON.stringify(result.result.result.value, null, 2));
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(result.result.result.value, null, 2));
  if (process.argv[4]) {
    const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(process.argv[4], Buffer.from(image.result.data, 'base64'));
  }
} finally { socket.close(); }
