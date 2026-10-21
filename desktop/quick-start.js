/**
 * 一键启动:后端(uvicorn)+ 桌面端(Electron 加载 web dist)。
 * 用法:cd frontend && npm run desktop:full
 *
 * 行为:
 * 1. 探测 http://127.0.0.1:8000/healthz——已有健康后端则复用,否则 spawn `uv run uvicorn`
 * 2. frontend/dist 缺失时自动 `npx expo export -p web`(EXPO_PUBLIC_API_BASE 默认 localhost:8000)
 * 3. Electron 以 dist 模式启动(内嵌静态服务,站内导航可用)
 * 4. Electron 退出或 Ctrl+C 时,联动清理自己拉起的后端
 */
const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const BACKEND = path.join(ROOT, "backend");
const DIST_INDEX = path.join(FRONTEND, "dist", "index.html");
const HEALTH_URL = "http://127.0.0.1:8000/healthz";
const ELECTRON_DIST_URL = "../frontend/dist/index.html"; // 相对 desktop/,main.js 内部锚定

const children = [];
let shuttingDown = false;

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: "inherit", ...opts });
  children.push(child);
  return child;
}

function probeHealth() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitBackendHealthy(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeHealth()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function ensureDist() {
  if (fs.existsSync(DIST_INDEX)) {
    console.log("[quick-start] 复用已有 frontend/dist(删除该目录可强制重建)");
    return;
  }
  console.log("[quick-start] dist 不存在,执行 npx expo export -p web …");
  await new Promise((resolve, reject) => {
    const child = run("npx", ["expo", "export", "-p", "web"], { cwd: FRONTEND });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`expo export 退出码 ${code}`))));
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(0);
}

async function main() {
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // 1. 后端:已有健康实例则复用,否则拉起
  if (await probeHealth()) {
    console.log("[quick-start] 检测到 8000 端口已有健康后端,复用之");
  } else {
    console.log("[quick-start] 启动后端 uvicorn(目录 backend/)…");
    const backend = run("uv", ["run", "uvicorn", "app.main:app", "--port", "8000"], { cwd: BACKEND });
    backend.on("exit", (code) => {
      if (!shuttingDown) console.error(`[quick-start] 后端提前退出(码 ${code}),检查依赖:cd backend && uv sync`);
    });
    if (!(await waitBackendHealthy())) {
      console.error("[quick-start] 后端 30s 内未就绪,放弃启动(端口占用/依赖缺失?)");
      shutdown();
      return;
    }
    console.log("[quick-start] 后端就绪");
  }

  // 2. 前端产物
  await ensureDist();

  // 3. 桌面端(dist 模式;Electron 退出 → 联动关后端)
  console.log("[quick-start] 启动桌面端…");
  const env = { ...process.env, DESKTOP_URL: ELECTRON_DIST_URL };
  // 沙箱/CI 会注入 ELECTRON_RUN_AS_NODE=1,使 electron 退化为纯 Node(require("electron") 直接失败)
  delete env.ELECTRON_RUN_AS_NODE;
  const electron = run("npx", ["electron", "../desktop/main.js"], {
    cwd: FRONTEND,
    env,
  });
  electron.on("exit", () => {
    console.log("[quick-start] 桌面端已退出");
    shutdown();
  });
}

main().catch((err) => {
  console.error("[quick-start] 启动失败:", err.message);
  shutdown();
});
