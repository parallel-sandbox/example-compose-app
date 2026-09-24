# example-compose-app

ParallelSandbox 的範例 repo 之一：一個 Node API 加一個 Go worker，用 docker compose 跑，另附一支 Playwright e2e，會開瀏覽器操作頁面並截圖。用來驗證「箱子裡 build、run、跑 e2e、拿回截圖與影片」整條路。

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

箱子是一台你自己 agent 的遠端 Linux 機器，裡面有 Docker、git、Node、Go、Xvfb 虛擬螢幕與 Chromium，沒有 AI。以下每一步都是一個 MCP 工具呼叫，由 Claude Code、Codex 或任何接了 `mcp.parallelsandbox.com` 的 agent 發出。工具定義見 https://parallelsandbox.com/docs/tools/ 。`sandbox_exec` 與 `sandbox_build` 一定要帶 `note`：用看箱子的人讀的語言，一句話說這一步要做什麼。

1. 起箱子，宣告這個 repo 有哪些服務、各聽哪個埠：

   ```json
   sandbox_start { "name": "example-compose-app e2e", "services": [{ "name": "api", "port": 3000, "web": true }, { "name": "worker", "port": 8080 }] }
   ```

   回 `id`、`sceneUrl`、`takeoverUrl`。之後每個工具都帶這個 `id`。箱子一開起來，`api` 與 `worker` 這兩個名字在箱子裡（含容器）就解析到箱子自己，不需要接線。`sceneUrl` 指到第一個宣告的服務（這裡是 `api`），可以直接在你的瀏覽器或手機打開；拿到完整網址的人都打得開，只分享給該看的人。`web: true` 讓 app 替 `api` 顯示「使用」按鈕。

2. 把程式碼放進箱子（`cwd` 預設是箱子的 `/work`）：

   ```json
   sandbox_exec { "id": "<id>", "cmd": "git clone https://github.com/parallel-sandbox/example-compose-app.git", "note": "clone 範例 repo" }
   ```

   自己改過、還沒 commit 的版本用同步（要經 stdio 轉接器 `parallelsandbox-mcp`，`localPath` 給絕對路徑）：`sandbox_sync { "id": "<id>", "localPath": "/absolute/path/to/example-compose-app", "dest": "example-compose-app" }`。

3. build 並跑起來：

   ```json
   sandbox_exec { "id": "<id>", "cmd": "docker compose up -d --build --wait", "cwd": "example-compose-app", "timeoutSec": 600, "note": "build 並啟動 api 與 worker" }
   sandbox_exec { "id": "<id>", "cmd": "curl -s http://api:3000/api/health", "note": "確認用名字連得到 api" }
   ```

   compose 網路裡兩個服務本來就互相找得到；箱子上 compose 以外的東西（e2e、Chromium、其他容器）也用同樣的名字連得到，因為名字在箱子裡解析到箱子自己、`ports:` 把兩個 port 發布在箱子上。

4. 跑 e2e，順便錄影。`HEADED=1` 讓 Chromium 開在箱子的虛擬螢幕上（命令的環境已經有 `DISPLAY=:99`），這樣 `sandbox_shot` 錄得到、人從 `takeoverUrl` 也看得到：

   ```json
   sandbox_exec { "id": "<id>", "cmd": "npm ci && npx playwright install chromium", "cwd": "example-compose-app/e2e", "timeoutSec": 600, "note": "安裝 e2e 測試需要的套件" }
   sandbox_shot { "id": "<id>", "record": "start" }
   sandbox_exec { "id": "<id>", "cmd": "HEADED=1 BASE_URL=http://localhost:3000 npx playwright test", "cwd": "example-compose-app/e2e", "timeoutSec": 300, "note": "在箱子螢幕上跑 e2e 測試" }
   sandbox_shot { "id": "<id>", "record": "stop" }
   ```

   `record: "stop"` 回一個一小時有效的 mp4 下載網址。

5. 拿截圖：

   ```json
   sandbox_get { "id": "<id>", "path": "example-compose-app/e2e/screenshots/jobs.png" }
   ```

   回一個一小時有效的下載網址。

6. 收箱子（之前可以先 `sandbox_feedback` 回報用起來的情況）：

   ```json
   sandbox_stop { "id": "<id>" }
   ```

### 只跑改過的服務，沒改的打你自己的環境

改了 `api`、沒改 `worker`，而你在 `https://staging.example.com` 已經有一個跑著的 worker：起箱子時給 `externalBaseUrl`。這時宣告的兩個服務一開始都是 `external`：boxd 在 3000 與 8080 上聽，把 HTTP 轉到 `externalBaseUrl`（路徑保留、Host 換掉）。所以要先把 `api` 切成 `box` 讓出 3000，再只啟動 `api`；`worker` 這個名字照樣轉到 staging：

```json
sandbox_start { "name": "改過的 api 接 staging 的 worker", "services": [{ "name": "api", "port": 3000 }, { "name": "worker", "port": 8080 }], "externalBaseUrl": "https://staging.example.com" }
sandbox_exec  { "id": "<id>", "cmd": "git clone https://github.com/parallel-sandbox/example-compose-app.git", "note": "clone 範例 repo" }
sandbox_wire  { "id": "<id>", "service": "api", "mode": "box" }
sandbox_exec  { "id": "<id>", "cmd": "docker compose up -d --build --wait api", "cwd": "example-compose-app", "timeoutSec": 600, "note": "只 build 並啟動 api" }
```

`sandbox_wire` 回整張接線表，`sandbox_status` 也看得到。沒給 `externalBaseUrl` 的箱子每個服務一開始就是 `box`，不需要這一步。

## 目錄

```
api/            Express 伺服器、Dockerfile
worker/         Go worker、Dockerfile
e2e/            Playwright 設定與測試
docker-compose.yml
```

---

# example-compose-app (English)

One of the ParallelSandbox example repos: a Node API plus a Go worker under docker compose, with a Playwright e2e that drives the page in a real browser and saves a screenshot. It exercises the whole path inside a box: build, run, run e2e, fetch the screenshot and the recording.

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

A box is a remote Linux machine for your own agent: Docker, git, Node, Go, an Xvfb virtual display and Chromium, no AI inside. Every step below is one MCP tool call issued by Claude Code, Codex or any agent connected to `mcp.parallelsandbox.com`. Tool definitions: https://parallelsandbox.com/en/docs/tools/ . `sandbox_exec` and `sandbox_build` require a `note`: one sentence, in the language the person watching reads, saying what the step is for.

1. Start a box and declare the services this repo exposes:

   ```json
   sandbox_start { "name": "example-compose-app e2e", "services": [{ "name": "api", "port": 3000, "web": true }, { "name": "worker", "port": 8080 }] }
   ```

   Returns `id`, `sceneUrl`, `takeoverUrl`. Every later call carries this `id`. From the moment the box starts, `api` and `worker` resolve inside the box, containers included, to the box itself; there is nothing to wire. `sceneUrl` reaches the first declared service (`api` here) from your own browser or phone; anyone with the full URL can open it, so share it only with people who should see it. `web: true` puts a Use it button for `api` in the app.

2. Put the code in the box (`cwd` defaults to `/work` in the box):

   ```json
   sandbox_exec { "id": "<id>", "cmd": "git clone https://github.com/parallel-sandbox/example-compose-app.git", "note": "clone the example repo" }
   ```

   For an uncommitted local checkout use sync (through the stdio adapter `parallelsandbox-mcp`, with an absolute `localPath`): `sandbox_sync { "id": "<id>", "localPath": "/absolute/path/to/example-compose-app", "dest": "example-compose-app" }`.

3. Build and run:

   ```json
   sandbox_exec { "id": "<id>", "cmd": "docker compose up -d --build --wait", "cwd": "example-compose-app", "timeoutSec": 600, "note": "build and start the api and the worker" }
   sandbox_exec { "id": "<id>", "cmd": "curl -s http://api:3000/api/health", "note": "check the api answers by its name" }
   ```

   The two services already see each other on the compose network; everything else on the box (the e2e, Chromium, other containers) reaches them by the same names, because the names resolve to the box and `ports:` publishes both ports on it.

4. Run the e2e and record it. `HEADED=1` opens Chromium on the box's virtual display (commands already have `DISPLAY=:99`), so `sandbox_shot` can record it and a person can watch through `takeoverUrl`:

   ```json
   sandbox_exec { "id": "<id>", "cmd": "npm ci && npx playwright install chromium", "cwd": "example-compose-app/e2e", "timeoutSec": 600, "note": "install the e2e test dependencies" }
   sandbox_shot { "id": "<id>", "record": "start" }
   sandbox_exec { "id": "<id>", "cmd": "HEADED=1 BASE_URL=http://localhost:3000 npx playwright test", "cwd": "example-compose-app/e2e", "timeoutSec": 300, "note": "run the e2e test on the box screen" }
   sandbox_shot { "id": "<id>", "record": "stop" }
   ```

   `record: "stop"` returns a download URL for the mp4, valid for one hour.

5. Fetch the screenshot:

   ```json
   sandbox_get { "id": "<id>", "path": "example-compose-app/e2e/screenshots/jobs.png" }
   ```

   Returns a download URL valid for one hour.

6. Stop the box (report how it went with `sandbox_feedback` first):

   ```json
   sandbox_stop { "id": "<id>" }
   ```

### Run only what you changed, point the rest at your own environment

You changed `api`, left `worker` alone, and a worker already runs at `https://staging.example.com`: pass `externalBaseUrl` at start. Both declared services then start `external`: boxd listens on 3000 and 8080 and forwards HTTP to `externalBaseUrl` (path kept, Host rewritten). So switch `api` to `box` first, which frees port 3000, then start only `api`; the name `worker` keeps going to staging:

```json
sandbox_start { "name": "api change against staging worker", "services": [{ "name": "api", "port": 3000 }, { "name": "worker", "port": 8080 }], "externalBaseUrl": "https://staging.example.com" }
sandbox_exec  { "id": "<id>", "cmd": "git clone https://github.com/parallel-sandbox/example-compose-app.git", "note": "clone the example repo" }
sandbox_wire  { "id": "<id>", "service": "api", "mode": "box" }
sandbox_exec  { "id": "<id>", "cmd": "docker compose up -d --build --wait api", "cwd": "example-compose-app", "timeoutSec": 600, "note": "build and start only the api" }
```

`sandbox_wire` returns the whole wiring table, and `sandbox_status` shows it too. Without `externalBaseUrl` every service starts as `box` and this step is not needed.

## Layout

```
api/            Express server, Dockerfile
worker/         Go worker, Dockerfile
e2e/            Playwright config and tests
docker-compose.yml
```

## 假登入頁（接手示範用）

`GET /login` 是一個假登入頁，任何非空帳密都放行並設 cookie；`POST /logout` 清掉。設環境變數 `REQUIRE_LOGIN=1` 起 api 時，首頁會先轉去 `/login`，用來示範「agent 卡在登入頁，`sandbox_takeover` 請人來輸入帳密」的流程：

```
sandbox_exec { "id": "<id>", "cmd": "REQUIRE_LOGIN=1 docker compose up -d --build --wait", "cwd": "example-compose-app", "timeoutSec": 600, "note": "start the stack with the demo login required" }
sandbox_exec { "id": "<id>", "cmd": "chromium --no-sandbox --kiosk --window-size=1280,800 --user-data-dir=/tmp/chrome http://localhost:3000/", "background": true, "note": "open the app on the box screen" }
sandbox_takeover { "id": "<id>", "note": "Please sign in on the demo login page, then hand back." }
```

## Demo login page (for the takeover walkthrough)

`GET /login` is a fake sign-in page: any non-empty username and password pass and set a cookie; `POST /logout` clears it. Start the api with `REQUIRE_LOGIN=1` and the home page redirects to `/login` first, which is the moment to call `sandbox_takeover` and let a person type the credentials on the live screen.
