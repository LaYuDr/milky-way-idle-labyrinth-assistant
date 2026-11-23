// ==UserScript==
// @name         A迷宫助手 开发加载器
// @description  从本机加载迷宫助手，仅用于开发。
// @namespace    https://www.milkywayidle.com/
// @version      0.12.16
// @author       dakonglong, 柆雨
// @license      MIT
// @match        https://www.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://test.milkywayidlecn.com/*
// @match        https://shykai.github.io/MWICombatSimulatorTest/dist/*
// @noframes
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      127.0.0.1
// ==/UserScript==
(function () {
  GM_xmlhttpRequest({
    method: "GET",
    url: "http://127.0.0.1:4186/runtime.js?t=" + Date.now(),
    timeout: 10000,
    onload(response) {
      if (response.status !== 200 || !response.responseText.startsWith("// MWI_LABYRINTH_RUNTIME\n")) {
        console.error("[迷宫助手] 开发运行时响应无效"); return;
      }
      try { unsafeWindow.Function(response.responseText)(); }
      catch (error) { console.error("[迷宫助手] 开发运行时执行失败", error); }
    },
    onerror() { console.error("[迷宫助手] 无法连接本机开发服务"); },
    ontimeout() { console.error("[迷宫助手] 本机开发服务响应超时"); }
  });
})();
