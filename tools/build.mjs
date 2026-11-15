import path from "node:path";
import { pathToFileURL } from "node:url";
import sources, { usageSource } from "./runtime-sources.mjs";
import usageBuild from "./usage-build.js";
import { ROOT, ARTIFACT, json, read, write, versionParts, validateChannel } from "./project.mjs";
export function outputs(root = ROOT) {
  const pkg = json(root, "package.json");
  const config = json(root, "release.config.json");
  versionParts(pkg.version);
  validateChannel(config);
  if (!Number.isInteger(config.devPort) || config.devPort < 1024 || config.devPort > 65535)
    throw new Error("开发端口无效");
  const runtime =
    "// MWI_LABYRINTH_RUNTIME\n" +
    sources
      .filter((file) => file !== usageSource)
      .map((file) => `// SOURCE: ${file}\n${read(root, file).replaceAll("__BUILD_VERSION__", pkg.version)}`)
      .join("\n");
  const common = `// @namespace    https://www.milkywayidle.com/\n// @version      ${pkg.version}\n// @author       dakonglong, 柆雨\n// @license      MIT\n// @match        https://www.milkywayidle.com/*\n// @match        https://www.milkywayidlecn.com/*\n// @match        https://test.milkywayidle.com/*\n// @match        https://test.milkywayidlecn.com/*\n// @match        https://shykai.github.io/MWICombatSimulatorTest/dist/*\n// @noframes\n// @run-at       document-idle\n`;
  const channel = config.repository
    ? `// @homepageURL  ${config.repository}\n// @downloadURL  ${config.downloadURL}\n// @updateURL    ${config.updateURL}\n`
    : "";
  const usage = usageBuild.buildUsage(root, usageSource, "mwi_labyrinth", "迷宫助手", pkg.version);
  const bundle = `// ==UserScript==\n// @name         迷宫助手\n// @description  银河奶牛迷宫路线规划、房间胜率、预计耗时、推荐等级与重开建议。\n${common}${channel}${usageBuild.metadata}// @grant        GM_addElement\n// @grant        unsafeWindow\n// @sandbox      raw\n// ==/UserScript==\n\n${usage}${runtime}`;
  const loader = `// ==UserScript==\n// @name         A迷宫助手 开发加载器\n// @description  从本机加载迷宫助手，仅用于开发。\n${common}// @grant        GM_xmlhttpRequest\n// @grant        unsafeWindow\n// @connect      127.0.0.1\n// ==/UserScript==\n(function () {\n  GM_xmlhttpRequest({\n    method: "GET",\n    url: "http://127.0.0.1:${config.devPort}/runtime.js?t=" + Date.now(),\n    timeout: 10000,\n    onload(response) {\n      if (response.status !== 200 || !response.responseText.startsWith("// MWI_LABYRINTH_RUNTIME\\n")) {\n        console.error("[迷宫助手] 开发运行时响应无效"); return;\n      }\n      try { unsafeWindow.Function(response.responseText)(); }\n      catch (error) { console.error("[迷宫助手] 开发运行时执行失败", error); }\n    },\n    onerror() { console.error("[迷宫助手] 无法连接本机开发服务"); },\n    ontimeout() { console.error("[迷宫助手] 本机开发服务响应超时"); }\n  });\n})();\n`;
  return {
    [ARTIFACT]: bundle,
    "runtime.js": runtime,
    "milky-way-idle-labyrinth-dev-loader.user.js": loader,
    "test-harness.html": read(root, "tools/test-harness.html"),
    "route-lab.html": read(root, "tools/harness/route-lab/page.html")
      .replace("/* CORE_SOURCE */", () => read(root, "src/core.js"))
      .replace("/* MODEL_SOURCE */", () => read(root, "tools/harness/route-lab/model.js"))
      .replace("/* APP_SOURCE */", () => read(root, "tools/harness/route-lab/app.js"))
  };
}
export function build(root = ROOT) {
  const result = outputs(root);
  for (const [name, bytes] of Object.entries(result)) write(root, `dist/${name}`, bytes);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  build();
  console.log("已生成迷宫助手当前构建。");
}
