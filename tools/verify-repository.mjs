import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sources from "./runtime-sources.mjs";
import { outputs } from "./build.mjs";
import { ROOT, ARTIFACT, read, json, digest, archivePath, versionParts } from "./project.mjs";
export function verify(root = ROOT) {
  const pkg = json(root, "package.json");
  const lock = json(root, "package-lock.json");
  if (
    pkg.name !== "milky-way-idle-labyrinth-assistant" ||
    lock.name !== pkg.name ||
    lock.version !== pkg.version ||
    lock.packages[""].version !== pkg.version
  )
    throw new Error("包名或锁文件版本不一致");
  if (sources.at(-1) !== "src/userscript.js" || new Set(sources).size !== sources.length)
    throw new Error("运行时清单顺序错误");
  const actualSources = fs
    .readdirSync(path.join(root, "src"), { recursive: true })
    .filter((f) => f.endsWith(".js"))
    .map((f) => `src/${f}`)
    .sort();
  if (JSON.stringify(actualSources) !== JSON.stringify([...sources].sort())) throw new Error("源码未全部列入构建清单");
  for (const [name, expected] of Object.entries(outputs(root)))
    if (read(root, `dist/${name}`) !== expected) throw new Error(`产物过期：${name}`);
  const manifest = json(root, "releases/manifest.json");
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.releases)) throw new Error("历史清单结构无效");
  const seen = new Set();
  let previous = null;
  for (const entry of manifest.releases) {
    const parts = versionParts(entry.version);
    if (previous && compare(parts, previous) <= 0) throw new Error("历史版本必须递增且唯一");
    previous = parts;
    if (entry.path !== archivePath(entry.version)) throw new Error("历史路径不匹配");
    seen.add(entry.path);
    const bytes = fs.readFileSync(path.join(root, entry.path));
    if (bytes.length !== entry.sizeBytes || digest(bytes) !== entry.sha256)
      throw new Error(`历史归档损坏：${entry.path}`);
    if (!bytes.toString().includes(`// @version      ${entry.version}\n`)) throw new Error("历史脚本版本不匹配");
  }
  const archives = fs
    .readdirSync(path.join(root, "releases"), { recursive: true })
    .filter((f) => f.endsWith(".user.js"));
  if (archives.some((f) => !seen.has(`releases/${f}`))) throw new Error("存在未登记的历史归档");
  const current = manifest.releases.find((entry) => entry.version === pkg.version);
  if (current && read(root, current.path) !== read(root, `dist/${ARTIFACT}`))
    throw new Error("当前版本已归档，修改后必须提升版本");
}
function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  verify();
  console.log("仓库与产物检查通过。");
}
