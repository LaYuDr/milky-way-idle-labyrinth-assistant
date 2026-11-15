const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mwi-labyrinth-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of ["src", "tools", "package.json", "package-lock.json", "release.config.json", "CHANGELOG.md"])
    fs.cpSync(path.join(root, name), path.join(dir, name), { recursive: true });
  // 测试版本和历史独立于实际发布进度。
  for (const name of ["package.json", "package-lock.json"]) {
    change(dir, name, (text) => {
      const data = JSON.parse(text);
      data.version = "0.1.0";
      if (data.packages) data.packages[""].version = "0.1.0";
      return JSON.stringify(data, null, 2) + "\n";
    });
  }
  fs.mkdirSync(path.join(dir, "releases"));
  fs.writeFileSync(path.join(dir, "releases/manifest.json"), JSON.stringify({ schemaVersion: 1, releases: [] }));
  fs.writeFileSync(path.join(dir, "CHANGELOG.md"), "# 测试变更记录\n\n## 0.1.0\n\n测试版本。\n");
  fs.writeFileSync(
    path.join(dir, "release.config.json"),
    JSON.stringify({
      branch: "main",
      repository: null,
      downloadURL: null,
      updateURL: null,
      devPort: 4186
    })
  );
  const { build } = await import("../tools/build.mjs");
  build(dir);
  return dir;
}
function change(dir, file, callback) {
  const target = path.join(dir, file);
  fs.writeFileSync(target, callback(fs.readFileSync(target, "utf8")));
}
function git(dir, ...args) {
  const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function snapshot(dir) {
  return fs
    .readdirSync(dir, { recursive: true })
    .filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .sort()
    .map((f) => [f, fs.readFileSync(path.join(dir, f)).toString("base64")]);
}
test("运行时重复加载不创建第二实例，销毁后可重启", async () => {
  const { outputs } = await import("../tools/build.mjs");
  const code = outputs()["runtime.js"];
  const context = vm.createContext({});
  vm.runInContext(code, context);
  const first = context.__mwiLabyrinthAssistant;
  vm.runInContext(code, context);
  assert.equal(context.__mwiLabyrinthAssistant, first);
  first.destroy();
  assert.equal(context.__mwiLabyrinthAssistant, undefined);
  vm.runInContext(code, context);
  first.destroy();
  assert.ok(context.__mwiLabyrinthAssistant);
  assert.notEqual(context.__mwiLabyrinthAssistant, first);
});
test("确定性构建、不归档，正式脚本不含本机权限或旧身份", async (t) => {
  const dir = await fixture(t);
  const { build } = await import("../tools/build.mjs");
  const a = build(dir);
  assert.deepEqual(build(dir), a);
  const bundle = a["milky-way-idle-labyrinth-assistant.user.js"];
  assert.doesNotMatch(bundle, /127\.0\.0\.1|586873|mwi-guild-|__mwiGuildAssistant/);
  assert.match(bundle, /@grant +GM_xmlhttpRequest/);
  assert.match(bundle, /@sandbox +raw/);
  assert.match(bundle, /@author +dakonglong, 柆雨/);
  assert.match(bundle, /Copyright \(c\) 2026 wow121/);
  assert.match(bundle, /Rust dependency: serde 1\.0\.229/);
  assert.match(bundle, /LAYU_USAGE_START mwi_labyrinth/);
  assert.doesNotMatch(a["runtime.js"], /LAYU_USAGE_START|USAGE_BOOTSTRAP/);
  assert.doesNotMatch(a["milky-way-idle-labyrinth-dev-loader.user.js"], /rainapp|LAYU_USAGE_START/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "releases/manifest.json"))).releases.length, 0);
  new vm.Script(bundle);
  new vm.Script(a["milky-way-idle-labyrinth-dev-loader.user.js"]);
});
test("仓库检查识别旧产物、缺失模块和锁文件错误", async (t) => {
  const dir = await fixture(t);
  const { verify } = await import("../tools/verify-repository.mjs");
  verify(dir);
  const artifact = "dist/runtime.js";
  change(dir, artifact, (s) => s + "\n// stale");
  assert.throws(() => verify(dir), /产物过期/);
  const { build } = await import("../tools/build.mjs");
  build(dir);
  fs.writeFileSync(path.join(dir, "src/missing.js"), "// missing");
  assert.throws(() => verify(dir), /源码未全部/);
  fs.unlinkSync(path.join(dir, "src/missing.js"));
  change(dir, "package-lock.json", (s) => s.replace('"version": "0.1.0"', '"version": "9.0.0"'));
  assert.throws(() => verify(dir), /锁文件/);
});
test("历史归档校验哈希且拒绝覆盖", async (t) => {
  const dir = await fixture(t);
  const { archive } = await import("../tools/release-current-version.mjs");
  const { verify } = await import("../tools/verify-repository.mjs");
  archive(dir);
  verify(dir);
  const before = snapshot(path.join(dir, "releases"));
  assert.throws(() => archive(dir), /不能覆盖/);
  assert.deepEqual(snapshot(path.join(dir, "releases")), before);
  change(dir, "releases/v0.1/迷宫助手-v0.1.0.user.js", (s) => s + "broken");
  assert.throws(() => verify(dir), /历史归档损坏/);
});
test("渠道未配置或误用旧项目时拒绝发布", async (t) => {
  const dir = await fixture(t);
  const { preflight } = await import("../tools/release-current-version.mjs");
  const before = snapshot(dir);
  assert.throws(() => preflight(dir), /请配置/);
  assert.deepEqual(snapshot(dir), before);
  const { validateChannel } = await import("../tools/project.mjs");
  assert.throws(
    () =>
      validateChannel(
        {
          repository: "https://github.com/test/labyrinth",
          downloadURL: "https://update.greasyfork.org/scripts/586873/test.user.js",
          updateURL: "https://update.greasyfork.org/scripts/586873/test.meta.js"
        },
        true
      ),
    /公会助手/
  );
});
test("白名单拒绝草稿、参考插件和历史修改", async () => {
  const { allowed } = await import("../tools/release-current-version.mjs");
  for (const file of [
    ".workbench/draft.js",
    "references/local-plugins/a.js",
    "secrets.env",
    "releases/v0.1/迷宫助手-v0.1.0.user.js",
    "releases/manifest.json",
    "docs/draft.txt"
  ])
    assert.equal(allowed(file), false, file);
  for (const file of [
    "src/userscript.js",
    "tools/build.mjs",
    "docs/RELEASING.md",
    "test/fixtures/combat-engine-reference.json",
    "references/combat-engine.json"
  ])
    assert.equal(allowed(file), true, file);
});
test("发布预演只读；分支、暂存和未知文件会阻止发布", async (t) => {
  const dir = await fixture(t);
  fs.writeFileSync(
    path.join(dir, "release.config.json"),
    JSON.stringify({
      branch: "main",
      repository: "https://github.com/test/labyrinth",
      downloadURL: "https://update.greasyfork.org/scripts/999999/labyrinth.user.js",
      updateURL: "https://update.greasyfork.org/scripts/999999/labyrinth.meta.js",
      devPort: 4186
    })
  );
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.name", "Fixture");
  git(dir, "config", "user.email", "fixture@example.invalid");
  git(
    dir,
    "add",
    "--",
    "src",
    "tools",
    "releases",
    "dist",
    "package.json",
    "package-lock.json",
    "release.config.json",
    "CHANGELOG.md"
  );
  git(dir, "commit", "-m", "fixture baseline");
  git(dir, "remote", "add", "origin", "https://github.com/test/labyrinth.git");
  git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
  change(dir, "src/userscript.js", (s) => s + "\n// fixture change\n");
  const before = snapshot(dir);
  const result = spawnSync(process.execPath, ["tools/release-current-version.mjs", "--dry-run"], {
    cwd: dir,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /只读预演通过/);
  assert.deepEqual(snapshot(dir), before);
  const { preflight } = await import("../tools/release-current-version.mjs");
  fs.writeFileSync(path.join(dir, "private.txt"), "draft");
  assert.throws(() => preflight(dir), /发布范围外/);
  fs.unlinkSync(path.join(dir, "private.txt"));
  git(dir, "add", "--", "src/userscript.js");
  assert.throws(() => preflight(dir), /暂存区/);
  git(dir, "reset");
  git(dir, "checkout", "-b", "feature");
  assert.throws(() => preflight(dir), /当前分支/);
});
test("开发服务仅提供允许文件，构建失败返回 503", async (t) => {
  const dir = await fixture(t);
  const { createServer } = await import("../tools/dev-server.mjs");
  const server = createServer(dir);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      })
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + "/runtime.js");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(await response.text(), /^\/\/ MWI_LABYRINTH_RUNTIME/);
  assert.equal((await fetch(base + "/package.json")).status, 404);
  assert.equal((await fetch(base + "/runtime.js", { method: "POST" })).status, 405);
  // Simulate a source-list upgrade while this exact server remains running.
  fs.writeFileSync(path.join(dir, "src/hot-added.js"), "globalThis.__mwiLabyrinthHotAdded = true;\n");
  change(dir, "tools/runtime-sources.mjs", (s) =>
    s.replace('"src/userscript.js"', '"src/hot-added.js", "src/userscript.js"')
  );
  const upgraded = await (await fetch(base + "/runtime.js")).text();
  assert.match(upgraded, /__mwiLabyrinthHotAdded = true/);
  assert.match(upgraded, /SOURCE: src\/calculator\/lifecycle\.js/);
  assert.ok(upgraded.indexOf("SOURCE: src/calculator/lifecycle.js") < upgraded.indexOf("SOURCE: src/userscript.js"));
  change(dir, "tools/build.mjs", (s) =>
    s.replace('"// MWI_LABYRINTH_RUNTIME\\n"', '"// MWI_LABYRINTH_RUNTIME\\n// builder-updated\\n"')
  );
  assert.match(await (await fetch(base + "/runtime.js")).text(), /builder-updated/);
  fs.unlinkSync(path.join(dir, "src/userscript.js"));
  t.mock.method(console, "error", () => {});
  assert.equal((await fetch(base + "/runtime.js")).status, 503);
});
