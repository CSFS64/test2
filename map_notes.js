;(() => {
  // =========================
  // MapNotes global module
  // =========================

  const DEFAULT_POPUP_OPTS = {
    className: "mn-popup",
    minWidth: 1,
    maxWidth: 960,
    autoPan: true,
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k === "style") Object.assign(n.style, v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    children.forEach(c => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  // -------------------------
  // state
  // -------------------------
  const S = {
    map: null,
    L: null,
    apiBase: "",
    notesLayer: null,
    paneName: "mapNotePane",
    renderer: null,
    popupOpts: DEFAULT_POPUP_OPTS,

    // add-mode
    addMode: false,
    addClickHandler: null,

    // for caching
    approvedCache: [],
  };

  // -------------------------
  // core: init
  // -------------------------
  function init(opts) {
    if (!opts || !opts.map || !opts.L) throw new Error("MapNotes.init: missing map/L");

    S.map = opts.map;
    S.L = opts.L;
    S.apiBase = opts.apiBase || "";
    S.notesLayer = opts.notesLayer || S.L.layerGroup().addTo(S.map);
    S.paneName = opts.mapNotePane || "mapNotePane";
    S.renderer = opts.renderer || null;
    S.popupOpts = opts.popupOpts || DEFAULT_POPUP_OPTS;

    // ensure pane exists
    try {
      if (!S.map.getPane(S.paneName)) {
        S.map.createPane(S.paneName);
        S.map.getPane(S.paneName).style.zIndex = 650;
      }
    } catch (e) {}

    injectCssOnce();

    return window.MapNotes;
  }

  // -------------------------
  // API helpers
  // -------------------------
  async function fetchJson(url, options) {
    const res = await fetch(url, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options && options.headers ? options.headers : {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} :: ${text}`);
    }
    return res.json();
  }

  async function fetchJsonNoCache(url) {
    const u = new URL(url, location.href);
    u.searchParams.set("_ts", String(Date.now()));
    return fetchJson(u.toString(), { method: "GET" });
  }

  // -------------------------
  // marker rendering
  // -------------------------
  function addApprovedMarker(n) {
    const L = S.L;

    const mk = L.circleMarker([n.lat, n.lng], {
      pane: S.paneName,
      renderer: S.renderer || undefined,
      radius: 10,
      stroke: true,
      weight: 3,
      fillColor: "#00ff66",
      fillOpacity: 1,
      interactive: true,
      className: "map-note-dot map-note-approved",
    }).addTo(S.notesLayer);

    mk.bindPopup(renderApprovedPopup(n), S.popupOpts);
    return mk;
  }

  function addPendingMarker(n) {
    const L = S.L;

    const mk = L.circleMarker([n.lat, n.lng], {
      pane: S.paneName,
      renderer: S.renderer || undefined,
      radius: 10,
      stroke: true,
      weight: 3,
      fillColor: "#ffff00",
      fillOpacity: 1,
      interactive: true,
      className: "map-note-dot map-note-pending",
    }).addTo(S.notesLayer);

    mk.bindPopup(renderPendingPopup(n), S.popupOpts);
    return mk;
  }

  // -------------------------
  // popups
  // -------------------------
  function renderApprovedPopup(n) {
    const title = escapeHtml(n.title || "Map Note");
    const body = escapeHtml(n.text || n.content || "");
    const imgUrl = n.image_url || n.imageUrl || "";

    const wrap = el("div", { class: "mn-pop" }, [
      el("div", { class: "mn-title" }, [title]),
      body ? el("div", { class: "mn-body" }, [body]) : el("div", { class: "mn-body mn-muted" }, ["(no text)"]),
      imgUrl ? el("img", { class: "mn-img", src: imgUrl, alt: "note image", loading: "lazy" }) : el("div", { class: "mn-muted" }, [""]),
      el("div", { class: "mn-meta" }, [`${escapeHtml(n.created_at || n.createdAt || "")}`]),
    ]);
    return wrap;
  }

  function renderPendingPopup(n) {
    const title = escapeHtml(n.title || "Pending Note");
    const body = escapeHtml(n.text || n.content || "");
    const imgUrl = n.image_url || n.imageUrl || "";

    const wrap = el("div", { class: "mn-pop" }, [
      el("div", { class: "mn-title" }, [title]),
      body ? el("div", { class: "mn-body" }, [body]) : el("div", { class: "mn-body mn-muted" }, ["(no text)"]),
      imgUrl ? el("img", { class: "mn-img", src: imgUrl, alt: "note image", loading: "lazy" }) : el("div", { class: "mn-muted" }, [""]),
      el("div", { class: "mn-meta" }, [`${escapeHtml(n.created_at || n.createdAt || "")}`]),
    ]);
    return wrap;
  }

  // -------------------------
  // load
  // -------------------------
  async function loadApprovedNotes() {
    if (!S.apiBase) throw new Error("MapNotes: apiBase empty");
    const url = `${S.apiBase}/api/notes?status=approved`;
    const data = await fetchJsonNoCache(url);

    // 清空 layer 再画
    S.notesLayer.clearLayers();

    const arr = Array.isArray(data) ? data : (data && data.notes ? data.notes : []);
    S.approvedCache = arr;

    arr.forEach(addApprovedMarker);
    return arr;
  }

  // -------------------------
  // Add-mode: click to open add panel
  // -------------------------
  function enableAddMode() {
    if (S.addMode) return;
    S.addMode = true;

    // cursor hint
    try { S.map.getContainer().style.cursor = "crosshair"; } catch (e) {}

    S.addClickHandler = (e) => {
      const latlng = e.latlng;
      openAddPanel(latlng);
    };

    S.map.on("click", S.addClickHandler);

    toast("点击地图选择位置以添加 Map Note（Esc 取消）");

    window.addEventListener("keydown", onEscCancel, { once: true });
  }

  function disableAddMode() {
    if (!S.addMode) return;
    S.addMode = false;

    try { S.map.getContainer().style.cursor = ""; } catch (e) {}

    if (S.addClickHandler) {
      S.map.off("click", S.addClickHandler);
      S.addClickHandler = null;
    }
  }

  function onEscCancel(ev) {
    if (ev.key === "Escape") {
      disableAddMode();
      toast("已取消添加 Map Note");
    } else {
      window.addEventListener("keydown", onEscCancel, { once: true });
    }
  }

  // -------------------------
  // Add panel (with upload inside)
  // -------------------------
  function openAddPanel(latlng) {
    disableAddMode();

    // 临时 marker（pending 风格）
    const temp = addPendingMarker({
      lat: latlng.lat,
      lng: latlng.lng,
      title: "New Note",
      text: "",
      created_at: nowIso(),
    });

    const panel = buildAddPanel(latlng, async (payload) => {
      // submit
      const created = await createNote(payload);
      // replace temp popup content
      temp.setLatLng([created.lat, created.lng]);
      temp.setStyle({ fillColor: "#00ff66" });
      temp.bindPopup(renderApprovedPopup(created), S.popupOpts);
      temp.openPopup();

      toast("已提交，等待/或已通过（取决于后端）");
      return created;
    }, async () => {
      // cancel
      S.notesLayer.removeLayer(temp);
      toast("已取消");
    });

    temp.bindPopup(panel, S.popupOpts);
    temp.openPopup();
  }

  function buildAddPanel(latlng, onSubmit, onCancel) {
    // state for upload
    let uploadedUrl = "";

    const titleInput = el("input", { class: "mn-inp", placeholder: "标题（可选）" });
    const textArea = el("textarea", { class: "mn-ta", placeholder: "写点说明…" });

    const fileInput = el("input", { type: "file", accept: "image/*", class: "mn-file" });
    const preview = el("img", { class: "mn-img mn-hidden", alt: "preview" });
    const uploadBtn = el("button", { class: "mn-btn" }, ["上传图片"]);
    const uploadHint = el("div", { class: "mn-muted" }, ["可选：先选图再上传（推荐在提交前完成）"]);

    const submitBtn = el("button", { class: "mn-btn mn-primary" }, ["提交 Note"]);
    const cancelBtn = el("button", { class: "mn-btn mn-ghost" }, ["取消"]);

    const statusLine = el("div", { class: "mn-muted" }, [`Lat ${latlng.lat.toFixed(5)}, Lng ${latlng.lng.toFixed(5)}`]);

    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      preview.src = url;
      preview.classList.remove("mn-hidden");
      uploadedUrl = ""; // reset: need re-upload
      uploadHint.textContent = "已选择图片：请点击“上传图片”";
    });

    uploadBtn.addEventListener("click", async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) { toast("先选择图片"); return; }
      uploadBtn.disabled = true;
      uploadBtn.textContent = "上传中…";
      try {
        uploadedUrl = await uploadImage(f);
        uploadHint.textContent = "上传成功 ✅";
        toast("图片已上传");
      } catch (e) {
        console.warn(e);
        uploadHint.textContent = "上传失败 ❌（检查网络/后端）";
        toast("上传失败");
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = "上传图片";
      }
    });

    submitBtn.addEventListener("click", async () => {
      submitBtn.disabled = true;
      submitBtn.textContent = "提交中…";
      try {
        const payload = {
          lat: latlng.lat,
          lng: latlng.lng,
          title: titleInput.value.trim(),
          text: textArea.value.trim(),
          image_url: uploadedUrl || "", // only if uploaded
        };
        await onSubmit(payload);
      } catch (e) {
        console.warn(e);
        toast("提交失败（看控制台）");
        submitBtn.disabled = false;
        submitBtn.textContent = "提交 Note";
      }
    });

    cancelBtn.addEventListener("click", async () => {
      try { await onCancel(); } catch (e) {}
      try { S.map.closePopup(); } catch (e) {}
    });

    const wrap = el("div", { class: "mn-add" }, [
      el("div", { class: "mn-title" }, ["Add Map Note"]),
      statusLine,

      el("div", { class: "mn-row" }, [titleInput]),
      el("div", { class: "mn-row" }, [textArea]),

      el("div", { class: "mn-row" }, [fileInput]),
      el("div", { class: "mn-row" }, [preview]),
      el("div", { class: "mn-row mn-actions" }, [uploadBtn]),
      el("div", { class: "mn-row" }, [uploadHint]),

      el("div", { class: "mn-row mn-actions" }, [submitBtn, cancelBtn]),
    ]);

    return wrap;
  }

  // -------------------------
  // create note + upload
  // -------------------------
  async function createNote(payload) {
    if (!S.apiBase) throw new Error("MapNotes: apiBase empty");
    const url = `${S.apiBase}/api/notes`;
    // 这里按你的后端：假设 POST JSON
    const created = await fetchJson(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    // 有些后端会返回 {note: {...}}，兼容一下
    return created.note ? created.note : created;
  }

  async function uploadImage(file) {
    if (!S.apiBase) throw new Error("MapNotes: apiBase empty");

    // 这里假设你后端有 /api/upload 返回 {url:"..."}
    // 如果你的实际接口不同，把这里 url / field 名告诉我，我给你对齐
    const url = `${S.apiBase}/api/upload`;

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch(url, { method: "POST", body: fd });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`upload failed ${res.status}: ${t}`);
    }
    const data = await res.json();
    if (!data || !(data.url || data.image_url)) throw new Error("upload: missing url in response");
    return data.url || data.image_url;
  }

  // -------------------------
  // UI helpers
  // -------------------------
  function toast(msg) {
    console.log("[MapNotes]", msg);
    // 你可以以后换成你自己的 toast UI
  }

  function injectCssOnce() {
    if (document.getElementById("mn-css")) return;
    const css = `
      .map-note-dot { pointer-events: auto !important; cursor: pointer; stroke-width: 40px !important; }
      .map-note-dot.map-note-approved { }
      .map-note-dot.map-note-pending  { }
      .mn-pop { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .mn-title { font-weight: 700; margin: 0 0 6px 0; }
      .mn-body { white-space: pre-wrap; line-height: 1.4; margin: 6px 0; }
      .mn-meta { opacity: .6; font-size: 12px; margin-top: 8px; }
      .mn-muted { opacity: .65; font-size: 12px; }
      .mn-img { width: 100%; max-height: 240px; object-fit: cover; border-radius: 10px; margin-top: 6px; }
      .mn-hidden { display: none; }

      .mn-add .mn-row { margin: 8px 0; }
      .mn-inp, .mn-ta { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.15); background: rgba(0,0,0,.25); color: #fff; }
      .mn-ta { min-height: 90px; resize: vertical; }
      .mn-file { width: 100%; color: #ddd; }

      .mn-actions { display: flex; gap: 8px; }
      .mn-btn { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.06); color: #fff; cursor: pointer; }
      .mn-btn:disabled { opacity: .5; cursor: not-allowed; }
      .mn-primary { background: rgba(0,255,100,.18); border-color: rgba(0,255,100,.35); }
      .mn-ghost { background: transparent; }
    `;
    const style = document.createElement("style");
    style.id = "mn-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // -------------------------
  // expose global
  // -------------------------
  window.MapNotes = {
    init,
    loadApprovedNotes,
    enableAddMode,
    disableAddMode,
  };
})();
