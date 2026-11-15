(function () {
  "use strict";
  const M = globalThis.MwiRouteLab,
    core = globalThis.MwiLabyrinthCore;
  const $ = (id) => document.getElementById(id),
    key = "mwi-labyrinth:route-lab:v1";
  let state = M.preset("original"),
    step = Infinity,
    compare = 1,
    drag = false,
    lastDrag = null;
  const history = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) state = M.validate(JSON.parse(raw));
  } catch {
    $("storage").textContent = "未能读取本机存档，可导入备份";
  }
  const el = (tag, text) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const coordinate = (id) => `${Math.floor(id / state.board.size) + 1}行${(id % state.board.size) + 1}列`;
  function message(text = "") {
    $("status").textContent = text;
  }
  function remember() {
    history.push(structuredClone(state));
    if (history.length > 100) history.shift();
  }
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(state));
      $("storage").textContent = "方案已保存在本机";
    } catch {
      $("storage").textContent = "本机保存失败，请导出方案备份";
    }
  }
  function mutate(fn) {
    remember();
    fn();
    step = Infinity;
    message();
    render();
    save();
  }
  function render() {
    const b = M.board(state),
      n = b.size,
      route = state.routes[state.selected];
    if (compare >= state.routes.length || compare === state.selected)
      compare = state.routes.findIndex((_, i) => i !== state.selected);
    const metrics = state.routes.map((r) => M.measure(b, r.path));
    step = Math.min(step, route.path.length - 1);
    const prefix = route.path.slice(0, step + 1),
      current = M.measure(b, prefix),
      other = metrics[compare];
    $("size").value = String(n);
    $("route-name").value = route.name;
    $("undo").disabled = !history.length;
    $("new").disabled = $("copy").disabled = state.routes.length >= 6;
    $("delete").disabled = state.routes.length === 1;
    $("compare").replaceChildren();
    $("routes").replaceChildren();
    $("stats").replaceChildren();
    state.routes.forEach((r, index) => {
      const button = el("button", r.name);
      button.setAttribute("aria-pressed", String(index === state.selected));
      button.onclick = () => {
        state.selected = index;
        step = Infinity;
        message();
        render();
        save();
      };
      $("routes").append(button);
      if (index !== state.selected) {
        const option = el("option", r.name);
        option.value = String(index);
        $("compare").append(option);
      }
      const m = metrics[index],
        row = el("tr");
      if (index === state.selected) row.className = "active";
      [
        r.name,
        m.cost,
        m.newRevealed,
        m.extraOpportunity,
        m.opportunityReach,
        m.issues.length ? "无效" : m.complete ? "到出口" : "未完成"
      ].forEach((t) => row.append(el("td", t)));
      row.title = m.issues.join("；");
      $("stats").append(row);
    });
    $("compare").value = String(compare);
    $("compare").disabled = compare < 0;
    const own = metrics[state.selected];
    if (own.issues.length) $("difference").textContent = own.issues.join("；") + "。请撤销或修改地图。";
    else if (other) {
      const sign = (x) => (x > 0 ? `+${x}` : String(x));
      $("difference").textContent =
        `相对「${state.routes[compare].name}」：新格 ${sign(own.cost - other.cost)}，新增揭示 ${sign(own.newRevealed - other.newRevealed)}，外扩机会 ${sign(own.extraOpportunity - other.extraOpportunity)}。`;
    } else $("difference").textContent = "新建或复制一条路线，即可比较。";
    $("step").max = String(route.path.length - 1);
    $("step").value = String(step);
    $("step-value").value = `${step} / ${route.path.length - 1}`;
    const before = M.measure(b, prefix.slice(0, -1));
    $("step-summary").textContent =
      `到 ${coordinate(prefix.at(-1))}，这一步新增揭示 ${step ? current.newRevealed - before.newRevealed : 0} 格。`;
    const pathSet = new Set(prefix),
      neighborsOnly = [...current.newly].filter((id) => !pathSet.has(id)).length;
    $("details").replaceChildren();
    for (const [label, value] of [
      ["移动次数 / 重复进入", `${current.moves} / ${current.revisits}`],
      ["首次进入消耗", current.cost],
      ["新增揭示 / 其中仅邻格", `${current.newRevealed} / ${neighborsOnly}`],
      ["累计已揭示", `${current.total} / ${n * n}`],
      ["潜在新增范围（含直接揭示）", current.opportunityReach],
      ["实际经过的已知宝箱", current.treasures]
    ]) {
      const row = el("tr");
      row.append(el("td", label), el("td", value));
      $("details").append(row);
    }
    if ($("cells").children.length !== n * n) {
      $("cells").replaceChildren();
      for (let id = 0; id < n * n; id++) {
        const cell = el("button");
        cell.type = "button";
        cell.dataset.id = String(id);
        cell.append(el("span"), el("span"));
        cell.children[0].className = "tag";
        cell.children[1].className = "step";
        $("cells").append(cell);
      }
    }
    $("map").style.setProperty("--n", n);
    $("overlay").setAttribute("viewBox", `0 0 ${n * 40} ${n * 40}`);
    const layer = $("layer").value;
    const names = { unknown: "未知", challenge: "挑战", treasure: "宝箱", start: "入口", exit: "出口" };
    [...$("cells").children].forEach((e, id) => {
      const c = b.cells[id],
        classes = ["cell"];
      if (current.known.has(id)) classes.push("known");
      if (layer === "difference" && other) {
        const a = current.newly.has(id),
          z = other.newly.has(id);
        if (a || z) classes.push(a && z ? "common" : a ? "only-a" : "only-b");
      } else {
        if (current.newly.has(id)) classes.push("direct");
        if (layer === "opportunity" && current.extra.has(id)) classes.push("extra");
      }
      if (c.visited) classes.push("visited");
      if (c.passable === false) classes.push("blocked");
      e.className = classes.join(" ");
      const tag =
        id === 0
          ? "入"
          : id === n * n - 1
            ? "出"
            : c.visited
              ? "已"
              : c.passable === false
                ? "禁"
                : c.type === "treasure"
                  ? "宝"
                  : c.type === "challenge"
                    ? "可"
                    : "";
      e.children[0].textContent = tag;
      const indexes = prefix.flatMap((v, i) => (v === id && i ? [i] : []));
      e.children[1].textContent = indexes.length
        ? indexes.length > 1
          ? `${indexes[0]}…${indexes.at(-1)}`
          : String(indexes[0])
        : "";
      e.setAttribute(
        "aria-label",
        `${coordinate(id)} ${c.visited ? "已通关" : c.passable === false ? "不能通过" : names[c.type]}`
      );
      e.title = `${coordinate(id)}${indexes.length ? ` · 第 ${indexes.join("、")} 步` : ""}`;
    });
    $("line").setAttribute(
      "points",
      prefix.map((id) => `${(id % n) * 40 + 20},${Math.floor(id / n) * 40 + 20}`).join(" ")
    );
    $("endpoint").setAttribute("cx", (prefix.at(-1) % n) * 40 + 20);
    $("endpoint").setAttribute("cy", Math.floor(prefix.at(-1) / n) * 40 + 20);
  }
  function edit(id) {
    const mode = $("mode").value,
      n = state.board.size,
      r = state.routes[state.selected];
    if (mode === "route") {
      if (id === r.path.at(-1)) return;
      try {
        const next = M.drawTo(state.board, r.path, id);
        mutate(() => {
          r.path = next;
        });
      } catch (error) {
        message(error.message);
      }
    } else {
      if (id === 0 || id === n * n - 1) {
        message("入口和出口固定，不能修改。");
        return;
      }
      mutate(() => {
        state.board.cells[id] = {
          type: mode === "treasure" ? "treasure" : mode === "unknown" || mode === "revealed" ? "unknown" : "challenge",
          revealed: mode !== "unknown",
          visited: mode === "visited",
          passable: mode === "blocked" ? false : mode === "unknown" || mode === "revealed" ? null : true
        };
      });
    }
  }
  $("map").addEventListener("pointerdown", (e) => {
    const cell = e.target.closest("[data-id]");
    if (!cell || e.button !== 0) return;
    drag = true;
    lastDrag = Number(cell.dataset.id);
    edit(lastDrag);
  });
  $("map").addEventListener("pointermove", (e) => {
    if (!drag) return;
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest("#cells [data-id]");
    if (!cell) return;
    const id = Number(cell.dataset.id);
    if (id !== lastDrag) {
      lastDrag = id;
      edit(id);
    }
  });
  window.addEventListener("pointerup", () => {
    drag = false;
    lastDrag = null;
  });
  window.addEventListener("pointercancel", () => {
    drag = false;
  });
  $("map").addEventListener("click", (e) => {
    if (e.detail === 0) {
      const cell = e.target.closest("[data-id]");
      if (cell) edit(Number(cell.dataset.id));
    }
  });
  $("map").addEventListener("keydown", (e) => {
    if ($("mode").value !== "route") return;
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: state.board.size, ArrowUp: -state.board.size }[e.key];
    if (!delta) return;
    e.preventDefault();
    const last = state.routes[state.selected].path.at(-1);
    if (core.neighbors(last, state.board.size).includes(last + delta)) edit(last + delta);
  });
  for (let n = 5; n <= 20; n++) {
    const o = el("option", `${n} × ${n}`);
    o.value = String(n);
    $("size").append(o);
  }
  $("size").onchange = () =>
    mutate(() => {
      state = M.preset("blank", Number($("size").value));
      $("preset").value = "blank";
    });
  $("load").onclick = () =>
    mutate(() => {
      state = M.preset($("preset").value, Number($("size").value));
    });
  $("route-name").onchange = () => {
    const name = $("route-name").value.trim();
    if (name)
      mutate(() => {
        state.routes[state.selected].name = name;
      });
    else render();
  };
  function add(copy) {
    mutate(() => {
      state.routes.push({
        name: `路线 ${String.fromCharCode(65 + state.routes.length)}`,
        path: copy ? [...state.routes[state.selected].path] : [0]
      });
      state.selected = state.routes.length - 1;
    });
  }
  $("new").onclick = () => add(false);
  $("copy").onclick = () => add(true);
  $("delete").onclick = () =>
    mutate(() => {
      state.routes.splice(state.selected, 1);
      state.selected = Math.max(0, state.selected - 1);
    });
  $("clear").onclick = () =>
    mutate(() => {
      state.routes[state.selected].path = [0];
    });
  $("undo").onclick = () => {
    if (history.length) {
      state = history.pop();
      step = Infinity;
      message();
      render();
      save();
    }
  };
  $("step").oninput = () => {
    step = Number($("step").value);
    render();
  };
  $("layer").onchange = render;
  $("compare").onchange = () => {
    compare = Number($("compare").value);
    render();
  };
  $("export").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    const a = el("a");
    a.href = url;
    a.download = "迷宫路线方案.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("import").onclick = () => $("file").click();
  $("file").onchange = async () => {
    const f = $("file").files[0];
    if (!f) return;
    try {
      if (f.size > 2000000) throw new Error("文件超过 2 MB");
      const next = M.validate(JSON.parse(await f.text()));
      mutate(() => {
        state = next;
      });
      message("方案已导入，可撤销恢复原方案。");
    } catch (e) {
      message(`导入失败：${e.message}`);
    } finally {
      $("file").value = "";
    }
  };
  render();
})();
