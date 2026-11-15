import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { ROOT } from "./project.mjs";
// Read only the pinned JSON asset literal; never evaluate the downloaded userscript.
const input = process.argv[2];
if (!input) throw new Error("请提供 labyrinth-clear-rate-rust-embedded.user.js 的本地路径");
const source = fs.readFileSync(input, "utf8");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (sha(source) !== "663ad862424fd424f54c03cdd9861cb153309d67a553914606651f7d9484c76c")
  throw new Error("上游脚本与固定提交不一致，请先核对版本");
const assets = JSON.parse(source.match(/const rustCalculator = CalculatorRuntime.create\((\{[^\n]+\})\);/)[1]);
if (sha(gunzipSync(Buffer.from(assets.wasm, "base64"))) !== assets.hash) throw new Error("上游 WASM 校验失败");
// Preserve the pinned WASM and battle rules; expose its already-computed experience.
const experienceMarker = "        ...result,\n        clearTimeInterval:";
if (assets.worker.split(experienceMarker).length !== 2) throw new Error("上游经验输出接入点不匹配");
const worker = assets.worker.replace(
  experienceMarker,
  "        ...result,\n        experienceGained: full.experienceGained,\n        clearTimeInterval:"
);
const code = [
  `ctx.MWISIM_ENGINE_TAG = "labyrinth-clear-rate:e30f758841ba+wasm:${assets.hash.slice(0, 12)}";`,
  `ctx.MWISIM_WASM_SHA256 = ${JSON.stringify(assets.hash)};`,
  `ctx.MWISIM_WORKER_GZ_BASE64 = ${JSON.stringify(gzipSync(worker, { level: 9, mtime: 0 }).toString("base64"))};`,
  `ctx.MWISIM_WASM_GZ_BASE64 = ${JSON.stringify(assets.wasm)};`,
  `ctx.MWISIM_DATA_GZ_BASE64 = ${JSON.stringify(assets.data)};`
].join("\n    ");
const target = path.join(ROOT, "src/calculator/combat-engine.js");
const current = fs.readFileSync(target, "utf8");
const marker = /\/\/ BEGIN PINNED COMBAT ASSETS[\s\S]*?\/\/ END PINNED COMBAT ASSETS/;
if (!marker.test(current)) throw new Error("目标文件缺少资源标记");
fs.writeFileSync(
  target,
  current.replace(marker, `// BEGIN PINNED COMBAT ASSETS\n    ${code}\n    // END PINNED COMBAT ASSETS`)
);
console.log(`已导入固定内核：${assets.hash}；Worker：${sha(worker)}`);
