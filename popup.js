// ===== Отложенка: popup (копилка + группы) =====

let state = { inbox: [], groups: [], settings: { removeAfterOpen: true } };
let selId = null;      // id выбранной группы: "inbox" или group.id
let movingId = null;   // id ссылки, для которой открыто поле выбора группы

const $ = sel => document.querySelector(sel);
const groupsEl = $("#grouplist");
const linksEl = $("#links");
const headEl = $("#listhead");

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function normalize() {
  state.inbox = Array.isArray(state.inbox) ? state.inbox : [];
  state.groups = Array.isArray(state.groups) ? state.groups : [];
  state.settings = Object.assign({ removeAfterOpen: true }, state.settings);
  state.groups.forEach(g => { g.items = Array.isArray(g.items) ? g.items : []; });
}

async function load() {
  state = await browser.storage.local.get(["inbox", "groups", "settings"]);
  normalize();
  if (!selId || !currentList().ok) selId = "inbox";
  render();
}

async function save() {
  await browser.storage.local.set({
    inbox: state.inbox, groups: state.groups, settings: state.settings
  });
}

// Выбранный узел: {ok, name, items (ссылка на реальный массив), isInbox, group}
function currentList() {
  if (selId === "inbox") return { ok: true, name: "📥 Входящие", items: state.inbox, isInbox: true };
  const g = state.groups.find(x => x.id === selId);
  if (g) return { ok: true, name: g.name, items: g.items, group: g };
  return { ok: false };
}

// Перезапись списка выбранного узла (items в currentList — живой массив состояния)
function setItems(cur, newArr) {
  if (!cur.ok) return;
  if (cur.isInbox) state.inbox = newArr;
  else cur.group.items = newArr;
}

function extractUrls(text) {
  const re = /https?:\/\/[^\s<>"'`]+|(?:[\w-]+\.)*\w+(?:[\w-]+)+\.(?:com|net|org|ru|ua|io|me|dev|app|xyz|info|biz|online|site|store|tech|space|fun|cc|to|co|it|by|kz|edu|gov)(?:\/[^\s<>"'`]*)?/gi;
  const found = new Set();
  for (const m of (text.match(re) || [])) {
    found.add(m.startsWith("http") ? m : "https://" + m);
  }
  return [...found];
}

function shortHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url.slice(0, 60); }
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("ru", { day: "2-digit", month: "2-digit" });
}

// ===== Рендер =====
function render() {
  renderGroups();
  renderForm();
  renderList();
}

function renderGroups() {
  groupsEl.innerHTML = "";
  const mk = (name, count, id) => {
    const el = document.createElement("div");
    el.className = "group" + (selId === id ? " sel" : "");
    el.dataset.id = id;
    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = name;
    el.appendChild(nameSpan);
    const c = document.createElement("span");
    c.className = "count";
    c.textContent = count;
    el.appendChild(c);
    el.onclick = () => { selId = id; movingId = null; render(); };
    return el;
  };

  groupsEl.appendChild(mk("📥 Входящие", state.inbox.length, "inbox"));

  for (const g of state.groups) {
    const el = mk(g.name, g.items.length, g.id);
    el.title = "Двойной клик — переименовать";
    el.ondblclick = e => { e.preventDefault(); renameGroupInput(g, el.querySelector(".name")); };
    groupsEl.appendChild(el);
  }
}

function renderForm() {
  const sel = $("#targetsel");
  const prev = sel.value || selId;
  sel.innerHTML = "";
  const opt = (v, t) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t; sel.appendChild(o);
  };
  opt("inbox", "📥 Входящие");
  for (const g of state.groups) opt(g.id, "📁 " + g.name);
  sel.value = (prev === "inbox" || state.groups.some(g => g.id === prev)) ? prev : selId;
}

function renderList() {
  const cur = currentList();
  linksEl.innerHTML = "";
  headEl.innerHTML = "";

  if (!cur.ok) { linksEl.innerHTML = '<div class="empty">Группа не найдена</div>'; return; }

  const name = document.createElement("span");
  name.className = "gname";
  name.textContent = cur.name;
  headEl.appendChild(name);

  const openAll = mkBtn("⤴", cur.isInbox ? "Открыть всё из входящих" : "Открыть всю группу", () => openAllGroup(cur));
  headEl.appendChild(openAll);

  if (cur.isInbox) {
    const wipe = mkBtn("🧹", "Очистить входящие", async () => {
      state.inbox = [];
      await save(); render();
    });
    wipe.classList.add("del");
    headEl.appendChild(wipe);
  } else {
    const ren = mkBtn("✏", "Переименовать", () => renameGroupInput(cur.group, name));
    headEl.appendChild(ren);
    const drop = mkBtn("🗂", "Удалить группу (ссылки → Входящие)", async () => {
      state.inbox.unshift(...cur.group.items);
      state.groups = state.groups.filter(g => g.id !== cur.group.id);
      selId = "inbox";
      await save(); render();
    });
    drop.classList.add("del");
    headEl.appendChild(drop);
  }

  if (!cur.items.length) {
    linksEl.innerHTML =
      '<div class="empty">Здесь пусто.<br>Вставьте ссылки сверху или ПКМ по ссылке → «Отложить в копилку».</div>';
    $("#counter").textContent = "";
    return;
  }

  for (const it of cur.items) linksEl.appendChild(renderLink(it, cur));

  const total = state.inbox.length + state.groups.reduce((s, g) => s + g.items.length, 0);
  $("#counter").textContent = "В группе: " + cur.items.length + " · всего: " + total;
}

function mkBtn(label, title, onclick) {
  const b = document.createElement("button");
  b.className = "act";
  b.textContent = label;
  b.title = title;
  b.onclick = e => { e.stopPropagation(); onclick(); };
  return b;
}

function renderLink(it, cur) {
  const row = document.createElement("div");
  row.className = "link" + (movingId === it.id ? " moving" : "");
  row.dataset.id = it.id;

  const txt = document.createElement("div");
  txt.className = "txt";
  const t = document.createElement("span");
  t.className = "t";
  t.textContent = it.title || shortHost(it.url);
  const u = document.createElement("span");
  u.className = "u";
  u.textContent = it.url.replace(/^https?:\/\//, "");
  txt.append(t, u);
  txt.title = it.url;
  txt.onclick = () => openItem(it, cur);
  row.appendChild(txt);

  const date = document.createElement("span");
  date.className = "date";
  date.textContent = fmtDate(it.added);
  date.title = "Добавлено: " + new Date(it.added).toLocaleString("ru");
  row.appendChild(date);

  row.appendChild(mkMoveSel(it));
  row.appendChild(mkBtn("▶", "Открыть", () => openItem(it, cur)));
  row.appendChild(mkBtn("➜", "Переложить в другую группу", () => {
    movingId = (movingId === it.id) ? null : it.id;
    render();
  }));
  const del = mkBtn("✕", "Удалить", async () => {
    setItems(cur, cur.items.filter(x => x.id !== it.id));
    await save(); render();
  });
  del.classList.add("del");
  row.appendChild(del);
  return row;
}

function mkMoveSel(it) {
  const sel = document.createElement("select");
  const opt = (v, t) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t; sel.appendChild(o);
  };
  opt("", "Куда переложить?");
  if (selId !== "inbox") opt("inbox", "📥 Входящие");
  for (const g of state.groups) {
    if (g.id !== selId) opt(g.id, "📁 " + g.name);
  }
  sel.onchange = async () => {
    if (!sel.value) return;
    const cur = currentList();
    const item = cur.ok ? cur.items.find(x => x.id === it.id) : null;
    if (!item) return;
    setItems(cur, cur.items.filter(x => x.id !== it.id));
    if (sel.value === "inbox") state.inbox.unshift(item);
    else {
      const g = state.groups.find(x => x.id === sel.value);
      if (g) g.items.unshift(item);
    }
    movingId = null;
    await save(); render();
  };
  return sel;
}

async function openItem(it, cur) {
  await browser.tabs.create({ url: it.url, active: true });
  if (state.settings.removeAfterOpen) {
    setItems(cur, cur.items.filter(x => x.id !== it.id));
    await save();
    render();
  }
}

async function openAllGroup(cur) {
  const ids = cur.items.map(x => x.id);
  for (let i = 0; i < ids.length; i++) {
    const item = cur.items.find(x => x.id === ids[i]);
    if (item) await browser.tabs.create({ url: item.url, active: i === 0 });
    await new Promise(r => setTimeout(r, 150));
  }
  if (state.settings.removeAfterOpen) {
    setItems(cur, cur.items.filter(x => !ids.includes(x.id)));
    await save();
  }
  render();
}

function renameGroupInput(g, nameEl) {
  const input = document.createElement("input");
  input.value = g.name;
  input.placeholder = g.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (v) { g.name = v; save(); }
    render();
  };
  input.onkeydown = e => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { done = true; render(); }
  };
  input.onblur = commit;
}

// ===== Обработчики =====
$("#addbtn").onclick = async () => {
  const box = $("#urlbox");
  const urls = extractUrls(box.value);
  if (!urls.length) {
    box.placeholder = "Не найдено ни одной ссылки :(";
    setTimeout(() => { box.placeholder = "Вставьте ссылки (можно пачкой)\nhttps://… или www.…"; }, 1500);
    return;
  }
  const target = $("#targetsel").value;
  const items = urls.map((u, i) => ({ id: uid() + i, url: u, title: shortHost(u), added: Date.now() }));
  if (target === "inbox") {
    state.inbox.unshift(...items);
  } else {
    const g = state.groups.find(x => x.id === target);
    if (g) g.items.unshift(...items);
    else state.inbox.unshift(...items);
  }
  box.value = "";
  await save(); render();
};

$("#newgroup").onclick = () => {
  const g = { id: uid(), name: "Новая группа " + (state.groups.length + 1), items: [] };
  state.groups.push(g);
  selId = g.id;
  save();
  requestAnimationFrame(() => {
    const nameEl = groupsEl.querySelector(".group.sel .name");
    if (nameEl) renameGroupInput(g, nameEl);
  });
};

$("#removeAfterOpen").onchange = e => {
  state.settings.removeAfterOpen = e.target.checked;
  save();
};

$("#exportbtn").onclick = () => {
  const cur = currentList();
  if (!cur.ok || !cur.items.length) { $("#counter").textContent = "Экспортировать нечего"; return; }
  const payload = {
    type: "links-hold-backup",
    group: cur.isInbox ? "Входящие" : cur.group.name,
    items: cur.items
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "links-hold-" + (cur.isInbox ? "inbox" : cur.group.name.replace(/[\\/:*?"<>|]/g, "").trim()) + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
};

$("#importfile").onchange = async e => {
  const file = e.target.files ? e.target.files[0] : null;
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if ((data.type === "links-hold-backup" || Array.isArray(data.items)) && data.items && data.items.length) {
      const items = data.items.filter(i => i && i.url).map(i => ({
        id: uid(), url: i.url, title: i.title || shortHost(i.url), added: i.added || Date.now()
      }));
      const name = data.group || file.name.replace(/\.json$/i, "");
      let g = state.groups.find(x => x.name === name);
      if (!g) {
        g = { id: uid(), name: name, items: [] };
        state.groups.push(g);
      }
      g.items.unshift(...items);
      selId = g.id;
      await save(); render();
    } else {
      $("#counter").textContent = "Файл не похож на бэкап Отложенки";
    }
  } catch {
    $("#counter").textContent = "Не удалось прочитать файл";
  }
  e.target.value = "";
};

load();
