import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ARTIFACT = "milky-way-idle-labyrinth-assistant.user.js";
export const read = (root, file) => fs.readFileSync(path.join(root, file), "utf8");
export const json = (root, file) => JSON.parse(read(root, file));
export const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
export function versionParts(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error("版本号必须是 X.Y.Z");
  const parts = version.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error("版本号超出范围");
  return parts;
}
export function archivePath(version) {
  const [major, minor] = versionParts(version);
  return `releases/v${major}.${minor}/迷宫助手-v${version}.user.js`;
}
export function run(command, args, root = ROOT, capture = false) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} 失败\n${result.stderr || ""}`);
  return (result.stdout || "").trim();
}
export const git = (args, root = ROOT) => run("git", args, root, true);
export function write(root, file, bytes) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), bytes);
}
export function validateChannel(config, required = false) {
  const keys = ["repository", "downloadURL", "updateURL"];
  if (!required && keys.every((key) => config[key] === null)) return;
  if (!/^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/.test(config.repository || ""))
    throw new Error("请配置独立 GitHub 仓库 HTTPS 地址（不带 .git）");
  const download = /^https:\/\/update\.greasyfork\.org\/scripts\/(\d+)\/[^\s]+\.user\.js$/.exec(
    config.downloadURL || ""
  );
  if (!download || config.updateURL !== config.downloadURL.replace(/\.user\.js$/, ".meta.js"))
    throw new Error("请配置同一迷宫脚本的 Greasy Fork 下载和更新地址");
  if (download[1] === "586873" || config.repository.includes("guild-credit-optimizer"))
    throw new Error("不能使用公会助手发布渠道");
}
