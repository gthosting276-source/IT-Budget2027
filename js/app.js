(function () {
  "use strict";
  const B = window.BUDGET;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  /* ---------- الحسابات (بالهللة لتجنّب أخطاء الكسور العشرية) ---------- */
  const toC = (v) => Math.round(v * 100);
  const items = B.items.map((it, i) => {
    const mc = it.monthly.map(toC);
    const totalC = mc.reduce((a, b) => a + b, 0);
    const active = mc.map((v, k) => (v ? k : -1)).filter((k) => k >= 0);
    let pay, payId;
    if (active.length === 12) { payId = "monthly"; pay = "شهريًا (12 دفعة)"; }
    else if (active.length === 1) { payId = "once"; pay = "دفعة واحدة في " + B.months[active[0]]; }
    else { payId = "bimonthly"; pay = "كل شهرين (" + active.length + " دفعات)"; }
    return Object.assign({}, it, { idx: i + 1, mc, totalC, payId, pay, block: it.row && it.row <= 13 ? "block1" : "block2" });
  });
  const totalC = items.reduce((a, it) => a + it.totalC, 0);
  const monthC = B.months.map((_, k) => items.reduce((a, it) => a + it.mc[k], 0));

  // تحقّق: الإجمالي المحسوب = الإجمالي في الملف، ومجموع الأشهر = الإجمالي
  const checks = [];
  if (totalC !== toC(B.fileTotal)) checks.push("الإجمالي المحسوب لا يطابق إجمالي الملف");
  if (monthC.reduce((a, b) => a + b, 0) !== totalC) checks.push("مجموع الأشهر لا يطابق الإجمالي");

  const G = B.groupings[B.grouping];
  const catKey = { priority: "priority", nature: "nature", payment: "payId", fileBlocks: "block" }[B.grouping];
  const cats = G.categories.map((c) => {
    const its = items.filter((it) => it[catKey] === c.id);
    return Object.assign({}, c, { items: its, totalC: its.reduce((a, it) => a + it.totalC, 0) });
  });
  const catsLabel = cats.length === 2 ? "تصنيفان" : cats.length + " تصنيفات";
  const catOf = (it) => cats.find((c) => c.id === it[catKey]);
  if (cats.reduce((a, c) => a + c.totalC, 0) !== totalC) checks.push("مجموع التصنيفات لا يطابق الإجمالي");
  if (items.some((it) => !catOf(it))) checks.push("يوجد بند بدون تصنيف");
  if (checks.length) { const a = $("#dataAlert"); a.hidden = false; a.textContent = "تنبيه بيانات: " + checks.join(" · "); }

  /* ---------- التنسيق ---------- */
  const fmt = (c, forceDec) => {
    const dec = forceDec || c % 100 !== 0 ? 2 : 0;
    return (c / 100).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  const fmt2 = (c) => fmt(c, true);
  const pct = (c, of = totalC) => ((c / of) * 100).toFixed(1) + "%";
  const SAR = '<span class="sar" role="img" aria-label="ريال سعودي"></span>';
  const N = (s) => '<span class="num">' + s + "</span>";

  /* ---------- عدّاد متحرك ---------- */
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function countUp(node, targetC, dur = 1600, forceDec) {
    const start = performance.now();
    const dec = forceDec || targetC % 100 !== 0;
    cancelAnimationFrame(node._raf);
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const v = Math.round(targetC * easeOut(t));
      node.textContent = fmt(t < 1 ? v - (v % (dec ? 1 : 100)) : targetC, dec);
      if (t < 1) node._raf = requestAnimationFrame(step);
    };
    node._raf = requestAnimationFrame(step);
  }

  /* ---------- التلميح ---------- */
  const stage = $("#stage"), tip = $("#tooltip");
  let scale = 1;
  function showTip(html, ev) {
    tip.innerHTML = html; tip.classList.add("show"); moveTip(ev);
  }
  function moveTip(ev) {
    const r = stage.getBoundingClientRect();
    let x = (ev.clientX - r.left) / scale, y = (ev.clientY - r.top) / scale;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x - w - 24; if (left < 20) left = x + 24;
    let top = y - h / 2; top = Math.max(20, Math.min(1080 - h - 20, top));
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }
  const hideTip = () => tip.classList.remove("show");
  function bindTip(node, fn) {
    node.addEventListener("mouseenter", (e) => showTip(fn(), e));
    node.addEventListener("mousemove", moveTip);
    node.addEventListener("mouseleave", hideTip);
  }
  const itemTip = (it) => {
    const c = catOf(it);
    return `<div class="tt-title">${it.name}</div>
      <div class="tt-row"><span>المبلغ السنوي</span><b>${N(fmt2(it.totalC))} ${SAR}</b></div>
      <div class="tt-row"><span>النسبة من الإجمالي</span><b>${N(pct(it.totalC))}</b></div>
      <div class="tt-row"><span>موعد الدفع</span><b>${it.pay}</b></div>
      <div class="tt-row"><span>التصنيف</span><b><i style="background:${c.color}"></i>${c.name}</b></div>
      ${it.desc || it.note ? `<div class="tt-note">${it.desc || it.note}</div>` : ""}`;
  };

  /* ================= بناء الشرائح ================= */

  // --- الملخص ---
  const payGroups = cats.filter((c) => c.totalC > 0);
  const payBar = $("#payBar"), payLegend = $("#payLegend");
  payGroups.forEach((p) => {
    const s = el("span"); s.style.background = p.color; s.dataset.w = (p.totalC / totalC) * 100; payBar.appendChild(s);
    bindTip(s, () => `<div class="tt-title">${p.name}</div><div class="tt-row"><span>المبلغ</span><b>${N(fmt2(p.totalC))} ${SAR}</b></div><div class="tt-row"><span>النسبة</span><b>${N(pct(p.totalC))}</b></div><div class="tt-note">${p.items.map((it) => it.name).join("، ")}</div>`);
    payLegend.appendChild(el("div", "", `<span class="t"><i style="background:${p.color}"></i>${p.name}</span><span class="v">${N(fmt(p.totalC))}<small>${N(pct(p.totalC))}</small></span>`));
  });

  const recurringC = items.filter((it) => it.payId === "monthly").reduce((a, it) => a + it.mc[0], 0);
  const peakK = monthC.indexOf(Math.max(...monthC));
  const kpis = [
    { label: "عدد بنود الميزانية", c: items.length * 100, unit: "بندًا", sub: "جميع البنود الواردة في الملف" },
    { label: "متوسط المصروف الشهري", c: Math.round(totalC / 12), unit: SAR, sub: "الإجمالي ÷ 12 شهرًا", dec: true },
    { label: "الإجمالي دون المدفوعات المحتملة", c: totalC - items.filter((it) => it.priority === "possible").reduce((a, it) => a + it.totalC, 0), unit: SAR, sub: "بنود الأولوية الأولى والثانية" },
    { label: "أعلى شهر في المصروفات", c: monthC[peakK], unit: SAR, sub: "شهر " + B.months[peakK] }
  ];
  const kpiBox = $("#kpis");
  kpis.forEach((k, i) => {
    const d = el("div", "kpi anim", `<div class="k-label">${k.label}</div><div class="k-value"><span class="num" data-c="${k.c}" data-dec="${k.dec ? 1 : ""}">0</span><span class="unit">${k.unit}</span></div><div class="k-sub">${k.sub}</div>`);
    d.style.setProperty("--d", 0.15 + i * 0.1 + "s");
    kpiBox.appendChild(d);
  });

  // --- التوزيع (الدائرة) ---
  $("#groupingNote").textContent = G.label + " · " + catsLabel;
  const svg = $("#donut"), R = 160, CIRC = 2 * Math.PI * R, GAP = 4;
  svg.innerHTML = `<circle class="track" cx="200" cy="200" r="${R}"></circle>`;
  const catList = $("#catList"), center = $("#donutCenter");
  const setCenter = (c) => {
    center.innerHTML = c
      ? `<div class="c-label">${c.name}</div><div class="c-value">${N(fmt(c.totalC))}</div><div class="c-pct">${N(pct(c.totalC))} من الإجمالي</div>`
      : `<div class="c-label">الإجمالي</div><div class="c-value">${N(fmt(totalC))}</div><div class="c-pct">${SAR} · ${catsLabel}</div>`;
  };
  setCenter(null);
  let acc = 0;
  const segs = cats.map((c) => {
    const frac = c.totalC / totalC;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    s.setAttribute("class", "seg"); s.setAttribute("cx", 200); s.setAttribute("cy", 200); s.setAttribute("r", R);
    s.style.stroke = c.color; s.style.strokeDasharray = `0 ${CIRC}`; s.style.strokeDashoffset = -acc * CIRC;
    s.dataset.len = Math.max(0, frac * CIRC - GAP);
    acc += frac; svg.appendChild(s); return s;
  });
  const catRows = cats.map((c, i) => {
    const r = el("div", "cat-row anim", `
      <div class="c-name"><i style="background:${c.color}"></i>${c.name}</div>
      <div class="c-amt">${N(fmt(c.totalC))}</div>
      <div class="c-meta">${c.items.length} ${c.items.length > 2 && c.items.length < 11 ? "بنود" : c.items.length >= 11 ? "بندًا" : "بند"}</div>
      <div class="c-pct">${N(pct(c.totalC))}</div>
      <div class="c-bar"><span style="background:${c.color}" data-w="${(c.totalC / totalC) * 100}"></span></div>`);
    r.style.setProperty("--d", 0.2 + i * 0.1 + "s");
    catList.appendChild(r); return r;
  });
  const hiCat = (i) => {
    segs.forEach((s, k) => { s.classList.toggle("hi", k === i); s.classList.toggle("dim", i != null && k !== i); });
    catRows.forEach((r, k) => { r.classList.toggle("hi", k === i); r.classList.toggle("dim", i != null && k !== i); });
    setCenter(i == null ? null : cats[i]);
  };
  const catTip = (c) => `<div class="tt-title">${c.name}</div>` +
    c.items.slice().sort((a, b) => b.totalC - a.totalC).map((it) => `<div class="tt-row"><span>${it.name}</span><b>${N(fmt(it.totalC))}</b></div>`).join("");
  segs.forEach((s, i) => {
    s.addEventListener("mouseenter", (e) => { hiCat(i); showTip(catTip(cats[i]), e); });
    s.addEventListener("mousemove", moveTip);
    s.addEventListener("mouseleave", () => { hiCat(null); hideTip(); });
  });
  catRows.forEach((r, i) => {
    r.addEventListener("mouseenter", () => hiCat(i));
    r.addEventListener("mouseleave", () => hiCat(null));
  });

  // --- البنود ---
  const chart = $("#itemsChart"), chips = $("#itemChips");
  const sorted = items.slice().sort((a, b) => b.totalC - a.totalC);
  const maxC = sorted[0].totalC;
  const itemRows = sorted.map((it, i) => {
    const c = catOf(it);
    const r = el("div", "item-row", `
      <div class="i-name"><span class="rk num">${i + 1}</span>${it.name}</div>
      <div class="i-track"><div class="i-bar" style="background:${c.color}" data-w="${(it.totalC / maxC) * 100}"></div></div>
      <div class="i-val">${N(fmt2(it.totalC))}<small>${N(pct(it.totalC))}</small></div>`);
    r.dataset.cat = c.id; bindTip(r, () => itemTip(it)); chart.appendChild(r); return r;
  });
  const itemsTotal = el("div", "items-total", `<span id="itemsTotalLabel">إجمالي البنود (${items.length})</span><b>${N(fmt2(totalC))} ${SAR}</b>`);
  chart.appendChild(itemsTotal);
  const setFilter = (id) => {
    $$("button", chips).forEach((b) => b.classList.toggle("on", b.dataset.cat === id));
    itemRows.forEach((r) => r.classList.toggle("dim", id !== "all" && r.dataset.cat !== id));
    const c = cats.find((x) => x.id === id);
    itemsTotal.innerHTML = c
      ? `<span>${c.name} (${c.items.length} من ${items.length})</span><b>${N(fmt2(c.totalC))} ${SAR} · ${N(pct(c.totalC))}</b>`
      : `<span>إجمالي البنود (${items.length})</span><b>${N(fmt2(totalC))} ${SAR}</b>`;
  };
  [{ id: "all", short: "الكل" }].concat(cats).forEach((c) => {
    const b = el("button", "", (c.color ? `<i style="background:${c.color}"></i>` : "") + c.short);
    b.dataset.cat = c.id; b.addEventListener("click", () => setFilter(c.id)); chips.appendChild(b);
  });
  setFilter("all");

  // --- الشهري ---
  const mChart = $("#monthChart"), mSide = $("#monthSide");
  const mMax = Math.max(...monthC), plotH = 490;
  const cols = B.months.map((m, k) => {
    const col = el("div", "mcol");
    const stack = el("div", "stack");
    cats.forEach((c) => {
      const v = c.items.reduce((a, it) => a + it.mc[k], 0);
      if (v) { const s = el("span"); s.style.background = c.color; s.style.height = (v / monthC[k]) * 100 + "%"; stack.appendChild(s); }
    });
    stack.dataset.h = (monthC[k] / mMax) * plotH;
    col.appendChild(el("div", "mval", N(fmt(monthC[k]))));
    col.appendChild(stack);
    col.appendChild(el("div", "mname", m));
    bindTip(col, () => `<div class="tt-title">${m} · ${N(fmt2(monthC[k]))} ${SAR}</div>` +
      items.filter((it) => it.mc[k]).sort((a, b) => b.mc[k] - a.mc[k])
        .map((it) => `<div class="tt-row"><span><i style="background:${catOf(it).color}"></i>${it.name}</span><b>${N(fmt2(it.mc[k]))}</b></div>`).join(""));
    mChart.appendChild(col); return col;
  });
  const base = el("div", "baseline");
  base.style.bottom = (recurringC / mMax) * plotH + "px"; mChart.appendChild(base);

  const peaks = monthC.map((v, k) => ({ v, k })).sort((a, b) => b.v - a.v).slice(0, 3).map((p) => p.k);
  peaks.forEach((k) => cols[k].classList.add("peak"));
  mSide.appendChild(el("div", "side-title", "أعلى ثلاثة أشهر · البنود غير الشهرية المستحقة فيها"));
  peaks.forEach((k) => {
    const extra = items.filter((it) => it.mc[k] && it.payId !== "monthly").sort((a, b) => b.mc[k] - a.mc[k]);
    const card = el("div", "peak-card", `<div class="p-head"><span class="p-month">${B.months[k]}</span><span class="p-amt">${N(fmt2(monthC[k]))}</span></div>
      <ul>${extra.map((it) => `<li><span>${it.name}</span><span>${N(fmt(it.mc[k]))}</span></li>`).join("")}
      </ul>`);
    card.addEventListener("mouseenter", () => cols[k].classList.add("hi"));
    card.addEventListener("mouseleave", () => cols[k].classList.remove("hi"));
    mSide.appendChild(card);
  });
  $("#monthLegend").innerHTML = cats.map((c) => `<span><i style="background:${c.color}"></i>${c.name}</span>`).join("") +
    `<span><i class="dash"></i>مصروفات تتكرر كل شهر ${N(fmt2(recurringC))}</span>` +
    "";

  // --- الجدول ---
  const table = $("#detailTable");
  let sortMode = "file", openRow = null;
  function renderTable() {
    const list = sortMode === "file" ? items : sorted;
    table.innerHTML = `<thead><tr>
        <th class="c-idx">#</th><th>البند</th><th>${B.grouping === "priority" ? "الأولوية" : "التصنيف"}</th><th>موعد الدفع</th>
        <th class="c-amt">المبلغ السنوي (${SAR})</th><th class="c-pct">النسبة</th><th>الملاحظات</th></tr></thead>`;
    const tb = el("tbody");
    list.forEach((it) => {
      const c = catOf(it);
      const tr = el("tr", "main", `
        <td class="c-idx num">${it.idx}</td>
        <td class="c-name">${it.name}</td>
        <td class="c-cat"><i style="background:${c.color}"></i>${c.short}</td>
        <td class="c-pay">${it.pay}</td>
        <td class="c-amt">${N(fmt2(it.totalC))}</td>
        <td class="c-pct">${N(pct(it.totalC))}</td>
        <td class="c-note">${it.desc || it.note || "—"}</td>`);
      const ex = el("tr", "expand", `<td colspan="7"><div class="expand-body">
        <div class="mgrid">${B.months.map((m, k) => `<div class="${it.mc[k] ? "has" : ""}"><b>${m}</b><span class="num">${it.mc[k] ? fmt(it.mc[k]) : "—"}</span></div>`).join("")}</div>
        <div class="orig"><b>${it.added ? "بند مضاف بطلب صاحب الميزانية (غير موجود في ملف Excel):" : `البند في ملف Excel (الصف ${it.row}):`}</b> ${it.source}${it.desc ? `<br><b>الوصف في الملف:</b> ${it.desc}` : ""}</div></div></td>`);
      ex.hidden = true;
      tr.addEventListener("click", () => {
        const willOpen = ex.hidden;
        if (openRow && openRow !== ex) { openRow.hidden = true; openRow.previousSibling.classList.remove("open"); }
        ex.hidden = !willOpen; tr.classList.toggle("open", willOpen); openRow = willOpen ? ex : null;
      });
      tb.appendChild(tr); tb.appendChild(ex);
    });
    table.appendChild(tb);
    table.appendChild(el("tfoot", "", `<tr><td></td><td colspan="3">الإجمالي (${items.length} بندًا)</td>
      <td class="c-amt">${N(fmt2(totalC))}</td><td class="c-pct">${N("100.0%")}</td><td></td></tr>`));
    openRow = null;
  }
  renderTable();
  $$("#tableSort button").forEach((b) => b.addEventListener("click", () => {
    sortMode = b.dataset.sort; $$("#tableSort button").forEach((x) => x.classList.toggle("on", x === b)); renderTable();
  }));

  // --- الختام ---
  $("#closeCats").innerHTML = cats.map((c) => `<div><div class="n"><i style="background:${c.color}"></i>${c.short}</div><div class="v">${N(fmt(c.totalC))}<small>${N(pct(c.totalC))}</small></div></div>`).join("");

  /* ================= أنميشن الدخول لكل شريحة ================= */
  const slides = $$(".slide");
  const enter = [
    () => {},
    (s) => {
      countUp($("#kpiTotal"), totalC, 1800, true);
      $$(".kpi .num", s).forEach((n, i) => setTimeout(() => countUp(n, +n.dataset.c, 1400, !!n.dataset.dec), 250 + i * 100));
      setTimeout(() => $$("span", payBar).forEach((x) => (x.style.width = x.dataset.w + "%")), 500);
    },
    (s) => {
      segs.forEach((x, i) => setTimeout(() => (x.style.strokeDasharray = `${x.dataset.len} ${CIRC}`), 300 + i * 180));
      setTimeout(() => $$(".c-bar span", s).forEach((x) => (x.style.width = x.dataset.w + "%")), 500);
    },
    (s) => { $$(".i-bar", s).forEach((x, i) => setTimeout(() => (x.style.width = x.dataset.w + "%"), 200 + i * 45)); },
    () => { cols.forEach((c, i) => { const st = $(".stack", c); setTimeout(() => (st.style.height = st.dataset.h + "px"), 200 + i * 55); }); },
    () => {},
    () => { countUp($("#closeTotal"), totalC, 1800, true); }
  ];
  const leave = [
    () => {},
    (s) => { $$("span", payBar).forEach((x) => (x.style.width = 0)); $("#kpiTotal").textContent = "0"; $$(".kpi .num", s).forEach((n) => (n.textContent = "0")); },
    (s) => { segs.forEach((x) => (x.style.strokeDasharray = `0 ${CIRC}`)); $$(".c-bar span", s).forEach((x) => (x.style.width = 0)); hiCat(null); },
    (s) => { $$(".i-bar", s).forEach((x) => (x.style.width = 0)); },
    () => { cols.forEach((c) => ($(".stack", c).style.height = 0)); },
    () => {},
    () => { $("#closeTotal").textContent = "0"; }
  ];

  /* ================= التنقل ================= */
  let cur = -1;
  const dots = $("#dots"), counter = $("#counter"), fill = $("#progressFill");
  slides.forEach((s, i) => {
    const d = el("button"); d.title = s.dataset.title; d.setAttribute("aria-label", s.dataset.title);
    d.addEventListener("click", () => go(i)); dots.appendChild(d);
  });
  const timers = [];
  function go(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i === cur) return;
    hideTip();
    const prev = cur; cur = i;
    slides.forEach((s, k) => { s.classList.toggle("active", k === i); s.classList.toggle("past", k < i); });
    if (prev >= 0) { const p = prev; timers.push(setTimeout(() => { if (cur !== p) leave[p](slides[p]); }, 800)); }
    enter[i](slides[i]);
    $$("button", dots).forEach((d, k) => d.classList.toggle("on", k === i));
    counter.textContent = i + 1 + " / " + slides.length;
    fill.style.width = ((i + 1) / slides.length) * 100 + "%";
    $("#prevBtn").disabled = i === 0; $("#nextBtn").disabled = i === slides.length - 1;
    document.body.classList.toggle("on-cover", i === 0);
    history.replaceState(null, "", "#" + (i + 1));
  }
  const next = () => go(cur + 1), prev = () => go(cur - 1);
  $("#nextBtn").addEventListener("click", next);
  $("#prevBtn").addEventListener("click", prev);

  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    // اتجاه RTL: السهم الأيسر = التالي، السهم الأيمن = السابق
    if (["ArrowLeft", "ArrowDown", "PageDown", " ", "Enter"].includes(k)) { e.preventDefault(); next(); }
    else if (["ArrowRight", "ArrowUp", "PageUp", "Backspace"].includes(k)) { e.preventDefault(); prev(); }
    else if (k === "Home") go(0);
    else if (k === "End") go(slides.length - 1);
    else if (/^[1-9]$/.test(k)) go(+k - 1);
    else if (k === "f" || k === "F") toggleFull();
  });
  function toggleFull() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen && document.exitFullscreen();
  }
  stage.addEventListener("dblclick", (e) => { if (!e.target.closest("button, tr, .chips")) toggleFull(); });

  // السحب على الشاشات اللمسية
  let tx = null;
  stage.addEventListener("touchstart", (e) => (tx = e.touches[0].clientX), { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 60) (dx > 0 ? next() : prev());
  });

  /* ---------- ملاءمة الشاشة ---------- */
  function fit() {
    scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.setProperty("--scale", scale);
  }
  window.addEventListener("resize", fit); fit();

  const start = parseInt((location.hash || "").slice(1), 10);
  go(start >= 1 && start <= slides.length ? start - 1 : 0);

  // للاطلاع من وحدة التحكم
  window.__budgetCheck = { totalC, monthC, cats: cats.map((c) => [c.name, c.totalC, pct(c.totalC)]), checks };
})();
