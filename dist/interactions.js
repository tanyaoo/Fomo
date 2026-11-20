(() => {
  // src/note-relations.js
  function relationGroups(links = {}) {
    const unique = (rows) => [...new Map((rows || []).map((row) => [row.id, row])).values()];
    const visible = (rows) => unique(rows).filter((note) => note && !note.deleted);
    const annotations = visible(links.annotations), annotationIds = new Set(annotations.map((note) => note.id));
    const outgoing = visible(links.outgoing), incoming = visible(links.incoming).filter((note) => !annotationIds.has(note.id));
    return { annotations, outgoing, incoming, count: annotations.length + outgoing.length + incoming.length };
  }

  // src/display-preferences.js
  function applyDisplayPreferences(value) {
    const p = window.MemoCore.displayPreferences(value), body = document.body;
    const fonts = { default: "var(--fl-font-memo)", system: '-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif', serif: '"Songti SC","SimSun",serif' };
    const windows = /Windows/i.test(navigator.userAgent);
    body.style.setProperty("--memo-font-family", fonts[p.font]);
    body.dataset.displayFont = p.font;
    body.classList.toggle("system-font-sidebar", p.font === "system");
    body.classList.toggle("system-font-win", p.font === "system" && windows);
    body.style.setProperty("--memo-font-size", p.fontSize + "px");
    body.style.setProperty("--memo-tag-font-size", ({ 13: 11, 14: 12, 15: 13, 16: 14, 20: 16, 24: 18, 28: 20, 32: 22 }[p.fontSize] || p.fontSize - 2) + "px");
    body.style.setProperty("--memo-line-height", String(p.font === "default" && p.lineHeight === 1.8 ? 1.62 : p.lineHeight));
    const listPad = { 13: 20, 14: 22, 15: 24, 16: 26, 20: 32, 24: 36, 28: 40, 32: 44 };
    body.style.setProperty("--memo-ul-padding-left", (listPad[p.fontSize] || 22) + "px");
    body.classList.toggle("heatmap-hidden", !p.showHeatmap);
    body.classList.toggle("note-sources-visible", p.showSources);
    document.querySelectorAll("[data-structured-editor]").forEach((node) => node.memoEditor?.setSpellcheck?.(p.spellcheck));
    document.querySelectorAll(".ProseMirror").forEach((node) => node.setAttribute("spellcheck", String(p.spellcheck)));
  }
  function sourceLabel(m) {
    return { direct: "\u76F4\u63A5\u8BB0\u5F55", annotation: "\u5F15\u7528", reflection: "\u8054\u60F3", import: "\u5BFC\u5165" }[window.MemoCore.sourceOf(m)];
  }
  function referenceGroup(root, label, fold) {
    if (!fold) return root;
    const group = document.createElement("details");
    group.className = "reference-fold";
    const summary = document.createElement("summary");
    summary.textContent = label;
    const content = document.createElement("div");
    content.className = "reference-fold-content";
    group.append(summary, content);
    root.append(group);
    return content;
  }

  // src/feedback.js
  function createFeedback(root) {
    let timer = null, current = null;
    const stop = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (current?.deadline) {
        current.remaining = Math.max(0, current.deadline - Date.now());
        current.deadline = 0;
      }
    };
    const hide = () => {
      stop();
      if (root.contains(document.activeElement)) document.activeElement.blur();
      root.hidden = true;
      current = null;
    };
    const schedule = () => {
      stop();
      if (!current || current.running || root.matches(":hover") || root.contains(document.activeElement)) return;
      current.deadline = Date.now() + current.remaining;
      timer = setTimeout(hide, current.remaining);
    };
    const hostObserver = new MutationObserver(() => {
      const host = root.parentElement;
      if (host?.tagName === "DIALOG" && !host.open) {
        hostObserver.disconnect();
        document.body.append(root);
        schedule();
      }
    });
    function show(message, undo, options2 = {}) {
      stop();
      const keepFocus = root.querySelector("#undoAction") === document.activeElement, retained = !undo && current?.action && !current.action.used ? current.action : null, action = undo ? { run: undo, label: options2.actionLabel || "\u64A4\u9500", used: false } : retained;
      const host = document.querySelector("dialog[open]:not(#lightbox)") || document.body;
      hostObserver.disconnect();
      if (root.parentElement !== host) host.append(root);
      if (host.tagName === "DIALOG") hostObserver.observe(host, { attributes: true, attributeFilter: ["open"] });
      const item = { action, error: !!options2.error, remaining: action ? 12e3 : options2.error ? 1e4 : 4e3, deadline: 0, running: false };
      current = item;
      root.replaceChildren();
      root.dataset.kind = item.error ? "error" : "success";
      root.setAttribute("aria-live", item.error ? "assertive" : "polite");
      root.setAttribute("aria-atomic", "true");
      const text = document.createElement("span");
      text.className = "toast-message";
      text.textContent = message;
      root.append(text);
      if (action) {
        const button = document.createElement("button");
        button.id = "undoAction";
        button.textContent = retained ? "\u64A4\u9500\u4E0A\u6B21\u64CD\u4F5C" : action.label;
        button.onclick = async () => {
          if (action.used || item.running) return;
          action.used = true;
          item.running = true;
          stop();
          button.disabled = true;
          button.textContent = "\u6B63\u5728\u64A4\u9500\u2026";
          try {
            const result = await action.run();
            if (result === false || current !== item && current?.error) {
              action.used = false;
              show(current !== item && current?.error ? root.querySelector(".toast-message").textContent : "\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u91CD\u8BD5", action.run, { error: true, actionLabel: "\u91CD\u8BD5\u64A4\u9500" });
            } else if (current === item) show("\u64CD\u4F5C\u5DF2\u64A4\u9500");
          } catch (error) {
            action.used = false;
            show("\u64A4\u9500\u5931\u8D25\uFF1A" + error.message, action.run, { error: true, actionLabel: "\u91CD\u8BD5\u64A4\u9500" });
          }
        };
        root.append(button);
      }
      const close = document.createElement("button");
      close.id = "dismissToast";
      close.type = "button";
      close.setAttribute("aria-label", "\u5173\u95ED\u63D0\u793A");
      close.innerHTML = '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 4 8 8m0-8-8 8"/></svg>';
      close.onclick = hide;
      root.append(close);
      root.hidden = false;
      if (retained && keepFocus) root.querySelector("#undoAction").focus({ preventScroll: true });
      schedule();
    }
    root.addEventListener("pointerenter", stop);
    root.addEventListener("pointerleave", schedule);
    root.addEventListener("focusin", stop);
    root.addEventListener("focusout", () => queueMicrotask(schedule));
    return { show, hide };
  }

  // src/share-basic-layouts.js
  var localDay = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` : "";
  };
  function applyBasicShareLayout(root, m, template, settings, api, escape2, icon2) {
    if (!["plain", "letter", "ink", "excerpt"].includes(template.id)) return;
    const state = api.state(), memos = state.memos.filter((note) => !note.deleted), days = MemoCore.usedDayCount(state);
    const stat = memos.length + " MEMOS \xB7 " + days + " DAYS", created = new Date(m.created), year = created.getFullYear(), month = String(created.getMonth() + 1).padStart(2, "0"), day = String(created.getDate()).padStart(2, "0");
    const date = year + "/" + month + "/" + day, profile = escape2(api.state().profile || "\u6211\u7684\u7B14\u8BB0");
    let header = root.querySelector(".share-card-header");
    if (!header) {
      header = document.createElement("header");
      header.className = "share-card-header";
      root.prepend(header);
    }
    const footer = root.querySelector(".share-card-footer");
    if (template.id === "plain" || template.id === "ink") {
      header.innerHTML = '<span class="share-basic-time">' + date + "</span>";
      footer.innerHTML = '<div class="share-basic-info">' + (settings.brand ? '<b class="share-basic-brand">Fomo</b>' : "") + (settings.personal ? '<div class="share-basic-author">' + profile + '</div><div class="share-basic-stat">' + stat + "</div>" : "") + "</div>";
      if (settings.personal) {
        const heatmap = document.createElement("div");
        heatmap.className = "share-mini-heatmap";
        heatmap.setAttribute("aria-hidden", "true");
        const counts = /* @__PURE__ */ new Map();
        for (const memo of memos) {
          const key = localDay(memo.created);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        const latest = Math.max(created.getTime(), ...memos.map((note) => new Date(note.created).getTime()).filter(Number.isFinite));
        for (let index = 0; index < 49; index++) {
          const date2 = new Date(latest);
          date2.setDate(date2.getDate() - 48 + index);
          const count = counts.get(localDay(date2)) || 0, cell = document.createElement("span");
          cell.style.backgroundColor = count > 3 ? "#459d78" : count > 1 ? "#70bd9b" : count ? "#aad9c5" : template.id === "ink" ? "#333b37" : "#e6eeea";
          heatmap.append(cell);
        }
        footer.append(heatmap);
      }
      if (!settings.brand && !settings.personal) footer.replaceChildren();
    }
    if (template.id === "letter") {
      header.innerHTML = (settings.brand ? '<b class="share-letter-brand">Fomo</b>' : "<span></span>") + "<span>" + date + "</span>";
      footer.innerHTML = settings.personal ? '<span class="share-stat-line"></span><span class="share-basic-stat">' + stat + '</span><span class="share-stat-line"></span>' : "";
    }
    if (template.id === "excerpt") {
      const chapter = [...memos].sort((a, b) => new Date(a.created) - new Date(b.created)).findIndex((note) => note.id === m.id) + 1;
      header.innerHTML = '<span class="share-excerpt-quote">' + icon2("quote") + "</span>" + (settings.personal ? "<b>Chapter. " + chapter + "</b>" : "<span></span>") + '<span class="share-excerpt-quote share-excerpt-quote-end">' + icon2("quote") + "</span>";
      footer.innerHTML = (settings.brand ? '<b class="share-excerpt-brand">Fomo</b>' : "") + (settings.personal ? '<div class="share-basic-author">' + profile + "</div>" : "") + '<div class="share-excerpt-date">' + year + "." + month + "." + day + "</div>";
    }
  }

  // src/share-decoration.js
  function drawPaper(context, width, height, layout) {
    if (layout === "light") {
      const wash = context.createLinearGradient(0, 0, width * 0.7, Math.min(height, 640));
      wash.addColorStop(0, "#f4ebec");
      wash.addColorStop(0.48, "#f4f1ee");
      wash.addColorStop(1, "#eaf2f3");
      context.fillStyle = wash;
      context.fillRect(0, 0, width, height);
    }
    if (!["memo", "journal", "excerpt"].includes(layout)) return;
    let seed = 2147;
    const random = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < width * height / 5; i++) {
      context.fillStyle = random() > 0.5 ? "rgba(94,77,43,.035)" : "rgba(255,255,255,.3)";
      context.fillRect(random() * width, random() * height, random() * 0.8 + 0.2, 0.5);
    }
  }
  function drawBorder(context, rect, origin, side, style) {
    const size = parseFloat(style["border" + side + "Width"]), kind = style["border" + side + "Style"];
    if (!size || kind === "none" || kind === "hidden") return;
    const x = rect.left - origin.left, y = rect.top - origin.top, w = rect.width, h = rect.height;
    const horizontal = side === "Top" || side === "Bottom", edge = side === "Bottom" ? y + h - size : side === "Right" ? x + w - size : horizontal ? y : x;
    const stripe = (offset, thickness) => {
      context.fillStyle = style["border" + side + "Color"];
      if (horizontal) context.fillRect(x, edge + offset, w, thickness);
      else context.fillRect(edge + offset, y, thickness, h);
    };
    if (kind === "double" && size >= 3) {
      stripe(0, size / 3);
      stripe(size * 2 / 3, size / 3);
      return;
    }
    if (kind === "dashed" || kind === "dotted") {
      context.save();
      context.strokeStyle = style["border" + side + "Color"];
      context.lineWidth = size;
      context.setLineDash(kind === "dotted" ? [size, size * 2] : [size * 4, size * 3]);
      context.beginPath();
      if (horizontal) {
        context.moveTo(x, edge + size / 2);
        context.lineTo(x + w, edge + size / 2);
      } else {
        context.moveTo(edge + size / 2, y);
        context.lineTo(edge + size / 2, y + h);
      }
      context.stroke();
      context.restore();
      return;
    }
    stripe(0, size);
  }
  function drawFlower(context, rect, origin) {
    const x = rect.left - origin.left + rect.width / 2, y = rect.top - origin.top + 18;
    context.save();
    context.strokeStyle = "#46534a";
    context.lineWidth = 1.3;
    context.beginPath();
    context.moveTo(x, y + 9);
    context.lineTo(x, y + 28);
    context.stroke();
    context.fillStyle = "#60b38e";
    for (let n = 0; n < 6; n++) {
      const angle = n * Math.PI / 3;
      context.beginPath();
      context.arc(x + Math.cos(angle) * 7, y + Math.sin(angle) * 7, 5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.fillStyle = "#fff8df";
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }
  function drawTicket(context, rect, origin) {
    context.save();
    context.fillStyle = "#555";
    let x = rect.left - origin.left;
    const end = x + rect.width, y = rect.top - origin.top;
    for (let n = 0; x < end; n++) {
      const width = [1, 1, 2, 1, 3, 1, 2, 2, 1, 1, 3][n % 11];
      context.fillRect(x, y, Math.min(width, end - x), rect.height);
      x += width + (n % 3 === 0 ? 2 : 1);
    }
    context.restore();
  }
  function cutTicketEdges(context, width, height) {
    context.save();
    context.globalCompositeOperation = "destination-out";
    for (let x = 10; x < width; x += 23) {
      for (const y of [0, height]) {
        context.beginPath();
        context.arc(x, y, 6, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }

  // src/share-image.js
  var templates = [
    { id: "daily", name: "\u65E5\u7B7E", paper: "#ecd896", ink: "#b1731c", accent: "#b1731c", layout: "daily" },
    { id: "ticket", name: "\u7968\u6839", paper: "#f2f2f2", ink: "#2e2e2e", accent: "#777777", layout: "ticket" },
    { id: "journal", name: "\u624B\u672D", paper: "#f8f7f0", ink: "#323232", accent: "#73734b", layout: "journal" },
    { id: "memo", name: "\u5907\u5FD8", paper: "#faf8f1", ink: "#585854", accent: "#d7b739", layout: "memo" },
    { id: "plain", name: "\u7D20\u767D", paper: "#ffffff", ink: "#454545", accent: "#5783f7", layout: "plain" },
    { id: "letter", name: "\u7A7A\u7B3A", paper: "#ffffff", ink: "#454545", accent: "#5783f7", layout: "letter" },
    { id: "ink", name: "\u58A8\u8272", paper: "#202020", ink: "#d9d9d9", accent: "#2b88d8", layout: "ink" },
    { id: "excerpt", name: "\u65AD\u7AE0", paper: "#f5f2ed", ink: "#141817", accent: "#141817", layout: "excerpt" },
    { id: "bloom", name: "\u751F\u82B1", paper: "#d5f0e4", ink: "#454545", accent: "#5783f7", layout: "bloom" },
    { id: "gold", name: "\u9ED1\u91D1", paper: "#202020", ink: "#e4ddb3", accent: "#e4ddb3", layout: "gold" },
    { id: "old", name: "\u65E7\u9875", paper: "#fffcf7", ink: "#563a17", accent: "#ad9e88", layout: "old" },
    { id: "light", name: "\u6D6E\u5149", paper: "#f2efef", ink: "#323232", accent: "#999999", layout: "light" }
  ];
  var $ = (selector) => document.querySelector(selector);
  var escape = (value) => window.MemoMarkup.escape(String(value));
  var icon = (name) => window.memoIcons[name] || "";
  var defaults = { personal: true, brand: true, tags: true, fontSize: 16 };
  var storageKey = "writeboom-share-image-options";
  var dateParts = (value) => {
    const d = new Date(value);
    return { day: String(d.getDate()).padStart(2, "0"), month: String(d.getMonth() + 1).padStart(2, "0"), year: d.getFullYear() };
  };
  function options() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return { ...defaults, ...Object.fromEntries(["personal", "brand", "tags"].filter((k) => typeof saved[k] === "boolean").map((k) => [k, saved[k]])), fontSize: Number.isInteger(Number(saved.fontSize)) && Number(saved.fontSize) >= 14 && Number(saved.fontSize) <= 20 ? Number(saved.fontSize) : 16 };
    } catch {
      return { ...defaults };
    }
  }
  function imageReady(image) {
    return new Promise((resolve, reject) => {
      if (image.complete && image.naturalWidth) return resolve();
      const timeout = setTimeout(() => reject(Error("\u56FE\u7247\u8BFB\u53D6\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5")), 1e4);
      image.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timeout);
        reject(Error("\u7B14\u8BB0\u56FE\u7247\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u8BF7\u91CD\u8BD5"));
      };
    });
  }
  function fillRect(context, rect, origin, color, radius = 0) {
    if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") return;
    context.fillStyle = color;
    if (radius > 0) {
      context.beginPath();
      context.roundRect(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height, Math.min(radius, rect.width / 2, rect.height / 2));
      context.fill();
    } else context.fillRect(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height);
  }
  async function renderImage(m, api, template, settings, thumbnail = false) {
    const root = document.createElement("article");
    root.className = "share-document";
    root.dataset.layout = template.layout;
    root.style.cssText = `--share-paper:${template.paper};--share-ink:${template.ink};--share-accent:${template.accent};--share-font-size:${settings.fontSize}px`;
    const { day, month, year } = dateParts(m.created), brand = settings.brand ? '<span class="share-brand">' + icon("back") + "<b>Fomo</b></span>" : "<span></span>";
    const symbols = settings.brand ? '<span class="share-symbols">' + icon("hash") + icon("insight") + icon("sparkles") + "</span>" : "";
    root.innerHTML = `<header class="share-card-header">${brand}${symbols}</header><div class="share-card-date">${escape(day)} <small>/ ${escape(month)}<span>${escape(year)}</span></small></div><div class="share-quote">${icon("quote")}</div><div class="share-card-body">${api.rich(m)}</div><div class="share-card-images"></div><footer class="share-card-footer">${settings.personal ? '<div class="share-author">' + escape(api.state().profile || "\u6211\u7684\u7B14\u8BB0") + '</div><div class="share-date">' + year + "." + month + "." + day + " / " + api.state().memos.filter((n) => !n.deleted).length + " MEMOS</div>" : ""}${settings.brand ? '<div class="share-footer-brand">Fomo</div>' : ""}</footer>`;
    if (!settings.tags) {
      const tagParagraphs = /* @__PURE__ */ new Set();
      root.querySelectorAll(".tag-link").forEach((tag) => {
        const paragraph = tag.closest("p");
        if (paragraph) tagParagraphs.add(paragraph);
        tag.remove();
      });
      for (const paragraph of tagParagraphs) if (!paragraph.textContent.trim() && !paragraph.querySelector("img,audio,video,a,code")) paragraph.remove();
    }
    if (!settings.brand) root.querySelector(".share-card-header").remove();
    root.querySelectorAll("button,a").forEach((el) => {
      el.removeAttribute("tabindex");
      el.style.pointerEvents = "none";
    });
    for (const src of m.images || []) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = src;
      root.querySelector(".share-card-images").append(image);
    }
    if (["bloom", "gold", "old"].includes(template.layout)) {
      const footer = root.querySelector(".share-card-footer"), header = root.querySelector(".share-card-header");
      if (settings.personal && header) {
        const info = document.createElement("div");
        info.className = "share-heading-info";
        info.textContent = api.state().profile || "\u6211\u7684\u7B14\u8BB0";
        header.prepend(info);
      }
      if (header) {
        header.querySelector(".share-symbols")?.remove();
        const date = document.createElement("span");
        date.className = "share-heading-date";
        date.textContent = year + "-" + month + "-" + day;
        header.append(date);
      }
      if (template.layout === "bloom") {
        const ornament = document.createElement("span");
        ornament.className = "share-flower";
        ornament.setAttribute("aria-hidden", "true");
        root.append(ornament);
      }
    }
    if (template.layout === "light") root.querySelector(".share-card-date").innerHTML = "<span>" + day + "</span><small>" + year + "." + month + "</small>";
    if (template.layout === "gold" && root.querySelector(".share-card-header")) root.querySelector(".share-card-header").prepend(root.querySelector(".share-quote"));
    if (["daily", "ticket", "journal"].includes(template.layout)) {
      const header = root.querySelector(".share-card-header"), footer = root.querySelector(".share-card-footer"), date = root.querySelector(".share-card-date");
      const memos = api.state().memos.filter((note) => !note.deleted), count = memos.length, profile = escape(api.state().profile || "\u6211\u7684\u7B14\u8BB0");
      if (template.layout === "daily") {
        if (header) header.remove();
        if (settings.personal) {
          const bar = document.createElement("div");
          bar.className = "share-daily-user";
          bar.innerHTML = "<span>" + profile + "</span><span>" + count + " MEMOS</span>";
          root.prepend(bar);
        }
        date.innerHTML = "<span>" + day + "</span><small>" + month + "\u6708 \xB7 " + ["\u661F\u671F\u65E5", "\u661F\u671F\u4E00", "\u661F\u671F\u4E8C", "\u661F\u671F\u4E09", "\u661F\u671F\u56DB", "\u661F\u671F\u4E94", "\u661F\u671F\u516D"][new Date(m.created).getDay()] + "</small><small>" + year + "</small>";
        footer.innerHTML = settings.brand ? "<span>Fomo</span><span>\u8BB0\u5F55\u60F3\u6CD5</span>" : "";
      }
      if (template.layout === "ticket") {
        if (header) {
          header.innerHTML = "<span>\xB7</span><b>Fomo</b><span>\xB7</span>";
        }
        footer.innerHTML = (settings.personal ? '<div class="share-ticket-row"><span>\u8BB0\u5F55\u8005</span><b>' + profile + '</b></div><div class="share-ticket-row"><span>\u8BB0\u5F55\u65E5\u671F</span><b>' + year + "." + month + "." + day + '</b></div><div class="share-ticket-row"><span>\u7D2F\u8BA1\u7B14\u8BB0</span><b>' + count + "</b></div>" : "") + '<div class="share-ticket-code" aria-hidden="true"></div>';
      }
      if (template.layout === "journal") {
        if (header) header.remove();
        const chapter = [...memos].sort((a, b) => new Date(a.created) - new Date(b.created)).findIndex((note) => note.id === m.id) + 1;
        date.innerHTML = "<span>" + month + " / " + day + "</span><small>Captured in Words</small>" + (settings.personal ? "<small>Chapter." + chapter + "</small>" : "");
        footer.innerHTML = settings.personal ? '<span class="share-journal-line"></span><span>Written by ' + profile + '</span><span class="share-journal-line"></span>' : "";
        if (settings.brand) {
          const brand2 = document.createElement("div");
          brand2.className = "share-journal-brand";
          brand2.textContent = "Fomo";
          footer.append(brand2);
        }
      }
    }
    applyBasicShareLayout(root, m, template, settings, api, escape, icon);
    const host = document.createElement("div");
    host.className = "share-render-host";
    host.setAttribute("aria-hidden", "true");
    host.inert = true;
    host.append(root);
    document.body.append(host);
    try {
      await document.fonts.ready;
      await Promise.all([...root.querySelectorAll("img")].map(imageReady));
      const origin = root.getBoundingClientRect(), scale = thumbnail ? 0.5 : 2, width = Math.ceil(origin.width), height = Math.ceil(origin.height);
      if (height > 14e3 || width * height * 4 > 24e6) throw Error("\u7B14\u8BB0\u8FC7\u957F\uFF0C\u65E0\u6CD5\u751F\u6210\u5B8C\u6574\u56FE\u7247\uFF0C\u8BF7\u5206\u6BB5\u5206\u4EAB");
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext("2d");
      if (!context) throw Error("\u5F53\u524D\u73AF\u5883\u65E0\u6CD5\u751F\u6210\u56FE\u7247");
      context.scale(scale, scale);
      context.fillStyle = template.paper;
      context.fillRect(0, 0, width, height);
      for (const element of [root, ...root.querySelectorAll("*")]) {
        const style = getComputedStyle(element);
        if (style.display === "none") continue;
        const rect = element.getBoundingClientRect();
        fillRect(context, rect, origin, style.backgroundColor, parseFloat(style.borderTopLeftRadius) || 0);
        if (element === root) drawPaper(context, width, height, template.layout);
        for (const side of ["Top", "Right", "Bottom", "Left"]) drawBorder(context, rect, origin, side, style);
        if (element.classList.contains("share-flower")) drawFlower(context, rect, origin);
        if (element.classList.contains("share-ticket-code")) drawTicket(context, rect, origin);
        if (element.tagName === "IMG" && element.complete && element.naturalWidth) {
          context.save();
          const radius = parseFloat(style.borderTopLeftRadius) || 0;
          if (radius) {
            context.beginPath();
            context.roundRect(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height, radius);
            context.clip();
          }
          context.drawImage(element, rect.left - origin.left, rect.top - origin.top, rect.width, rect.height);
          context.restore();
        }
        if (element.tagName === "svg" || element instanceof SVGElement) continue;
        if (element.tagName === "LI") {
          const list = element.parentElement, items = [...list.children].filter((item) => item.tagName === "LI"), position = items.indexOf(element), reversed = list.hasAttribute("reversed");
          let index = Number(list.getAttribute("start") ?? (reversed ? items.length : 1));
          for (let i = 0; i <= position; i++) {
            if (items[i].hasAttribute("value")) index = Number(items[i].getAttribute("value"));
            if (i < position) index += reversed ? -1 : 1;
          }
          const type = getComputedStyle(list).listStyleType, marker = list.tagName === "OL" ? index + "." : type === "circle" ? "\u25E6" : type === "square" ? "\u25AA" : type === "none" ? "" : "\u2022";
          const first = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
          let line = rect;
          if (first?.textContent) {
            const range = document.createRange();
            range.setStart(first, 0);
            range.setEnd(first, Math.min(1, first.length));
            const measured = range.getBoundingClientRect();
            if (measured.height) line = measured;
          }
          context.save();
          context.font = style.font;
          context.fillStyle = style.color;
          context.textBaseline = "middle";
          context.textAlign = "right";
          context.fillText(marker, rect.left - origin.left - 6, line.top - origin.top + line.height / 2 + parseFloat(style.fontSize) * 0.04);
          context.restore();
        }
      }
      for (const svg of root.querySelectorAll("svg")) {
        if (!svg.getClientRects().length) continue;
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const clone = svg.cloneNode(true);
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", String(rect.width));
        clone.setAttribute("height", String(rect.height));
        const markup = new XMLSerializer().serializeToString(clone).replaceAll("currentColor", getComputedStyle(svg).color);
        const image = new Image();
        image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
        await imageReady(image);
        if (svg.closest(".share-excerpt-quote-end")) {
          context.save();
          context.translate(rect.left - origin.left + rect.width / 2, rect.top - origin.top + rect.height / 2);
          context.rotate(Math.PI);
          context.drawImage(image, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
          context.restore();
        } else context.drawImage(image, rect.left - origin.left, rect.top - origin.top, rect.width, rect.height);
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
      let node;
      while (node = walker.nextNode()) {
        if (!node.textContent || node.parentElement.closest("svg")) continue;
        const style = getComputedStyle(node.parentElement);
        if (style.display === "none" || !node.parentElement.getClientRects().length) continue;
        const fontSize = parseFloat(style.fontSize);
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        context.fillStyle = style.color;
        context.textBaseline = "middle";
        for (const part of segmenter.segment(node.textContent)) {
          if (part.segment === "\n") continue;
          const range = document.createRange();
          range.setStart(node, part.index);
          range.setEnd(node, part.index + part.segment.length);
          const rect = range.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          context.fillText(part.segment, rect.left - origin.left, rect.top - origin.top + rect.height / 2 + fontSize * 0.04);
          if (style.textDecorationLine.includes("underline") || node.parentElement.closest("u")) context.fillRect(rect.left - origin.left, rect.bottom - origin.top - 1, rect.width, 1);
        }
      }
      if (template.layout === "ticket") cutTicketEdges(context, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw Error("\u56FE\u7247\u751F\u6210\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
      return { blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
    } finally {
      host.remove();
    }
  }
  function openShareImage(m, api, { onClose } = {}) {
    const settings = options();
    let selected = "memo", revision = 0, epoch = 0, current = null, closed = false, working = false, thumbTask = 0;
    const cache = /* @__PURE__ */ new Map(), thumbnailCache = /* @__PURE__ */ new Map(), urls = /* @__PURE__ */ new Set();
    api.modal("\u751F\u6210\u5206\u4EAB\u56FE\u7247", `<section class="share-sheet"><div class="share-hint"><span>\u8BF7\u53F3\u952E\u70B9\u51FB\u56FE\u7247\u4FDD\u5B58\u6216\u590D\u5236</span><div><button id="shareSave" type="button" disabled title="\u4FDD\u5B58\u56FE\u7247" aria-label="\u4FDD\u5B58\u56FE\u7247">${icon("download")}</button><button id="shareCopy" type="button" disabled title="\u590D\u5236\u56FE\u7247" aria-label="\u590D\u5236\u56FE\u7247">${icon("copy")}</button></div></div><div class="share-preview-stage" aria-busy="true"><p id="shareImageStatus" role="status">\u56FE\u7247\u751F\u6210\u4E2D\u2026</p><img id="sharePreview" alt="\u7B14\u8BB0\u5206\u4EAB\u56FE\u7247\u9884\u89C8" hidden></div><div class="share-template-strip" role="tablist" aria-label="\u5206\u4EAB\u56FE\u7247\u6A21\u677F">${templates.map((t) => `<button class="share-template" data-share-template="${t.id}" type="button" role="tab" aria-selected="${t.id === selected}" aria-label="${t.name}\u6A21\u677F" tabindex="${t.id === selected ? 0 : -1}"><span class="share-template-preview" aria-busy="true"><img alt="" hidden></span><span>${t.name}</span></button>`).join("")}</div><div id="shareSettingsPanel" class="share-settings-panel" hidden><label>\u663E\u793A\u4E2A\u4EBA\u76F8\u5173\u4FE1\u606F<input id="sharePersonal" type="checkbox" role="switch" ${settings.personal ? "checked" : ""}></label><label>\u663E\u793A Fomo \u6807\u5FD7<input id="shareBrand" type="checkbox" role="switch" ${settings.brand ? "checked" : ""}></label><label>\u663E\u793A\u7B14\u8BB0\u4E2D\u7684\u6807\u7B7E<input id="shareTags" type="checkbox" role="switch" ${settings.tags ? "checked" : ""}></label><label>\u6587\u5B57\u5927\u5C0F<select id="shareFont">${Array.from({ length: 7 }, (_, i) => 14 + i).map((size) => `<option value="${size}" ${size === settings.fontSize ? "selected" : ""}>${size}</option>`).join("")}</select></label></div><div id="shareContextMenu" class="share-context-menu" role="menu" hidden><button type="button" role="menuitem" id="shareContextSave">\u4FDD\u5B58\u56FE\u7247</button><button type="button" role="menuitem" id="shareContextCopy">\u590D\u5236\u56FE\u7247</button></div></section>`);
    const dialog = $("#dialog"), sheet = $(".share-sheet"), stage = $(".share-preview-stage"), preview = $("#sharePreview"), status = $("#shareImageStatus"), save = $("#shareSave"), copy = $("#shareCopy");
    const gear = document.createElement("button");
    gear.id = "shareSettings";
    gear.type = "button";
    gear.title = "\u5206\u4EAB\u56FE\u7247\u8BBE\u7F6E";
    gear.setAttribute("aria-label", "\u5206\u4EAB\u56FE\u7247\u8BBE\u7F6E");
    gear.setAttribute("aria-expanded", "false");
    gear.setAttribute("aria-controls", "shareSettingsPanel");
    gear.innerHTML = icon("settings");
    dialog.querySelector(".dialog-header").append(gear);
    function cleanup() {
      if (closed) return;
      closed = true;
      revision++;
      for (const url of urls) URL.revokeObjectURL(url);
      gear.remove();
      observer.disconnect();
      dialog.removeEventListener("close", cleanup);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escapeMenus, true);
      if (!dialog.open && onClose) requestAnimationFrame(() => {
        if (!dialog.open) onClose();
      });
    }
    const observer = new MutationObserver(() => {
      if (!sheet.isConnected) cleanup();
    });
    observer.observe($("#dialogBody"), { childList: true });
    dialog.addEventListener("close", cleanup);
    function outside(event) {
      if (!sheet.contains(event.target) && event.target !== gear && !gear.contains(event.target)) hideMenus();
      else if (!event.target.closest("#shareContextMenu,#sharePreview")) $("#shareContextMenu").hidden = true;
    }
    function hideMenus() {
      $("#shareSettingsPanel").hidden = true;
      gear.setAttribute("aria-expanded", "false");
      $("#shareContextMenu").hidden = true;
    }
    function escapeMenus(event) {
      if (event.key !== "Escape") return;
      if (!$("#shareSettingsPanel").hidden || !$("#shareContextMenu").hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        hideMenus();
        gear.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escapeMenus, true);
    gear.onclick = () => {
      const panel = $("#shareSettingsPanel");
      panel.hidden = !panel.hidden;
      gear.setAttribute("aria-expanded", String(!panel.hidden));
      $("#shareContextMenu").hidden = true;
    };
    function invalidate() {
      preview.hidden = true;
      epoch++;
      thumbTask++;
      cache.clear();
      thumbnailCache.clear();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
      for (const image of sheet.querySelectorAll(".share-template img")) {
        image.hidden = true;
        image.removeAttribute("src");
        image.parentElement.setAttribute("aria-busy", "true");
      }
    }
    async function imageFor(template, thumbnail = false) {
      const entries = thumbnail ? thumbnailCache : cache, key = template.id, generation = epoch;
      if (entries.has(key)) {
        const value = entries.get(key);
        entries.delete(key);
        entries.set(key, value);
        return value;
      }
      const source = thumbnail ? { ...m, content: [...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(m.content.slice(0, 1024))].slice(0, 180).map((part) => part.segment).join(""), html: "", images: [] } : m;
      const promise = renderImage(source, api, template, { ...settings }, thumbnail).then((result) => {
        if (closed || generation !== epoch) URL.revokeObjectURL(result.url);
        else urls.add(result.url);
        return result;
      });
      entries.set(key, promise);
      promise.catch(() => {
        if (entries.get(key) === promise) entries.delete(key);
      });
      if (!thumbnail && entries.size > 3) {
        const oldest = entries.keys().next().value, old = entries.get(oldest);
        entries.delete(oldest);
        old.then((result) => {
          if (result !== current) {
            URL.revokeObjectURL(result.url);
            urls.delete(result.url);
          }
        }).catch(() => {
        });
      }
      return promise;
    }
    const yieldToInput = () => new Promise((resolve) => setTimeout(resolve, 24));
    async function thumbnails() {
      const task = ++thumbTask, generation = epoch;
      for (const template of [templates.find((item) => item.id === selected), ...templates.filter((item) => item.id !== selected)]) {
        await yieldToInput();
        if (closed || task !== thumbTask || generation !== epoch) return;
        const thumb = sheet.querySelector('[data-share-template="' + template.id + '"] img');
        if (!thumb.hidden) continue;
        try {
          const result = await imageFor(template, true);
          if (closed || task !== thumbTask || generation !== epoch) return;
          thumb.src = result.url;
          thumb.hidden = false;
          thumb.parentElement.setAttribute("aria-busy", "false");
        } catch {
          if (closed || task !== thumbTask) return;
          thumb.parentElement.setAttribute("aria-busy", "false");
        }
      }
    }
    async function draw() {
      const token = ++revision;
      current = null;
      save.disabled = copy.disabled = true;
      preview.style.opacity = ".45";
      stage.setAttribute("aria-busy", "true");
      status.textContent = "\u56FE\u7247\u751F\u6210\u4E2D\u2026";
      try {
        const result = await imageFor(templates.find((t) => t.id === selected));
        if (closed || token !== revision) return;
        current = result;
        preview.src = result.url;
        preview.dataset.template = selected;
        preview.hidden = false;
        preview.style.opacity = "";
        stage.scrollTop = 0;
        status.textContent = "";
        save.disabled = copy.disabled = working;
        stage.setAttribute("aria-busy", "false");
        thumbnails();
      } catch (error) {
        if (!closed && token === revision) {
          preview.hidden = true;
          stage.setAttribute("aria-busy", "false");
          status.textContent = error.message;
          const retry = document.createElement("button");
          retry.id = "shareRetry";
          retry.textContent = "\u91CD\u65B0\u751F\u6210";
          retry.onclick = draw;
          status.append(retry);
        }
      }
    }
    const choose = (id) => {
      if (selected === id && current) return;
      selected = id;
      hideMenus();
      for (const button of sheet.querySelectorAll("[data-share-template]")) {
        const active = button.dataset.shareTemplate === id;
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      }
      sheet.querySelector(`[data-share-template="${id}"]`).scrollIntoView({ block: "nearest", inline: "nearest" });
      draw();
    };
    sheet.querySelectorAll("[data-share-template]").forEach((button) => button.onclick = () => choose(button.dataset.shareTemplate));
    $(".share-template-strip").onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = templates.findIndex((t) => t.id === selected), next = event.key === "Home" ? 0 : event.key === "End" ? templates.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + templates.length) % templates.length;
      choose(templates[next].id);
      sheet.querySelector(`[data-share-template="${selected}"]`).focus();
    };
    for (const [id, key] of [["sharePersonal", "personal"], ["shareBrand", "brand"], ["shareTags", "tags"], ["shareFont", "fontSize"]]) $("#" + id).onchange = (event) => {
      settings[key] = key === "fontSize" ? Number(event.target.value) : event.target.checked;
      invalidate();
      try {
        localStorage.setItem(storageKey, JSON.stringify(settings));
      } catch {
      }
      draw();
    };
    async function exportImage(kind) {
      if (!current || working) return;
      working = true;
      const image = current;
      save.disabled = copy.disabled = true;
      $("#shareContextMenu").hidden = true;
      try {
        if (window.memoDesktop?.shareImage) {
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(image.blob);
          });
          const result = await window.memoDesktop.shareImage({ kind, data });
          if (result) api.toast(kind === "copy" ? "\u5206\u4EAB\u56FE\u7247\u5DF2\u590D\u5236" : "\u5206\u4EAB\u56FE\u7247\u5DF2\u4FDD\u5B58");
        } else if (kind === "copy") {
          if (!navigator.clipboard?.write || !window.ClipboardItem) throw Error("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u590D\u5236\u56FE\u7247\uFF0C\u8BF7\u4FDD\u5B58\u56FE\u7247");
          await navigator.clipboard.write([new ClipboardItem({ "image/png": image.blob })]);
          api.toast("\u5206\u4EAB\u56FE\u7247\u5DF2\u590D\u5236");
        } else {
          const link = document.createElement("a");
          link.href = image.url;
          link.download = "fomo-share-" + m.created.slice(0, 10) + ".png";
          document.body.append(link);
          link.click();
          link.remove();
          api.toast("\u5DF2\u5F00\u59CB\u4E0B\u8F7D\u5206\u4EAB\u56FE\u7247");
        }
      } catch (error) {
        api.toast("\u64CD\u4F5C\u672A\u5B8C\u6210\uFF1A" + error.message);
      } finally {
        working = false;
        if (!closed) {
          save.disabled = copy.disabled = !current;
        }
      }
    }
    save.onclick = () => exportImage("save");
    copy.onclick = () => exportImage("copy");
    $("#shareContextSave").onclick = save.onclick;
    $("#shareContextCopy").onclick = copy.onclick;
    preview.oncontextmenu = (event) => {
      event.preventDefault();
      if (!current) return;
      hideMenus();
      const menu = $("#shareContextMenu");
      menu.hidden = false;
      const r = menu.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, event.clientX)) + "px";
      menu.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, event.clientY)) + "px";
      menu.querySelector("button").focus();
    };
    requestAnimationFrame(() => {
      sheet.querySelector("[aria-selected=true]").scrollIntoView({ block: "nearest", inline: "center" });
    });
    draw();
  }

  // src/note-metadata.js
  function menuEditedDate(value, now = /* @__PURE__ */ new Date()) {
    const time = Date.parse(value), stamp = new Date(now).getTime();
    if (!Number.isFinite(time) || !Number.isFinite(stamp)) return "";
    const d = new Date(time), current = new Date(stamp);
    const pad = (n) => String(n).padStart(2, "0");
    const days = Math.floor((stamp - time) / 864e5);
    const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (days === 0) return clock;
    if (days === 1) return `\u6628\u5929 ${clock}`;
    if (days > 1 && days < 7) return `${days}\u5929\u524D ${clock}`;
    if (d.getFullYear() === current.getFullYear()) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${clock}`;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // src/media-feedback.js
  function installMediaFeedback(root = document) {
    const states = /* @__PURE__ */ new WeakMap();
    let sequence = 0;
    const style = document.createElement("style");
    style.textContent = ".media-load-feedback{display:flex;align-items:center;gap:10px;margin:8px 0;color:var(--muted,#777);font-size:12px;line-height:1.6}.media-load-feedback button{flex:none;padding:3px 9px;border:1px solid var(--border,#ddd);border-radius:5px;background:transparent;color:inherit;font:inherit;cursor:pointer}.media-load-feedback button:focus-visible{outline:2px solid var(--tag,#5884ff);outline-offset:2px}.media-load-feedback button:disabled{cursor:default;opacity:.6}";
    document.head.append(style);
    const isMedia = (target) => target instanceof HTMLMediaElement;
    const clear = (media, restoreFocus = false) => {
      const state = states.get(media);
      if (!state) return;
      const focused = restoreFocus && state.row.contains(document.activeElement);
      clearTimeout(state.timer);
      state.row.remove();
      states.delete(media);
      const ids = (media.getAttribute("aria-describedby") || "").split(/\s+/).filter((id) => id && id !== state.row.id);
      if (ids.length) media.setAttribute("aria-describedby", ids.join(" "));
      else media.removeAttribute("aria-describedby");
      if (focused) media.focus({ preventScroll: true });
    };
    const show = (media) => {
      if (!media.isConnected) return;
      clear(media);
      const label = media.tagName === "AUDIO" ? "\u97F3\u9891" : "\u89C6\u9891", row = document.createElement("div"), text = document.createElement("span"), button = document.createElement("button");
      row.className = "media-load-feedback";
      row.id = "media-load-feedback-" + ++sequence;
      row.setAttribute("role", "status");
      text.textContent = label + "\u52A0\u8F7D\u5931\u8D25\uFF0C\u539F\u9644\u4EF6\u4ECD\u4FDD\u7559\u3002";
      button.type = "button";
      button.textContent = "\u91CD\u8BD5";
      button.setAttribute("aria-label", "\u91CD\u65B0\u52A0\u8F7D" + label);
      row.append(text, button);
      media.after(row);
      media.setAttribute("aria-describedby", [media.getAttribute("aria-describedby"), row.id].filter(Boolean).join(" "));
      const state = { row, timer: null, pending: false };
      states.set(media, state);
      button.onclick = () => {
        if (!media.hasAttribute("tabindex")) media.tabIndex = 0;
        media.focus({ preventScroll: true });
        state.pending = true;
        button.disabled = true;
        text.textContent = "\u6B63\u5728\u91CD\u65B0\u52A0\u8F7D" + label + "\u2026";
        state.timer = setTimeout(() => {
          if (states.get(media) !== state) return;
          if (!media.isConnected) {
            clear(media);
            return;
          }
          state.pending = false;
          button.disabled = false;
          text.textContent = label + "\u5C1A\u672A\u52A0\u8F7D\u5B8C\u6210\uFF0C\u8BF7\u91CD\u8BD5\u3002";
        }, 12e3);
        try {
          media.load();
        } catch {
          show(media);
        }
      };
    };
    root.addEventListener("error", (event) => {
      if (isMedia(event.target)) show(event.target);
    }, true);
    root.addEventListener("loadedmetadata", (event) => {
      if (isMedia(event.target)) clear(event.target, true);
    }, true);
    root.addEventListener("loadstart", (event) => {
      if (isMedia(event.target) && !states.get(event.target)?.pending) clear(event.target);
    }, true);
  }

  // src/workspace-ui.js
  installMediaFeedback();
  window.MemoFeedback = createFeedback(document.getElementById("toast"));
  window.MemoDisplay = { apply: applyDisplayPreferences };
  (() => {
    "use strict";
    const $2 = (selector) => document.querySelector(selector), esc = (value) => MemoMarkup.escape(value), icon2 = (name) => window.memoIcons[name] || window.memoIcons.notes;
    const menuGlyph = (name) => icon2(name === "delete" ? "trash" : name === "edit" ? "menuEdit" : name).replace('class="bi ', 'class="menu-svg bi ');
    let api, selecting = false, context = "", selected = /* @__PURE__ */ new Set(), relatedExpanded = /* @__PURE__ */ new Set(), lastReferenceCollapse = null, selectionAnchor = "";
    const date = (value) => new Date(value).toLocaleString("zh-CN");
    const cardDate = (value) => {
      const d = new Date(value), pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const note = (id) => MemoCore.resolveRef(api.state().memos, id);
    const title = (m) => m.content.trim().replace(/\s+/g, " ").slice(0, 140) || "\u56FE\u7247\u7B14\u8BB0";
    const selectedRows = () => api.filtered().filter((m) => selected.has(m.id));
    const memoCopyText = (m) => String(m.content || "").replace(/(?:fomo|writeboom|memo-flow):\/\/note\/([a-zA-Z0-9-]{1,100})/g, (_, id) => "fomo://note/" + id);
    const memoCopyHTML = (m) => {
      const holder = document.createElement("div");
      holder.innerHTML = MemoMarkup.clean(m.html || MemoMarkup.plainHTML(m.content || ""));
      holder.querySelectorAll("a[data-memo-id]").forEach((link) => link.replaceWith(document.createTextNode("fomo://note/" + link.dataset.memoId)));
      return holder.innerHTML;
    };
    async function copyValue(text, html) {
      try {
        if (html && navigator.clipboard.write && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]);
        else await navigator.clipboard.writeText(text);
        api.toast("\u5DF2\u590D\u5236");
      } catch {
        api.modal("\u590D\u5236\u5185\u5BB9", '<textarea id="noteCopyValue" readonly rows="8"></textarea><p>\u8BF7\u9009\u62E9\u6587\u5B57\u5E76\u590D\u5236\u3002</p>');
        $2("#noteCopyValue").value = text;
        $2("#noteCopyValue").select();
      }
    }
    function copyReference(m) {
      const id = esc(m.id), label = esc(window.MemoEditor.referenceLabel(m));
      return copyValue("fomo://note/" + m.id, `<a href="fomo://note/${id}" data-memo-id="${id}">\u2197 ${label}</a>`);
    }
    function toggleMore(menu, open, preferRight = false) {
      const sub = menu.querySelector(".memo-more-menu"), trigger = menu.querySelector("[data-action=more]");
      if (!sub) return;
      sub.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
      if (open) {
        const r = trigger.getBoundingClientRect(), s = sub.getBoundingClientRect();
        const anchor = preferRight ? menu.getBoundingClientRect() : r, right = anchor.right + 1, left = anchor.left - s.width - 1, preferred = preferRight ? right + s.width <= innerWidth - 8 ? right : left : left >= 8 ? left : right;
        sub.style.left = Math.max(8, Math.min(innerWidth - s.width - 8, preferred)) + "px";
        sub.style.top = Math.max(8, Math.min(innerHeight - s.height - 8, r.top)) + "px";
      }
    }
    const FLOAT_KEY = "writeboom-float-notes", FLOAT_POS_KEY = "writeboom-float-dock-y";
    let floatIds = [];
    try {
      const value = JSON.parse(localStorage.getItem(FLOAT_KEY) || "[]");
      if (Array.isArray(value)) floatIds = [...new Set(value.filter((id) => typeof id === "string"))];
    } catch {
    }
    let floatDockY = null;
    try {
      const value = Number(localStorage.getItem(FLOAT_POS_KEY));
      if (Number.isFinite(value)) floatDockY = value;
    } catch {
    }
    let floatDock = null, floatOverlay = null, floatCards = null, floatCount = null, floatStatus = null, floatOpen = false, floatUndo = [], floatUndoTimer = 0;
    function saveFloat() {
      try {
        localStorage.setItem(FLOAT_KEY, JSON.stringify(floatIds));
      } catch {
      }
    }
    function dockY(value) {
      return Math.max(8, Math.min(innerHeight - 64, value));
    }
    function positionFloatDock() {
      if (!floatDock) return;
      const y = dockY(floatDockY == null ? innerHeight / 2 - 26 : floatDockY);
      floatDock.style.top = y + "px";
    }
    function floatUndoButton() {
      return floatOverlay ? floatOverlay.querySelector("#floatUndo") : null;
    }
    function showFloatUndo() {
      const b = floatUndoButton();
      if (!b) return;
      b.hidden = false;
      clearTimeout(floatUndoTimer);
      floatUndoTimer = setTimeout(() => {
        b.hidden = true;
        if (!floatIds.length) closeFloat();
      }, 6e3);
    }
    function hideFloatUndo() {
      const b = floatUndoButton();
      if (b) b.hidden = true;
      clearTimeout(floatUndoTimer);
    }
    function ensureFloat() {
      if (floatDock) return;
      floatDock = document.createElement("div");
      floatDock.className = "float-dock";
      floatDock.innerHTML = '<button type="button" aria-label="\u5C55\u5F00\u6D6E\u7A97" title="\u5C55\u5F00\u6D6E\u7A97"><i></i><i></i><i></i></button>';
      floatOverlay = document.createElement("div");
      floatOverlay.className = "float-overlay";
      floatOverlay.innerHTML = '<section class="float-panel" role="dialog" aria-label="\u6D6E\u7A97\u7B14\u8BB0"><header class="float-head"><strong id="floatCount"></strong><nav><button type="button" id="floatUndo" hidden>\u64A4\u9500</button><button type="button" id="floatCopy">\u590D\u5236\u5168\u90E8</button><button type="button" id="floatClear">\u6E05\u7A7A</button></nav></header><div class="float-cards" id="floatCards"></div><p class="float-status" id="floatStatus" role="status"></p></section>';
      document.body.append(floatDock, floatOverlay);
      floatCards = floatOverlay.querySelector("#floatCards");
      floatCount = floatOverlay.querySelector("#floatCount");
      floatStatus = floatOverlay.querySelector("#floatStatus");
      const dockButton = floatDock.querySelector("button");
      let dockDrag = null, dockMoved = false;
      dockButton.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;
        dockDrag = { y: event.clientY, start: floatDock.getBoundingClientRect().top };
        dockMoved = false;
        event.preventDefault();
      });
      document.addEventListener("mousemove", (event) => {
        if (!dockDrag) return;
        const y = dockY(dockDrag.start + event.clientY - dockDrag.y);
        floatDockY = y;
        floatDock.style.top = y + "px";
        if (Math.abs(event.clientY - dockDrag.y) > 4) dockMoved = true;
      });
      document.addEventListener("mouseup", () => {
        if (!dockDrag) return;
        dockDrag = null;
        floatDockY = dockY(parseFloat(floatDock.style.top) || innerHeight / 2 - 26);
        try {
          localStorage.setItem(FLOAT_POS_KEY, String(floatDockY));
        } catch {
        }
        if (!dockMoved) {
          floatOpen = true;
          renderFloat();
        }
        dockMoved = false;
      });
      floatOverlay.addEventListener("wheel", (event) => {
        if (!floatOpen || !event.target.closest(".float-cards")) return;
        event.preventDefault();
        if (floatCards.scrollHeight > floatCards.clientHeight + 1) floatCards.scrollTop += event.deltaY;
      }, { passive: false });
      floatOverlay.addEventListener("mousedown", (event) => {
        if (event.target === floatOverlay) closeFloat();
      });
      floatOverlay.querySelector("#floatCopy").onclick = () => copyValue(floatIds.map((id) => note(id)?.content || "").filter(Boolean).join("\n\n---\n\n"));
      floatOverlay.querySelector("#floatUndo").onclick = () => {
        if (!floatUndo.length) return;
        floatIds = floatUndo.slice();
        floatUndo = [];
        hideFloatUndo();
        saveFloat();
        floatOpen = true;
        renderFloat();
        api.toast("\u64A4\u9500\u6210\u529F");
      };
      floatOverlay.querySelector("#floatClear").onclick = () => {
        const count = floatIds.length;
        if (!count) return;
        floatUndo = floatIds.slice();
        floatIds = [];
        saveFloat();
        floatOpen = true;
        renderFloat();
        showFloatUndo();
        api.toast("\u5DF2\u6E05\u7A7A\u6D6E\u7A97\u4E2D\u7684 " + count + " \u6761\u7B14\u8BB0");
      };
    }
    function closeFloat() {
      floatOpen = false;
      renderFloat();
    }
    function renderFloat() {
      ensureFloat();
      floatIds = floatIds.filter((id) => {
        const m = note(id);
        return m && !m.deleted;
      });
      saveFloat();
      const open = floatOpen && (floatIds.length > 0 || floatUndo.length > 0);
      floatDock.classList.toggle("show", !open && floatIds.length > 0);
      floatOverlay.classList.toggle("show", open);
      positionFloatDock();
      floatCount.textContent = floatIds.length + "\u6761\u7B14\u8BB0";
      floatCards.replaceChildren();
      for (const id of floatIds) {
        const m = note(id);
        if (!m) continue;
        const text = String(m.content || "").replace(/\s+/g, " ").trim() || "\u56FE\u7247\u7B14\u8BB0", preview = esc(text).replace(/(^|\s)(#[^\s#]+)/g, '$1<span class="tag">$2</span>');
        const card = document.createElement("article");
        card.className = "float-card";
        card.dataset.floatId = id;
        card.innerHTML = `<span class="text">${preview}</span><button type="button" class="remove" aria-label="\u79FB\u51FA\u6D6E\u7A97" title="\u79FB\u51FA\u6D6E\u7A97">\xD7</button>`;
        card.onclick = () => {
          closeFloat();
          openDetail(id);
        };
        card.querySelector(".remove").onclick = (e) => {
          e.stopPropagation();
          floatIds = floatIds.filter((x) => x !== id);
          saveFloat();
          renderFloat();
        };
        floatCards.append(card);
      }
      if (!floatIds.length) {
        const p = document.createElement("p");
        p.className = "float-empty";
        p.textContent = "\u6D6E\u7A97\u91CC\u8FD8\u6CA1\u6709\u7B14\u8BB0";
        floatCards.append(p);
      }
    }
    function addFloat(id) {
      if (!note(id)) return;
      api.closeMenu?.();
      floatUndo = [];
      hideFloatUndo();
      if (!floatIds.includes(id)) {
        if (floatIds.length >= 7) {
          api.toast("\u6D6E\u7A97\u5185\u7B14\u8BB0\u5DF2\u6EE1\uFF0C\u6700\u591A\u652F\u6301 7 \u6761\u7B14\u8BB0\uFF0C\u6574\u7406\u4E00\u4E0B\u518D\u6DFB\u52A0\u5427");
          return;
        }
        floatIds.push(id);
      }
      saveFloat();
      floatOpen = true;
      renderFloat();
    }
    window.addEventListener("resize", () => positionFloatDock());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && floatOpen) closeFloat();
    });
    function buildNoteMenu(menu, m) {
      menu.replaceChildren();
      menu.dataset.refined = "true";
      const add = (root, action, label, glyph) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.action = action;
        b.innerHTML = (glyph ? menuGlyph(glyph) : "") + `<span>${label}</span>`;
        root.append(b);
        return b;
      };
      if (!m.deleted) {
        add(menu, "share", "\u5206\u4EAB", "share");
        add(menu, "edit", "\u7F16\u8F91", "edit");
        add(menu, "copy", "\u590D\u5236", "copy");
        menu.append(document.createElement("hr"));
        if (window.memoDesktop) add(menu, "window", "\u65B0\u7A97\u53E3\u6253\u5F00");
        add(menu, "pin", m.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876");
        if (window.memoDesktop) add(menu, "float", "\u52A0\u5165\u6D6E\u7A97");
        add(menu, "insight", "AI \u6D1E\u5BDF");
        add(menu, "related", "\u76F8\u5173\u7B14\u8BB0");
        add(menu, "copy-link", "\u590D\u5236\u94FE\u63A5");
        add(menu, "annotate", "\u6279\u6CE8");
      } else add(menu, "restore", "\u6062\u590D\u7B14\u8BB0", "refresh");
      const more = add(menu, "more", "\u66F4\u591A");
      more.setAttribute("aria-haspopup", "menu");
      more.setAttribute("aria-expanded", "false");
      more.insertAdjacentHTML("beforeend", icon2("next").replace('class="bi ', 'class="more-chevron bi '));
      const sub = document.createElement("div");
      sub.className = "memo-more-menu";
      sub.setAttribute("role", "menu");
      sub.setAttribute("aria-label", "\u66F4\u591A\u7B14\u8BB0\u64CD\u4F5C");
      sub.hidden = true;
      add(sub, "history", "\u5386\u53F2\u7248\u672C");
      if (!m.deleted) add(sub, "change-date", "\u4FEE\u6539\u65E5\u671F");
      menu.append(sub);
      more.onpointerenter = () => toggleMore(menu, true);
      if (!m.deleted) add(menu, "delete", "\u5220\u9664").className = "danger";
      else add(menu, "purge", "\u6C38\u4E45\u5220\u9664").className = "danger";
      const meta = document.createElement("div");
      meta.className = "menu-meta";
      const count = document.createElement("span");
      count.textContent = `\u5B57\u6570\u7EDF\u8BA1: ${api.wordCount(m)}`;
      const edited = document.createElement("span"), stamp = m.updated || m.created;
      edited.textContent = `\u7F16\u8F91\u4E8E ${menuEditedDate(stamp)}`;
      edited.title = cardDate(stamp);
      meta.append(count, edited);
      menu.append(meta);
      for (const b of menu.querySelectorAll(":scope>button")) if (b !== more) b.onpointerenter = () => toggleMore(menu, false);
    }
    const shortDate = (value) => {
      const d = new Date(value), pad = (n) => String(n).padStart(2, "0");
      return `${d.getMonth() + 1}\u6708${d.getDate()}\u65E5 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const tokenText = (text) => String(text).replace(/(?:fomo|writeboom|memo-flow):\/\/note\/[a-zA-Z0-9-]+|https?:\/\/[^/\s]+\/mine\/\?[^\s<>]*memo_id=[a-zA-Z0-9_-]+/g, "\u5173\u8054\u7B14\u8BB0");
    function row(m, { label = "", open = openDetail } = {}) {
      const b = document.createElement("button");
      b.className = "related-choice";
      b.type = "button";
      const tags = MemoCore.tagsOf(m.content).slice(0, 3).map((tag) => "#" + tag).join(" "), meta = m.missing ? label || "\u5F15\u7528\u6682\u4E0D\u53EF\u7528" : [label || shortDate(m.created), tags, m.deleted ? "\u5728\u56DE\u6536\u7AD9\u4E2D" : ""].filter(Boolean).join(" \xB7 ");
      const small = document.createElement("small");
      small.textContent = meta || "";
      const text = document.createElement("span");
      text.textContent = tokenText(title(m));
      b.append(small, text);
      b.disabled = !!m.missing;
      b.onclick = () => open(m.id);
      return b;
    }
    function emptyNote(root, text) {
      const p = document.createElement("p");
      p.className = "detail-empty";
      p.textContent = text;
      root.append(p);
    }
    let detailEditSession = null;
    function startDetailEditing(m) {
      if (detailEditSession) {
        api.toast("\u8BF7\u5148\u4FDD\u5B58\u6216\u53D6\u6D88\u5F53\u524D\u7F16\u8F91");
        return false;
      }
      const section = $2("#dialog .note-detail"), card = section?.dataset.detailId === m.id ? section.querySelector(".detail-current-card") : section?.querySelector(`[data-relation-id="${CSS.escape(m.id)}"]`);
      if (!card) return false;
      const saved = captureDetail(), slot = document.createElement("div");
      slot.id = "detailEditSlot";
      slot.dataset.editSlot = m.id;
      card.append(slot);
      if (!api.edit(m)) {
        slot.remove();
        return false;
      }
      detailEditSession = saved;
      api.render();
      for (const child of card.children) if (child !== slot && !child.matches(".detail-card-head,.relation-card-head")) child.hidden = true;
      section.querySelectorAll("button").forEach((button) => {
        if (!button.closest("#composer")) button.disabled = true;
      });
      $2("#editor").focus({ preventScroll: true });
      return true;
    }
    function finishDetailEdit() {
      if (!detailEditSession) return;
      const saved = detailEditSession;
      detailEditSession = null;
      openDetail(saved.id, saved.tab, true, saved);
    }
    function shareFromDetail(m) {
      const saved = captureDetail();
      if (!saved) {
        openShareImage(m, api);
        return;
      }
      saved.returnContext = { origin: detailOrigin, trail: [...detailTrail] };
      detailOrigin = null;
      detailTrail.length = 0;
      openShareImage(m, api, { onClose: () => openDetail(saved.id, saved.tab, true, saved) });
    }
    function openDatePicker(m, anchor) {
      if (!m || m.deleted || api.busy()) return;
      document.getElementById("detailDatePicker")?.remove();
      const section = $2("#dialog[open] .note-detail"), detail = !!section && section.dataset.detailId === m.id;
      const pad = (n) => String(n).padStart(2, "0");
      const keyOf = (value) => {
        const d = new Date(value);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      };
      const initial = new Date(m.created), base = Number.isFinite(initial.getTime()) ? initial : /* @__PURE__ */ new Date();
      let selected2 = new Date(base.getFullYear(), base.getMonth(), base.getDate());
      let month = new Date(selected2.getFullYear(), selected2.getMonth(), 1);
      let timeValue = `${pad(base.getHours())}:${pad(base.getMinutes())}`;
      const picker = document.createElement("section");
      picker.id = "detailDatePicker";
      picker.className = "detail-date-picker";
      picker.setAttribute("popover", "auto");
      picker.setAttribute("role", "dialog");
      picker.setAttribute("aria-label", "\u4FEE\u6539\u7B14\u8BB0\u65E5\u671F");
      document.body.append(picker);
      const close = (focus = true) => {
        if (picker.matches(":popover-open")) picker.hidePopover();
        picker.remove();
        if (focus && anchor?.isConnected) anchor.focus({ preventScroll: true });
      };
      picker.addEventListener("toggle", () => {
        if (!picker.matches(":popover-open")) picker.remove();
      });
      picker.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      });
      const draw = () => {
        const year = month.getFullYear(), monthIndex = month.getMonth(), first = new Date(year, monthIndex, 1), offset = first.getDay(), days = new Date(year, monthIndex + 1, 0).getDate(), today = keyOf(/* @__PURE__ */ new Date()), selectedKey = keyOf(selected2);
        let cells = "";
        for (let i = 0; i < 42; i++) {
          const day = i - offset + 1, date2 = new Date(year, monthIndex, day), key = keyOf(date2), outside = date2.getMonth() !== monthIndex, isSelected = key === selectedKey, isToday = key === today;
          cells += `<button type="button" class="detail-date-day${outside ? " other" : ""}${isSelected ? " selected" : ""}${isToday ? " today" : ""}" data-detail-date="${key}" aria-label="${key}" aria-pressed="${isSelected}" ${outside ? 'tabindex="-1"' : ""}>${date2.getDate()}</button>`;
        }
        picker.innerHTML = `<header class="detail-date-head"><div><strong>\u4FEE\u6539\u65E5\u671F</strong><span>${year}\u5E74 ${monthIndex + 1}\u6708</span></div><div class="detail-date-nav"><button type="button" data-detail-date-nav="-1" aria-label="\u4E0A\u4E2A\u6708">\u2039</button><button type="button" data-detail-date-nav="1" aria-label="\u4E0B\u4E2A\u6708">\u203A</button></div></header><div class="detail-date-week">${["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"].map((day) => `<span>${day}</span>`).join("")}</div><div class="detail-date-grid" role="grid" aria-label="${year}\u5E74 ${monthIndex + 1}\u6708">${cells}</div><label class="detail-date-time"><span>\u65F6\u95F4</span><input id="detailDateTime" type="time" value="${timeValue}" step="60" aria-label="\u7B14\u8BB0\u65F6\u95F4"></label><p class="detail-date-status" id="detailDateStatus" role="status"></p><footer class="detail-date-actions"><button type="button" id="detailDateCancel">\u53D6\u6D88</button><button type="button" id="detailDateSave" class="primary-button">\u4FDD\u5B58</button></footer>`;
        picker.querySelectorAll("[data-detail-date-nav]").forEach((button) => button.onclick = () => {
          month.setMonth(month.getMonth() + Number(button.dataset.detailDateNav));
          draw();
        });
        picker.querySelectorAll("[data-detail-date]").forEach((button) => button.onclick = () => {
          const [y, mo, da] = button.dataset.detailDate.split("-").map(Number);
          selected2 = new Date(y, mo - 1, da);
          month = new Date(y, mo - 1, 1);
          draw();
          requestAnimationFrame(() => picker.querySelector(".detail-date-day.selected")?.focus({ preventScroll: true }));
        });
        $2("#detailDateTime").oninput = (event) => {
          timeValue = event.target.value;
        };
        $2("#detailDateCancel").onclick = () => close();
        $2("#detailDateSave").onclick = async () => {
          if (api.busy()) return;
          const status = $2("#detailDateStatus");
          if (!/^\d{2}:\d{2}$/.test(timeValue)) {
            status.textContent = "\u8BF7\u9009\u62E9\u6709\u6548\u65F6\u95F4";
            return;
          }
          const [hours, minutes] = timeValue.split(":").map(Number), created = new Date(selected2.getFullYear(), selected2.getMonth(), selected2.getDate(), hours, minutes, 0, 0);
          if (!Number.isFinite(created.getTime())) {
            status.textContent = "\u8BF7\u9009\u62E9\u6709\u6548\u65E5\u671F";
            return;
          }
          const desired = MemoCore.clone(api.state()), target = desired.memos.find((item) => item.id === m.id);
          if (!target || target.deleted) {
            status.textContent = "\u7B14\u8BB0\u5DF2\u79FB\u5165\u56DE\u6536\u7AD9\uFF0C\u8BF7\u5148\u6062\u590D";
            return;
          }
          const saved = captureDetail(), save = $2("#detailDateSave"), cancel = $2("#detailDateCancel");
          save.disabled = cancel.disabled = true;
          status.textContent = "\u6B63\u5728\u4FDD\u5B58\u2026";
          target.created = created.toISOString();
          target.updated = (/* @__PURE__ */ new Date()).toISOString();
          try {
            if (!await api.commit(desired)) {
              status.textContent = "\u672A\u4FDD\u5B58\uFF0C\u8BF7\u91CD\u8BD5";
              return;
            }
            close(false);
            if (detail) {
              if (saved) openDetail(saved.id, saved.tab, true, saved);
              else openDetail(m.id, $2("#detailTabContent")?.dataset.relationView || "auto");
            } else {
              api.render();
              const button = document.querySelector(`#memos [data-id="${CSS.escape(m.id)}"] .memo-menu-button`);
              button?.focus({ preventScroll: true });
            }
            api.toast("\u7B14\u8BB0\u65E5\u671F\u5DF2\u4FEE\u6539");
          } catch (error) {
            status.textContent = "\u4FDD\u5B58\u5931\u8D25\uFF1A" + error.message;
          } finally {
            if (picker.isConnected) {
              save.disabled = false;
              cancel.disabled = false;
            }
          }
        };
      };
      draw();
      picker.showPopover();
      const position = () => {
        const rect = anchor?.getBoundingClientRect(), width = picker.offsetWidth || 300, height = picker.offsetHeight || 360;
        const left = rect ? rect.left <= 12 ? 12 : Math.min(innerWidth - width - 8, rect.left) : Math.max(8, (innerWidth - width) / 2);
        let top = rect ? rect.bottom + 6 : 12;
        if (top + height > innerHeight - 8) top = Math.max(8, (rect?.top || innerHeight) - height - 6);
        picker.style.left = left + "px";
        picker.style.top = top + "px";
      };
      position();
      requestAnimationFrame(() => {
        position();
        picker.querySelector(".detail-date-day.selected")?.focus({ preventScroll: true });
      });
    }
    function openRelationMenu(trigger) {
      const m = note(trigger.dataset.relationMenu), section = trigger.closest(".note-detail");
      if (!m || !section) return;
      let menu = section.querySelector("#relationActions");
      if (!menu) {
        menu = document.createElement("div");
        menu.id = "relationActions";
        menu.className = "detail-actions-menu relation-actions-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", "\u5173\u8054\u7B14\u8BB0\u64CD\u4F5C");
        menu.setAttribute("popover", "auto");
        section.append(menu);
      }
      if (menu.matches(":popover-open") && menu.dataset.relationTarget === m.id) {
        menu.hidePopover();
        return;
      }
      section.querySelectorAll("[data-relation-menu][aria-expanded=true]").forEach((button) => button.setAttribute("aria-expanded", "false"));
      menu.dataset.relationTarget = m.id;
      menu.replaceChildren();
      const close = () => {
        if (menu.isConnected && menu.matches(":popover-open")) menu.hidePopover();
      };
      const add = (action, label, run) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.relationAction = action;
        b.setAttribute("role", "menuitem");
        b.textContent = label;
        b.onclick = async () => {
          if (api.busy()) return;
          close();
          try {
            await run();
          } catch (error) {
            api.toast(error.message);
          }
        };
        menu.append(b);
        return b;
      };
      const refresh = () => {
        const saved = captureDetail();
        if (saved) openDetail(saved.id, saved.tab, true, saved);
      };
      if (!m.deleted) {
        add("edit", "\u7F16\u8F91", () => startDetailEditing(m));
        add("pin", m.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876", async () => {
          const desired = MemoCore.clone(api.state()), target = desired.memos.find((item) => item.id === m.id);
          target.pinned = !target.pinned;
          if (await api.commit(desired)) refresh();
        });
        add("related", "\u76F8\u5173\u7B14\u8BB0", () => openDetail(m.id));
        menu.append(document.createElement("hr"));
        add("share", "\u751F\u6210\u5206\u4EAB\u56FE", () => shareFromDetail(m));
        add("copy-link", "\u590D\u5236\u94FE\u63A5", () => copyReference(m));
        add("annotate", "\u6279\u6CE8", () => api.annotate(m.id));
        add("delete", "\u5220\u9664", async () => {
          if (api.editingId() === m.id) {
            api.toast("\u8BF7\u5148\u4FDD\u5B58\u6216\u53D6\u6D88\u8FD9\u6761\u7B14\u8BB0\u7684\u7F16\u8F91");
            return;
          }
          const before = MemoCore.clone(api.state());
          if (await api.commit(MemoCore.batch(before, [m.id], "delete"))) {
            const after = MemoCore.clone(api.state());
            refresh();
            api.toast("\u5DF2\u79FB\u5165\u56DE\u6536\u7AD9", async () => {
              const result = await api.undo(before, after);
              if (result !== false) refresh();
              return result;
            });
          }
        }).className = "danger";
      } else add("detail", "\u67E5\u770B\u8BE6\u60C5", () => openDetail(m.id));
      const meta = document.createElement("div");
      meta.className = "menu-meta";
      meta.innerHTML = "<span>\u5B57\u6570\u7EDF\u8BA1: " + api.wordCount(m) + "</span><span>\u7F16\u8F91\u4E8E " + esc(menuEditedDate(m.updated || m.created)) + "</span>";
      menu.append(meta);
      trigger.setAttribute("aria-controls", menu.id);
      trigger.setAttribute("aria-expanded", "true");
      menu.ontoggle = () => {
        trigger.setAttribute("aria-expanded", String(menu.matches(":popover-open")));
      };
      menu.showPopover();
      const anchor = trigger.getBoundingClientRect(), rect = menu.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(innerWidth - rect.width - 8, anchor.right - rect.width)) + "px";
      menu.style.top = Math.max(8, Math.min(innerHeight - rect.height - 8, anchor.bottom + 4)) + "px";
      menu.querySelector("button")?.focus({ preventScroll: true });
      menu.onkeydown = (e) => {
        const buttons = [...menu.querySelectorAll("button")], index = buttons.indexOf(document.activeElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          buttons[e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          close();
          trigger.focus({ preventScroll: true });
        }
      };
    }
    function appendGroup(root, label, rows) {
      if (!rows.length) return;
      root = referenceGroup(root, label + " " + rows.length, label.includes("\u5F15\u7528") && api.state().display.collapseReferences);
      const heading = document.createElement("h3");
      heading.textContent = label + " " + rows.length;
      root.append(heading);
      for (const m of rows) root.append(row(m));
    }
    const detailTrail = [];
    let detailOrigin = null;
    const scrollSelectors = ["#dialogBody", ".detail-primary-scroll", "#detailTabContent"];
    const detailScroll = (el) => el?.closest("[hidden]") ? Number(el.dataset.savedScroll) || 0 : el?.scrollTop || 0;
    function captureDetail() {
      const section = $2("#dialog[open] .note-detail");
      if (!section) return null;
      section.saveTabPosition?.();
      const focus = document.activeElement;
      return {
        id: section.dataset.detailId,
        tab: section.dataset.relationView || "similar",
        hideSharedTags: section.dataset.hideSharedTags === "true",
        expandedRelations: [...section.expandedRelations || []],
        tabPositions: JSON.parse(JSON.stringify(section.tabPositions || {})),
        scroll: scrollSelectors.map((selector) => detailScroll($2(selector))),
        bodies: [...section.querySelectorAll(".relation-body")].map(detailScroll),
        folds: [...section.querySelectorAll(".reference-fold")].map((group) => group.open),
        focus: section.contains(focus) ? { panel: focus.closest("[role=region]")?.id, id: focus.id, reference: focus.dataset.memoId, relation: focus.dataset.relationOpen, provenance: !!focus.closest("#detailProvenance") } : null
      };
    }
    function restoreDetail(entry) {
      const section = $2("#dialog .note-detail");
      const apply = () => {
        if (!$2("#dialog").open || $2("#dialog .note-detail") !== section || (section.dataset.relationView || "similar") !== entry.tab) return;
        section.querySelectorAll(".reference-fold").forEach((group, index) => {
          group.open = !!entry.folds?.[index];
        });
        const target = entry.focus, scope = target?.panel ? document.getElementById(target.panel) : section;
        const focus = target && (target.id ? document.getElementById(target.id) : target.provenance ? $2("#detailProvenance button") : target.reference ? scope.querySelector(`[data-memo-id="${CSS.escape(target.reference)}"]`) : target.relation ? scope.querySelector(`[data-relation-open="${CSS.escape(target.relation)}"]`) : null);
        if (focus && !focus.disabled) focus.focus({ preventScroll: true });
        scrollSelectors.forEach((selector, index) => {
          const el = $2(selector);
          if (el) {
            el.dataset.savedScroll = entry.scroll[index];
            el.scrollTop = entry.scroll[index];
          }
        });
        section.querySelectorAll(".relation-body").forEach((body, index) => {
          body.dataset.savedScroll = entry.bodies[index] || 0;
          body.scrollTop = entry.bodies[index] || 0;
        });
      };
      apply();
      requestAnimationFrame(apply);
    }
    function restoreDetailOrigin() {
      if ($2("#dialog").open) return;
      if (detailEditSession) {
        detailEditSession = null;
        api.render();
      }
      const origin = detailOrigin;
      detailOrigin = null;
      detailTrail.length = 0;
      if (!origin || origin.context !== api.context() || origin.editing !== api.editingId()) return;
      if (origin.resume) origin.resume();
      else if (origin.focus?.isConnected && !origin.focus.disabled) origin.focus.focus({ preventScroll: true });
      $2("#memos").scrollTop = origin.scroll;
      window.scrollTo({ left: origin.left, top: origin.top, behavior: "instant" });
    }
    function insightMarkdown(text) {
      const lines = esc(String(text || "")).split("\n");
      let html = "", list = "";
      const close = () => {
        if (list) {
          html += `</${list}>`;
          list = "";
        }
      };
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
          close();
          continue;
        }
        const heading = /^(#{1,4})\s+(.*)$/.exec(line);
        if (heading) {
          close();
          const level = Math.min(5, heading[1].length + 1);
          html += `<h${level}>${heading[2].replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</h${level}>`;
          continue;
        }
        const bullet = /^[-*]\s+(.*)$/.exec(line);
        if (bullet) {
          if (list !== "ul") {
            close();
            list = "ul";
            html += "<ul>";
          }
          html += `<li>${bullet[1].replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>`;
          continue;
        }
        const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
        if (ordered) {
          if (list !== "ol") {
            close();
            list = "ol";
            html += "<ol>";
          }
          html += `<li>${ordered[1].replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>`;
          continue;
        }
        close();
        html += `<p>${line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>")}</p>`;
      }
      close();
      return html;
    }
    const INSIGHT_HISTORY_KEY = "fomo-ai-insight-history";
    function saveInsightHistory(entry) {
      try {
        const list = JSON.parse(localStorage.getItem(INSIGHT_HISTORY_KEY) || "[]");
        const record = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: (/* @__PURE__ */ new Date()).toISOString(), ...entry };
        const next = [record, ...list].filter((item) => item && item.content).slice(0, 20);
        localStorage.setItem(INSIGHT_HISTORY_KEY, JSON.stringify(next));
      } catch {
      }
    }
    function openMemoInsight(m, related = [], options2 = {}) {
      if (!m || m.deleted) return;
      if (!window.memoDesktop?.aiComplete) {
        api.toast("AI \u6D1E\u5BDF\u4EC5\u5728\u684C\u9762\u7248\u53EF\u7528");
        return;
      }
      const started = Date.now();
      const notes = [m, ...related.filter((note2) => note2 && note2.id !== m.id && !note2.deleted)];
      const title2 = options2.title || (notes.length > 1 ? "\u76F8\u5173\u7B14\u8BB0\u6D1E\u5BDF" : "\u7B14\u8BB0\u6D1E\u5BDF");
      api.modal(title2, `<section class="memo-insight-sheet" data-insight-memo="${esc(m.id)}">
      <div class="insight-execution">
        <div class="step-list insight-steps" id="insightSteps" aria-live="polite">
          <div data-step="collect" class="step-item is_start is-active"><span class="step-dot" aria-hidden="true"></span><div class="step-content"><strong class="step-title">\u6B63\u5728\u6536\u96C6\u7B14\u8BB0..</strong></div></div>
          <div data-step="think" class="step-item is_start"><span class="step-dot" aria-hidden="true"></span><div class="step-content"><strong class="step-title">\u6D1E\u5BDF\u601D\u8003\u4E2D...</strong></div></div>
          <div data-step="report" class="step-item"><span class="step-dot" aria-hidden="true"></span><div class="step-content"><strong class="step-title">\u751F\u6210\u6D1E\u5BDF\u62A5\u544A</strong></div></div>
        </div>
        <div id="insightResult" class="insight-result" hidden></div>
        <div id="insightError" class="insight-error" hidden><h3>\u83B7\u53D6\u7B14\u8BB0\u6D1E\u5BDF\u65F6\u53D1\u751F\u9519\u8BEF</h3><p>\u6362\u4E00\u4E2A\u7B14\u8BB0\u8BD5\u8BD5\u5427</p><p class="insight-error-detail"></p><button id="insightRetry" type="button">\u518D\u8BD5\u4E00\u6B21</button></div>
      </div>
    </section>`);
      const dialog = $2("#dialog");
      dialog.classList.add("memo-insight-dialog");
      let closed = false, activeRequestId = "";
      const timers = [];
      const finish = () => {
        for (const timer of timers) clearTimeout(timer);
        dialog.classList.remove("memo-insight-dialog");
      };
      const onClose = () => {
        if (dialog.open) return;
        dialog.removeEventListener("close", onClose);
        closed = true;
        if (activeRequestId) window.memoDesktop.aiCancel?.(activeRequestId);
        finish();
      };
      dialog.addEventListener("close", onClose);
      const steps = [...document.querySelectorAll("#insightSteps [data-step]")];
      let activeStep = 0;
      const setStep = (index, state) => {
        if (state === "active") activeStep = index;
        steps.forEach((step, i) => {
          step.classList.toggle("is-active", i === index && state === "active");
          step.classList.toggle("is-complete", i < index || i === index && state === "complete");
          step.classList.toggle("is-error", i === index && state === "error");
        });
      };
      setStep(0, "active");
      timers.push(setTimeout(() => {
        if (!closed && activeStep === 0) setStep(1, "active");
      }, 700));
      const records = notes.map((note2, index) => {
        const content = String(note2.content || "").trim().slice(0, 2e4), tags = MemoCore.tagsOf(content).map((tag) => "#" + tag).join(" ");
        return `\u7B14\u8BB0 ${index + 1}
\u65E5\u671F\uFF1A${note2.created.slice(0, 10)}
\u6807\u7B7E\uFF1A${tags || "\u65E0"}
\u6B63\u6587\uFF1A
${content}`;
      }).join("\n\n");
      const memory = window.FomoAiMemory?.context?.() || "";
      const prompt = `\u8BF7\u57FA\u4E8E\u4E0B\u9762 ${notes.length} \u6761\u76F8\u5173\u7B14\u8BB0\u751F\u6210\u4E00\u4EFD\u4E2D\u6587\u6D1E\u5BDF\u62A5\u544A\u3002\u4E0D\u8981\u7F16\u9020\u7B14\u8BB0\u91CC\u6CA1\u6709\u7684\u4E8B\u5B9E\u3002\u4E0D\u8981\u9010\u6761\u590D\u8FF0\uFF0C\u91CD\u70B9\u5BFB\u627E\u5B83\u4EEC\u4E4B\u95F4\u7684\u5171\u540C\u4E3B\u9898\u3001\u77DB\u76FE\u4E0E\u53EF\u7EE7\u7EED\u8FFD\u95EE\u7684\u65B9\u5411\u3002${options2.focus ? `

\u91CD\u70B9\u89C6\u89D2\uFF1A${options2.focus}` : ""}${memory ? `

${memory}` : ""}

${records.slice(0, 6e4)}`;
      const resultBox = $2("#insightResult");
      let streamed = "";
      const paint = (text) => {
        if (closed) return;
        const thinking = steps[1].querySelector(".step-title");
        if (thinking) thinking.textContent = `\u5DF2\u5B8C\u6210\u6D1E\u5BDF\u601D\u8003\uFF08${Math.max(1, Math.round((Date.now() - started) / 1e3))} \u79D2\uFF09`;
        setStep(2, "active");
        resultBox.hidden = false;
        resultBox.innerHTML = `<div class="insight-result-head"><div class="insight-title">\u6D1E\u5BDF\u62A5\u544A</div><span>\u6B63\u5728\u751F\u6210\u2026</span></div><div class="insight-content">${insightMarkdown(text)}</div><p class="insight-disclaimer">AI \u751F\u6210\u5185\u5BB9\u4EC5\u4F9B\u53C2\u8003</p>`;
      };
      const showInsightError = (message) => {
        for (const timer of timers) clearTimeout(timer);
        setStep(activeStep, "error");
        const errorBox = $2("#insightError"), title3 = errorBox.querySelector("h3"), copy = errorBox.querySelector("p"), detail = errorBox.querySelector(".insight-error-detail"), retry = $2("#insightRetry");
        errorBox.hidden = false;
        const configurationIssue = /API Key|AI 尚未启用|启用 AI 服务|加密保存/.test(message) && typeof api.openSettings === "function";
        title3.textContent = "\u83B7\u53D6\u7B14\u8BB0\u6D1E\u5BDF\u65F6\u53D1\u751F\u9519\u8BEF";
        copy.textContent = "\u6362\u4E00\u4E2A\u7B14\u8BB0\u8BD5\u8BD5\u5427";
        detail.textContent = message;
        detail.hidden = !configurationIssue;
        retry.textContent = configurationIssue ? "\u6253\u5F00 Fomo AI \u8BBE\u7F6E" : "\u518D\u8BD5\u4E00\u6B21";
        retry.onclick = async () => {
          if (configurationIssue) {
            dialog.close();
            try {
              await api.openSettings();
              requestAnimationFrame(() => {
                $2("#tabAi")?.click();
                $2("#aiTabSettings")?.click();
              });
            } catch (error) {
              api.toast(error.message);
            }
            return;
          }
          dialog.close();
          openMemoInsight(m, related, options2);
        };
      };
      (async () => {
        try {
          const status = await window.memoDesktop.aiSettings?.();
          if (status && status.enabled !== true) throw Error("Fomo AI \u5C1A\u672A\u542F\u7528\u3002\u8BF7\u5728\u8BBE\u7F6E \u2192 Fomo AI \u2192 \u8BBE\u7F6E\u4E2D\u5F00\u542F\u670D\u52A1\u3002");
          if (status && (!status.hasKey || status.keyUsable === false)) throw Error(status.hasKey ? "\u5DF2\u4FDD\u5B58\u7684 API Key \u65E0\u6CD5\u8BFB\u53D6\u3002\u8BF7\u5728\u8BBE\u7F6E \u2192 Fomo AI \u2192 \u8BBE\u7F6E\u4E2D\u91CD\u65B0\u586B\u5199\u3002" : "\u5C1A\u672A\u914D\u7F6E DeepSeek API Key\u3002\u8BF7\u5728\u8BBE\u7F6E \u2192 Fomo AI \u2192 \u8BBE\u7F6E\u4E2D\u586B\u5199\u3002");
          setStep(1, "active");
          const payload = { temperature: 0.4, maxTokens: 1200, messages: [
            { role: "system", content: "\u4F60\u662F Fomo \u7684\u7B14\u8BB0\u6D1E\u5BDF\u52A9\u624B\u3002\u57FA\u4E8E\u7528\u6237\u9009\u4E2D\u7684\u7B14\u8BB0\uFF0C\u5199\u4E00\u4EFD\u7B80\u6D01\u3001\u5177\u4F53\u3001\u53EF\u7EE7\u7EED\u884C\u52A8\u7684\u4E2D\u6587\u6D1E\u5BDF\u62A5\u544A\u3002\u4F7F\u7528 Markdown\uFF1B\u5305\u542B\u4E3B\u9898\u3001\u503C\u5F97\u8FFD\u95EE\u7684\u95EE\u9898\u3001\u53EF\u6267\u884C\u7684\u4E0B\u4E00\u6B65\uFF0C\u4E0D\u8981\u6CDB\u6CDB\u800C\u8C08\u3002" },
            { role: "user", content: prompt }
          ] };
          let result;
          try {
            if (window.memoDesktop.aiStreamRequest) {
              const request = window.memoDesktop.aiStreamRequest(payload, (delta) => {
                if (closed) return;
                streamed += delta;
                paint(streamed);
              });
              activeRequestId = request.requestId;
              result = await request.result;
            } else if (window.memoDesktop.aiStream) {
              activeRequestId = "stream";
              result = await window.memoDesktop.aiStream(payload, (delta) => {
                if (closed) return;
                streamed += delta;
                paint(streamed);
              });
            } else result = await window.memoDesktop.aiComplete(payload);
          } catch (error) {
            if (closed) throw error;
            if (streamed || !window.memoDesktop.aiComplete) throw error;
            setStep(1, "active");
            if (window.memoDesktop.aiCompleteRequest) {
              const request = window.memoDesktop.aiCompleteRequest(payload);
              activeRequestId = request.requestId;
              result = await request.result;
            } else result = await window.memoDesktop.aiComplete(payload);
          }
          if (closed) return;
          steps[2].querySelector(".step-title").textContent = "\u5DF2\u7ECF\u751F\u6210\u6D1E\u5BDF\u62A5\u544A";
          setStep(2, "complete");
          const seconds = Math.max(1, Math.round((Date.now() - started) / 1e3));
          resultBox.hidden = false;
          const report = String(result.content || "").replace(/^\s*#\s*(?:AI\s*)?洞察(?:报告)?\s*\n?/i, "").trim();
          saveInsightHistory({ memoId: m.id, title: title2, content: report, count: notes.length, focus: options2.focus || "" });
          resultBox.innerHTML = `<div class="insight-result-head"><div class="insight-title">\u6D1E\u5BDF\u62A5\u544A</div><span>\u5B8C\u6210\u6D1E\u5BDF\uFF08${seconds} \u79D2\uFF09</span></div><div class="insight-content">${insightMarkdown(report)}</div><p class="insight-disclaimer">AI \u751F\u6210\u5185\u5BB9\u4EC5\u4F9B\u53C2\u8003</p>`;
        } catch (error) {
          if (closed) return;
          showInsightError(String(error?.message || error));
        }
      })();
    }
    function openDetail(id, tab = "auto", back = false, restore = null) {
      if (detailEditSession && api.editingId()) {
        api.toast("\u8BF7\u5148\u4FDD\u5B58\u6216\u53D6\u6D88\u5F53\u524D\u7F16\u8F91");
        return;
      }
      if (tab === "links") tab = "quoted";
      document.getElementById("detailDatePicker")?.remove();
      const m = note(id);
      if (!m) {
        api.toast("\u539F\u7B14\u8BB0\u6682\u4E0D\u53EF\u7528\uFF0C\u5F15\u7528\u4ECD\u7136\u4FDD\u7559");
        return;
      }
      const previous = captureDetail();
      if (!previous) {
        detailTrail.length = 0;
        if (restore?.returnContext) {
          detailTrail.push(...restore.returnContext.trail);
          detailOrigin = restore.returnContext.origin;
        } else detailOrigin = { context: api.context(), editing: api.editingId(), scroll: $2("#memos").scrollTop, left: scrollX, top: scrollY, focus: document.activeElement, resume: api.detailReturn?.() };
      } else if (previous.id !== id && !back) detailTrail.push(previous);
      else if (previous.id === id && !restore) restore = { ...previous, tab };
      const links = MemoCore.relationships(api.state().memos, id), groups = relationGroups(links);
      const incoming = [...new Map([...groups.annotations, ...groups.incoming].map((n) => [n.id, n])).values()];
      const related = MemoCore.related(api.state().memos, id).slice(0, 30);
      const tabs = [];
      if (tab === "similar") tabs.push({ key: "similar", label: "\u76F8\u5173", count: related.length, notes: related.map((item) => item.memo) });
      if (groups.outgoing.length) tabs.push({ key: "quote", label: "\u5F15\u7528", count: groups.outgoing.length, notes: groups.outgoing });
      if (incoming.length) tabs.push({ key: "quoted", label: "\u88AB\u5F15\u7528", count: incoming.length, notes: incoming });
      if (!tabs.length) tabs.push({ key: "similar", label: "\u76F8\u5173", count: related.length, notes: related.map((item) => item.memo) });
      if (!tabs.some((item) => item.key === tab)) tab = groups.outgoing.length ? "quote" : incoming.length ? "quoted" : "similar";
      const relationHeading = "", canRandom = !m.deleted && api.state().memos.filter((item) => !item.deleted).length >= 15;
      api.modal("\u7B14\u8BB0\u8BE6\u60C5", `<section class="note-detail" data-detail-id="${m.id}">
      <div class="detail-primary">
        <div class="detail-section-row"><h3 class="detail-section-label">\u5F53\u524D\u7B14\u8BB0</h3>${canRandom ? '<button id="detailRandomWalk" type="button">\u968F\u673A\u6F2B\u6B65</button>' : ""}</div>
        <div class="detail-primary-scroll" id="detailCurrentScroll" tabindex="0">
        <article class="detail-current-card">
        <div class="detail-card-head"><time class="detail-meta" datetime="${m.created}">${esc(cardDate(m.created))}${m.deleted ? " \xB7 \u5728\u56DE\u6536\u7AD9\u4E2D" : ""}</time><span class="note-origin">${sourceLabel(m)}</span><button id="detailActionsToggle" type="button" aria-label="\u5F53\u524D\u7B14\u8BB0\u64CD\u4F5C" aria-haspopup="menu" aria-controls="detailActions" aria-expanded="false">\xB7\xB7\xB7</button></div>
        ${m.annotationOf ? '<div class="detail-provenance" id="detailProvenance"></div>' : ""}
        ${m.deleted ? '<p class="detail-source-status" id="detailTrashStatus">\u7B14\u8BB0\u4F4D\u4E8E\u56DE\u6536\u7AD9\uFF0C\u6062\u590D\u540E\u53EF\u7EE7\u7EED\u7F16\u8F91\u3002</p>' : ""}
        <div class="memo-content">${api.rich(m)}</div>
        <div class="detail-images">${m.images.map((src, i) => `<button data-detail-image="${i}" aria-label="\u67E5\u770B\u56FE\u7247 ${i + 1}"><img src="${src}" alt="\u7B14\u8BB0\u56FE\u7247 ${i + 1}"></button>`).join("")}</div>${m.audio ? `<audio class="detail-audio" controls preload="metadata" src="${m.audio}" aria-label="\u7B14\u8BB0\u8BED\u97F3"></audio>` : ""}${m.video ? `<video class="detail-video" controls preload="metadata" src="${m.video}" aria-label="\u7B14\u8BB0\u89C6\u9891"></video>` : ""}
        <div id="detailActions" class="detail-tools detail-actions-menu" role="menu" aria-label="\u5F53\u524D\u7B14\u8BB0\u64CD\u4F5C" popover="auto"><button id="detailShare"><span class="detail-tool-icon" data-icon="share"></span>\u5206\u4EAB</button>${!m.deleted ? '<button id="detailEdit"><span class="detail-tool-icon" data-icon="edit"></span>\u7F16\u8F91</button>' : ""}<button id="detailCopy"><span class="detail-tool-icon" data-icon="copy"></span>\u590D\u5236</button><hr>${window.memoDesktop ? '<button id="detailWindow">\u65B0\u7A97\u53E3\u6253\u5F00</button>' : ""}${!m.deleted ? '<button id="detailPin">' + (m.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876") + '</button><button id="detailFloat">\u52A0\u5165\u6D6E\u7A97</button>' : ""}${window.memoDesktop ? '<button id="detailInsight">AI \u6D1E\u5BDF</button>' : ""}<button id="detailRelated">\u76F8\u5173\u7B14\u8BB0</button><button id="detailCopyLink">\u590D\u5236\u94FE\u63A5</button>${!m.deleted ? '<button id="detailAnnotate">' + (api.legacyDraft(id) ? "\u6062\u590D\u6279\u6CE8\u8349\u7A3F" : "\u6279\u6CE8") + "</button>" : ""}<button id="detailMore" data-action="more" aria-haspopup="menu" aria-expanded="false">\u66F4\u591A ${icon2("next").replace('class="bi ', 'class="more-chevron bi ')}</button><div class="memo-more-menu detail-more-menu" role="menu" aria-label="\u66F4\u591A\u7B14\u8BB0\u64CD\u4F5C" hidden><button id="detailHistory">\u5386\u53F2\u7248\u672C</button>${!m.deleted ? '<button id="detailChangeDate">\u4FEE\u6539\u65E5\u671F</button>' : ""}</div>${!m.deleted ? '<button id="detailDelete" class="danger">\u5220\u9664</button>' : ""}<div class="menu-meta"><span>\u5B57\u6570\u7EDF\u8BA1: ${api.wordCount(m)}</span><span>\u7F16\u8F91\u4E8E ${esc(menuEditedDate(m.updated || m.created))}</span></div></div>
        <div id="annotationList"></div>
        </article>
        </div>
      </div>
      <aside class="detail-relations"${tabs.length ? "" : " hidden"}>
        <div id="detailRelationHeader" class="memo-detail-header"></div>
        <div id="detailTabContent" class="detail-tab-content" role="tabpanel" tabindex="0"></div>
      </aside>
    </section>`);
      $2("#dialog").classList.remove("has-relations", "single-pane");
      $2("#dialog").classList.add("note-detail-dialog", tabs.length ? "has-relations" : "single-pane");
      const header = $2("#dialog .dialog-header");
      header.querySelector("#detailBack")?.remove();
      header.querySelector(".detail-switcher")?.remove();
      if (detailTrail.length) {
        const b = document.createElement("button");
        b.id = "detailBack";
        b.type = "button";
        b.setAttribute("aria-label", "\u8FD4\u56DE\u4E0A\u4E00\u6761\u7B14\u8BB0");
        b.innerHTML = icon2("back");
        b.onclick = () => {
          let previous2 = detailTrail.pop();
          while (previous2 && !note(previous2.id)) previous2 = detailTrail.pop();
          if (previous2) openDetail(previous2.id, previous2.tab, true, previous2);
          else {
            b.remove();
            api.toast("\u4E4B\u524D\u7684\u7B14\u8BB0\u6682\u4E0D\u53EF\u7528");
          }
        };
        header.prepend(b);
      }
      const switcher = document.createElement("div");
      switcher.className = "detail-switcher";
      switcher.innerHTML = '<button id="detailSwitch" type="button" aria-haspopup="menu" aria-expanded="false">\u21BB <span>\u5207\u6362\u5185\u5BB9</span></button><div class="detail-tabs" id="detailTabs" role="menu" aria-label="\u5207\u6362\u5185\u5BB9" hidden></div>';
      header.insertBefore(switcher, header.querySelector("#closeDialog"));
      switcher.hidden = tabs.length <= 1;
      const switchButton = switcher.querySelector("#detailSwitch"), switchMenu = switcher.querySelector("#detailTabs");
      switchButton.onclick = (event) => {
        switchMenu.hidden = !switchMenu.hidden;
        switchButton.setAttribute("aria-expanded", String(!switchMenu.hidden));
        if (!switchMenu.hidden && event.detail === 0) switchMenu.querySelector("[aria-checked=true]")?.focus();
      };
      switcher.addEventListener("keydown", (event) => {
        if (switchMenu.hidden) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          switchMenu.hidden = true;
          switchButton.setAttribute("aria-expanded", "false");
          switchButton.focus();
          return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          const items = [...switchMenu.querySelectorAll("[role=menuitemradio]")], index = items.indexOf(document.activeElement), next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          event.preventDefault();
          items[next]?.focus();
        }
      });
      const detailDialog = $2("#dialog");
      detailDialog.detailSwitchController?.abort();
      const switchController = new AbortController();
      detailDialog.detailSwitchController = switchController;
      detailDialog.addEventListener("click", (event) => {
        if (!switchMenu.hidden && !switcher.contains(event.target)) {
          switchMenu.hidden = true;
          switchButton.setAttribute("aria-expanded", "false");
        }
      }, { signal: switchController.signal });
      detailDialog.addEventListener("close", () => {
        if (!detailDialog.open) switchController.abort();
      }, { signal: switchController.signal });
      const relationSection = $2(".note-detail");
      relationSection.expandedRelations = new Set(restore?.expandedRelations || relationSection.expandedRelations || []);
      const attachRelationLinks = () => {
        document.querySelectorAll("#detailTabContent [data-relation-menu]").forEach((b) => b.onclick = () => openRelationMenu(b));
        document.querySelectorAll("#detailTabContent [data-relation-open]").forEach((b) => b.onclick = () => openDetail(b.dataset.relationOpen, b.matches(".relation-parent,.relation-source") ? "quoted" : "auto"));
        document.querySelectorAll("#detailTabContent [data-relation-image]").forEach((b) => b.onclick = () => {
          const source = note(b.dataset.relationId), index = Number(b.dataset.relationImage);
          if (source) api.image(source.images[index], source.images, index);
        });
        document.querySelectorAll("#detailTabContent [data-relation-expand]").forEach((btn) => {
          const id2 = btn.dataset.relationExpand, body = btn.closest(".relation-card")?.querySelector(".relation-body");
          if (!body) return;
          const apply = () => {
            const expanded = relationSection.expandedRelations.has(id2), overflow = body.scrollHeight > 240;
            body.classList.toggle("is-collapsed", overflow && !expanded);
            btn.hidden = !expanded && !overflow;
            btn.textContent = expanded ? "\u6536\u8D77" : "\u5C55\u5F00";
            btn.setAttribute("aria-expanded", String(expanded));
          };
          btn.onclick = () => {
            if (relationSection.expandedRelations.has(id2)) relationSection.expandedRelations.delete(id2);
            else relationSection.expandedRelations.add(id2);
            apply();
          };
          requestAnimationFrame(apply);
        });
      };
      relationSection.dataset.hideSharedTags = String(restore?.hideSharedTags === true);
      relationSection.tabPositions = JSON.parse(JSON.stringify(restore?.tabPositions || {}));
      relationSection.saveTabPosition = () => {
        const key = relationSection.dataset.relationView;
        if (!key) return;
        const panel = $2("#detailTabContent");
        relationSection.tabPositions[key] = {
          scroll: panel.scrollTop,
          body: $2("#dialogBody").scrollTop,
          cards: [...panel.querySelectorAll("[data-relation-id] .relation-body")].map((body) => ({ id: body.closest("[data-relation-id]").dataset.relationId, scroll: body.scrollTop }))
        };
      };
      const restoreTabPosition = (key) => {
        const position = relationSection.tabPositions[key], panel = $2("#detailTabContent");
        for (const body of panel.querySelectorAll("[data-relation-id] .relation-body")) {
          body.scrollTop = position?.cards.find((card) => card.id === body.closest("[data-relation-id]").dataset.relationId)?.scroll || 0;
        }
        panel.scrollTop = position?.scroll || 0;
        if (innerWidth < 760) $2("#dialogBody").scrollTop = position?.body || 0;
      };
      const selectTab = (key, focus = false, force = false) => {
        const selected2 = tabs.find((item) => item.key === key) || tabs[0];
        const current = selected2?.key || "";
        if (relationSection.dataset.relationView === current && !force) {
          if (focus) $2('#detailTabs [aria-selected="true"]')?.focus({ preventScroll: true });
          return;
        }
        const relationMenu = $2("#relationActions");
        if (relationMenu?.matches(":popover-open")) relationMenu.hidePopover();
        const previousRelatedMenu = $2("#detailRelatedMenu");
        if (previousRelatedMenu?.matches(":popover-open")) previousRelatedMenu.hidePopover();
        relationSection.saveTabPosition();
        relationSection.dataset.relationView = current;
        const tabsRoot = $2("#detailTabs");
        tabsRoot.replaceChildren();
        for (const item of tabs) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "detail-tab";
          b.dataset.detailTab = item.key;
          b.id = "detail-tab-" + item.key;
          b.setAttribute("role", "menuitemradio");
          b.setAttribute("aria-controls", "detailTabContent");
          b.setAttribute("aria-checked", String(item.key === current));
          b.setAttribute("aria-selected", String(item.key === current));
          b.tabIndex = 0;
          b.textContent = item.label;
          b.onclick = () => {
            tabsRoot.hidden = true;
            switchButton.setAttribute("aria-expanded", "false");
            selectTab(item.key);
            switchButton.focus({ preventScroll: true });
          };
          tabsRoot.append(b);
        }
        if (focus) tabsRoot.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
        const content = $2("#detailTabContent");
        content.replaceChildren();
        content.setAttribute("aria-label", selected2 ? selected2.label + "\u7B14\u8BB0" : "\u7B14\u8BB0\u5173\u7CFB");
        if (!selected2) {
          $2("#detailRelationHeader").replaceChildren();
          emptyNote(content, "\u8FD8\u6CA1\u6709\u5F15\u7528\u3001\u88AB\u5F15\u7528\u6216\u76F8\u5173\u7B14\u8BB0\u3002");
          return;
        }
        const sourceTags = MemoCore.tagsOf(m.content), hideSharedTags = relationSection.dataset.hideSharedTags === "true", visibleNotes = current === "similar" && hideSharedTags ? selected2.notes.filter((item) => !MemoCore.tagsOf(item.content).some((tag) => sourceTags.includes(tag))) : selected2.notes;
        const heading = current === "similar" ? `${visibleNotes.length} \u6761\u76F8\u5173\u7B14\u8BB0` : current === "quote" ? `${selected2.count} \u6761\u5F15\u7528\u7B14\u8BB0` : `\u88AB ${selected2.count} \u6761\u7B14\u8BB0\u5F15\u7528`;
        const relationHeader = $2("#detailRelationHeader");
        relationHeader.innerHTML = current === "similar" ? `<h3 class="relation-count">${heading}</h3><span class="relation-hint">\u5F53\u524D\u7B14\u8BB0\u76F8\u5173\u5EA6\u7531\u672C\u5730\u5173\u8054\u8BA1\u7B97\uFF0C\u4EC5\u4F9B\u53C2\u8003</span><div class="detail-relation-actions"><button id="detailRelatedShare" type="button" aria-label="\u5206\u4EAB\u76F8\u5173\u7B14\u8BB0" title="\u751F\u6210\u5206\u4EAB\u56FE">${menuGlyph("share")}</button><button id="detailRelatedMore" type="button" aria-label="\u76F8\u5173\u7B14\u8BB0\u66F4\u591A\u64CD\u4F5C" aria-haspopup="menu" aria-expanded="false" title="\u66F4\u591A">${icon2("ellipsis")}</button></div><div id="detailRelatedMenu" class="detail-related-menu" role="menu" popover="auto"><button id="hideRelatedSameTags" type="button" role="menuitemcheckbox" aria-checked="${hideSharedTags}"><span class="menu-check" aria-hidden="true">${hideSharedTags ? "\u2713" : ""}</span><span>\u9690\u85CF\u540C\u6807\u7B7E\u7B14\u8BB0</span></button></div>` : `<h3 class="relation-count">${heading}</h3>`;
        if (current === "similar") {
          $2("#detailRelatedShare").onclick = () => shareFromDetail(m);
          const relatedMore = $2("#detailRelatedMore"), relatedMenu = $2("#detailRelatedMenu");
          relatedMore.onclick = (event) => {
            if (relatedMenu.matches(":popover-open")) {
              relatedMenu.hidePopover();
              return;
            }
            relatedMenu.showPopover();
            const a = relatedMore.getBoundingClientRect(), r = relatedMenu.getBoundingClientRect();
            relatedMenu.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, a.right - r.width)) + "px";
            relatedMenu.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, a.bottom + 4)) + "px";
            relatedMenu.tabIndex = -1;
            (event.detail === 0 ? relatedMenu.querySelector("button") : relatedMenu).focus({ preventScroll: true });
          };
          relatedMenu.addEventListener("toggle", () => relatedMore.setAttribute("aria-expanded", String(relatedMenu.matches(":popover-open"))));
          $2("#hideRelatedSameTags").onclick = () => {
            const checked = !$2("#hideRelatedSameTags").getAttribute("aria-checked").startsWith("true");
            relationSection.dataset.hideSharedTags = String(checked);
            relatedMenu.hidePopover();
            selectTab(current, false, true);
            $2("#detailRelatedMore")?.focus({ preventScroll: true });
          };
        }
        if (current === "similar" && visibleNotes.length && window.memoDesktop) {
          content.insertAdjacentHTML("beforeend", '<div class="ai-related-action"><button id="aiRelatedInsight" type="button">AI \u6D1E\u5BDF</button><span>\u8BA9 AI \u628A\u8FD9\u7EC4\u7B14\u8BB0\u653E\u5728\u4E00\u8D77\u770B</span></div>');
          $2("#aiRelatedInsight").onclick = () => {
            const related2 = visibleNotes.filter((note2) => note2 && !note2.deleted);
            $2("#dialog").close();
            openMemoInsight(m, related2);
          };
        }
        if (!visibleNotes.length) emptyNote(content, "\u6682\u65E0\u7B26\u5408\u6761\u4EF6\u7684\u76F8\u5173\u7B14\u8BB0\u3002");
        for (const item of visibleNotes) content.insertAdjacentHTML("beforeend", relationCard(item));
        attachRelationLinks();
        restoreTabPosition(current);
      };
      selectTab(tab);
      const glyphMap = { edit: "edit", copy: "copy" };
      document.querySelectorAll("#dialogBody .detail-tool-icon[data-icon]").forEach((el) => {
        el.innerHTML = menuGlyph(glyphMap[el.dataset.icon] || el.dataset.icon);
      });
      const actions = $2("#detailActions"), actionsToggle = $2("#detailActionsToggle");
      actions.querySelectorAll("button").forEach((b) => b.setAttribute("role", "menuitem"));
      actionsToggle.onclick = (e) => {
        if (actions.matches(":popover-open")) {
          actions.hidePopover();
          return;
        }
        actions.showPopover();
        const a = actionsToggle.getBoundingClientRect(), r = actions.getBoundingClientRect();
        actions.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, a.left)) + "px";
        actions.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, a.bottom + 4)) + "px";
        actions.tabIndex = -1;
        (e.detail === 0 ? actions.querySelector("button") : actions).focus({ preventScroll: true });
      };
      actions.addEventListener("toggle", () => actionsToggle.setAttribute("aria-expanded", String(actions.matches(":popover-open"))));
      const more = $2("#detailMore"), sub = actions.querySelector(".detail-more-menu");
      more.onpointerenter = () => toggleMore(actions, true, true);
      more.onclick = () => toggleMore(actions, sub.hidden, true);
      actions.querySelectorAll(":scope>button:not(#detailMore)").forEach((button) => button.onpointerenter = () => toggleMore(actions, false));
      actions.addEventListener("toggle", () => {
        if (!actions.matches(":popover-open")) toggleMore(actions, false);
      });
      actions.addEventListener("click", (e) => {
        if (e.target.closest("button") !== more && e.target.closest("button") && actions.isConnected && actions.matches(":popover-open")) actions.hidePopover();
      });
      actions.onkeydown = (e) => {
        const inside = sub.contains(document.activeElement), items = [...(inside ? sub : actions).querySelectorAll(inside ? "button" : ":scope>button")], i = items.indexOf(document.activeElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        } else if (e.key === "ArrowRight" && document.activeElement === more) {
          e.preventDefault();
          toggleMore(actions, true, true);
          sub.querySelector("button")?.focus();
        } else if (e.key === "ArrowLeft" && inside) {
          e.preventDefault();
          toggleMore(actions, false);
          more.focus();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (inside) {
            toggleMore(actions, false);
            more.focus();
          } else {
            actions.hidePopover();
            actionsToggle.focus({ preventScroll: true });
          }
        }
      };
      const closeActions = () => {
        const relationMenu = $2("#relationActions");
        if (relationMenu?.matches(":popover-open")) relationMenu.hidePopover();
        const relatedMenu = $2("#detailRelatedMenu");
        if (relatedMenu?.matches(":popover-open")) relatedMenu.hidePopover();
        if (actions.isConnected && actions.matches(":popover-open")) actions.hidePopover();
      };
      $2("#dialogBody").onscroll = closeActions;
      $2(".detail-primary-scroll").addEventListener("scroll", closeActions, { passive: true });
      $2("#detailTabContent").addEventListener("scroll", closeActions, { passive: true });
      $2("#detailEdit")?.addEventListener("click", () => startDetailEditing(m));
      $2(".detail-current-card .memo-content").ondblclick = (event) => {
        if (!event.target.closest("a,button,[contenteditable]")) startDetailEditing(m);
      };
      $2("#detailAnnotate")?.addEventListener("click", () => api.annotate(id));
      $2("#detailChangeDate")?.addEventListener("click", () => openDatePicker(m, actionsToggle));
      $2("#detailDelete")?.addEventListener("click", async () => {
        if (api.busy()) return;
        if (api.editingId() === id) {
          api.toast("\u8BF7\u5148\u4FDD\u5B58\u6216\u53D6\u6D88\u8FD9\u6761\u7B14\u8BB0\u7684\u7F16\u8F91");
          return;
        }
        const before = MemoCore.clone(api.state());
        if (await api.commit(MemoCore.batch(before, [id], "delete"))) {
          const after = MemoCore.clone(api.state());
          $2("#dialog").close();
          api.toast("\u5DF2\u79FB\u5165\u56DE\u6536\u7AD9", () => api.undo(before, after));
        }
      });
      $2("#detailShare").onclick = () => shareFromDetail(m);
      $2("#detailInsight")?.addEventListener("click", () => {
        $2("#dialog").close();
        openMemoInsight(m);
      });
      $2("#detailHistory").onclick = () => showHistory(id);
      $2("#detailCopy").onclick = () => copyValue(memoCopyText(m), memoCopyHTML(m));
      $2("#detailWindow")?.addEventListener("click", () => openWindow(id, false));
      $2("#detailPin")?.addEventListener("click", async () => {
        if (api.busy()) return;
        const desired = MemoCore.clone(api.state()), target = desired.memos.find((item) => item.id === id);
        if (!target || target.deleted) return;
        target.pinned = !target.pinned;
        if (await api.commit(desired)) {
          const saved = captureDetail();
          if (saved) openDetail(saved.id, saved.tab, true, saved);
        }
      });
      $2("#detailFloat")?.addEventListener("click", () => addFloat(id));
      $2("#detailRelated").onclick = () => openDetail(id);
      $2("#detailRandomWalk")?.addEventListener("click", () => api.startRandomWalk(id));
      $2("#detailCopyLink").onclick = () => copyReference(m);
      document.querySelectorAll("[data-detail-image]").forEach((b) => b.onclick = () => api.image(m.images[Number(b.dataset.detailImage)], m.images, Number(b.dataset.detailImage)));
      const provenance = $2("#detailProvenance");
      if (provenance) {
        const parent = note(m.annotationOf), b = document.createElement("button");
        b.type = "button";
        b.innerHTML = '<span class="detail-source-label">\u5173\u8054\u81EA\uFF1A</span><span class="ref-arrow" aria-hidden="true">' + icon2("external") + "</span>" + (parent?.deleted ? '<span class="source-state">\u56DE\u6536\u7AD9</span>' : !parent ? '<span class="source-state">\u539F\u7B14\u8BB0\u6682\u4E0D\u53EF\u7528</span>' : "");
        b.title = parent ? sourceSummary(parent) : "\u672C\u5730\u6682\u65F6\u627E\u4E0D\u5230\u539F\u7B14\u8BB0\uFF0C\u5F15\u7528\u5173\u7CFB\u4ECD\u4FDD\u7559\u3002";
        b.setAttribute("aria-label", "\u67E5\u770B\u6279\u6CE8\u6765\u6E90\uFF1A" + b.title);
        b.disabled = !parent || parent.deleted;
        b.onclick = () => openDetail(m.annotationOf, "links");
        provenance.append(b);
      }
      document.querySelectorAll("[data-relation-open]").forEach((b) => b.onclick = () => openDetail(b.dataset.relationOpen, b.matches(".relation-parent,.relation-source") ? "quoted" : "auto"));
      document.querySelectorAll("[data-relation-image]").forEach((b) => b.onclick = () => {
        const source = note(b.dataset.relationId), index = Number(b.dataset.relationImage);
        if (source) api.image(source.images[index], source.images, index);
      });
      if (restore) restoreDetail(restore);
      else scrollSelectors.forEach((selector) => {
        const el = $2(selector);
        if (el) el.scrollTop = 0;
      });
    }
    const sourceSummary = (m) => m.missing ? "\u539F\u7B14\u8BB0\u6682\u4E0D\u53EF\u7528" : (m.created ? cardDate(m.created).slice(0, 10) + ": " : "") + tokenText(m.content.trim().replace(/\s+/g, " ") || "\u56FE\u7247\u7B14\u8BB0") + (m.deleted ? "\uFF08\u56DE\u6536\u7AD9\uFF09" : "");
    function referenceSources(m) {
      return MemoCore.relationships(api.state().memos, m.id).outgoing.map((source) => `<button type="button" class="relation-source${source.missing ? " is-missing" : ""}" ${source.missing ? "disabled" : 'data-relation-open="' + source.id + '"'} title="${esc(sourceSummary(source))}" aria-label="\u67E5\u770B\u5F15\u7528\u6765\u6E90\uFF1A${esc(sourceSummary(source))}"><span class="ref-arrow" aria-hidden="true">${icon2("linkedMemo")}</span><span class="detail-source-summary">${esc(sourceSummary(source))}</span></button>`).join("");
    }
    function relationCard(m, current = false) {
      if (m.missing) return `<article class="relation-card is-missing" data-missing-source="${esc(m.id)}"><p class="detail-empty">\u539F\u7B14\u8BB0\u6682\u4E0D\u53EF\u7528</p><p class="detail-source-status">\u672C\u5730\u6682\u65F6\u627E\u4E0D\u5230\u539F\u7B14\u8BB0\uFF0C\u5F15\u7528\u5173\u7CFB\u4ECD\u4FDD\u7559\u3002</p></article>`;
      const parentId = m.annotationOf || m.relatedTo, parent = parentId ? note(parentId) : null, tmp = document.createElement("template");
      tmp.innerHTML = api.rich(m);
      return `<article class="relation-card${current ? " relation-card-current" : ""}" data-relation-id="${m.id}">
      <div class="relation-card-head"><button class="relation-date" type="button" data-relation-open="${m.id}" aria-label="\u6253\u5F00\u7B14\u8BB0\u8BE6\u60C5"><time datetime="${m.created}">${esc(cardDate(m.created))}${m.deleted ? " \xB7 \u56DE\u6536\u7AD9" : ""}</time></button><button class="relation-more" type="button" data-relation-menu="${m.id}" aria-label="\u7B14\u8BB0\u64CD\u4F5C" aria-haspopup="menu" aria-expanded="false">\xB7\xB7\xB7</button></div>
      ${m.annotationOf ? `<button class="relation-parent" type="button" ${parent && !parent.deleted ? 'data-relation-open="' + parentId + '"' : "disabled"} aria-label="\u67E5\u770B\u6279\u6CE8\u6765\u6E90\uFF1A${esc(parent ? sourceSummary(parent) : "\u539F\u7B14\u8BB0\u6682\u4E0D\u53EF\u7528\uFF0C\u5F15\u7528\u5173\u7CFB\u4ECD\u4FDD\u7559")}" title="${esc(parent ? sourceSummary(parent) : "\u672C\u5730\u6682\u65F6\u627E\u4E0D\u5230\u539F\u7B14\u8BB0\uFF0C\u5F15\u7528\u5173\u7CFB\u4ECD\u4FDD\u7559\u3002")}"><span class="detail-source-label">\u5173\u8054\u81EA\uFF1A</span><span class="ref-arrow" aria-hidden="true">${icon2("external")}</span>${parent?.deleted ? '<span class="source-state">\u56DE\u6536\u7AD9</span>' : !parent ? '<span class="source-state">\u539F\u7B14\u8BB0\u6682\u4E0D\u53EF\u7528</span>' : ""}</button>` : ""}
      <div class="relation-body-wrap"><div class="relation-body">${tmp.innerHTML}</div><button class="relation-expand" type="button" data-relation-expand="${m.id}" aria-expanded="false" hidden>\u5C55\u5F00</button></div>
      ${m.images?.length ? `<div class="memo-images">${m.images.map((src, i) => `<button type="button" data-relation-image="${i}" data-relation-id="${m.id}" aria-label="\u67E5\u770B\u56FE\u7247 ${i + 1}"><img src="${src}" alt="\u7B14\u8BB0\u56FE\u7247 ${i + 1}" loading="lazy"></button>`).join("")}</div>` : ""}
      ${m.audio ? `<audio class="relation-audio" controls preload="metadata" src="${esc(m.audio)}" aria-label="\u7B14\u8BB0\u8BED\u97F3"></audio>` : ""}
      ${m.video ? `<video class="relation-video" controls preload="metadata" playsinline src="${esc(m.video)}" aria-label="\u7B14\u8BB0\u89C6\u9891"></video>` : ""}
    </article>`;
    }
    function relatedMarkup(m, links) {
      const outgoing = links.outgoing.filter((row2) => row2.id !== m.annotationOf && !row2.deleted), incoming = [...new Map(links.incoming.map((row2) => [row2.id, row2])).values()];
      if (!outgoing.length && !incoming.length) return "";
      const collapse = api.state().display?.collapseReferences !== false, simple = outgoing.length + incoming.length <= 2 && (outgoing.length === 1 || incoming.length === 1), expanded = relatedExpanded.has(m.id), showRows = !collapse || simple || expanded;
      const counts = [outgoing.length ? `\u5F15\u7528 ${outgoing.length} \u6761` : "", incoming.length ? `\u88AB ${incoming.length} \u6761\u7B14\u8BB0\u5F15\u7528` : ""].filter(Boolean).join(" \xB7 ");
      const relationRow = (item, kind, firstIncoming = false) => `<button type="button" class="related-memo ${kind === "incoming" ? "reference-incoming" : ""} ${firstIncoming ? "reference-group-start" : ""}" data-related-open="${esc(item.id)}" data-related-kind="${kind}" ${item.missing ? "disabled" : ""} title="${esc(sourceSummary(item))}" aria-label="${esc(sourceSummary(item))}"><span class="ref-arrow" aria-hidden="true">${icon2(kind === "incoming" ? "backlinkedMemo" : "linkedMemo")}</span><span class="related-memo-text">${esc(sourceSummary(item))}</span></button>`;
      let html = '<div class="related-memos">';
      if (collapse && !simple) html += `<button type="button" class="related-memos-toggle" data-related-toggle="${esc(m.id)}" aria-expanded="${expanded}"><span>${counts}</span>${icon2("down")}</button>`;
      if (showRows) html += `<div class="related-list">${outgoing.map((item) => relationRow(item, "outgoing")).join("")}${incoming.map((item, index) => relationRow(item, "incoming", index === 0 && (!collapse || !simple))).join("")}</div>`;
      return html + "</div>";
    }
    function showSimilar(id) {
      openDetail(id, "similar");
    }
    function showRelated(id) {
      openDetail(id, "auto");
    }
    function chooseRelation() {
      api.modal("\u5173\u8054\u7B14\u8BB0", '<div class="relation-picker"><label class="relation-search" aria-label="\u641C\u7D22\u7B14\u8BB0"><span data-icon="search"></span><input id="relationSearch" placeholder="\u641C\u7D22\u7B14\u8BB0\u5185\u5BB9\u6216\u6807\u7B7E" autocomplete="off"></label><p id="relationCount" role="status"></p><div id="relationChoices" role="listbox" aria-label="\u53EF\u5173\u8054\u7684\u7B14\u8BB0"></div></div>');
      const draw = () => {
        const query = $2("#relationSearch").value.trim(), rows = api.state().memos.filter((m) => !m.deleted && m.id !== api.editingId() && MemoCore.matches(m.content, query)).sort((a, b) => Date.parse(b.created) - Date.parse(a.created)), root = $2("#relationChoices");
        root.replaceChildren();
        $2("#relationCount").textContent = rows.length > 100 ? `\u627E\u5230 ${rows.length} \u6761\uFF0C\u663E\u793A\u524D 100 \u6761\uFF1B\u7EE7\u7EED\u8F93\u5165\u53EF\u7F29\u5C0F\u8303\u56F4` : `\u627E\u5230 ${rows.length} \u6761\u7B14\u8BB0`;
        for (const m of rows.slice(0, 100)) {
          const item = row(m, { open: (id) => api.link(id) });
          item.setAttribute("role", "option");
          root.append(item);
        }
        if (!rows.length) root.innerHTML = '<p class="detail-empty">\u6CA1\u6709\u5339\u914D\u7684\u7B14\u8BB0\uFF0C\u8BD5\u8BD5\u5176\u4ED6\u5173\u952E\u8BCD\u3002</p>';
      };
      $2("#relationSearch").oninput = draw;
      $2("#relationSearch").onkeydown = (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          $2("#relationChoices button")?.focus();
        }
      };
      draw();
      $2("#relationSearch").focus();
    }
    function historyWhen(value) {
      const d = new Date(value);
      if (!Number.isFinite(d.getTime())) return "";
      const day = (date2) => {
        const x = new Date(date2);
        return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      };
      const days = Math.floor((day(Date.now()) - day(d)) / 864e5);
      const pad = (n) => String(n).padStart(2, "0"), clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      if (days === 0) return "\u4ECA\u65E5 " + clock;
      if (days === 1) return "\u6628\u65E5 " + clock;
      if (days >= 2 && days <= 6) return days + " \u5929\u524D " + clock;
      return historyFull(value);
    }
    function historyFull(value) {
      const d = new Date(value), pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    function showHistory(id) {
      const m = note(id);
      if (!m) return;
      const historyBase = MemoCore.clone(m), editingAtOpen = api.editingId() === id;
      const cutoff = Date.now() - 30 * 864e5, recent = (value) => {
        const time = Date.parse(value.created);
        return !Number.isFinite(time) || time >= cutoff;
      };
      const candidates = [...(m.history || []).map((value) => ({ kind: "saved", label: "\u6B63\u6587\u53D8\u5316", value })), ...api.draftVersions(id).map((value) => ({ kind: "draft", label: "\u672C\u5730\u8349\u7A3F", value }))].filter((item) => recent(item.value)).sort((a, b) => Date.parse(b.value.created) - Date.parse(a.value.created));
      const grouped = /* @__PURE__ */ new Map();
      for (const item of candidates) {
        const time = Date.parse(item.value.created);
        if (!Number.isFinite(time)) continue;
        const key = Math.floor(time / 6e4);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(item);
      }
      const allVersions = [...grouped].sort((a, b) => b[0] - a[0]).map(([, entries]) => {
        entries.sort((a, b) => Date.parse(b.value.created) - Date.parse(a.value.created));
        return entries.find((item) => item.kind === "saved") || entries[0];
      });
      let chosen = null, loading = false;
      api.modal("\u5386\u53F2\u7248\u672C", `<section class="history-panel"><div class="history-layout"><aside class="history-sidebar"><nav id="historyVersions" aria-label="\u9009\u62E9\u5386\u53F2\u7248\u672C"></nav><p class="history-empty" id="historyEmpty" hidden>\u6682\u65E0\u5386\u53F2\u7248\u672C</p><p class="history-tip">\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u4FDD\u5B58 30 \u5929\u5185\u7F16\u8F91\u8FC7\u7684\u5386\u53F2\u7248\u672C\uFF0C</p></aside><section class="history-document"><div class="history-document-head"><time id="historyLabel" role="status" aria-live="polite"></time><button id="loadHistory" type="button" disabled>\u6062\u590D</button></div><p class="history-restore-tip">\u8BE5\u65E7\u7248\u672C\u53EA\u80FD\u6062\u590D\u6B63\u6587\uFF0C\u5F53\u524D\u9644\u4EF6\u4F1A\u4FDD\u7559</p><article class="history-preview-card"><div id="historyPreview" class="memo-content"></div></article><p id="historyStatus" role="status"></p></section></div><div id="historyRestoreConfirm" class="history-restore-confirm" hidden><section class="history-restore-card" role="alertdialog" aria-modal="true" aria-labelledby="historyRestoreTitle" aria-describedby="historyRestoreText"><h3 id="historyRestoreTitle">\u6062\u590D</h3><p id="historyRestoreText"></p><div><button id="historyRestoreCancel" type="button">\u53D6\u6D88</button><button id="historyRestoreContinue" class="primary-button" type="button">\u6062\u590D</button></div></section></div></section>`);
      const panel = $2(".history-panel"), title2 = $2("#dialogTitle"), header = title2.parentElement, back = document.createElement("button"), narrow = matchMedia("(max-width:419px)");
      back.type = "button";
      back.className = "history-back";
      back.setAttribute("aria-label", "\u8FD4\u56DE\u5386\u53F2\u7248\u672C\u5217\u8868");
      back.textContent = "\u2039";
      header.insertBefore(back, title2);
      let mobileDetail = false;
      const syncHistoryLayout = () => {
        if (!panel.isConnected) return;
        panel.classList.toggle("history-mobile-detail", narrow.matches && mobileDetail);
        back.hidden = !(narrow.matches && mobileDetail);
        title2.textContent = narrow.matches && mobileDetail && chosen ? historyWhen(chosen.value.created) : "\u5386\u53F2\u7248\u672C";
      };
      back.onclick = () => {
        mobileDetail = false;
        syncHistoryLayout();
        $2("#historyVersions [aria-pressed=true]")?.focus({ preventScroll: true });
      };
      const onResize = () => {
        if (!narrow.matches) mobileDetail = false;
        syncHistoryLayout();
      };
      narrow.addEventListener("change", onResize);
      $2("#dialog").addEventListener("close", () => {
        narrow.removeEventListener("change", onResize);
        back.remove();
      }, { once: true });
      const preview = (item) => {
        if (loading) return;
        chosen = item;
        $2("#historyStatus").textContent = "";
        $2("#historyLabel").textContent = historyFull(item.value.created);
        $2("#historyLabel").dateTime = item.value.created;
        $2("#historyPreview").innerHTML = api.rich(item.value);
        $2("#loadHistory").disabled = m.deleted || editingAtOpen;
        if (editingAtOpen) $2("#historyStatus").textContent = "\u8BF7\u5148\u4FDD\u5B58\u6216\u53D6\u6D88\u5F53\u524D\u7F16\u8F91\uFF0C\u518D\u6062\u590D\u5386\u53F2\u7248\u672C";
        $2("#historyVersions").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.index) === allVersions.indexOf(item))));
        $2(".history-document").scrollTop = 0;
      };
      const draw = () => {
        const visible = allVersions;
        $2("#historyEmpty").hidden = visible.length > 0;
        const nav = $2("#historyVersions");
        nav.replaceChildren();
        visible.forEach((item) => {
          const index = allVersions.indexOf(item), b = document.createElement("button");
          b.type = "button";
          b.dataset.index = index;
          b.dataset.kind = item.kind;
          b.className = "history-version";
          b.setAttribute("aria-pressed", String(item === chosen));
          b.setAttribute("aria-controls", "historyPreview");
          b.innerHTML = `<time datetime="${item.value.created}">${esc(historyWhen(item.value.created))}</time><span>${esc(item.label || item.value.content.length + " \u5B57")}</span>`;
          b.onclick = () => {
            preview(item);
            if (narrow.matches) {
              mobileDetail = true;
              syncHistoryLayout();
              $2("#loadHistory").focus({ preventScroll: true });
            }
          };
          nav.append(b);
        });
        if (!chosen || !visible.includes(chosen)) chosen = visible[0] || null;
        if (chosen) preview(chosen);
        else {
          $2("#historyLabel").textContent = "";
          $2("#historyPreview").replaceChildren();
          $2("#loadHistory").disabled = true;
        }
      };
      $2("#historyVersions").onkeydown = (e) => {
        if (loading || !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
        const items = [...$2("#historyVersions").querySelectorAll("button")], index = items.indexOf(document.activeElement);
        e.preventDefault();
        const next = items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: "nearest" });
        next.click();
      };
      const restoreVersion = async () => {
        if (loading || api.busy() || !chosen || m.deleted) return;
        loading = true;
        $2("#loadHistory").disabled = true;
        $2("#historyVersions").querySelectorAll("button").forEach((b) => b.disabled = true);
        try {
          if (!await api.restoreHistoryCommit(id, chosen.value, historyBase) && $2("#historyStatus")) $2("#historyStatus").textContent = "\u6062\u590D\u672A\u5B8C\u6210\uFF0C\u8BF7\u91CD\u8BD5";
        } catch (error) {
          if ($2("#historyStatus")) $2("#historyStatus").textContent = error.message;
        } finally {
          loading = false;
          if ($2("#loadHistory")) {
            $2("#loadHistory").disabled = m.deleted || !chosen;
            $2("#historyVersions").querySelectorAll("button").forEach((b) => b.disabled = false);
          }
        }
      };
      const hideRestore = () => {
        const box = $2("#historyRestoreConfirm");
        if (!box || box.hidden) return;
        box.hidden = true;
        if ($2("#loadHistory")) $2("#loadHistory").focus({ preventScroll: true });
      };
      $2("#loadHistory").onclick = () => {
        if (loading || api.busy() || !chosen || m.deleted) return;
        const box = $2("#historyRestoreConfirm");
        $2("#historyRestoreText").textContent = `\u6062\u590D\u5230\u6B64\u7248\u672C\uFF1F${historyFull(chosen.value.created)} \xB7 ${chosen.value.content.length} \u5B57`;
        box.hidden = false;
        $2("#historyRestoreCancel").focus({ preventScroll: true });
      };
      $2("#historyRestoreCancel").onclick = hideRestore;
      $2("#historyRestoreContinue").onclick = async () => {
        const box = $2("#historyRestoreConfirm");
        box.hidden = true;
        await restoreVersion();
      };
      $2("#historyRestoreConfirm").onclick = (event) => {
        if (event.target.id === "historyRestoreConfirm") hideRestore();
      };
      $2("#historyRestoreConfirm").onkeydown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          hideRestore();
        }
      };
      draw();
      syncHistoryLayout();
    }
    async function openWindow(id, floating) {
      try {
        await window.memoDesktop.openNote(id, floating);
      } catch (error) {
        const message = error && error.message || "";
        api.toast(message.startsWith("\u6D6E\u7A97\u5185\u7B14\u8BB0\u5DF2\u6EE1") ? message : "\u65E0\u6CD5\u6253\u5F00\u7B14\u8BB0\u7A97\u53E3\uFF1A" + message);
      }
    }
    function positionMenu(menu) {
      menu.style.position = "fixed";
      menu.style.top = "0";
      menu.style.left = "0";
      const rect = menu.closest(".memo").querySelector(".memo-menu-button").getBoundingClientRect(), size = menu.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(innerWidth - size.width - 8, rect.right - size.width)) + "px";
      menu.style.top = Math.max(8, Math.min(innerHeight - size.height - 8, rect.bottom + 5)) + "px";
      menu.style.maxHeight = innerHeight - 16 + "px";
      menu.style.overflowY = "auto";
      if (menu.querySelector(".memo-more-menu:not([hidden])")) toggleMore(menu, true);
    }
    function positionMenuAt(menu, left, top) {
      if (!menu) return;
      menu.style.position = "fixed";
      menu.style.top = "0";
      menu.style.left = "0";
      const size = menu.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(innerWidth - size.width - 8, left)) + "px";
      menu.style.top = Math.max(8, Math.min(innerHeight - size.height - 8, top)) + "px";
      menu.style.maxHeight = innerHeight - 16 + "px";
      menu.style.overflowY = "auto";
      if (menu.querySelector(".memo-more-menu:not([hidden])")) toggleMore(menu, true);
    }
    function exitSelection() {
      selecting = false;
      selected.clear();
      selectionAnchor = "";
      drawSelection();
      ($2("#multiSelect").getClientRects().length ? $2("#multiSelect") : $2("#sortButton")).focus({ preventScroll: true });
    }
    function selectNote(id, checked, range = false) {
      const ids = api.filtered().map((m) => m.id), start = ids.indexOf(selectionAnchor), end = ids.indexOf(id);
      const targets = range && start >= 0 && end >= 0 ? ids.slice(Math.min(start, end), Math.max(start, end) + 1) : [id];
      for (const target of targets) checked ? selected.add(target) : selected.delete(target);
      selectionAnchor = id;
      drawSelection();
    }
    function drawSelection() {
      const selectable = !["insight", "stats", "find"].includes(api.view());
      $2("#multiSelect").hidden = !selectable;
      if (!selectable) {
        selecting = false;
        selected.clear();
      }
      document.body.classList.toggle("selecting-notes", selecting);
      $2("#bulkBar").hidden = !selecting;
      $2("#multiSelect").setAttribute("aria-pressed", String(selecting));
      $2("#bulkCount").textContent = "\u5DF2\u9009\u62E9 " + selected.size + " \u6761";
      const count = api.filtered().length;
      $2("#bulkSelectAll").textContent = count && selected.size === count ? "\u53D6\u6D88\u5168\u9009" : "\u5168\u9009\u5F53\u524D\u7ED3\u679C\uFF08" + count + "\uFF09";
      const loaded = document.querySelectorAll("#memos>.memo").length;
      $2("#bulkScope").textContent = `\u5F53\u524D\u7ED3\u679C ${count} \u6761${count > loaded ? " \xB7 \u5DF2\u52A0\u8F7D " + loaded + " \u6761" : ""} \xB7 \u5168\u9009\u5305\u542B\u672A\u52A0\u8F7D\u7B14\u8BB0`;
      $2("#bulkSelectAll").disabled = !count || api.busy();
      for (const name of ["bulkTag", "bulkCopy", "bulkDelete"]) $2("#" + name).disabled = !selected.size || api.busy();
      $2("#bulkTag").hidden = api.view() === "trash";
      $2("#bulkDelete").textContent = api.view() === "trash" ? "\u6279\u91CF\u6062\u590D" : "\u79FB\u5165\u56DE\u6536\u7AD9";
      document.querySelectorAll(".memo").forEach((article) => {
        const checked = selected.has(article.dataset.id);
        article.classList.toggle("is-selected", checked);
        const box = article.querySelector(".memo-selection");
        if (box) {
          box.hidden = !selecting;
          box.querySelector("input").checked = checked;
        }
      });
    }
    function beginSelection(id) {
      if (["insight", "stats"].includes(api.view())) return;
      context = api.context();
      selecting = true;
      if (id) selected.add(id);
      api.closeMenu();
      api.render();
    }
    function batchTagDialog() {
      api.modal("\u6279\u91CF\u6DFB\u52A0\u6807\u7B7E", `<p>\u4E3A\u6240\u9009 ${selected.size} \u6761\u7B14\u8BB0\u6DFB\u52A0\u6807\u7B7E\u3002\u5DF2\u6709\u6807\u7B7E\u4E0D\u4F1A\u91CD\u590D\u6DFB\u52A0\u3002</p><label for="bulkTagInput">\u6807\u7B7E\u540D\u79F0</label><input id="bulkTagInput" list="bulkTagOptions" placeholder="\u4F8B\u5982\uFF1A\u9605\u8BFB/\u6458\u5F55 \u5DE5\u4F5C"><datalist id="bulkTagOptions"></datalist><p class="dialog-hint">\u591A\u4E2A\u6807\u7B7E\u7528\u7A7A\u683C\u6216\u9017\u53F7\u5206\u9694\u3002\u53EA\u6DFB\u52A0\u6240\u586B\u6807\u7B7E\uFF0C\u4E0D\u66FF\u6362\u539F\u6709\u6807\u7B7E\u3002</p><div id="bulkTagPreview" class="bulk-tag-preview" role="status" aria-live="polite"></div><p id="bulkStatus" role="status"></p><div class="dialog-actions"><button id="cancelBulkOperation">\u53D6\u6D88</button><button id="confirmBulkTag" class="primary-button">\u6DFB\u52A0\u6807\u7B7E</button></div>`);
      const parseTags = () => [...new Set($2("#bulkTagInput").value.split(/[\s,，]+/).filter(Boolean).map(MemoCore.normalizeTag))];
      $2("#cancelBulkOperation").onclick = () => $2("#dialog").close();
      $2("#bulkTagInput").oninput = () => {
        const tags2 = parseTags(), root = $2("#bulkTagPreview");
        root.replaceChildren();
        $2("#bulkStatus").textContent = "";
        if (!tags2.length || tags2.some((t) => !MemoCore.validTag(t))) return;
        for (const tag of tags2) {
          const count = selectedRows().filter((m) => !MemoCore.tagsOf(m.content).includes(tag)).length, p = document.createElement("p");
          p.textContent = "#" + tag + " \xB7 \u5C06\u6DFB\u52A0\u5230 " + count + " \u6761\u7B14\u8BB0" + (count < selected.size ? " \xB7 " + (selected.size - count) + " \u6761\u5DF2\u5305\u542B" : "");
          root.append(p);
        }
      };
      const tags = [.../* @__PURE__ */ new Set([...api.state().extraTags, ...api.state().memos.filter((m) => !m.deleted).flatMap((m) => MemoCore.tagsOf(m.content))])];
      for (const tag of tags) {
        const option = document.createElement("option");
        option.value = tag;
        $2("#bulkTagOptions").append(option);
      }
      $2("#confirmBulkTag").onclick = async () => {
        const tags2 = [...new Set($2("#bulkTagInput").value.split(/[\s,，]+/).filter(Boolean).map(MemoCore.normalizeTag))];
        if (!tags2.length || tags2.some((tag) => !MemoCore.validTag(tag))) {
          $2("#bulkStatus").textContent = "\u8BF7\u8F93\u5165\u6709\u6548\u6807\u7B7E\uFF0C\u4F8B\u5982 \u9605\u8BFB/\u6458\u5F55";
          return;
        }
        if (selectedRows().every((m) => tags2.every((tag) => MemoCore.tagsOf(m.content).includes(tag)))) {
          $2("#bulkStatus").textContent = "\u6240\u9009\u7B14\u8BB0\u5DF2\u5305\u542B\u8FD9\u4E9B\u6807\u7B7E\uFF0C\u65E0\u9700\u91CD\u590D\u6DFB\u52A0\u3002";
          return;
        }
        await commitBatch("tag", tags2);
      };
      $2("#bulkTagInput").focus();
    }
    function batchDeleteDialog() {
      const restore = api.view() === "trash";
      api.modal(restore ? "\u6279\u91CF\u6062\u590D" : "\u79FB\u5165\u56DE\u6536\u7AD9", `<p>${restore ? "\u6062\u590D" : "\u5C06"}\u6240\u9009 ${selected.size} \u6761\u7B14\u8BB0${restore ? "\u5230\u5168\u90E8\u7B14\u8BB0" : "\u79FB\u5165\u56DE\u6536\u7AD9"}\uFF1F${restore ? "" : "\u5185\u5BB9\u4ECD\u53EF\u5728\u56DE\u6536\u7AD9\u4E2D\u627E\u56DE\u3002"}</p><p id="bulkStatus" role="status"></p><div class="dialog-actions"><button id="cancelBulkOperation">\u53D6\u6D88</button><button id="confirmBulkDelete" class="${restore ? "primary-button" : "danger"}">${restore ? "\u6062\u590D" : "\u79FB\u5165\u56DE\u6536\u7AD9"}</button></div>`);
      $2("#cancelBulkOperation").onclick = () => $2("#dialog").close();
      $2("#confirmBulkDelete").onclick = () => commitBatch(restore ? "restore" : "delete");
    }
    async function commitBatch(operation, tags = []) {
      if (api.busy()) return;
      const ids = [...selected];
      if (ids.includes(api.editingId())) {
        $2("#bulkStatus").textContent = "\u6240\u9009\u7B14\u8BB0\u4E2D\u6709\u6B63\u5728\u7F16\u8F91\u7684\u8BB0\u5F55\uFF0C\u8BF7\u5148\u4FDD\u5B58\u6216\u53D6\u6D88\u7F16\u8F91\u3002";
        return;
      }
      const affected = operation === "tag" ? selectedRows().filter((m) => tags.some((tag) => !MemoCore.tagsOf(m.content).includes(tag))).length : ids.length;
      const before = MemoCore.clone(api.state()), controls = [...$2("#dialog").querySelectorAll("button,input")], block = (e) => e.preventDefault();
      controls.forEach((b) => b.disabled = true);
      $2("#dialog").addEventListener("cancel", block);
      $2("#bulkStatus").textContent = "\u6B63\u5728\u4FDD\u5B58\u2026";
      try {
        let desired = before;
        if (operation === "tag") for (const tag of tags) desired = MemoCore.batch(desired, ids, "tag", tag);
        else desired = MemoCore.batch(desired, ids, operation);
        if (!await api.commit(desired)) {
          $2("#bulkStatus").textContent = "\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u6240\u9009\u7B14\u8BB0\u4FDD\u7559\u3002\u53EF\u5237\u65B0\u540E\u91CD\u8BD5\u3002";
          return;
        }
        const after = MemoCore.clone(api.state());
        $2("#dialog").close();
        exitSelection();
        api.toast(operation === "tag" ? "\u5DF2\u4E3A " + affected + " \u6761\u7B14\u8BB0\u6DFB\u52A0\u6807\u7B7E" + (affected < ids.length ? "\uFF0C\u5176\u4F59\u7B14\u8BB0\u5DF2\u5305\u542B" : "") : operation === "delete" ? "\u5DF2\u5C06 " + ids.length + " \u6761\u7B14\u8BB0\u79FB\u5165\u56DE\u6536\u7AD9" : "\u5DF2\u6062\u590D " + ids.length + " \u6761\u7B14\u8BB0", () => api.undo(before, after));
      } catch (error) {
        $2("#bulkStatus").textContent = error.message;
      } finally {
        controls.forEach((b) => b.disabled = false);
        $2("#dialog").removeEventListener("cancel", block);
        drawSelection();
      }
    }
    async function copySelected() {
      const rows = selectedRows(), text = rows.map((m) => m.content).join("\n\n---\n\n");
      if (!rows.length) return;
      try {
        if (window.ClipboardItem && navigator.clipboard?.write) {
          const html = rows.map((m) => api.rich(m)).join("<hr>");
          await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]);
        } else await navigator.clipboard.writeText(text);
        exitSelection();
        api.toast("\u5DF2\u590D\u5236 " + rows.length + " \u6761\u7B14\u8BB0");
      } catch {
        api.modal("\u590D\u5236\u6240\u9009\u7B14\u8BB0", '<p>\u8BF7\u9009\u62E9\u4E0B\u65B9\u5185\u5BB9\u5E76\u590D\u5236\u3002</p><textarea id="bulkCopyText" readonly rows="12"></textarea>');
        $2("#bulkCopyText").value = text;
        $2("#bulkCopyText").focus();
        $2("#bulkCopyText").select();
      }
    }
    window.MemoInteractions = {
      init(handlers) {
        api = handlers;
        context = api.context();
        $2("#linkMemo").onclick = chooseRelation;
        renderFloat();
        const toggle = document.createElement("button");
        toggle.id = "multiSelect";
        toggle.type = "button";
        toggle.className = "multi-select-toggle";
        toggle.textContent = "\u591A\u9009";
        toggle.setAttribute("aria-pressed", "false");
        toggle.onclick = () => selecting ? exitSelection() : beginSelection();
        $2(".title-row").append(toggle);
        const bar = document.createElement("section");
        bar.id = "bulkBar";
        bar.hidden = true;
        bar.className = "bulk-bar";
        bar.setAttribute("aria-label", "\u6279\u91CF\u64CD\u4F5C");
        bar.innerHTML = '<span id="bulkCount" role="status"></span><span id="bulkScope" class="bulk-scope"></span><button id="bulkSelectAll">\u5168\u9009\u5F53\u524D\u7ED3\u679C</button><button id="bulkTag">\u6DFB\u52A0\u6807\u7B7E</button><button id="bulkCopy">\u590D\u5236</button><button id="bulkDelete">\u79FB\u5165\u56DE\u6536\u7AD9</button><button id="bulkExit" aria-label="\u9000\u51FA\u591A\u9009">\u9000\u51FA</button>';
        $2("#memos").before(bar);
        $2("#bulkExit").onclick = exitSelection;
        $2("#bulkSelectAll").onclick = () => {
          const ids = api.filtered().map((m) => m.id);
          selected = selected.size === ids.length ? /* @__PURE__ */ new Set() : new Set(ids);
          selectionAnchor = "";
          drawSelection();
        };
        $2("#bulkTag").onclick = batchTagDialog;
        $2("#bulkDelete").onclick = batchDeleteDialog;
        $2("#bulkCopy").onclick = copySelected;
        document.addEventListener("pointerdown", (e) => {
          if (!e.target.closest(".memo-menu,.memo-menu-button") && $2(".memo-menu")) api.closeMenu();
        });
        document.addEventListener("click", (e) => {
          const link = e.target.closest("[data-memo-id]");
          if (link && !link.closest("#editor")) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = note(link.dataset.memoId);
            if (!target || target.deleted) {
              api.toast("\u5173\u8054\u7B14\u8BB0\u6682\u4E0D\u53EF\u7528");
              return;
            }
            openDetail(target.id, "quoted");
            return;
          }
          const article = e.target.closest(".memo");
          if (selecting && article && !e.target.closest("button,a,input,label") && getSelection().isCollapsed) {
            e.preventDefault();
            e.stopImmediatePropagation();
            selectNote(article.dataset.id, !selected.has(article.dataset.id), e.shiftKey);
          }
        }, true);
        document.addEventListener("keydown", (e) => {
          const menu = e.target.closest?.(".memo-menu");
          if (menu) {
            const scope = e.target.closest(".memo-more-menu") || menu, items = [...scope.querySelectorAll("button")].filter((b) => b.getClientRects().length && (scope !== menu || !b.closest(".memo-more-menu"))), index = items.indexOf(document.activeElement);
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
            }
            if (e.key === "ArrowRight" && e.target.dataset.action === "more") {
              e.preventDefault();
              toggleMore(menu, true);
              menu.querySelector(".memo-more-menu button")?.focus();
            }
            if (e.key === "ArrowLeft" && scope !== menu) {
              e.preventDefault();
              toggleMore(menu, false);
              menu.querySelector("[data-action=more]").focus();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopImmediatePropagation();
              const id = menu.closest(".memo").dataset.id;
              api.closeMenu();
              document.querySelector(`[data-id="${id}"] .memo-menu-button`)?.focus();
            }
            return;
          }
          if (!selecting || $2("#dialog").open || $2("#lightbox").open || e.isComposing) return;
          const editable = e.target.isContentEditable || e.target.closest("input,textarea,select");
          if (editable) return;
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            exitSelection();
          }
          if ((e.key === "Delete" || e.key === "Backspace") && selected.size) {
            e.preventDefault();
            e.stopImmediatePropagation();
            batchDeleteDialog();
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && selecting) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const ids = api.filtered().map((m) => m.id);
            selected = selected.size === ids.length ? /* @__PURE__ */ new Set() : new Set(ids);
            selectionAnchor = "";
            drawSelection();
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selected.size) {
            e.preventDefault();
            copySelected();
          }
        }, true);
        $2("#dialog").addEventListener("close", restoreDetailOrigin);
        $2("#memos").addEventListener("scroll", () => {
          const menu = $2(".memo-menu");
          if (menu) positionMenu(menu);
        });
        window.addEventListener("resize", () => api.closeMenu());
        if (window.memoDesktop) {
          window.memoDesktop.onOpenMemo(async (id) => {
            await api.refresh();
            const m = note(id);
            if (m && !m.deleted) {
              openDetail(id);
            } else api.toast("\u539F\u7B14\u8BB0\u5DF2\u79FB\u9664");
          });
          window.memoDesktop.onOpenMemoLinkError?.(() => api.toast("\u7B14\u8BB0\u94FE\u63A5\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u590D\u5236\u5B8C\u6574\u94FE\u63A5"));
        }
      },
      finishDetailEdit,
      openDetail,
      openDatePicker,
      openMemoInsight,
      showRelated,
      showSimilar,
      chooseRelation,
      showHistory,
      positionMenu,
      positionMenuAt,
      toggleMore,
      isSelecting: () => selecting,
      async menuAction(action, m) {
        if (action === "share") {
          openShareImage(m, api);
          return true;
        }
        if (action === "copy-link") {
          await copyReference(m);
          return true;
        }
        if (action === "insight") {
          openMemoInsight(m);
          return true;
        }
        if (action === "related") {
          showRelated(m.id);
          return true;
        }
        if (action === "similar") {
          api.modal("\u76F8\u5173\u7B14\u8BB0", '<div id="similarNotes"></div>');
          const list = MemoCore.related(api.state().memos, m.id), root = $2("#similarNotes");
          for (const item of list) root.append(row(item.memo));
          if (!list.length) root.textContent = "\u6682\u65E0\u76F8\u5173\u7B14\u8BB0\uFF0C\u53EF\u901A\u8FC7\u5171\u540C\u6807\u7B7E\u6216\u5F15\u7528\u5173\u8054\u8BB0\u5F55\u3002";
          return true;
        }
        return false;
      },
      async action(action, m) {
        if (action === "detail") {
          openDetail(m.id);
          return true;
        }
        if (action === "annotate") {
          api.annotate(m.id);
          return true;
        }
        if (action === "history") {
          showHistory(m.id);
          return true;
        }
        if (action === "select") {
          beginSelection(m.id);
          return true;
        }
        if (action === "window") {
          await openWindow(m.id, false);
          return true;
        }
        if (action === "float") {
          addFloat(m.id);
          return true;
        }
        if (action === "related") {
          showRelated(m.id);
          return true;
        }
        return false;
      },
      render() {
        if (!api) return;
        const referenceCollapse = api.state().display?.collapseReferences !== false;
        if (lastReferenceCollapse !== null && lastReferenceCollapse !== referenceCollapse) relatedExpanded.clear();
        lastReferenceCollapse = referenceCollapse;
        if (context !== api.context()) {
          selected.clear();
          selectionAnchor = "";
          selecting = false;
          context = api.context();
        }
        const visible = new Set(api.filtered().map((m) => m.id));
        selected = new Set([...selected].filter((id) => visible.has(id)));
        document.querySelectorAll(".memo").forEach((article) => {
          if (article.classList.contains("inline-edit-card")) return;
          const m = note(article.dataset.id);
          if (!m) return;
          MemoMarkup.highlight(article.querySelector(".memo-content"), api.query());
          const menu = article.querySelector(".memo-menu");
          if (menu && !menu.dataset.refined) {
            buildNoteMenu(menu, m);
          }
          if (menu) {
            menu.setAttribute("role", "menu");
            menu.setAttribute("aria-label", "\u7B14\u8BB0\u64CD\u4F5C");
            menu.querySelectorAll("button").forEach((b) => b.setAttribute("role", "menuitem"));
            positionMenu(menu);
          }
          const head = article.querySelector(".memo-head");
          if (head && !article.querySelector(".memo-selection")) {
            const label = document.createElement("label");
            label.className = "memo-selection";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.setAttribute("aria-label", "\u9009\u62E9\u7B14\u8BB0\uFF1A" + title(m));
            checkbox.onclick = (e) => selectNote(m.id, checkbox.checked, e.shiftKey);
            label.append(checkbox);
            head.prepend(label);
          }
          article.querySelector(".source-link")?.remove();
          article.querySelector(".reference-summary")?.remove();
          article.querySelector(".related-memos")?.remove();
          const links = MemoCore.relationships(api.state().memos, m.id), related = relatedMarkup(m, links);
          if (related) {
            article.insertAdjacentHTML("beforeend", related);
            const toggle = article.querySelector("[data-related-toggle]");
            if (toggle) toggle.onclick = (e) => {
              e.stopPropagation();
              if (relatedExpanded.has(m.id)) relatedExpanded.delete(m.id);
              else relatedExpanded.add(m.id);
              window.MemoInteractions.render();
              article.querySelector("[data-related-toggle]")?.focus({ preventScroll: true });
            };
            for (const button of article.querySelectorAll("[data-related-open]")) {
              button.onclick = (e) => {
                e.stopPropagation();
                const id = button.dataset.relatedOpen;
                if (!id) return;
                openDetail(button.dataset.relatedKind === "incoming" ? m.id : id, "quoted");
              };
            }
          }
        });
        drawSelection();
      },
      focusMenu(keyboard = true) {
        const focus = () => {
          const menu = $2(".memo-menu");
          if (!menu) return false;
          menu.tabIndex = -1;
          (keyboard ? menu.querySelector("button") : menu)?.focus({ preventScroll: true });
          return true;
        };
        queueMicrotask(focus);
        setTimeout(focus, 0);
      },
      isBusy() {
        return api.busy();
      }
    };
  })();
})();
