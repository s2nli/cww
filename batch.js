(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (v = "") => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  const params = new URLSearchParams(location.search);
  const batchId = params.get("id") || "";
  const ICON = {
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="3"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
  };

  let batch = null, meta = null;
  let state = { tab: "lectures", s: null };
  let curList = [], filterText = "";

  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200); }

  async function init() {
    if (!/^[a-z0-9-]+$/i.test(batchId)) return fail("Batch not found.");
    try {
      const [dRes, bRes] = await Promise.all([fetch("data/" + batchId + ".json"), fetch("batches.json").catch(() => null)]);
      if (!dRes.ok) throw new Error("not found");
      batch = await dRes.json();
      try { const bj = bRes && (await bRes.json()); meta = (bj.batches || []).find((b) => b._id === batchId) || null; } catch (e) {}
    } catch (e) { return fail("This batch could not be loaded. Please go back and try again."); }
    document.title = batch.name + " — CODEX STUDYS";
    trackRecent();
    buildFlat();
    const h = readHash();
    state = h;
    history.replaceState(state, "");
    render();
    const dl = location.hash.match(/[#&]lec=(\d+)/);
    if (dl) {
      history.replaceState(state, "", "#tab=" + state.tab + (state.s !== null ? "&s=" + state.s : ""));
      const fi = +dl[1], f = flat[fi];
      if (f && !f.pdf) openLecture(fi, { startAt: resumePos(fi), autoplay: true });
    }
  }

  function fail(msg) { $("#topTitle").textContent = "Batch"; $("#page").innerHTML = '<div class="empty">' + esc(msg) + "</div>"; }

  function readHash() {
    const m = location.hash.match(/tab=(lectures|notes|about)(?:&s=(\d+))?/);
    return { tab: m ? m[1] : "lectures", s: m && m[2] !== undefined ? +m[2] : null };
  }
  function go(tab, s) {
    state = { tab, s: s === undefined ? null : s };
    filterText = "";
    history.pushState(state, "", "#tab=" + tab + (state.s !== null ? "&s=" + state.s : ""));
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener("popstate", (e) => {
    if ($("#lv").classList.contains("open") && !(e.state && e.state.p)) closeOverlay(true);
    state = (e.state && e.state.tab) ? { tab: e.state.tab, s: e.state.s === undefined ? null : e.state.s } : readHash();
    filterText = ""; render();
  });
  $("#backBtn").addEventListener("click", () => {
    if (state.s !== null) { history.back(); return; }
    if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) history.back();
    else location.href = "index.html#courses";
  });

  function trackRecent() {
    try {
      const k = "codex-studys-recent";
      const arr = JSON.parse(localStorage.getItem(k) || "[]").filter((x) => x._id !== batchId);
      arr.unshift({ _id: batchId, name: batch.name, byName: batch.by || "", language: (meta && meta.language) || "", previewImage: (meta && meta.previewImage) || "" });
      localStorage.setItem(k, JSON.stringify(arr.slice(0, 8)));
    } catch (e) {}
  }

  const total = (groups) => groups.reduce((n, g) => n + g.i.length, 0);

  function render() {
    const page = $("#page");
    const groups = state.tab === "notes" ? batch.notes : batch.lectures;
    const inSubject = state.s !== null && state.tab !== "about" && groups[state.s];
    $("#topTitle").textContent = inSubject ? groups[state.s].n : batch.name;
    if (inSubject) { page.innerHTML = renderItems(groups[state.s]); bindItems(groups[state.s]); return; }
    const img = (meta && meta.previewImage) || "assets/batch-" + batchId + ".webp";
    let html = '<div class="hero"><img class="hero-img" src="' + esc(img) + '" alt="' + esc(batch.name) + '" onerror="this.src=\'assets/codex-telegram.png\'">' +
      '<div class="hero-body"><h2 class="hero-title">' + esc(batch.name) + '</h2><p class="hero-sub">' + esc(batch.by || "") + '</p>' +
      '<div class="badges"><span class="badge accent">Recorded</span><span class="badge">' + esc((meta && meta.language) || "Hinglish") + '</span></div></div></div>' +
      '<div class="tabs">' + ["lectures", "notes", "about"].map((t) => '<button class="tab' + (state.tab === t ? " active" : "") + '" data-tab="' + t + '" type="button">' + t[0].toUpperCase() + t.slice(1) + "</button>").join("") + "</div>";
    if (state.tab === "about") html += renderAbout();
    else html += '<div class="list">' + (groups.length ? groups.map((g, i) => subjectRow(g, i)).join("") : '<div class="empty">Nothing here yet.</div>') + "</div>";
    page.innerHTML = html;
    page.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { if (b.dataset.tab !== state.tab) go(b.dataset.tab); }));
    page.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => go(state.tab, +b.dataset.s)));
  }

  function subjectRow(g, i) {
    const notes = state.tab === "notes";
    const n = g.i.length;
    return '<button class="row" type="button" data-s="' + i + '"><span class="ico' + (notes ? " pdf" : "") + '">' + (notes ? ICON.doc : ICON.video) + '</span><span class="row-main"><span class="row-name">' + esc(g.n) +
      '</span><div class="row-sub">' + n + (notes ? (n === 1 ? " note" : " notes") : (n === 1 ? " lecture" : " lectures")) + "</div></span>" + ICON.chev + "</button>";
  }

  function renderAbout() {
    const subj = batch.lectures.map((g) => g.n);
    return '<div class="stats"><div class="stat"><b>' + total(batch.lectures) + '</b><span>Lectures</span></div><div class="stat"><b>' + total(batch.notes) + '</b><span>Notes</span></div><div class="stat"><b>' + batch.lectures.length + '</b><span>Subjects</span></div></div>' +
      '<div class="about-card"><h3>About this batch</h3><p>' + esc(batch.about || "") + '</p></div>' +
      '<div class="about-card" style="margin-top:14px"><h3>Subjects</h3><div class="tags">' + subj.map((s) => '<span class="tag">' + esc(s) + "</span>").join("") + "</div></div>";
  }

  function renderItems(g) {
    const notes = state.tab === "notes";
    let h = '<p class="crumb">' + esc(batch.name) + " › " + (notes ? "Notes" : "Lectures") + " › " + esc(g.n) + "</p>";
    if (g.i.length > 10) h += '<input class="search" id="itemSearch" type="search" placeholder="Search in ' + esc(g.n) + '…" autocomplete="off" value="' + esc(filterText) + '">';
    h += '<div class="list" id="itemList"></div>';
    return h;
  }

  function bindItems(g) {
    const notes = state.tab === "notes";
    const list = $("#itemList");
    const draw = () => {
      const q = filterText.trim().toLowerCase();
      const rows = [];
      g.i.forEach((it, idx) => { if (!q || it[0].toLowerCase().includes(q)) rows.push([it, idx]); });
      curList = rows.map((r) => ({ it: r[0], idx: r[1] }));
      list.innerHTML = rows.length ? rows.map(([it, idx], n) => itemRow(it, idx, n, notes)).join("") : '<div class="empty">No results found.</div>';
      list.querySelectorAll("[data-n]").forEach((el) => el.addEventListener("click", (e) => {
        const n = +el.dataset.n; const a = e.target.closest("[data-act]");
        if (notes) { openNote(curList[n], a && a.dataset.act); return; }
        const fi = offsets[state.s] + curList[n].idx, f = flat[fi];
        if (f && f.pdf) window.open(f.it[1], "_blank", "noopener,noreferrer"); else openLecture(fi);
      }));
    };
    const search = $("#itemSearch");
    if (search) search.addEventListener("input", () => { filterText = search.value; draw(); });
    draw();
  }

  function itemRow(it, idx, n, notes) {
    const fi = notes ? -1 : offsets[state.s] + idx;
    const done = !notes && isDone(fi);
    if (notes) return '<div class="row item" data-n="' + n + '" role="button" tabindex="0"><span class="ico pdf" style="width:42px;height:42px;border-radius:13px">' + ICON.doc + '</span><span class="row-main"><span class="row-name">' + esc(it[0]) + '</span></span><span class="act"><button class="pill-btn solid" data-act="view" type="button">View</button><button class="pill-btn" data-act="dl" type="button">Download</button></span></div>';
    return '<div class="row item' + (done ? " done" : "") + '" data-n="' + n + '" data-fi="' + fi + '" data-num="' + (idx + 1) + '" role="button" tabindex="0"><span class="num">' + (done ? "✓" : idx + 1) + '</span><span class="row-main"><span class="row-name">' + esc(it[0]) + '</span></span><span class="play">' + ICON.play + "</span></div>";
  }

  function openNote(entry, act) {
    const url = entry.it[1];
    if (act === "dl") { const a = document.createElement("a"); a.href = url; a.download = ""; a.target = "_blank"; a.rel = "noopener noreferrer"; document.body.appendChild(a); a.click(); a.remove(); toast("Download started"); }
    else window.open(url, "_blank", "noopener,noreferrer");
  }

  /* ---------- lecture list + completion ---------- */
  const DONE_KEY = "cx-done";
  const RECENT_KEY = "codex-studys-recent-lectures";
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const readDone = () => { const m = lsGet(DONE_KEY, {}); return m && typeof m === "object" && !Array.isArray(m) ? m : {}; };
  let doneMap = readDone();
  const lkey = (idx) => batchId + "-" + idx;
  const isDone = (idx) => !!doneMap[lkey(idx)];
  const isPdf = (u) => /\.pdf(\?|#|$)/i.test(String(u || ""));
  let flat = [], offsets = [], vids = [], lite = [], noteFlat = [], doneCount = 0;
  let player = null, built = false, cur = -1;

  function buildFlat() {
    flat = []; offsets = [];
    batch.lectures.forEach((g, gi) => { offsets[gi] = flat.length; g.i.forEach((it, ii) => flat.push({ it, g: gi, i: ii, idx: flat.length, pdf: isPdf(it[1]) })); });
    vids = flat.filter((f) => !f.pdf);
    lite = vids.map((f) => ({ id: lkey(f.idx), idx: f.idx, title: f.it[0] }));
    noteFlat = [];
    batch.notes.forEach((g, gi) => g.i.forEach((it) => noteFlat.push({ title: it[0], url: it[1], g: gi })));
    countDone();
  }
  function countDone() { doneMap = readDone(); doneCount = vids.reduce((n, f) => n + (isDone(f.idx) ? 1 : 0), 0); }

  function setDone(idx, on) {
    const m = readDone(), k = lkey(idx);
    if (on) m[k] = 1; else delete m[k];
    doneMap = m;
    try { localStorage.setItem(DONE_KEY, JSON.stringify(m)); } catch (e) {}
    doneCount = vids.reduce((n, f) => n + (isDone(f.idx) ? 1 : 0), 0);
    // update every visible copy of this lecture in place (no re-render)
    document.querySelectorAll('[data-l="' + idx + '"]').forEach((r) => {
      r.classList.toggle("done", !!on);
      const c = r.querySelector("[data-chk]"); if (c) { c.setAttribute("aria-pressed", on ? "true" : "false"); c.setAttribute("aria-label", on ? "Mark as not complete" : "Mark as complete"); }
    });
    document.querySelectorAll('[data-fi="' + idx + '"]').forEach((r) => {
      r.classList.toggle("done", !!on);
      const n = r.querySelector(".num"); if (n) n.textContent = on ? "✓" : r.dataset.num;
    });
    updateProgressDom();
  }

  function updateProgressDom() {
    const total = vids.length, pct = total ? Math.round((doneCount / total) * 100) : 0;
    const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
    set("lvProgTxt", (el) => { el.textContent = doneCount + "/" + total + " lectures done"; });
    set("lvProgPct", (el) => { el.textContent = pct + "%"; });
    set("lvProgFill", (el) => { el.style.width = pct + "%"; });
    set("lvProg", (el) => el.classList.toggle("full", total > 0 && doneCount >= total));
    set("lvAbDone", (el) => { el.textContent = String(doneCount); });
  }

  function resumePos(fi) {
    const p = +lsGet("lp:pos:" + lkey(fi), 0) || 0;
    return p > 10 ? p : 0;
  }

  /* ---------- recently watched (lecture level) ---------- */
  function trackLecture(f) {
    try {
      const kind = f.it[2], src = f.it[1];
      const thumb = kind === "y" ? "https://i.ytimg.com/vi/" + encodeURIComponent(src) + "/hqdefault.jpg" : ((meta && meta.previewImage) || "assets/batch-" + batchId + ".webp");
      const arr = lsGet(RECENT_KEY, []).filter((x) => !(x && x.b === batchId && x.i === f.idx));
      arr.unshift({ b: batchId, i: f.idx, t: f.it[0], bn: batch.name, th: thumb, at: Date.now() });
      localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 10)));
    } catch (e) {}
  }

  /* ---------- lecture screen ---------- */
  const SV = {
    video: ICON.video,
    tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    doc: ICON.doc
  };

  function lectureRow(f) {
    const d = isDone(f.idx);
    return '<div class="lv-row' + (d ? " done" : "") + '" role="button" tabindex="0" data-l="' + f.idx + '"><span class="lv-ico">' +
      SV.video.replace("<svg ", '<svg class="v" ') + SV.tick.replace("<svg ", '<svg class="t" ') + '</span><span class="lv-main-txt"><span class="lv-name">' + esc(f.it[0]) + '</span></span>' +
      '<button class="lv-chk" type="button" data-chk="' + f.idx + '" aria-pressed="' + (d ? "true" : "false") + '" aria-label="' + (d ? "Mark as not complete" : "Mark as complete") + '">' + SV.tick + "</button></div>";
  }

  function buildOverlayOnce() {
    if (built) return; built = true;
    const total = vids.length, pct = total ? Math.round((doneCount / total) * 100) : 0;
    let h = '<div class="lv-prog' + (total && doneCount >= total ? " full" : "") + '" id="lvProg"><div class="lv-prog-top"><span id="lvProgTxt">' + doneCount + "/" + total + ' lectures done</span><b id="lvProgPct">' + pct + '%</b></div><div class="lv-bar"><i id="lvProgFill" style="width:' + pct + '%"></i></div></div>';
    if (!total) h += '<div class="empty">No video lectures yet.</div>';
    let lastG = -1;
    vids.forEach((f) => {
      if (f.g !== lastG) { lastG = f.g; h += '<div class="lv-grp">' + esc(batch.lectures[f.g].n) + "</div>"; }
      h += lectureRow(f);
    });
    $("#lvLectures").innerHTML = h;

    let n = "", lastN = -1;
    if (!noteFlat.length) n = '<div class="empty">No notes yet.</div>';
    noteFlat.forEach((x, i) => {
      if (x.g !== lastN) { lastN = x.g; n += '<div class="lv-grp">' + esc(batch.notes[x.g].n) + "</div>"; }
      n += '<div class="lv-row" role="button" tabindex="0" data-note="' + i + '"><span class="lv-ico pdf">' + SV.doc + '</span><span class="lv-main-txt"><span class="lv-name">' + esc(x.title) + "</span></span></div>";
    });
    $("#lvNotes").innerHTML = n;

    $("#lvAbout").innerHTML = '<div class="lv-about-card" style="margin-top:0"><h3>' + esc(batch.name) + '</h3><div class="badges" style="margin-top:10px"><span class="badge accent">' + esc((meta && meta.language) || "Hinglish") + '</span></div></div>' +
      '<div class="stats"><div class="stat"><b>' + total + '</b><span>Lectures</span></div><div class="stat"><b>' + noteFlat.length + '</b><span>Notes</span></div><div class="stat"><b id="lvAbDone">' + doneCount + "</b><span>Completed</span></div></div>";
  }

  function setLvTab(t) {
    document.querySelectorAll(".lv-tab").forEach((b) => { const on = b.dataset.lt === t; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    document.querySelectorAll(".lv-pane").forEach((p) => p.classList.toggle("on", p.dataset.pane === t));
    if (t === "lectures") scrollToNow();
  }
  function scrollToNow() { const r = $("#lvLectures .lv-row.now"); if (r && $("#lvLectures").classList.contains("on")) r.scrollIntoView({ block: "nearest" }); }
  function markNow(idx) {
    document.querySelectorAll("#lvLectures .lv-row.now").forEach((r) => r.classList.remove("now"));
    const r = document.querySelector('#lvLectures [data-l="' + idx + '"]'); if (r) { r.classList.add("now"); scrollToNow(); }
  }

  function showAlt(html) {
    if (player) { try { player.v.pause(); } catch (e) {} }
    $("#lvRoot").style.display = "none";
    const a = $("#lvAlt"); a.innerHTML = html; a.classList.add("show");
  }
  function hideAlt() {
    const a = $("#lvAlt"); a.classList.remove("show"); a.innerHTML = "";
    $("#lvRoot").style.display = "";
  }

  function lecData(pos, o) {
    const f = vids[pos], src = f.it[1], kind = f.it[2];
    return {
      id: lkey(f.idx), idx: f.idx, kind, title: f.it[0],
      videoUrl: kind === "y" ? "https://www.youtube.com/watch?v=" + src : src,
      downloadUrl: kind === "v" ? src : null,
      quality: {}, chapters: [],
      attachments: noteFlat.map((x) => ({ title: x.title, url: x.url })),
      course: { title: batch.name },
      lectures: lite,
      previousLecture: pos > 0 ? lite[pos - 1] : null,
      nextLecture: pos < vids.length - 1 ? lite[pos + 1] : null,
      startAt: o.startAt || 0, autoplay: o.autoplay !== false
    };
  }

  const playerOpts = {
    onBack: () => closeOverlay(false),
    onNavigate: (n) => { if (n) openLecture(n.idx, {}); },
    onSelectLecture: (l) => { if (l) openLecture(l.idx, {}); },
    onEnded: (d) => { if (d && d.idx != null) setDone(d.idx, true); }
  };

  function openLecture(fi, o) {
    o = o || {};
    const pos = vids.findIndex((f) => f.idx === fi); if (pos < 0) return;
    const ov = $("#lv");
    if (!ov.classList.contains("open")) {
      history.pushState(Object.assign({}, state, { p: 1 }), "");
      ov.classList.add("open"); document.body.style.overflow = "hidden";
    }
    buildOverlayOnce();
    playPos(pos, o);
  }

  function playPos(pos, o) {
    cur = pos;
    const f = vids[pos];
    trackLecture(f); markNow(f.idx);
    const d = lecData(pos, o);
    if (d.kind === "p") {
      // these lectures only play on their own page, so they open in an embedded frame
      showAlt('<iframe src="' + esc(f.it[1]) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe>' +
        '<div class="lv-altbar"><button class="pill-btn" type="button" data-alt="prev"' + (pos > 0 ? "" : " disabled") + '>◀ Prev</button><a class="pill-btn" href="' + esc(f.it[1]) + '" target="_blank" rel="noopener noreferrer">Open in new tab</a><button class="pill-btn" type="button" data-alt="next"' + (pos < vids.length - 1 ? "" : " disabled") + ">Next ▶</button></div>");
      return;
    }
    hideAlt();
    if (!player) {
      player = new LecturePlayer($("#lvRoot"), d, playerOpts);
      try { LecturePlayer.mediaSession(player, "assets/icon-192.png"); } catch (e) {}
    } else player.load(d);
  }

  function showDoc(i) {
    const x = noteFlat[i]; if (!x) return;
    showAlt('<div class="lv-doc"><span class="ico pdf">' + SV.doc + '</span><h3>' + esc(x.title) + '</h3><p>PDF document</p><div class="act"><a class="pill-btn solid" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">Open Document</a><a class="pill-btn" href="' + esc(x.url) + '" download target="_blank" rel="noopener noreferrer">Download</a>' +
      (cur >= 0 ? '<button class="pill-btn" type="button" data-alt="video">Back to video</button>' : "") + "</div></div>");
    $("#lvStage").scrollIntoView({ block: "nearest" });
  }

  function closeOverlay(fromPop) {
    const ov = $("#lv"); if (!ov.classList.contains("open")) return;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    if (player) { try { player.v.pause(); player.save(); } catch (e) {} }
    hideAlt();
    ov.classList.remove("open"); document.body.style.overflow = "";
    if (!fromPop && history.state && history.state.p) history.back();
  }

  /* overlay events (delegated, so toggling never re-renders the list) */
  $("#lvLectures").addEventListener("click", (e) => {
    const c = e.target.closest("[data-chk]");
    if (c) { e.stopPropagation(); const i = +c.dataset.chk; setDone(i, !isDone(i)); return; }
    const r = e.target.closest(".lv-row[data-l]"); if (r) openLecture(+r.dataset.l, {});
  });
  $("#lvLectures").addEventListener("keydown", (e) => {
    const r = e.target.closest(".lv-row[data-l]");
    if (!r || e.target !== r) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLecture(+r.dataset.l, {}); }
  });
  $("#lvNotes").addEventListener("click", (e) => { const r = e.target.closest("[data-note]"); if (r) showDoc(+r.dataset.note); });
  $("#lvNotes").addEventListener("keydown", (e) => {
    const r = e.target.closest("[data-note]");
    if (r && e.target === r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showDoc(+r.dataset.note); }
  });
  $("#lvAlt").addEventListener("click", (e) => {
    const b = e.target.closest("[data-alt]"); if (!b || b.disabled) return;
    if (b.dataset.alt === "prev" && cur > 0) openLecture(vids[cur - 1].idx, {});
    else if (b.dataset.alt === "next" && cur < vids.length - 1) openLecture(vids[cur + 1].idx, {});
    else if (b.dataset.alt === "video" && cur >= 0) openLecture(vids[cur].idx, { startAt: resumePos(vids[cur].idx), autoplay: true });
  });
  document.querySelectorAll(".lv-tab").forEach((b) => b.addEventListener("click", () => setLvTab(b.dataset.lt)));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !$("#lv").classList.contains("open")) return;
    if (document.fullscreenElement || (player && player.menu)) return;
    closeOverlay(false);
  });
  window.addEventListener("storage", (e) => { if (e.key === DONE_KEY && batch) { countDone(); updateProgressDom(); } });

  init();
})();
