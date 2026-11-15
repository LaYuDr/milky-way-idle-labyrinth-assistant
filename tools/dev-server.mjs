import http from "node:http";
import path from "node:path";
import { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ROOT, json, read } from "./project.mjs";
export function createServer(root = ROOT) {
  return http.createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const name = pathname === "/" ? "test-harness.html" : pathname.slice(1);
    if (request.method !== "GET") {
      response.writeHead(405);
      response.end();
      return;
    }
    if (
      ![
        "test-harness.html",
        "route-lab.html",
        "runtime.js",
        "milky-way-idle-labyrinth-dev-loader.user.js",
        "milky-way-idle-labyrinth-assistant.user.js"
      ].includes(name)
    ) {
      response.writeHead(404);
      response.end("没有这个文件");
      return;
    }
    try {
      // A long-running server must not retain an old ESM module list or builder.
      // Build in a fresh process so newly added modules are included immediately.
      execFileSync(process.execPath, [realpathSync(path.join(root, "tools/build.mjs"))], {
        cwd: root,
        timeout: 5000,
        maxBuffer: 512 * 1024,
        stdio: "pipe"
      });
      response.setHeader(
        "Content-Type",
        name.endsWith(".html") ? "text/html; charset=utf-8" : "application/javascript; charset=utf-8"
      );
      response.end(read(root, `dist/${name}`));
    } catch (error) {
      console.error(error);
      response.writeHead(503);
      response.end("构建失败，请查看终端日志。");
    }
  });
}
if (process.argv[1]?.endsWith("/dev-server.mjs")) {
  const port = json(ROOT, "release.config.json").devPort;
  const server = createServer();
  server.on("error", (error) => {
    console.error("开发服务启动失败：", error.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => console.log(`迷宫助手：http://127.0.0.1:${port}`));
}
