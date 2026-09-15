import express from 'express';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 3000);
const WORKER_URL = process.env.WORKER_URL || 'http://worker:8080';

const app = express();
app.use(express.json());

const jobs = [];

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'api', jobs: jobs.length });
});

app.get('/api/jobs', (_req, res) => {
  res.json(jobs);
});

app.post('/api/jobs', (req, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) {
    res.status(400).json({ error: 'title required' });
    return;
  }
  const job = { id: randomUUID(), title, status: 'pending', createdAt: Date.now(), doneAt: null, result: null };
  jobs.push(job);
  res.status(201).json(job);
});

app.get('/api/jobs/next', (_req, res) => {
  const job = jobs.find((j) => j.status === 'pending');
  if (!job) {
    res.status(204).end();
    return;
  }
  job.status = 'running';
  res.json(job);
});

app.post('/api/jobs/:id/done', (req, res) => {
  const job = jobs.find((j) => j.id === req.params.id);
  if (!job) {
    res.status(404).json({ error: 'job not found' });
    return;
  }
  job.status = 'done';
  job.doneAt = Date.now();
  job.result = String(req.body?.result || '');
  res.json(job);
});

app.get('/api/worker', async (_req, res) => {
  try {
    const r = await fetch(`${WORKER_URL}/stats`);
    res.status(r.status).json(await r.json());
  } catch (err) {
    res.status(502).json({ error: `worker unreachable at ${WORKER_URL}: ${err.message}` });
  }
});

// 假登入頁：給接手示範用（人在 takeover 畫面上輸入帳密），任何非空帳密都放行，設一個 cookie 後回首頁。
const sessions = new Set();
function loggedIn(req) {
  const m = /(?:^|;\s*)demo_session=([A-Za-z0-9-]+)/.exec(req.headers.cookie || '');
  return Boolean(m && sessions.has(m[1]));
}

app.get('/login', (_req, res) => {
  res.type('html').send(LOGIN_PAGE);
});

app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const user = String(req.body?.username || '').trim();
  const pass = String(req.body?.password || '');
  if (!user || !pass) {
    res.status(400).type('html').send(LOGIN_PAGE.replace('<!--error-->', '<p class="error">Username and password are required.</p>'));
    return;
  }
  const id = randomUUID();
  sessions.add(id);
  res.setHeader('Set-Cookie', `demo_session=${id}; Path=/; HttpOnly; SameSite=Lax`);
  res.redirect(303, '/');
});

app.post('/logout', (req, res) => {
  const m = /(?:^|;\s*)demo_session=([A-Za-z0-9-]+)/.exec(req.headers.cookie || '');
  if (m) sessions.delete(m[1]);
  res.setHeader('Set-Cookie', 'demo_session=; Path=/; Max-Age=0');
  res.redirect(303, '/login');
});

app.get('/', (req, res) => {
  if (process.env.REQUIRE_LOGIN === '1' && !loggedIn(req)) {
    res.redirect(303, '/login');
    return;
  }
  res.type('html').send(PAGE);
});

const LOGIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in - example-compose-app</title>
<style>
  body { margin: 0; padding: 32px; font: 15px/1.5 system-ui, sans-serif; color: #151713; background: #f7f7f3; }
  main { max-width: 360px; margin: 80px auto 0; background: #fff; padding: 28px; border-radius: 10px; border: 1px solid #e7e7e1; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { margin: 0 0 18px; color: #4a4e45; }
  label { display: block; font-size: 13px; color: #777c73; margin-bottom: 4px; }
  input { width: 100%; box-sizing: border-box; padding: 9px 10px; font: inherit; border: 1px solid #c9c9c2; border-radius: 6px; margin-bottom: 14px; }
  button { width: 100%; padding: 10px 16px; font: inherit; border: 0; border-radius: 6px; background: #151713; color: #fff; cursor: pointer; }
  .error { color: #a33; font-size: 13px; }
</style>
</head>
<body>
<main>
  <h1>Sign in</h1>
  <p>Demo login for the takeover walkthrough. Any username and password work.</p>
  <!--error-->
  <form method="post" action="/login">
    <label for="username">Username</label>
    <input id="username" name="username" autocomplete="username" autofocus>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password">
    <button id="signin" type="submit">Sign in</button>
  </form>
</main>
</body>
</html>`;

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>example-compose-app</title>
<style>
  body { margin: 0; padding: 32px; font: 15px/1.5 system-ui, sans-serif; color: #151713; background: #f7f7f3; }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p { margin: 0 0 20px; color: #4a4e45; }
  form { display: flex; gap: 8px; margin-bottom: 20px; }
  input { flex: 1; padding: 8px 10px; font: inherit; border: 1px solid #c9c9c2; border-radius: 6px; }
  button { padding: 8px 16px; font: inherit; border: 0; border-radius: 6px; background: #151713; color: #fff; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e7e7e1; font-size: 14px; }
  th { color: #777c73; font-weight: 500; }
  tr[data-status="pending"] td.status { color: #a38c68; }
  tr[data-status="running"] td.status { color: #2f5884; }
  tr[data-status="done"] td.status { color: #2d7a4f; }
  #worker { font-size: 13px; color: #777c73; margin-top: 16px; }
</style>
</head>
<body>
<main>
  <h1>example-compose-app</h1>
  <p>Node API on port 3000 queues jobs; the Go worker on port 8080 picks them up and marks them done.</p>
  <form id="form">
    <input id="title" name="title" placeholder="Job title" autocomplete="off" required>
    <button id="add" type="submit">Add job</button>
  </form>
  <table>
    <thead><tr><th>Title</th><th>Status</th><th>Result</th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
  <div id="worker">worker: checking</div>
</main>
<script>
  const rows = document.getElementById('rows');
  const workerEl = document.getElementById('worker');
  async function refresh() {
    const jobs = await fetch('/api/jobs').then((r) => r.json());
    rows.innerHTML = jobs.map((j) =>
      '<tr data-status="' + j.status + '" data-id="' + j.id + '">' +
      '<td>' + escapeHtml(j.title) + '</td>' +
      '<td class="status">' + j.status + '</td>' +
      '<td>' + escapeHtml(j.result || '') + '</td></tr>'
    ).join('');
    const w = await fetch('/api/worker').then((r) => r.json()).catch(() => null);
    workerEl.textContent = w && w.processed !== undefined
      ? 'worker: up, processed ' + w.processed + ' jobs, uptime ' + w.uptimeSec + 's'
      : 'worker: unreachable';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('title');
    await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: input.value }) });
    input.value = '';
    refresh();
  });
  refresh();
  setInterval(refresh, 500);
</script>
</body>
</html>`;

app.listen(PORT, () => {
  console.log(`api listening on :${PORT}, worker at ${WORKER_URL}`);
});
