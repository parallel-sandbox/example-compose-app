# example-compose-app

ParallelSandbox 的範例 repo 之一：一個 Node API 加一個 Go worker，用 docker compose 跑，另附一支 Playwright e2e，會開瀏覽器操作頁面並截圖。用來驗證「箱子裡 build、run、wire、跑 e2e、拿回截圖與影片」整條路。

English version below.

## 內容

| 目錄 | 服務 | 埠 | 說明 |
|---|---|---|---|
| `api/` | `api` | 3000 | Node 22 + Express。首頁是一張工作清單，`POST /api/jobs` 建工作，worker 來領 |
| `worker/` | `worker` | 8080 | Go 1.25。每 0.5 秒向 `API_URL` 領一件待處理工作，算完回報；`GET /stats` 給頁面顯示 |
| `e2e/` | 無 | 無 | Playwright。開首頁、新增一件工作、等它變成 `done`、存 `e2e/screenshots/jobs.png` |

`docker-compose.yml` 把兩個服務接起來：`api` 找 worker 用 `WORKER_URL=http://worker:8080`，`worker` 找 api 用 `API_URL=http://api:3000`，都是 compose 網路裡的名字。

## 本機跑

```bash
docker compose up -d --build --wait
open http://localhost:3000        # 打一個標題按 Add job，兩秒內變 done

cd e2e
npm ci
npx playwright install chromium
npx playwright test               # 截圖在 e2e/screenshots/jobs.png
```

收掉：`docker compose down`。

## 在 ParallelSandbox 的箱子裡跑

箱子是一台你自己 agent 的遠端 Linux 機器，裡面有 Docker、git、Node、Go、Xvfb 虛擬螢幕與 Chromium，沒有 AI。以下每一步都是一個 MCP 工具呼叫，由 Claude Code、Codex 或任何接了 `mcp.parallelsandbox.com` 的 agent 發出。工具定義見 https://parallelsandbox.com/docs/tools/ 。

1. 起箱子，宣告這個 repo 有哪些服務、各聽哪個埠：

   ```json
   sandbox_start { "services": [{ "name": "api", "port": 3000 }, { "name": "worker", "port": 8080 }] }
   ```

   回 `id`、`sceneUrl`、`takeoverUrl`。之後每個工具都帶這個 `id`。

2. 把程式碼放進箱子（`cwd` 預設是箱子的 `/work`）：

   ```json
   sandbox_exec { "id": "<id>", "cmd": "git clone https://github.com/parallel-sandbox/example-compose-app.git" }
   ```

   自己改過、還沒 commit 的版本用同步：`sandbox_sync { "id": "<id>", "localPath": ".", "dest": "example-compose-app" }`。

3. build 並跑起來：

   ```json
   sandbox_exec { "id": "<id>", "cmd": "docker compose up -d --build --wait", "cwd": "example-compose-app", "timeoutSec": 600 }
   ```

4. 接線。compose 網路裡兩個服務已經互相找得到；`sandbox_wire` 是讓箱子上 compose 以外的東西（e2e、Chromium、其他容器、場景網址）也用同一個名字找到它：

   ```json
   sandbox_wire { "id": "<id>", "service": "api", "mode": "box" }
   sandbox_wire { "id": "<id>", "service": "worker", "mode": "box" }
   sandbox_exec { "id": "<id>", "cmd": "curl -s http://api:3000/api/health" }
   ```

5. 跑 e2e，順便錄影。`HEADED=1` 讓 Chromium 開在箱子的虛擬螢幕 `:99` 上，這樣 `sandbox_shot` 錄得到、人從 `takeoverUrl` 也看得到：

   ```json
   sandbox_exec { "id": "<id>", "cmd": "npm ci && npx playwright install chromium", "cwd": "example-compose-app/e2e", "timeoutSec": 600 }
   sandbox_shot { "id": "<id>", "record": "start" }
   sandbox_exec { "id": "<id>", "cmd": "DISPLAY=:99 HEADED=1 BASE_URL=http://localhost:3000 npx playwright test", "cwd": "example-compose-app/e2e", "timeoutSec": 300 }
   sandbox_shot { "id": "<id>", "record": "stop" }
   ```

   `record: "stop"` 回一個一小時有效的 mp4 下載網址。

6. 拿截圖：

   ```json
   sandbox_get { "id": "<id>", "path": "example-compose-app/e2e/screenshots/jobs.png" }
   ```

   回一個一小時有效的下載網址。

7. 收箱子：

   ```json
   sandbox_stop { "id": "<id>" }
   ```

### 只跑改過的服務，沒改的打你自己的環境

改了 `api`、沒改 `worker`，而你在別處已經有一個跑著的 worker：起箱子時給 `externalBaseUrl`，箱子裡只跑 `api`，再把 `worker` 這個名字指到外部。

```json
sandbox_start { "services": [{ "name": "api", "port": 3000 }, { "name": "worker", "port": 8080 }], "externalBaseUrl": "https://staging.example.com" }
sandbox_exec  { "id": "<id>", "cmd": "docker compose up -d --build --wait api", "cwd": "example-compose-app", "timeoutSec": 600 }
sandbox_wire  { "id": "<id>", "service": "api", "mode": "box" }
sandbox_wire  { "id": "<id>", "service": "worker", "mode": "external" }
```

`sandbox_status` 會列出目前的接線表。

## 目錄

```
api/            Express 伺服器、Dockerfile
worker/         Go worker、Dockerfile
e2e/            Playwright 設定與測試
docker-compose.yml
```

---

# example-compose-app (English)

One of the ParallelSandbox example repos: a Node API plus a Go worker under docker compose, with a Playwright e2e that drives the page in a real browser and saves a screenshot. It exercises the whole path inside a box: build, run, wire, run e2e, fetch the screenshot and the recording.

## What is inside

| Directory | Service | Port | Notes |
|---|---|---|---|
| `api/` | `api` | 3000 | Node 22 + Express. The home page is a job list; `POST /api/jobs` queues a job for the worker |
| `worker/` | `worker` | 8080 | Go 1.25. Polls `API_URL` every 0.5 s for a pending job, computes a result, reports back; `GET /stats` feeds the page |
| `e2e/` | none | none | Playwright. Opens the page, adds a job, waits for `done`, writes `e2e/screenshots/jobs.png` |

`docker-compose.yml` links the two: `api` reaches the worker at `WORKER_URL=http://worker:8080`, `worker` reaches the API at `API_URL=http://api:3000`; both are compose network names.

## Run locally

```bash
docker compose up -d --build --wait
open http://localhost:3000        # type a title, press Add job, it turns done within two seconds

cd e2e
npm ci
npx playwright install chromium
npx playwright test               # screenshot lands in e2e/screenshots/jobs.png
```

Tear down with `docker compose down`.

## Run inside a ParallelSandbox box

A box is a remote Linux machine for your own agent: Docker, git, Node, Go, an Xvfb virtual display and Chromium, no AI inside. Every step below is one MCP tool call issued by Claude Code, Codex or any agent connected to `mcp.parallelsandbox.com`. Tool definitions: https://parallelsandbox.com/en/docs/tools/ .

1. Start a box and declare the services this repo exposes:

   ```json
   sandbox_start { "services": [{ "name": "api", "port": 3000 }, { "name": "worker", "port": 8080 }] }
   ```

   Returns `id`, `sceneUrl`, `takeoverUrl`. Every later call carries this `id`.

2. Put the code in the box (`cwd` defaults to `/work` in the box):

   ```json
   sandbox_exec { "id": "<id>", "cmd": "git clone https://github.com/parallel-sandbox/example-compose-app.git" }
   ```

   For an uncommitted local checkout use `sandbox_sync { "id": "<id>", "localPath": ".", "dest": "example-compose-app" }`.

3. Build and run:

   ```json
   sandbox_exec { "id": "<id>", "cmd": "docker compose up -d --build --wait", "cwd": "example-compose-app", "timeoutSec": 600 }
   ```

4. Wire. The two services already see each other on the compose network; `sandbox_wire` makes everything else on the box (the e2e, Chromium, other containers, the scene URL) reach them by the same names:

   ```json
   sandbox_wire { "id": "<id>", "service": "api", "mode": "box" }
   sandbox_wire { "id": "<id>", "service": "worker", "mode": "box" }
   sandbox_exec { "id": "<id>", "cmd": "curl -s http://api:3000/api/health" }
   ```

5. Run the e2e and record it. `HEADED=1` opens Chromium on the box's virtual display `:99`, so `sandbox_shot` can record it and a person can watch through `takeoverUrl`:

   ```json
   sandbox_exec { "id": "<id>", "cmd": "npm ci && npx playwright install chromium", "cwd": "example-compose-app/e2e", "timeoutSec": 600 }
   sandbox_shot { "id": "<id>", "record": "start" }
   sandbox_exec { "id": "<id>", "cmd": "DISPLAY=:99 HEADED=1 BASE_URL=http://localhost:3000 npx playwright test", "cwd": "example-compose-app/e2e", "timeoutSec": 300 }
   sandbox_shot { "id": "<id>", "record": "stop" }
   ```

   `record: "stop"` returns a download URL for the mp4, valid for one hour.

6. Fetch the screenshot:

   ```json
   sandbox_get { "id": "<id>", "path": "example-compose-app/e2e/screenshots/jobs.png" }
   ```

   Returns a download URL valid for one hour.

7. Stop the box:

   ```json
   sandbox_stop { "id": "<id>" }
   ```

### Run only what you changed, point the rest at your own environment

You changed `api`, left `worker` alone, and a worker is already running somewhere else: pass `externalBaseUrl` at start, run only `api` in the box, and point the name `worker` outside.

```json
sandbox_start { "services": [{ "name": "api", "port": 3000 }, { "name": "worker", "port": 8080 }], "externalBaseUrl": "https://staging.example.com" }
sandbox_exec  { "id": "<id>", "cmd": "docker compose up -d --build --wait api", "cwd": "example-compose-app", "timeoutSec": 600 }
sandbox_wire  { "id": "<id>", "service": "api", "mode": "box" }
sandbox_wire  { "id": "<id>", "service": "worker", "mode": "external" }
```

`sandbox_status` lists the current wiring table.

## Layout

```
api/            Express server, Dockerfile
worker/         Go worker, Dockerfile
e2e/            Playwright config and tests
docker-compose.yml
```
