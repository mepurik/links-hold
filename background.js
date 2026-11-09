// ===== Отложенка: фон (контекстное меню + badge) =====

const GRP_PREFIX = "grp-";

async function getGroups() {
  const data = await browser.storage.local.get("groups");
  return Array.isArray(data.groups) ? data.groups : [];
}

async function rebuildMenus() {
  await browser.contextMenus.removeAll();
  const groups = await getGroups();

  browser.contextMenus.create({
    id: "add-link",
    title: "Отложить ссылку в копилку",
    contexts: ["link"]
  });
  browser.contextMenus.create({
    id: "add-page",
    title: "Отложить эту страницу в копилку",
    contexts: ["page"]
  });

  if (groups.length) {
    browser.contextMenus.create({
      id: "add-grp",
      title: "Отложить в группу…",
      contexts: ["link", "page"]
    });
    for (const g of groups) {
      browser.contextMenus.create({
        id: GRP_PREFIX + g.id,
        parentId: "add-grp",
        title: g.name,
        contexts: ["link", "page"]
      });
    }
  }
}

function shortHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 48);
  }
}

async function saveItem(details, opts) {
  let url, title;
  if (opts.type === "link" && details.linkUrl) {
    url = details.linkUrl;
    title = (details.linkText || shortHost(url)).trim().slice(0, 120) || shortHost(url);
  } else {
    url = details.pageUrl || (opts.tab ? opts.tab.url : "");
    title = opts.tab ? opts.tab.title : "";
    if (!title) title = shortHost(url);
  }

  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    url,
    title,
    added: Date.now()
  };

  const data = await browser.storage.local.get(["inbox", "groups"]);
  let groups = Array.isArray(data.groups) ? data.groups : [];

  if (opts.groupId) {
    const g = groups.find(g => g.id === opts.groupId);
    if (g) g.items.unshift(item);
  } else {
    let inbox = Array.isArray(data.inbox) ? data.inbox : [];
    inbox.unshift(item);
    await browser.storage.local.set({ inbox });
    // inbox сохранён, groups преобразуем при записи ниже
  }

  if (!opts.groupId) {
    // уже записали inbox выше; обновим groups только если надо
  } else {
    await browser.storage.local.set({ groups });
  }

  const where = opts.groupId
    ? "группу «" + (groups.find(g => g.id === opts.groupId)?.name || "") + "»"
    : "входящие";
  browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-96.png"),
    title: "Отложенка",
    message: "«" + item.title + "» → " + where
  });
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = String(info.menuItemId);
  if (id === "add-link") {
    await saveItem(info, { type: "link", tab });
  } else if (id === "add-page") {
    await saveItem(info, { type: "page", tab });
  } else if (id.startsWith(GRP_PREFIX)) {
    await saveItem(info, { type: info.linkUrl ? "link" : "page", tab, groupId: id.slice(GRP_PREFIX.length) });
  }
});

// ===== Badge =====
async function updateBadge() {
  const data = await browser.storage.local.get(["inbox", "groups"]);
  const inbox = Array.isArray(data.inbox) ? data.inbox : [];
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const n = inbox.length + groups.reduce((s, g) => s + (g.items?.length || 0), 0);
  await browser.browserAction.setBadgeText({ text: n ? String(n) : "" });
  await browser.browserAction.setBadgeBackgroundColor({ color: "#f5a623" });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.groups) rebuildMenus();
  updateBadge();
});

rebuildMenus();
updateBadge();
