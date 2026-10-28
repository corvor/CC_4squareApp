// FutureProof Careers — browser code.
// Contains no prompts or methodology: it only searches the public O*NET title list
// and renders the validated JSON returned by /api/analyze. All text is set with textContent.
"use strict";

(function () {
  const $ = (id) => document.getElementById(id);
  const input = $("career-input"), list = $("career-list"), btn = $("explore-btn"), hint = $("search-hint");
  const statusEl = $("status"), results = $("results"), dialog = $("task-dialog");

  const EXAMPLES = [
    ["Veterinarian", "29-1131.00"], ["Mechanical Engineer", "17-2141.00"], ["Registered Nurse", "29-1141.00"],
    ["Attorney", "23-1011.00"], ["Electrician", "47-2111.00"], ["Graphic Designer", "27-1024.00"],
    ["Software Developer", "15-1252.00"], ["Corporate Communications", "27-3031.00"],
  ];

  // Grid order: top-left, top-right, bottom-left, bottom-right.
  const QUADS = {
    substitution: {
      name: "AI Substitution Pressure", axes: "High AI exposure, lower human advantage",
      advice: "AI can already do much of this. Learn the tools, then spend your time on higher-value work.",
      icon: "M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22M4.9 4.9l2.5 2.5M16.6 16.6l2.5 2.5M4.9 19.1l2.5-2.5M16.6 7.4l2.5-2.5",
    },
    collaboration: {
      name: "Human + AI Collaboration", axes: "High AI exposure, high human advantage",
      advice: "AI multiplies what people do here. You set direction and judge quality; AI speeds up the work.",
      icon: "M5 20v-5M10 20v-8M15 20v-6M20 20V9M4 11l5-4 4 3 7-6M16 4h4v4",
    },
    lower: {
      name: "Lower Exposure, Lower Advantage", axes: "Low AI exposure, lower human advantage",
      advice: "Neither side stands out. These tasks often get simplified, shared, or handled with templates.",
      icon: "M7 3h7l4 4v14H7zM14 3v4h4M9.5 12h6M9.5 15.5h6",
    },
    human: {
      name: "Human Strengths", axes: "Low AI exposure, high human advantage",
      advice: "People clearly lead here today. These are the skills worth building now.",
      icon: "M9 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM16.5 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3.5 19.5c.6-3.3 3-5.3 5.5-5.3s4.9 2 5.5 5.3M15.3 14.3c2.4 0 4.3 1.8 4.9 5.2",
    },
  };
  const GRID = ["substitution", "collaboration", "lower", "human"];
  const CATEGORIES = {
    communication: "Communication & content",
    analysis: "Analysis & planning",
    people: "People & relationships",
    technical: "Hands-on & technical",
    leadership: "Leadership & strategy",
    admin: "Administrative & support",
  };
  const RANK = { Low: 0, Moderate: 1, High: 2 };

  // Start-page preview of the four quadrants.
  (function renderIntro() {
    const grid = $("intro-grid");
    GRID.forEach((q) => {
      const Q = QUADS[q];
      const card = el("div", `quad mini ${q}`);
      const head = el("div", "quad-head");
      const icon = el("div", "quad-icon"); icon.setAttribute("aria-hidden", "true"); icon.appendChild(svgIcon(Q.icon));
      const txt = el("div");
      txt.append(el("h3", "", Q.name), el("p", "q-axes", Q.axes), el("p", "q-advice", Q.advice));
      head.append(icon, txt); card.appendChild(head); grid.appendChild(card);
    });
  })();

  let occupations = [], index = [], byCode = new Map();
  let selected = null, activeIdx = -1, shown = [], report = null;

  // ---------- Load O*NET list ----------
  fetch("/occupations.json")
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then((data) => {
      occupations = data.occupations;
      index = occupations.map((o) => ({ o, title: norm(o.t), alts: o.a.map(norm) }));
      occupations.forEach((o) => byCode.set(o.c, o));
      input.disabled = false;
      hint.textContent = data.demo
        ? `Demo: choose one of ${occupations.length} sample careers (try the buttons below).`
        : `Choose from ${occupations.length.toLocaleString()} official O*NET careers.`;
      buildChips();
      const fromHash = decodeURIComponent(location.hash.slice(1));
      if (byCode.has(fromHash)) choose(byCode.get(fromHash), true);
    })
    .catch(() => { hint.textContent = "The career list didn't load. Refresh the page to try again."; });

  function norm(s) { return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }

  function buildChips() {
    const wrap = $("example-chips");
    EXAMPLES.forEach(([label, code]) => {
      const o = byCode.get(code);
      if (!o) return;
      const b = el("button", "chip", label);
      b.type = "button"; b.title = o.t;
      b.addEventListener("click", () => choose(o, true));
      wrap.appendChild(b);
    });
  }

  // ---------- Search (client-side filter over the official list only) ----------
  function search(q) {
    const tokens = norm(q).split(" ").filter(Boolean);
    if (!tokens.length) return [];
    const phrase = tokens.join(" ");
    const hit = (s) => { const w = s.split(" "); return tokens.every((t) => w.some((x) => x.startsWith(t))); };
    const out = [];
    for (const e of index) {
      let rank = -1, via = null;
      if (e.title.startsWith(phrase)) rank = 0;
      else if (hit(e.title)) rank = 1;
      else {
        const i = e.alts.findIndex(hit);
        if (i >= 0) { rank = e.alts[i].startsWith(phrase) ? 2 : 3; via = e.o.a[i]; }
      }
      if (rank >= 0) out.push({ o: e.o, rank, via });
    }
    out.sort((a, b) => a.rank - b.rank || a.o.t.length - b.o.t.length);
    return out.slice(0, 8);
  }

  function renderList() {
    list.textContent = "";
    if (!input.value.trim() || (selected && input.value === selected.t)) return closeList();
    shown = search(input.value);
    if (!shown.length) list.appendChild(el("li", "s-empty", "No O*NET career matches that. Try another word, like doctor or designer."));
    shown.forEach((r, i) => {
      const li = el("li");
      li.id = `opt-${i}`; li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === activeIdx));
      li.appendChild(el("span", "s-title", r.o.t));
      if (r.via) li.appendChild(el("span", "s-alt", `Also called ${r.via}`));
      li.addEventListener("mousedown", (ev) => { ev.preventDefault(); choose(r.o, false); });
      list.appendChild(li);
    });
    list.hidden = false; input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-activedescendant", activeIdx >= 0 ? `opt-${activeIdx}` : "");
  }
  function closeList() { list.hidden = true; input.setAttribute("aria-expanded", "false"); activeIdx = -1; }

  function choose(o, run) {
    selected = o; input.value = o.t; closeList();
    btn.disabled = false;
    hint.textContent = `Selected: ${o.t}`; hint.className = "hint ok";
    if (run) explore();
  }

  input.addEventListener("input", () => {
    selected = null; btn.disabled = true; activeIdx = -1;
    hint.textContent = "Pick a career from the list."; hint.className = "hint";
    renderList();
  });
  input.addEventListener("keydown", (e) => {
    if (list.hidden && e.key !== "Enter") return;
    if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, shown.length - 1); renderList(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); renderList(); }
    else if (e.key === "Escape") closeList();
    else if (e.key === "Enter" && !list.hidden && shown.length) { e.preventDefault(); choose(shown[Math.max(activeIdx, 0)].o, false); }
  });
  input.addEventListener("blur", () => setTimeout(closeList, 120));
  $("search-form").addEventListener("submit", (e) => { e.preventDefault(); if (selected) explore(); });
  $("print-btn").addEventListener("click", () => window.print());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  window.addEventListener("hashchange", () => {
    const code = decodeURIComponent(location.hash.slice(1));
    if (byCode.has(code) && (!selected || selected.c !== code)) choose(byCode.get(code), true);
  });

  // ---------- Analyze ----------
  const LOADING = ["Pulling the official O*NET task list…", "Sorting tasks by AI exposure…", "Weighing where people have the edge…", "Building your four-square…"];
  let loadTimer = null;

  async function explore() {
    if (!selected) return;
    const o = selected;
    history.replaceState(null, "", `#${o.c}`);
    btn.disabled = true; results.hidden = true; $("intro").hidden = true;
    showStatus("loading", LOADING[0], "The first time anyone explores a career, this can take up to 30 seconds.");
    let i = 0;
    clearInterval(loadTimer);
    loadTimer = setInterval(() => { i = (i + 1) % LOADING.length; statusEl.querySelector("p").textContent = LOADING[i]; }, 3500);
    try {
      const r = await fetch(`/api/analyze?code=${encodeURIComponent(o.c)}`);
      let body = null;
      try { body = await r.json(); } catch { /* not JSON */ }
      if (!r.ok || !body || body.error) throw new Error((body && body.message) || "The analysis didn't load. Try again in a moment.");
      report = body;
      statusEl.hidden = true;
      renderReport();
    } catch (err) {
      showStatus("error", err.message || "The analysis didn't load. Try again in a moment.");
    } finally {
      clearInterval(loadTimer);
      btn.disabled = !selected;
    }
  }

  function showStatus(kind, msg, sub) {
    statusEl.hidden = false; statusEl.className = `status ${kind === "error" ? "error" : ""}`;
    statusEl.textContent = "";
    if (kind === "loading") {
      const m = el("span", "mark"); m.setAttribute("aria-hidden", "true");
      for (let k = 0; k < 4; k++) m.appendChild(el("i"));
      statusEl.appendChild(m);
    }
    statusEl.appendChild(el("p", "", msg));
    if (sub) statusEl.appendChild(el("small", "", sub));
    statusEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- Render ----------
  function renderReport() {
    const r = report;
    $("occ-title").textContent = r.occupation.title;
    $("demo-banner").hidden = !r.demo;
    if (r.demo) {
      const how = $("how-to-read"); how.textContent = "";
      how.append(el("b", "", "How to read this: "), "This is a demo. The task list and placements are samples written to show how the app works. The full app uses the official O*NET task list and an AI analysis for each career. High AI exposure does not mean a job will disappear.");
    }

    const meta = $("occ-meta"); meta.textContent = "";
    meta.append(`O*NET code ${r.occupation.code}. Tasks from the ${r.provenance.tasks.source}. `);
    const a = el("a", "", "View this career on O*NET OnLine");
    a.href = r.provenance.tasks.url; a.target = "_blank"; a.rel = "noopener";
    meta.appendChild(a);

    renderQuadrants();
    renderSidebar();

    $("summary").textContent = r.summary;
    fillList($("takeaways"), r.takeaways);
    fillList($("next-steps"), r.nextSteps);

    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fillList(ul, items) { ul.textContent = ""; items.forEach((s) => ul.appendChild(el("li", "", s))); }

  function taskButton(t, withDot) {
    const b = el("button", "task-btn");
    b.type = "button";
    b.appendChild(withDot ? el("span", `dot ${t.category}`) : el("span", "pip"));
    b.appendChild(el("span", "", t.label));
    b.setAttribute("aria-label", `${t.label}. ${QUADS[t.quadrant].name}. Show details.`);
    b.addEventListener("click", () => openTask(t));
    return b;
  }

  function renderQuadrants() {
    const wrap = $("quadrants"); wrap.textContent = "";
    GRID.forEach((q) => {
      const Q = QUADS[q];
      const card = el("section", `quad ${q}`);
      const head = el("div", "quad-head");
      const icon = el("div", "quad-icon"); icon.appendChild(svgIcon(Q.icon)); icon.setAttribute("aria-hidden", "true");
      const txt = el("div");
      txt.appendChild(el("h3", "", Q.name));
      txt.appendChild(el("p", "q-axes", Q.axes));
      txt.appendChild(el("p", "q-advice", Q.advice));
      head.append(icon, txt);
      card.appendChild(head);

      const items = report.tasks
        .filter((t) => t.quadrant === q)
        .sort((a, b) => RANK[b.exposure] - RANK[a.exposure] || RANK[b.humanAdvantage] - RANK[a.humanAdvantage] || a.n - b.n);
      const ul = el("ul");
      if (!items.length) ul.appendChild(el("li", "empty", "None of this career’s key tasks landed here."));
      items.forEach((t) => { const li = el("li"); li.appendChild(taskButton(t, true)); ul.appendChild(li); });
      card.appendChild(ul);
      wrap.appendChild(card);
    });
  }

  function renderSidebar() {
    const core = report.tasks.filter((t) => t.core), supp = report.tasks.filter((t) => !t.core);
    const fill = (ul, arr) => { ul.textContent = ""; arr.forEach((t) => { const li = el("li"); li.appendChild(taskButton(t, false)); ul.appendChild(li); }); };
    fill($("core-list"), core);
    fill($("supp-list"), supp);
    $("supp-head").hidden = !supp.length;
    document.querySelectorAll(".side-sub .src").forEach((n) => { n.textContent = report.demo ? "(sample)" : "(O*NET)"; });

    const present = new Set(report.tasks.map((t) => t.category));
    const legend = $("legend"); legend.textContent = "";
    Object.keys(CATEGORIES).filter((c) => present.has(c)).forEach((c) => {
      const li = el("li"); li.append(el("span", `dot ${c}`), el("span", "", CATEGORIES[c])); legend.appendChild(li);
    });
  }

  function openTask(t) {
    const d = $("dlg-body"); d.textContent = "";
    d.appendChild(el("span", `dlg-chip ${t.quadrant}`, QUADS[t.quadrant].name));
    const h = el("h3", "", t.label); h.id = "dlg-title"; d.appendChild(h);
    d.appendChild(el("p", "dlg-task", t.task));
    const cat = el("div", "dlg-cat"); cat.append(el("span", `dot ${t.category}`), el("span", "", CATEGORIES[t.category] || "")); d.appendChild(cat);
    const grid = el("div", "ratings");
    grid.append(rating("AI exposure", t.exposure, t.exposureLean), rating("Human advantage", t.humanAdvantage, t.humanAdvantageLean));
    d.appendChild(grid);
    const why = el("p", "dlg-p"); why.append(el("b", "", "Why it’s here: "), t.rationale); d.appendChild(why);
    const unc = el("p", "dlg-p"); unc.append(el("b", "", `How sure: ${t.uncertainty} uncertainty. `), t.uncertaintyReason); d.appendChild(unc);
    const src = el("div", "dlg-src");
    const verified = report.provenance.tasks.type === "verified";
    const s1 = el("div"); s1.append(el("span", `tag ${verified ? "verified" : "estimate"}`, verified ? "Verified" : "Demo"), `Task text from the ${report.provenance.tasks.source}${verified && t.core ? " (core task)" : ""}.`);
    const s2 = el("div"); s2.append(el("span", "tag estimate", report.demo ? "Demo" : "Estimate"), report.provenance.placements.note);
    src.append(s1, s2); d.appendChild(src);
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  }

  function rating(label, level, lean) {
    const r = el("div", "rating");
    r.append(el("span", "", label), el("b", "", level));
    if (level === "Moderate") r.append(" ", el("small", "", `(leaning ${lean})`));
    return r;
  }

  // ---------- helpers ----------
  function svgIcon(d) {
    const NS = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24");
    const p = document.createElementNS(NS, "path"); p.setAttribute("d", d);
    s.appendChild(p); return s;
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
})();
