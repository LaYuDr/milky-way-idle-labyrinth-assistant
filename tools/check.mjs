import { ROOT, run, git } from "./project.mjs";
const mode = process.argv[2] || "full";
if (!["full", "quick", "handoff", "ci"].includes(mode)) throw new Error("未知检查模式");
if (mode === "quick") {
  const tests = process.argv.slice(3);
  if (!tests.length || tests.some((file) => !/^test\/[\w.-]+\.test\.js$/.test(file)))
    throw new Error("quick 模式请明确指定 test/*.test.js");
  run(process.execPath, ["--test", ...tests]);
} else {
  for (const stage of ["format:check", "lint", "test", "build", "verify:repo"]) run("npm", ["run", stage]);
  if (["handoff", "ci"].includes(mode)) git(["diff", "--check"], ROOT);
  if (mode === "ci" && git(["status", "--porcelain", "--untracked-files=all"]))
    throw new Error("CI 构建后仓库发生变化，请提交最新产物");
}
