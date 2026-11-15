import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ROOT,
  ARTIFACT,
  json,
  read,
  write,
  digest,
  archivePath,
  versionParts,
  validateChannel,
  git,
  run
} from "./project.mjs";
import { verify } from "./verify-repository.mjs";
const fixed = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".prettierignore",
  ".prettierrc.json",
  ".nvmrc",
  ".github/workflows/ci.yml",
  "AGENTS.md",
  "README.md",
  "DESIGN.md",
  "PRODUCT.md",
  "references/combat-engine.json",
  "CHANGELOG.md",
  "LICENSE",
  "package.json",
  "package-lock.json",
  "release.config.json",
  "eslint.config.mjs",
  "发布当前版本.command",
  "启动开发服务.command",
  "releases/README.md",
  "references/README.md"
]);
export function allowed(file) {
  return (
    fixed.has(file) ||
    /^(src|tools|test)\/[\w/-]+\.(js|mjs|html)$/.test(file) ||
    /^test\/fixtures\/[\w-]+\.json$/.test(file) ||
    /^docs\/[A-Z_]+\.md$/.test(file) ||
    /^dist\/(milky-way-idle-labyrinth-assistant.user.js|milky-way-idle-labyrinth-dev-loader.user.js|runtime.js|test-harness.html|route-lab.html)$/.test(
      file
    )
  );
}
function changes(root) {
  return [
    ...new Set(
      [
        ...git(["diff", "--name-only", "-z", "HEAD"], root).split("\0"),
        ...git(["ls-files", "--others", "--exclude-standard", "-z"], root).split("\0")
      ].filter(Boolean)
    )
  ];
}
export function preflight(root = ROOT) {
  const config = json(root, "release.config.json");
  validateChannel(config, true);
  if (config.branch !== "main") throw new Error("发布分支应为 main");
  if (fs.realpathSync(git(["rev-parse", "--show-toplevel"], root)) !== fs.realpathSync(root))
    throw new Error("必须使用独立 Git 仓库");
  if (git(["branch", "--show-current"], root) !== config.branch) throw new Error("当前分支不是 main");
  if (git(["diff", "--cached", "--name-only"], root)) throw new Error("暂存区必须为空");
  const remote = git(["remote", "get-url", "origin"], root)
    .replace(/\.git$/, "")
    .replace(/^git@github.com:/, "https://github.com/");
  const pushRemote = git(["remote", "get-url", "--push", "origin"], root)
    .replace(/\.git$/, "")
    .replace(/^git@github.com:/, "https://github.com/");
  if (remote !== config.repository || pushRemote !== config.repository)
    throw new Error("origin 拉取或推送地址与发布配置不符");
  if (git(["rev-parse", "HEAD"], root) !== git(["rev-parse", `refs/remotes/origin/${config.branch}`], root))
    throw new Error("HEAD 必须与 origin/main 一致；先处理未推送提交或落后状态");
  const version = json(root, "package.json").version;
  const parts = versionParts(version);
  const history = json(root, "releases/manifest.json").releases;
  for (const entry of history) {
    const older = versionParts(entry.version);
    const difference = parts.map((n, i) => n - older[i]).find((n) => n !== 0) || 0;
    if (difference <= 0) throw new Error("新版本必须高于所有历史版本");
  }
  if (!read(root, "CHANGELOG.md").includes(`## ${version}\n`)) throw new Error("请先填写本版本变更记录");
  const files = changes(root);
  const rejected = files.filter((file) => !allowed(file));
  if (rejected.length) throw new Error(`发布范围外的改动：${rejected.join(", ")}`);
  if (!files.length) throw new Error("没有待发布改动");
  return { config, version, files, archive: archivePath(version) };
}
export function archive(root = ROOT) {
  const version = json(root, "package.json").version;
  const destination = archivePath(version);
  const bytes = fs.readFileSync(path.join(root, `dist/${ARTIFACT}`));
  const manifest = json(root, "releases/manifest.json");
  if (manifest.releases.some((entry) => entry.version === version) || fs.existsSync(path.join(root, destination)))
    throw new Error("该版本已有归档，不能覆盖");
  write(root, destination, bytes);
  manifest.releases.push({ version, path: destination, sizeBytes: bytes.length, sha256: digest(bytes) });
  write(root, "releases/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
}
export async function main(args) {
  if (args.some((arg) => arg !== "--dry-run") || args.length > 1)
    throw new Error("用法：npm run release [-- --dry-run]；版本请在 package.json 和锁文件中同步修改");
  const plan = preflight();
  console.log(
    JSON.stringify(
      { version: plan.version, files: plan.files, archive: plan.archive, target: plan.config.repository },
      null,
      2
    )
  );
  if (args.includes("--dry-run")) {
    console.log("只读预演通过；未联网，远端状态仍需正式发布时核对。");
    return;
  }
  git(["fetch", "origin", plan.config.branch]);
  preflight();
  run("npm", ["run", "check:handoff"]);
  const checked = preflight();
  verify();
  archive();
  verify();
  const files = [...checked.files, checked.archive, "releases/manifest.json"];
  git(["add", "--", ...files]);
  git(["diff", "--cached", "--check"]);
  git(["commit", "-m", `Release v${checked.version}`]);
  const commit = git(["rev-parse", "HEAD"]);
  git(["push", "origin", `HEAD:refs/heads/${checked.config.branch}`]);
  const remote = git(["ls-remote", "origin", `refs/heads/${checked.config.branch}`]).split(/\s+/)[0];
  if (remote !== commit) throw new Error("推送后远端提交不一致，请人工核对");
  const response = await fetch(checked.config.downloadURL, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (
    !response.ok ||
    (await response.text()).replaceAll("\r\n", "\n") !== read(ROOT, `dist/${ARTIFACT}`).replaceAll("\r\n", "\n")
  )
    throw new Error("GitHub 已推送，Greasy Fork 尚未同步或内容不一致。请稍后核对公开脚本，不要重跑发布。");
  console.log(`已发布并核对 v${checked.version}。`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
