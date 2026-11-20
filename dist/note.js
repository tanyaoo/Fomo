(() => {
  // src/note-metadata.js
  function absoluteNoteDate(value) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    body.style.setProperty("--memo-line-height", String(p.font === "default" && p.lineHeight === 1.8 ? 11 / 7 : p.lineHeight));
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

  // src/note-viewer.js
  installMediaFeedback();
  (() => {
    "use strict";
    document.querySelectorAll("[data-icon]").forEach((el) => {
      el.innerHTML = window.memoIcons[el.dataset.icon] || "";
    });
    const $ = (selector) => document.querySelector(selector);
    let floating = false, activeTheme = "light", loadRevision = 0, currentMemo = null, editing = false, saving = false, reading = false, editRevision = 0, editImages = [], dirty = false;
    function compactReferences(root, links) {
      const rows = Object.values(links || {}).flat(), map = new Map(rows.flatMap((item) => [[item.id, item], ...item.sourceSlug ? [[item.sourceSlug, item]] : []]));
      root.querySelectorAll("a[data-memo-id]").forEach((link) => {
        const source = map.get(link.dataset.memoId);
        if (!source) return;
        const stamp = typeof source.created === "string" ? source.created.slice(0, 16).replace("T", " ") : "";
        link.className = "memo-reference-link";
        link.textContent = "";
        const label = "\u67E5\u770B\u5173\u8054\u7B14\u8BB0\uFF1A" + (source.content || "").replace(/\s+/g, " ").slice(0, 80);
        link.setAttribute("aria-label", label);
        link.title = label;
      });
      root.querySelectorAll('a[href^="http"]:not([data-memo-id])').forEach((link) => {
        if (!/^https?:\/\//i.test(link.textContent.trim())) return;
        try {
          link.textContent = new URL(link.href).hostname + "...";
          link.className = "blank-memo-link";
        } catch {
        }
      });
    }
    const memoEditor = window.MemoEditor?.create($("#noteEditor"), { onFiles: (files) => addImages(files), onChange: () => {
      if (editing) {
        dirty = true;
        syncNativeState();
        $("#noteCharCount").textContent = String(memoEditor.getDisplayText().length);
      }
    } });
    const systemTheme = matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => document.body.classList.toggle("dark", activeTheme === "dark" || activeTheme === "system" && systemTheme.matches);
    systemTheme.addEventListener("change", () => {
      if (activeTheme === "system") applyTheme();
    });
    async function open(id) {
      try {
        await window.memoNote.open(id);
      } catch (error) {
        $("#noteWindowStatus").textContent = error.message;
      }
    }
    async function load() {
      const revision = ++loadRevision;
      try {
        const info = await window.memoNote.read();
        if (revision !== loadRevision) return;
        floating = info.floating;
        activeTheme = info.theme;
        applyTheme();
        applyDisplayPreferences(info.display);
        $("#floatNote").setAttribute("aria-pressed", String(floating));
        $("#floatNote").title = floating ? "\u53D6\u6D88\u7A97\u53E3\u7F6E\u9876" : "\u7A97\u53E3\u7F6E\u9876";
        $("#floatNote").setAttribute("aria-label", $("#floatNote").title);
        if (editing) return;
        $("#noteImages").replaceChildren();
        $("#noteAnnotations").replaceChildren();
        if (!info.memo) {
          $("#noteDate").textContent = "";
          $("#noteContent").textContent = "\u8FD9\u6761\u7B14\u8BB0\u6682\u4E0D\u53EF\u7528\u3002";
          $("#noteWindowStatus").textContent = "";
          $("#editNote").disabled = true;
          return;
        }
        if (editing) return;
        const m = MemoCore.validate({ memos: [info.memo] }).memos[0];
        currentMemo = m;
        $("#noteDate").textContent = absoluteNoteDate(m.created);
        $("#noteWindowTitle").textContent = absoluteNoteDate(m.created);
        document.title = "Fomo \xB7 " + absoluteNoteDate(m.created);
        $("#noteContent").innerHTML = MemoMarkup.rich(m);
        compactReferences($("#noteContent"), info.links);
        document.querySelector(".note-origin")?.remove();
        const origin = document.createElement("span");
        origin.className = "note-origin";
        origin.textContent = sourceLabel(m);
        $("#noteDate").after(origin);
        m.images.forEach((src, index) => {
          const image = document.createElement("img");
          image.src = src;
          image.alt = "\u7B14\u8BB0\u56FE\u7247 " + (index + 1);
          $("#noteImages").append(image);
        });
        if (m.audio) {
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.preload = "metadata";
          audio.src = m.audio;
          audio.setAttribute("aria-label", "\u7B14\u8BB0\u8BED\u97F3");
          $("#noteImages").append(audio);
        }
        if (m.video) {
          const video = document.createElement("video");
          video.controls = true;
          video.preload = "metadata";
          video.src = m.video;
          video.setAttribute("aria-label", "\u7B14\u8BB0\u89C6\u9891");
          $("#noteImages").append(video);
        }
        const groups = relationGroups(info.links);
        for (const [key, label] of [["annotations", "\u6279\u6CE8"], ["outgoing", "\u5F15\u7528\u7684\u7B14\u8BB0"], ["incoming", "\u5F15\u7528\u6B64\u7B14\u8BB0"]]) {
          if (key === "annotations") continue;
          const rows = key === "incoming" ? [...new Map([...groups.annotations, ...groups.incoming].map((n) => [n.id, n])).values()] : groups[key];
          if (!rows.length) continue;
          const root = referenceGroup($("#noteAnnotations"), label + " " + rows.length, key !== "annotations" && info.display?.collapseReferences);
          const heading = document.createElement("h3");
          heading.textContent = label + " " + rows.length;
          root.append(heading);
          for (const item of rows) {
            const b = document.createElement("button");
            b.className = "related-choice";
            b.textContent = (item.content.trim().replace(/\s+/g, " ").slice(0, 160) || "\u56FE\u7247\u7B14\u8BB0") + (item.deleted ? " \xB7 \u5728\u56DE\u6536\u7AD9\u4E2D" : "");
            b.disabled = !!item.missing;
            b.onclick = () => open(item.id);
            root.append(b);
          }
        }
        $("#editNote").disabled = m.deleted;
        $("#noteWindowStatus").textContent = m.deleted ? "\u539F\u7B14\u8BB0\u5728\u56DE\u6536\u7AD9\u4E2D\uFF0C\u53EF\u56DE\u4E3B\u7A97\u53E3\u6062\u590D\u3002" : "";
      } catch (error) {
        if (revision === loadRevision) $("#noteWindowStatus").textContent = "\u65E0\u6CD5\u8BFB\u53D6\uFF1A" + error.message;
      }
    }
    function showEditing(on) {
      editing = on;
      if (!on) dirty = false;
      syncNativeState();
      $("#noteContent").hidden = on;
      $("#noteImages").hidden = on;
      $("#noteAnnotations").hidden = on;
      $("#noteEditor").hidden = !on;
      $("#noteEditImages").hidden = !on;
      $("#noteFormatBar").hidden = !on;
      $("#editNote").hidden = on;
      document.body.classList.toggle("note-editing", on);
      if (on) $("#noteCharCount").textContent = String(memoEditor.getDisplayText().length);
    }
    function textblockPosition(event, content) {
      const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
      if (!range || !content?.contains(range.startContainer)) return null;
      const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
      const selector = "p,h1,h2,h3,h4,h5,h6,pre,li:not(:has(p,h1,h2,h3,h4,h5,h6,pre))", block = element?.closest(selector);
      if (!block || !content.contains(block)) return null;
      const blocks = [...content.querySelectorAll(selector)].filter((node) => !node.closest(".annotation-parent")), index = blocks.indexOf(block);
      if (index < 0) return null;
      const selected = document.createRange();
      selected.selectNodeContents(block);
      selected.setEnd(range.startContainer, range.startOffset);
      const fragment = selected.cloneContents();
      fragment.querySelectorAll("a[data-memo-id]").forEach((link) => link.textContent = "fomo://note/" + link.dataset.memoId);
      return { index, offset: fragment.textContent.length };
    }
    function startEditing(position = null) {
      if (!currentMemo || currentMemo.deleted || !memoEditor) return;
      if (editing || saving) return;
      let sourceLine = 0;
      if (position && currentMemo.annotationOf) {
        const normalized = window.MemoMarkup.referenceBody(currentMemo);
        if (normalized.content !== currentMemo.content) {
          if (!currentMemo.html) sourceLine = 1;
          else {
            const template = document.createElement("template");
            template.innerHTML = window.MemoMarkup.clean(currentMemo.html);
            const first = template.content.firstElementChild;
            if (first?.matches("p,div")) {
              const clone = first.cloneNode(true);
              clone.querySelectorAll("a[data-memo-id]").forEach((link) => link.remove());
              const text = clone.textContent.trim(), token = text.replace(/^关联自：\s*/, "");
              if (/^关联自：\s*$/.test(text) || text.startsWith("\u5173\u8054\u81EA\uFF1A") && MemoCore.memoIdFromToken(token) === currentMemo.annotationOf) sourceLine = 1;
            }
          }
        }
      }
      editRevision++;
      editImages = [...currentMemo.images];
      showEditing(true);
      renderEditImages();
      memoEditor.setHTML(currentMemo.html || MemoEditor.plainHTML(currentMemo.content));
      dirty = false;
      syncNativeState();
      memoEditor.focusTextBlock((position?.index ?? 0) + sourceLine, position?.offset ?? 0);
    }
    async function saveEditing() {
      if (!memoEditor || !currentMemo || !editing || saving || reading) return;
      const content = memoEditor.getText(), html = memoEditor.getHTML();
      if (!content.trim() && !editImages.length && !currentMemo.audio && !currentMemo.video) {
        $("#noteWindowStatus").textContent = "\u8FD9\u91CC\u8FD8\u6CA1\u6709\u5185\u5BB9\uFF0C\u5199\u4E0B\u4E00\u70B9\u518D\u4FDD\u5B58\u3002";
        return;
      }
      try {
        saving = true;
        syncEditControls();
        memoEditor.setEditable(false);
        await window.memoNote.save({ content, html, images: editImages, base: currentMemo });
        showEditing(false);
        currentMemo = null;
        await load();
        $("#noteWindowStatus").textContent = "\u5DF2\u4FDD\u5B58";
        setTimeout(() => {
          if (!editing && $("#noteWindowStatus").textContent === "\u5DF2\u4FDD\u5B58") $("#noteWindowStatus").textContent = "";
        }, 1800);
      } catch (error) {
        $("#noteWindowStatus").textContent = "\u4FDD\u5B58\u5931\u8D25\uFF1A" + error.message;
      } finally {
        saving = false;
        memoEditor.setEditable(true);
        syncEditControls();
      }
    }
    function cancelEditing() {
      if (saving) return;
      editRevision++;
      showEditing(false);
      currentMemo = null;
      load();
    }
    $("#noteContent").ondblclick = (event) => {
      if (event.target.closest("a,button,input,textarea")) return;
      startEditing(textblockPosition(event, $("#noteContent")));
    };
    $("#noteContent").onclick = (event) => {
      const link = event.target.closest("a[data-memo-id]");
      if (link) {
        event.preventDefault();
        open(link.dataset.memoId);
      }
    };
    $("#floatNote").onclick = async () => {
      try {
        await window.memoNote.setFloating(!floating);
        await load();
      } catch (error) {
        $("#noteWindowStatus").textContent = error.message;
      }
    };
    $("#composeNote").onclick = () => window.memoNote.compose().catch((e) => $("#noteWindowStatus").textContent = e.message);
    $("#closeNote").onclick = () => window.memoNote.close();
    document.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (editing && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        saveEditing();
        return;
      }
      if (editing && e.key === "Escape") {
        e.preventDefault();
        cancelEditing();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        $("#editNote").click();
      }
    });
    $("#editNote").onclick = async () => {
      try {
        await window.memoNote.edit();
      } catch (error) {
        $("#noteWindowStatus").textContent = error.message;
      }
    };
    $("#saveNote").onclick = saveEditing;
    $("#cancelNote").onclick = cancelEditing;
    $("#noteTag").onclick = () => memoEditor.insertText("#");
    $("#noteBold").onclick = () => memoEditor.command("bold");
    $("#noteList").onclick = () => memoEditor.command("list");
    $("#noteNumber").onclick = () => memoEditor.command("number");
    function syncNativeState() {
      window.memoNote.editState({ dirty: editing && (dirty || reading), saving: saving || reading }).catch(() => {
      });
    }
    function syncEditControls() {
      syncNativeState();
      $("#saveNote").disabled = saving || reading;
      $("#cancelNote").disabled = saving;
      $("#noteImage").disabled = saving || reading;
      $("#noteEditor").setAttribute("aria-busy", String(saving || reading));
      for (const id of ["noteTag", "noteBold", "noteList", "noteNumber"]) $("#" + id).disabled = saving;
    }
    function renderEditImages() {
      const root = $("#noteEditImages");
      root.replaceChildren();
      root.hidden = !editing;
      editImages.forEach((src, index) => {
        const item = document.createElement("div"), image = document.createElement("img"), remove = document.createElement("button");
        image.src = src;
        image.alt = "\u56FE\u7247 " + (index + 1);
        remove.type = "button";
        remove.textContent = "\u79FB\u9664";
        remove.disabled = saving || reading;
        remove.onclick = () => {
          if (saving || reading) return;
          editImages.splice(index, 1);
          dirty = true;
          syncNativeState();
          renderEditImages();
        };
        item.append(image, remove);
        root.append(item);
      });
    }
    async function addImages(files) {
      if (!editing || saving || reading) return;
      const revision = editRevision, list = Array.from(files), status = $("#noteWindowStatus");
      if (list.reduce((n, f) => n + f.size, 0) > 32 * 1024 * 1024) {
        status.textContent = "\u5355\u6B21\u56FE\u7247\u603B\u5927\u5C0F\u8BF7\u4E0D\u8D85\u8FC7 32 MB";
        return;
      }
      reading = true;
      syncEditControls();
      renderEditImages();
      let added = 0, failed = 0;
      try {
        for (let i = 0; i < list.length; i++) {
          if (revision !== editRevision || !editing) break;
          const file = list[i];
          if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 8 * 1024 * 1024) {
            failed++;
            continue;
          }
          try {
            const src = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onprogress = (e) => {
                if (revision === editRevision && editing) status.textContent = "\u56FE\u7247\u8BFB\u53D6\u4E2D " + (i + 1) + "/" + list.length + (e.lengthComputable ? " \xB7 " + Math.round(e.loaded / e.total * 100) + "%" : "");
              };
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(Error("\u56FE\u7247\u8BFB\u53D6\u5931\u8D25"));
              reader.onabort = () => reject(Error("\u56FE\u7247\u8BFB\u53D6\u5DF2\u53D6\u6D88"));
              reader.readAsDataURL(file);
            });
            if (revision !== editRevision || !editing) break;
            const decoded = new Image();
            decoded.src = src;
            await decoded.decode();
            if (revision !== editRevision || !editing) break;
            editImages.push(src);
            dirty = true;
            syncNativeState();
            added++;
          } catch {
            failed++;
          }
        }
        if (revision === editRevision && editing) status.textContent = failed ? "\u5DF2\u6DFB\u52A0 " + added + " \u5F20\uFF0C" + failed + " \u5F20\u672A\u6DFB\u52A0\uFF08\u683C\u5F0F\u3001\u5927\u5C0F\u6216\u8BFB\u53D6\u5931\u8D25\uFF09\uFF1B\u539F\u5185\u5BB9\u4FDD\u7559\u3002" : "";
      } finally {
        reading = false;
        syncEditControls();
        renderEditImages();
      }
    }
    $("#noteImage").onclick = () => $("#noteImageInput").click();
    $("#noteImageInput").onchange = (event) => {
      addImages(event.target.files);
      event.target.value = "";
    };
    window.memoNote.onChange(load);
    load();
  })();
})();
