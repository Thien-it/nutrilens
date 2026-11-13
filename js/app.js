/* NutriLens — giao diện. Mọi dữ liệu nằm trong IndexedDB của máy, không gửi đi đâu. */
(function () {
  'use strict';
  const L = Logic, FD = FoodDB, CATS = FD.CATS;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; };
  const fmt = x => (Math.round(x * 10) / 10).toLocaleString('vi-VN');
  const fmt0 = x => Math.round(x).toLocaleString('vi-VN');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const DAY = 86400000, WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const hm = ts => new Date(ts).toTimeString().slice(0, 5);
  const toLocalInput = ts => { const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
  const dayLabel = key => { const d = new Date(key + 'T12:00'); return `${WD[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`; };
  const ICON = { ok: '✓', warn: '!', bad: '✕', tip: '→' };

  /* ---------- IndexedDB ---------- */
  const Store = (() => {
    let p;
    const open = () => p || (p = new Promise((res, rej) => {
      const r = indexedDB.open('nutrilens', 1);
      r.onupgradeneeded = () => { const d = r.result; for (const s of ['meals', 'photos', 'glucose']) d.createObjectStore(s, { keyPath: 'id' }); d.createObjectStore('kv', { keyPath: 'k' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = (s, mode, fn) => open().then(d => new Promise((res, rej) => { const t = d.transaction(s, mode), rq = fn(t.objectStore(s)); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }));
    return {
      all: s => tx(s, 'readonly', o => o.getAll()), get: (s, k) => tx(s, 'readonly', o => o.get(k)),
      put: (s, v) => tx(s, 'readwrite', o => o.put(v)), del: (s, k) => tx(s, 'readwrite', o => o.delete(k)), clear: s => tx(s, 'readwrite', o => o.clear()),
    };
  })();

  /* ---------- Trạng thái ---------- */
  const S = { tab: 'home', day: L.dayKey(Date.now()), meals: [], glucose: [], profile: {}, custom: [], range: 7, learned: null, foodQ: '', foodCat: '', labelLearn: {}, vlmStats: {}, taught: [], customIng: [] };
  let E = null;   // bữa đang sửa
  let F = null;   // form món (nhập số)
  let PE = null;  // form ghép nguyên liệu
  const targets = () => L.calcTargets(S.profile);
  const relearn = () => { S.learned = L.learn(S.meals, S.glucose); };
  const saveKV = (k, v) => Store.put('kv', { k, v });

  function allFoods() {
    const names = new Set(S.custom.map(f => f.name));
    return S.custom.map(f => Object.assign({}, f, { custom: true })).concat(FD.FOODS.filter(f => !names.has(f.name)));
  }
  const findFood = name => allFoods().find(f => f.name === name);
  function itemFromFood(f, qty) {
    const it = { name: f.name, portion: f.portion, qty: qty || 1, k: f.k, c: f.c, s: f.s, f: f.f, pr: f.pr, fa: f.fa, gi: f.gi || 0, cat: f.cat, flags: f.flags || '', swap: f.swap || '' };
    if (f.parts) { it.parts = f.parts.map(p => Object.assign({}, p)); it.sA = f.sA; it.veg = f.veg; }
    return it;
  }
  function searchFoods(q, cat) {
    const n = L.strip(q).trim();
    let list = allFoods();
    if (cat) list = list.filter(f => cat === 'rieng' ? f.custom : f.cat === cat);
    if (n) {
      const words = n.split(/\s+/);
      list = list.filter(f => { const s = L.strip(f.name); return words.every(w => s.includes(w)); })
        .sort((a, b) => (L.strip(b.name).startsWith(n) - L.strip(a.name).startsWith(n)) || a.name.length - b.name.length);
    }
    return list;
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); }
  const gdisp = v => S.profile.gunit === 'mgdl' ? fmt0(v * 18) : fmt(v);
  const gunit = () => S.profile.gunit === 'mgdl' ? 'mg/dL' : 'mmol/L';

  /* ---------- Mảnh giao diện dùng chung ---------- */
  const notesHtml = notes => `<ul class="notes">${notes.map(n => `<li class="${n.lv}"><span class="ic">${ICON[n.lv]}</span><span>${esc(n.text).replace(/(\d)\.(\d)/g, '$1,$2')}</span></li>`).join('')}</ul>`;
  function meter(label, val, tgt, unit, kind) {
    const pct = tgt ? val / tgt : 0;
    let cls = '', flag = '';
    if (kind === 'max') { if (pct > 1.05) { cls = 'over'; flag = `▲ vượt ${Math.round((pct - 1) * 100)}%`; } else if (pct > 0.9) { cls = 'near'; flag = 'sắp chạm mức'; } }
    else if (pct >= 1) flag = 'đạt';
    return `<div class="meter ${cls}"><div class="lbl"><span>${label}</span><b>${fmt(val)} / ${fmt0(tgt)} ${unit}</b></div>${flag ? `<div class="flag small">${flag}</div>` : ''}<div class="bar"><i style="width:${Math.min(100, pct * 100)}%"></i></div></div>`;
  }
  const footHtml = (act, label, closeAct) => `<div class="foot"><button class="btn" data-act="${closeAct}">Hủy</button><button class="btn primary big" data-act="${act}">${label}</button></div>`;
  const itemsText = items => items.map(i => i.name + (i.qty !== 1 ? ` ×${fmt(i.qty)}` : '')).join(', ');

  /* ================= NHẬT KÝ ================= */
  function renderHome() {
    const t = targets(), today = L.dayKey(Date.now());
    const meals = S.meals.filter(m => L.dayKey(m.ts) === S.day).sort((a, b) => a.ts - b.ts);
    const gl = S.glucose.filter(g => L.dayKey(g.ts) === S.day).sort((a, b) => a.ts - b.ts);
    const ev = L.evaluateDay(meals, t, S.profile, { isToday: S.day === today });
    const tot = ev.tot;
    let h = `<div class="daynav">
      <button class="btn" data-act="day" data-d="-1" aria-label="Ngày trước">‹</button>
      <div class="title"><h1>${S.day === today ? 'Hôm nay' : dayLabel(S.day)}</h1><div class="muted small">${S.day === today ? dayLabel(S.day) : `<button class="btn ghost sm" data-act="day" data-d="0">Về hôm nay</button>`}</div></div>
      <button class="btn" data-act="day" data-d="1" aria-label="Ngày sau" ${S.day >= today ? 'disabled' : ''}>›</button></div>`;
    h += `<div class="card"><div class="row between"><div class="hero"><b>${fmt0(tot.k)}</b><span class="muted">/ ${fmt0(t.kcal)} kcal</span></div>${ev.score != null ? `<span class="badge ${ev.level}">${ICON[ev.level]} ${ev.label} · ${ev.score}</span>` : ''}</div>
      ${meter('Năng lượng', tot.k, t.kcal, 'kcal', 'max')}
      <div class="grid2">${meter('Tinh bột', tot.c, t.carb, 'g', 'max')}${meter('Đường', tot.s, t.sugar, 'g', 'max')}${meter('Chất xơ', tot.f, t.fiber, 'g', 'min')}${meter('Đạm', tot.pr, t.protein, 'g', 'min')}</div>
      ${t.personalized ? '' : `<p class="small muted" style="margin:10px 0 0">Đang dùng mục tiêu mặc định 1.800 kcal. <button class="btn ghost sm" data-act="tab" data-tab="settings">Nhập thông tin cá nhân</button></p>`}</div>`;
    if (ev.notes.length) h += `<div class="card"><h2>Đánh giá trong ngày</h2>${notesHtml(ev.notes)}</div>`;
    h += `<h2 style="margin-top:18px">Bữa ăn</h2>`;
    if (!meals.length) h += `<div class="empty">Chưa ghi bữa nào.<br>Bấm <b>+ Bữa ăn</b> để chụp ảnh và chọn món.</div>`;
    for (const m of meals) {
      const e = L.evaluateMeal(m, t, S.profile, S.learned);
      h += `<button class="meal" data-act="edit-meal" data-id="${m.id}">
        <div class="thumb" ${m.hasPhoto ? `data-photo="${m.id}"` : ''}>${m.hasPhoto ? '' : hm(m.ts)}</div>
        <div class="body"><div class="row between"><b>${hm(m.ts)} · ${L.MEALS[m.type].label}</b><span class="badge ${e.level}">${e.label}</span></div>
        <div class="items">${esc(itemsText(m.items)) || '<i>Chưa chọn món</i>'}</div>${m.deep ? `<div class="small"><span class="tag" style="margin-left:0">Có kết quả phân tích kỹ · ${m.deep.items.filter(i => i.on).length} thành phần</span></div>` : ''}
        <div class="row between"><span class="small muted num">${fmt0(e.tot.k)} kcal · tinh bột ${fmt(e.tot.c)}g · GL ${fmt(e.tot.gl)}</span><span class="editpill">✎ Sửa</span></div></div></button>`;
    }
    h += `<div class="card"><div class="row between"><h2>Đường huyết</h2><button class="btn sm" data-act="add-glucose">+ Thêm</button></div>`;
    if (!gl.length) h += `<p class="muted small" style="margin:8px 0 0">Chưa có lần đo nào. Nhập số đo sau ăn 2 giờ để app học món nào ảnh hưởng nhiều đến bạn.</p>`;
    for (const g of gl) { const e = L.evalGlucose(g.val, g.ctx); h += `<div class="gl-row"><b class="num">${hm(g.ts)}</b><div class="grow"><b class="num">${gdisp(g.val)}</b> <span class="muted small">${gunit()} · ${L.GCTX[g.ctx]}</span><div class="small"><span class="badge ${e.lv}">${ICON[e.lv]} ${esc(e.text)}</span></div></div><button class="iconbtn" data-act="del-glucose" data-id="${g.id}" aria-label="Xóa">✕</button></div>`; }
    h += `</div><div class="fab"><button class="btn primary" data-act="new-meal">+ Bữa ăn</button></div>`;
    $('#view').innerHTML = h;
    document.querySelectorAll('[data-photo]').forEach(async el => { const p = await Store.get('photos', el.dataset.photo); if (p) el.style.backgroundImage = `url(${p.data})`; });
  }

  /* ================= SỬA BỮA ĂN ================= */
  function openEditor(meal) {
    if (meal) { E = JSON.parse(JSON.stringify(meal)); E.isNew = false; E.typeAuto = false; }
    else {
      const now = Date.now(), ts = S.day === L.dayKey(now) ? now : new Date(S.day + 'T12:00').getTime();
      E = { id: uid(), ts, type: L.mealTypeByTime(ts), items: [], note: '', hasPhoto: false, isNew: true, typeAuto: true };
    }
    E.photo = null; E.photoChanged = false; E.ocr = null; E.vis = null; E.deep = reviveDeep(E.deep); E.pending = []; E.q = ''; E.cat = '';
    const sh = $('#sheet');
    sh.innerHTML = `<div class="bar"><button class="btn ghost" data-act="close-editor">✕ Đóng</button><h2>${E.isNew ? 'Thêm bữa ăn' : 'Sửa bữa ăn'}</h2><span class="sp"></span></div>
    <div class="in">
      <div class="cols"><label class="f">Thời gian<input class="inp" type="datetime-local" id="e-ts" value="${toLocalInput(E.ts)}"></label>
      <label class="f">Loại bữa<select class="inp" id="e-type">${Object.entries(L.MEALS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label></div>
      <div class="card"><h3>Ảnh bữa ăn / nhãn dinh dưỡng</h3><div id="e-photo"></div><div id="e-ocr"><div id="e-vis"></div><div id="e-ocrtxt"></div><div id="e-deep"></div></div>
        <input type="file" accept="image/*" capture="environment" id="e-cam" hidden><input type="file" accept="image/*" id="e-lib" hidden></div>
      <div class="card"><h3>Món trong bữa</h3><div id="e-items"></div><div id="e-eval"></div></div>
      <div class="card"><h3>Thêm món</h3><input class="inp" id="e-q" type="search" placeholder="Tìm món: phở, cơm, sushi, pizza…" autocomplete="off">
        <div class="chips" id="e-cats"></div><div id="e-results"></div>
        <div class="btns" style="margin-top:10px"><button class="btn sm" data-act="new-food-num">+ Món mới (nhập số)</button><button class="btn sm" data-act="new-food-parts">+ Món mới (ghép nguyên liệu)</button></div></div>
      <label class="f">Ghi chú<textarea class="inp" id="e-note" placeholder="Ví dụ: ăn ngoài, ăn vội…">${esc(E.note || '')}</textarea></label>
      ${E.isNew ? '' : `<button class="btn danger block" style="margin-top:16px" data-act="del-meal">Xóa bữa này</button>`}
    </div>${footHtml('save-meal', 'Lưu bữa ăn', 'close-editor')}`;
    $('#e-type').value = E.type;
    sh.hidden = false; sh.scrollTop = 0;
    updPhoto(); updItems(); updResults();
    if (E.hasPhoto) Store.get('photos', E.id).then(p => { if (p && E && !E.photoChanged) { E.photo = p.data; updPhoto(); } });
  }
  function updPhoto() {
    $('#e-photo').innerHTML = E.photo
      ? `<img class="photo" src="${E.photo}" alt="Ảnh bữa ăn" style="margin-top:8px"><div class="btns" style="margin-top:8px"><button class="btn sm" data-act="ocr-again">Phân tích lại cả ảnh</button><button class="btn sm" data-act="pick-cam">Chụp lại</button><button class="btn sm" data-act="pick-lib">Chọn ảnh khác</button><button class="btn sm danger" data-act="rm-photo">Bỏ ảnh</button></div>`
      : `<p class="small muted" style="margin:6px 0 8px">Chụp món ăn hoặc <b>bảng giá trị dinh dưỡng</b> trên bao bì — app tự nhận diện món và đọc chữ ngay trên máy.</p><div class="btns"><button class="btn primary" data-act="pick-cam">Chụp ảnh</button><button class="btn" data-act="pick-lib">Chọn từ thư viện</button></div>`;
    updDeep();
  }
  function updItems() {
    const box = $('#e-items');
    if (!E.items.length) { box.innerHTML = `<p class="muted small" style="margin:6px 0">Chưa có món. Tìm và bấm vào món ở bên dưới.</p>`; $('#e-eval').innerHTML = ''; return; }
    box.innerHTML = E.items.map((it, i) => `<div class="mitem"><div class="row between"><b>${esc(it.name)}</b><span class="num"><b>${fmt0(it.k * it.qty)}</b> kcal</span></div>
      <div class="small muted num">${esc(it.portion)} × ${fmt(it.qty)} · tinh bột ${fmt(it.c * it.qty)}g</div>
      <div class="row" style="margin-top:8px"><div class="qty"><button data-act="qty" data-i="${i}" data-d="-0.5" aria-label="Bớt nửa phần">−</button><input type="number" inputmode="decimal" step="0.25" min="0.25" value="${it.qty}" data-chg="qty" data-i="${i}" aria-label="Số khẩu phần"><button data-act="qty" data-i="${i}" data-d="0.5" aria-label="Thêm nửa phần">+</button></div><span class="grow"></span>
      <button class="btn sm" data-act="${it.parts ? 'edit-parts' : 'edit-item'}" data-i="${i}">✎ Sửa</button><button class="btn sm danger" data-act="rm-item" data-i="${i}">Xóa</button></div></div>`).join('');
    updEval();
  }
  function updEval() {
    const e = L.evaluateMeal(E, targets(), S.profile, S.learned), t = e.tot;
    $('#e-eval').innerHTML = `<div class="totals"><div><b>${fmt0(t.k)}</b><span>kcal</span></div><div><b>${fmt(t.c)}</b><span>tinh bột (g)</span></div><div><b>${fmt(t.s)}</b><span>đường (g)</span></div><div><b>${fmt(t.gl)}</b><span>tải đường huyết</span></div></div>
      <div class="row between" style="margin-top:12px"><b>Đánh giá bữa này</b><span class="badge ${e.level}">${ICON[e.level]} ${e.label} · ${e.score}</span></div>${notesHtml(e.notes)}
      ${e.swaps.length ? `<div style="margin-top:10px"><b>Đề xuất thay đổi</b>${notesHtml(e.swaps.map(s => ({ lv: 'tip', text: (s.name ? s.name + ': ' : '') + s.text })))}</div>` : ''}`;
  }
  function foodRow(f, act) {
    return `<button class="food" data-act="${act}" data-name="${esc(f.name)}"><div class="grow"><span class="n">${esc(f.name)}</span>${f.custom ? '<span class="tag">của tôi</span>' : ''}${f.parts ? '<span class="tag">ghép nguyên liệu</span>' : ''}
      <div class="small muted num">${esc(f.portion)} · ${fmt0(f.k)} kcal · tinh bột ${fmt(f.c)}g${f.gi ? ` · GI ${f.gi}` : ''}</div></div><span class="plus">${act === 'add-food' ? '+' : '›'}</span></button>`;
  }
  function catChips(cur, act) {
    return [['', 'Tất cả'], ['rieng', 'Của tôi']].concat(Object.entries(CATS).filter(([k]) => !['nhan', 'rieng'].includes(k))).map(([k, v]) => `<button class="chip ${cur === k ? 'on' : ''}" data-act="${act}" data-cat="${k}">${v}</button>`).join('');
  }
  function updResults() {
    $('#e-cats').innerHTML = catChips(E.cat, 'e-cat');
    let list, head = '';
    if (!E.q.trim() && !E.cat) {
      const freq = L.frequentFoods(S.learned, E.type, 6).map(findFood).filter(Boolean);
      if (freq.length) { list = freq; head = `<div class="small muted" style="margin-top:6px">Bạn hay ăn vào ${L.MEALS[E.type].label.toLowerCase()}:</div>`; }
      else { list = []; head = `<p class="small muted" style="margin:8px 0 0">Gõ tên món hoặc chọn nhóm ở trên. Có ${allFoods().length} món Việt Nam và thế giới; món chưa có thì tự thêm được.</p>`; }
    } else list = searchFoods(E.q, E.cat).slice(0, 40);
    $('#e-results').innerHTML = head + (list.length ? list.map(f => foodRow(f, 'add-food')).join('') : (head ? '' : `<p class="muted small" style="margin:10px 0">Không tìm thấy “${esc(E.q)}”. Bấm <b>+ Món mới</b> để thêm — lần sau app sẽ nhớ.</p>`));
  }

  /* ---------- Ảnh + OCR chạy trên máy ---------- */
  function loadImage(file) {
    return new Promise((res, rej) => { const url = URL.createObjectURL(file), img = new Image(); img.onload = () => { URL.revokeObjectURL(url); res(img); }; img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Không mở được ảnh')); }; img.src = url; });
  }
  function drawScaled(img, max) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
  }
  // Tiền xử lý cho OCR: phóng to ảnh nhỏ (chữ cần đủ lớn), lấy 1 kênh màu, kéo giãn tương phản (bỏ 2% điểm tối/sáng nhất).
  // mode: gray = độ sáng, g = kênh lục (tách chữ đỏ/nâu khỏi nền vàng), min = kênh nhỏ nhất (chữ đậm trên nền màu)
  function prepForOcr(img, mode, maxSide) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height, side = Math.max(w0, h0);
    const k = side < 1400 ? Math.min(5, 1800 / side) : Math.min(1, (maxSide || 2000) / side);
    const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height), a = d.data, hist = new Uint32Array(256);
    for (let i = 0; i < a.length; i += 4) { const g = (mode === 'g' ? a[i + 1] : mode === 'min' ? Math.min(a[i], a[i + 1], a[i + 2]) : (a[i] * 299 + a[i + 1] * 587 + a[i + 2] * 114) / 1000) | 0; a[i] = g; hist[g]++; }
    const n = a.length / 4; let lo = 0, hi = 255, acc = 0;
    for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * 0.02) break; }
    for (acc = 0; hi > 0; hi--) { acc += hist[hi]; if (acc > n * 0.02) break; }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < a.length; i += 4) { const v = Math.max(0, Math.min(255, (a[i] - lo) * 255 / span)); a[i] = a[i + 1] = a[i + 2] = v; }
    ctx.putImageData(d, 0, 0); return c;
  }
  let ocrWorker = null, ocrProgress = null;
  async function getOcr() {
    if (ocrWorker) return ocrWorker;
    const base = new URL('vendor/tesseract/', location.href).href;
    ocrWorker = await Tesseract.createWorker(['vie', 'eng'], 1, {
      workerPath: base + 'worker.min.js', corePath: base, langPath: base + 'lang', gzip: true, workerBlobURL: false,
      logger: m => { if (ocrProgress) ocrProgress(m); },
    });
    return ocrWorker;
  }
  async function onPhoto(file) {
    if (!file) return;
    try {
      const img = await loadImage(file);
      E.photo = drawScaled(img, 900).toDataURL('image/jpeg', 0.72); E.photoChanged = true; E.ocrImg = img; E.fullVec = null; E.deep = null;
      updPhoto(); analyze();
    } catch (err) { toast(err.message || 'Không đọc được ảnh'); }
  }
  /* Đọc nhiều lượt: lượt 1 coi ảnh như trang tài liệu (hợp với bảng dinh dưỡng). Nếu không ra bảng số thì đọc tiếp
     ở chế độ "chữ rải rác" trên nhiều kênh màu — hợp với chữ dán trên ảnh món ăn, bảng hiệu, thực đơn. */
  const OCR_PASSES = [['gray', '3', 2000], ['gray', '11', 1600], ['g', '11', 1600], ['min', '11', 1600], ['g', '6', 1600]];
  /* Phân tích ảnh: (1) nhận diện món bằng mô hình trên máy — nhanh, ra trước; (2) đọc chữ. src = vùng đã khoanh (canvas) hoặc cả ảnh. */
  async function ensureImg() { if (!E.ocrImg && E.photo) { const img = new Image(); img.src = E.photo; await img.decode(); if (E) E.ocrImg = img; } return E && E.ocrImg; }
  async function analyze(region) {
    const mine = E;
    E.vis = { status: 'run' }; E.ocr = null; updVis(); updOcr();
    try {
      const src = region || await ensureImg(); if (E !== mine || !src) return;
      const r = await Vision.classify(src); if (E !== mine) return;
      if (!region) E.fullVec = r.vec;
      E.vis = Object.assign({ status: 'done', region: !!region }, visionSuggest(r));
    } catch (err) { if (E !== mine) return; E.vis = { status: 'err', msg: 'Chưa chạy được bộ nhận diện món: ' + (err && err.message || err) }; }
    updVis();
    // tự tìm lại những gì người dùng đã dạy (chỉ khi phân tích cả ảnh)
    if (!region && S.taught.some(t => !t.neg)) ensureImg().then(img => img && recallTaught(img)).then(found => { if (E === mine && found && found.length) { applyRecall(found); updDeep(); } }).catch(() => {});
    return runOcr(region);
  }
  function visionSuggest(r) {
    const seen = new Set(), guesses = [], other = [];
    for (const t of r.top) { const f = findFood(Vision.foodFor(t.label)); if (t.score < 0.12) continue; if (f && !seen.has(f.name)) { seen.add(f.name); guesses.push({ food: f, score: t.score, label: t.label }); } else if (!f && t.score >= 0.15) other.push(t); }
    // tự học: với kiểu ảnh này người dùng thường chọn món gì
    const w = {}; for (const t of r.top.slice(0, 3)) for (const [n, c] of Object.entries(S.labelLearn[t.idx] || {})) w[n] = (w[n] || 0) + c * t.score;
    const mine = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => findFood(e[0])).filter(f => f && !seen.has(f.name));
    // tự học: ảnh giống bữa đã ghi trước đây
    const sims = S.meals.filter(m => m.vec && m.items.length && m.id !== E.id).map(m => ({ m, s: Vision.cosine(r.vec, m.vec) })).filter(x => x.s >= 0.7).sort((a, b) => b.s - a.s || b.m.ts - a.m.ts).slice(0, 2);
    return { guesses, other, mine, sims, top: r.top };
  }
  function updVis() {
    const v = E.vis, box = $('#e-vis'); if (!box) return;
    if (!v) { box.innerHTML = ''; return; }
    if (v.status === 'run') { box.innerHTML = `<div class="ocrbox">Đang nhận diện món…</div>`; return; }
    if (v.status === 'err') { box.innerHTML = `<div class="ocrbox small muted">${esc(v.msg)}</div>`; return; }
    const pct = s => Math.round(s * 100) + '%', best = v.guesses.length ? v.guesses[0].score : 0;
    let h = `<div><b>Nhận diện món${v.region ? ' trong vùng đã khoanh' : ''}</b> <span class="small muted">(mô hình chạy trên máy)</span></div>`;
    for (const x of v.sims) h += `<div style="margin-top:8px">Giống bữa <b>${dayLabel(L.dayKey(x.m.ts))} ${hm(x.m.ts)}</b> (${pct(x.s)}): ${esc(itemsText(x.m.items))}</div><div class="btns" style="margin-top:6px"><button class="btn primary" data-act="add-sim" data-id="${x.m.id}">Thêm lại các món này</button></div>`;
    if (v.mine.length) h += `<div style="margin-top:8px">Với ảnh kiểu này bạn thường chọn:</div><div class="wrapchips">${v.mine.map(f => `<button class="chip" data-act="add-food" data-name="${esc(f.name)}">+ ${esc(f.name)}</button>`).join('')}</div>`;
    if (v.guesses.length) h += `<div class="wrapchips" style="margin-top:8px">${v.guesses.slice(0, 4).map(g => `<button class="chip ${g.score >= 0.5 ? 'on' : ''}" data-act="add-food" data-name="${esc(g.food.name)}">+ ${esc(g.food.name)} · ${pct(g.score)}</button>`).join('')}</div>`;
    if (v.other.length && best < 0.5) h += `<div class="small muted" style="margin-top:6px">Mô hình còn thấy giống: ${v.other.slice(0, 3).map(t => `${esc(t.label)} ${pct(t.score)}`).join(', ')} (chưa có trong danh sách món).</div>`;
    if (!v.guesses.length && !v.sims.length && !v.mine.length) h += `<div style="margin-top:6px">Chưa nhận ra món nào.</div>`;
    if (best < 0.5 && !v.region) h += `<div class="btns" style="margin-top:8px"><button class="btn" data-act="plate">Ghép đĩa nhiều món</button></div>`;
    if (best < 0.35 && !v.sims.length) h += `<div class="small" style="margin-top:8px"><span class="badge warn">! Chưa chắc chắn</span> ${v.region ? 'Thử khoanh sát món hơn, hoặc chọn món ở ô Thêm món.' : 'Đĩa có nhiều thành phần (cơm + đạm + rau) thì bấm <b>Ghép đĩa nhiều món</b> và chạm chọn từng thành phần. App sẽ nhớ để lần sau gặp ảnh giống là gợi ý lại.'}</div>`;
    box.innerHTML = `<div class="ocrbox">${h}</div>`;
  }
  // ghi nhớ tạm: ảnh đang có các nhãn này → người dùng chọn món X (chỉ lưu thật khi bấm Lưu bữa ăn)
  function noteChoice(name) { if (E && E.vis && E.vis.status === 'done') for (const t of E.vis.top.slice(0, 2)) if (t.score >= 0.06) E.pending.push([t.idx, name]); }

  /* ---------- Khoanh vùng trên ảnh ---------- */
  let CR = null;
  function openCrop() {
    if (!E.photo) return;
    CR = null;
    $('#sheet2').innerHTML = `<div class="bar"><button class="btn ghost" data-act="close-sheet2">✕ Đóng</button><h2>Khoanh vùng & giải thích</h2><span class="sp"></span></div><div class="in">
      <p class="small muted">Kéo ngón tay trên ảnh để khoanh <b>một món / một thành phần</b> (ví dụ phần cơm) hoặc <b>vùng có chữ</b>. Kéo lại để khoanh vùng khác.</p>
      <div id="crop-box"><img src="${E.photo}" alt="" draggable="false"><div id="crop-sel" hidden></div></div>
      <div class="card"><h3>Dạy AI: vùng vừa khoanh là gì?</h3><p class="small muted" style="margin:4px 0 0">Chọn tên bên dưới: app thêm thứ đó vào bữa và <b>ghi nhớ hình ảnh vùng này</b>. Lần sau gặp vùng giống vậy app sẽ tự gợi ý.</p>
        <label class="f">Giải thích thêm (tuỳ chọn)<textarea class="inp" id="teach-note" placeholder="vd: chả ức gà nhà làm, áp chảo ít dầu; 2 miếng khoảng 120g"></textarea></label>
        <label class="f">Tên món / thành phần<input class="inp" id="teach-q" type="search" autocomplete="off" placeholder="Gõ để tìm hoặc đặt tên mới: cơm gạo lứt, trứng, chả ức gà…"></label><div class="wrapchips" id="teach-res"></div></div></div>${footHtml('crop-apply', 'Chỉ phân tích vùng này', 'close-sheet2')}`;
    $('#sheet2').hidden = false; $('#sheet2').scrollTop = 0; updTeach();
  }
  function cropPoint(e) { const r = $('#crop-box').getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; }
  function drawCrop() { const s = $('#crop-sel'), x = Math.min(CR.x0, CR.x1), y = Math.min(CR.y0, CR.y1), w = Math.abs(CR.x1 - CR.x0), h = Math.abs(CR.y1 - CR.y0); s.hidden = false; s.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%`; }
  document.addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('#crop-box'); if (!b) return; e.preventDefault(); const p = cropPoint(e); CR = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, drag: true }; b.setPointerCapture(e.pointerId); drawCrop(); });
  document.addEventListener('pointermove', e => { if (!CR || !CR.drag || !$('#crop-box')) return; const p = cropPoint(e); CR.x1 = p.x; CR.y1 = p.y; drawCrop(); });
  document.addEventListener('pointerup', () => { if (CR) CR.drag = false; });
  async function applyCrop() {
    if (!CR || Math.abs(CR.x1 - CR.x0) < 0.06 || Math.abs(CR.y1 - CR.y0) < 0.06) return toast('Kéo trên ảnh để khoanh một vùng trước');
    const img = await ensureImg(), W = img.naturalWidth, H = img.naturalHeight;
    const x = Math.min(CR.x0, CR.x1) * W, y = Math.min(CR.y0, CR.y1) * H, w = Math.abs(CR.x1 - CR.x0) * W, h = Math.abs(CR.y1 - CR.y0) * H;
    const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h);
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    closeSheet2(); $('#e-ocr').scrollIntoView({ block: 'center' }); analyze(c);
  }

  async function runOcr(region) {
    const mine = E;
    const image = region || await ensureImg(); if (E !== mine || !image) return;
    E.ocr = { status: 'run', p: 0, msg: 'Đang chuẩn bị bộ đọc chữ…' }; updOcr();
    let pass = 0;
    ocrProgress = m => { if (E !== mine || !E.ocr || E.ocr.status !== 'run') return; if (m.status === 'recognizing text') { E.ocr.p = (pass + m.progress) / OCR_PASSES.length; E.ocr.msg = pass ? `Đang tìm chữ trên ảnh món ăn (lượt ${pass + 1}/${OCR_PASSES.length})…` : 'Đang đọc chữ trên ảnh…'; } const b = $('#e-ocr .progress i'), s = $('#e-ocr .msg'); if (b) b.style.width = Math.round(E.ocr.p * 100) + '%'; if (s) s.textContent = E.ocr.msg; };
    try {
      const w = await getOcr(), texts = [], foods = allFoods();
      let parsed = { found: 0 };
      for (; pass < OCR_PASSES.length; pass++) {
        const [mode, psm, side] = OCR_PASSES[pass];
        await w.setParameters({ tessedit_pageseg_mode: psm });
        const { data } = await w.recognize(prepForOcr(image, mode, side));
        if (E !== mine) return;
        const text = data.text || ''; texts.push(text);
        const p = L.parseNutritionText(text); if (p.found > parsed.found) parsed = p;
        if (pass === 0 && parsed.found >= 3) break;
        if (pass === 0 && (text.match(/[\p{L}\p{N}]/gu) || []).length < 6 && E.vis && E.vis.guesses && E.vis.guesses[0] && E.vis.guesses[0].score >= 0.5) break;                                    // đã ra bảng dinh dưỡng
        if (pass === 1 && !L.interpretDishText(texts, foods).words.length) break;      // ảnh không có chữ liên quan món ăn
      }
      const dish = L.interpretDishText(texts, foods), label = parsed.found >= 2;
      const hits = [...new Map(texts.flatMap(t => L.matchFoodsInText(t, foods)).concat(dish.hits).map(f => [f.name, f])).values()].slice(0, 6);
      E.ocr = { status: 'done', text: texts[0], texts, parsed, dish, hits, known: label || texts[0].length > 40 ? L.matchSignature(texts[0], S.custom) : null };
    } catch (err) { if (E !== mine) return; E.ocr = { status: 'err', msg: 'Không chạy được bộ đọc chữ: ' + (err && err.message || err) }; }
    updOcr();
  }
  function updOcr() {
    const o = E.ocr, box = $('#e-ocrtxt');
    if (!o) { box.innerHTML = ''; return; }
    if (o.status === 'run') { box.innerHTML = `<div class="ocrbox"><span class="msg">${esc(o.msg)}</span><div class="progress"><i style="width:${Math.round(o.p * 100)}%"></i></div><div class="small muted" style="margin-top:6px">Xử lý ngay trên máy, không gửi ảnh đi đâu. Bạn có thể chọn món bên dưới trong lúc chờ.</div></div>`; return; }
    if (o.status === 'err') { box.innerHTML = `<div class="ocrbox">${esc(o.msg)}</div>`; return; }
    const p = o.parsed, alnum = (o.text.match(/[\p{L}\p{N}]/gu) || []).length, d = o.dish;
    let h = '';
    if (d && d.parts.length && p.found < 3) {
      h += `<div><b>Chữ trên ảnh:</b> “${esc(d.words.join(' '))}”</div>
        <div style="margin-top:6px"><b>Gợi ý ghép món:</b> ${d.parts.map(x => `${esc(x.n)} ${x.g}g`).join(' · ')}</div>
        <div class="small muted" style="margin-top:4px">${d.light ? 'Thấy chữ “healthy” nên đoán là cơm gạo lứt. ' : ''}Chữ không cho biết rau, trứng, canh… đi kèm và khẩu phần thật — bạn chỉnh ở bước kiểm tra.</div>
        <div class="btns" style="margin-top:8px"><button class="btn primary" data-act="ocr-dish">Kiểm tra nguyên liệu & thêm vào bữa</button></div>`;
    }
    if (o.known) h += `<div><b>Nhận ra bao bì đã lưu:</b> ${esc(o.known.food.name)}</div><div class="btns" style="margin:6px 0"><button class="btn primary sm" data-act="add-food" data-name="${esc(o.known.food.name)}">Thêm vào bữa</button></div>`;
    if (p.found >= 2) {
      const cell = (k, l, u) => p[k] != null ? `${l} <b>${fmt(p[k])}</b>${u}` : '';
      h += `<div><b>Đọc được nhãn dinh dưỡng</b> <span class="muted small">(tính trên ${p.basis === '100' ? '100 ' + p.unit : '1 khẩu phần' + (p.servingSize ? ' ' + p.servingSize + p.unit : '')})</span></div>
        <div class="num" style="margin:4px 0">${[cell('kcal', 'Năng lượng', ' kcal'), cell('carb', 'Tinh bột', 'g'), cell('sugar', 'Đường', 'g'), cell('fiber', 'Xơ', 'g'), cell('protein', 'Đạm', 'g'), cell('fat', 'Béo', 'g')].filter(Boolean).join(' · ')}</div>
        ${p.warn ? `<div class="small"><span class="badge warn">! ${esc(p.warn)}</span></div>` : ''}
        <div class="btns" style="margin-top:8px"><button class="btn primary sm" data-act="ocr-use">Kiểm tra số & thêm vào bữa</button></div>`;
    }
    if (o.hits.length && p.found < 3) h += `<div style="margin-top:8px"><b>${d && d.parts.length ? 'Hoặc chọn món có sẵn gần giống:' : 'Món nhận ra từ chữ trên ảnh:'}</b><div class="wrapchips">${o.hits.map(f => `<button class="chip" data-act="add-food" data-name="${esc(f.name)}">+ ${esc(f.name)}</button>`).join('')}</div></div>`;
    if (!h) h = alnum < 12
      ? `<div class="small muted">Không thấy chữ trên ảnh. Ảnh vẫn được lưu kèm bữa ăn.</div>`
      : `<div>Có chữ nhưng không thấy bảng giá trị dinh dưỡng. Chụp gần và thẳng vào bảng số trên bao bì, hoặc chọn món bên dưới.</div><div class="btns" style="margin-top:8px"><button class="btn sm" data-act="ocr-use">Tự nhập số theo nhãn</button></div>`;
    if (alnum >= 12) h += `<details><summary>Xem chữ đã đọc (${o.texts.length} lượt)</summary><pre class="raw">${esc(o.texts.map(t => t.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n'))}</pre></details>`;
    box.innerHTML = `<div class="ocrbox">${h}</div>`;
  }


  /* ================= PHÂN TÍCH KỸ (Florence-2 chạy trên máy) =================
     Chống bịa món:
       1) Chỉ dùng chế độ mô hình TỰ mô tả (<OD> có khung vị trí, và mô tả tự do). Không bao giờ hỏi "có X không" —
          đo thực tế cho thấy hỏi dẫn dắt thì mô hình nhận bừa.
       2) Chỉ giữ thứ khớp bảng nguyên liệu/món của app; nhãn lạ bị loại và hiện riêng.
       3) Phân tầng bằng chứng: có khung trên ảnh → tích sẵn; chỉ nhắc trong câu mô tả → KHÔNG tích, chờ người dùng xác nhận.
       4) Người dùng tích/bỏ từng thứ; app ghi lại để lần sau thứ hay bị nhận nhầm sẽ không tích sẵn nữa. */
  /* Chế độ chạy bộ phân tích kỹ. Điện thoại ít bộ nhớ: trình duyệt ĐÓNG trang khi nạp mô hình quá sức.
     App đánh dấu trước khi chạy; nếu lần mở sau thấy dấu còn đó nghĩa là lần trước bị đóng → tự lùi một nấc. */
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const MOBILE = IOS || /Android/i.test(navigator.userAgent);
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } };
  const VLM_LADDER = MOBILE ? ['wasm'].concat(navigator.gpu ? ['webgpu'] : [], ['off']) : ['auto', 'wasm', 'off'];
  const vlmMode = () => { const m = lsGet('nl-vlm-mode'); return VLM_LADDER.includes(m) ? m : VLM_LADDER[0]; };
  const VLM_MODE_TXT = { auto: 'tự động (dùng GPU nếu có)', wasm: 'tiết kiệm bộ nhớ (CPU)', webgpu: 'GPU', off: 'đã tắt vì máy không đủ bộ nhớ' };
  const vlmOpts = () => { const m = vlmMode(); return { device: m === 'wasm' ? 'wasm' : undefined, threads: MOBILE ? 2 : undefined }; };
  let vlmCrashNote = '';
  function vlmCrashCheck() {
    const busy = lsGet('nl-vlm-busy'); if (!busy) return;
    lsSet('nl-vlm-busy', null);
    const i = VLM_LADDER.indexOf(busy), next = VLM_LADDER[Math.min(VLM_LADDER.length - 1, (i < 0 ? 0 : i) + 1)];
    lsSet('nl-vlm-mode', next);
    vlmCrashNote = next === 'off'
      ? 'Lần trước bộ phân tích kỹ làm app bị đóng vì máy này không đủ bộ nhớ. App đã tắt tính năng đó trên máy này; nhận diện nhanh, đọc chữ, khoanh vùng & dạy AI và thêm tay vẫn dùng bình thường.'
      : 'Lần trước bộ phân tích kỹ làm app bị đóng vì thiếu bộ nhớ. App đã chuyển sang chế độ “' + VLM_MODE_TXT[next] + '”, bạn có thể thử chạy lại.';
  }
  const VLM = (() => {
    let w = null, n = 0, onProg = null; const pend = new Map();
    function worker() {
      if (!w) {
        w = new Worker('js/vlm-worker.js', { type: 'module' });
        w.onmessage = e => { const m = e.data; if (m.type === 'progress' || m.type === 'step') { if (onProg) onProg(m); return; } const p = pend.get(m.id); if (p) { pend.delete(m.id); m.type === 'error' ? p.rej(new Error(m.message)) : p.res(m); } };
        w.onerror = e => { for (const p of pend.values()) p.rej(new Error(e.message || 'Không khởi động được bộ phân tích')); pend.clear(); w = null; };
      }
      return w;
    }
    const call = (msg, prog) => new Promise((res, rej) => { onProg = prog; msg.id = ++n; pend.set(msg.id, { res, rej }); worker().postMessage(msg); });
    return {
      load: prog => call(Object.assign({ type: 'load' }, vlmOpts()), prog),
      run: (jobs, prog) => call(Object.assign({ type: 'run', jobs, maxTokens: 160 }, vlmOpts()), prog),
      reset() { if (w) { w.terminate(); w = null; pend.clear(); } },
      async downloaded() { try { if (!('caches' in self) || !(await caches.has('transformers-cache'))) return false; const c = await caches.open('transformers-cache'); return (await c.keys()).filter(r => /\.onnx/.test(r.url)).length >= 4; } catch (e) { return false; } },
    };
  })();
  const VLM_MB = 205, APP_VERSION = '1.20';
  // từ tiếng Anh mô hình hay dùng → nguyên liệu của app (cụm dài xét trước)
  const EN_ING = [
    ['brown rice', 'Cơm gạo lứt'], ['fried rice', 'Cơm trắng'], ['rice', 'Cơm trắng'], ['spaghetti', 'Mì Ý'], ['pasta', 'Mì Ý'], ['noodles', 'Mì trứng'], ['noodle', 'Mì trứng'],
    ['french fries', 'Khoai tây chiên'], ['fries', 'Khoai tây chiên'], ['sweet potato', 'Khoai lang'], ['potatoes', 'Khoai tây'], ['potato', 'Khoai tây'], ['bread', 'Bánh mì trắng'], ['toast', 'Bánh mì trắng'], ['baguette', 'Bánh mì trắng'], ['corn', 'Bắp hạt'],
    ['fried chicken', 'Gà chiên bột'], ['chicken', 'Ức gà'], ['steak', 'Bò bít tết'], ['beef', 'Thịt bò'], ['pork', 'Thịt heo nạc'], ['bacon', 'Thịt xông khói'], ['sausages', 'Xúc xích'], ['sausage', 'Xúc xích'], ['ham', 'Giăm bông'], ['meat', 'Thịt heo nạc'],
    ['salmon', 'Cá hồi'], ['tuna', 'Cá ngừ'], ['fish', 'Cá thịt trắng'], ['shrimps', 'Tôm'], ['shrimp', 'Tôm'], ['prawns', 'Tôm'], ['prawn', 'Tôm'], ['squid', 'Mực'], ['eggs', 'Trứng'], ['egg', 'Trứng'], ['tofu', 'Đậu hũ'], ['cheese', 'Phô mai mozzarella'],
    ['broccoli', 'Bông cải xanh'], ['carrots', 'Cà rốt'], ['carrot', 'Cà rốt'], ['tomatoes', 'Cà chua'], ['tomato', 'Cà chua'], ['cucumbers', 'Dưa leo'], ['cucumber', 'Dưa leo'], ['lettuce', 'Rau sống / xà lách'], ['salad', 'Rau sống / xà lách'], ['cabbage', 'Bắp cải'],
    ['green vegetables', 'Rau lá xanh'], ['vegetables', 'Rau lá xanh'], ['vegetable', 'Rau lá xanh'], ['greens', 'Rau lá xanh'], ['spinach', 'Rau lá xanh'], ['mushrooms', 'Nấm'], ['mushroom', 'Nấm'], ['bell pepper', 'Ớt chuông'], ['peppers', 'Ớt chuông'],
    ['kimchi', 'Kim chi'], ['avocado', 'Bơ (trái)'], ['pineapple', 'Dứa (thơm)'], ['bean sprouts', 'Giá đỗ'], ['beans', 'Đậu đỏ / đậu đen'], ['peanuts', 'Đậu phộng'], ['soup', 'Nước dùng'], ['broth', 'Nước dùng'], ['soy sauce', 'Nước tương (xì dầu)'], ['ketchup', 'Tương cà (ketchup)'], ['chili sauce', 'Tương ớt'],
  ];
  const EN_SKIP = /^(bowl|plate|dish|table|dining table|tray|spoon|fork|knife|chopsticks|cup|glass|napkin|food|tableware|kitchen utensil|container|box|sign|arrow|person|hand)s?$/;
  function enToIng(text) { // trả về các nguyên liệu được nhắc trong một đoạn tiếng Anh
    let t = ' ' + String(text).toLowerCase().replace(/[^a-z]+/g, ' ') + ' '; const out = [];
    for (const [en, vi] of EN_ING) { const k = ' ' + en + ' '; if (t.includes(k)) { t = t.split(k).join(' _ '); if (!out.includes(vi)) out.push(vi); } }
    return out;
  }
  const gramsOf = n => { const q = QUICK.find(x => x[0] === n); return q ? q[1] : ({ tb: 150, dam: 80, rau: 60, sua: 30, gv: 15 }[(FD.ING[n] || {}).grp] || 50); };
  const flagged = n => { const s = S.vlmStats[n]; return !!s && (s.no || 0) >= 2 && s.no / ((s.ok || 0) + s.no) >= 0.6; };
  const newDeep = () => ({ status: 'done', ai: false, at: Date.now(), items: [], foods: [], memFoods: [], unknown: [], cap: '', often: [], proposed: [] });
  function ensureDeep() { if (!E.deep || E.deep.status !== 'done') E.deep = newDeep(); return E.deep; }
  function buildDeep(a, dim) {
    const od = a.results[0] || {}, od2 = a.results[1] || {}, cap = String(a.results[2] || '').trim();
    const items = [], foods = [], unknown = [], by = {}, foodEv = {};
    // ev = tập nguồn bằng chứng độc lập: a = phát hiện trên ảnh gốc, b = phát hiện trên bản nén lại, c = câu mô tả, o = chữ trên ảnh, m = mẫu người dùng đã dạy
    const add = (name, src, box, ev) => { let it = by[name]; if (!it) { it = by[name] = { name, g: gramsOf(name), src, boxes: [], on: false, ev: new Set() }; items.push(it); } if (box) it.boxes.push(box); if (src === 'box') it.src = 'box'; it.ev.add(ev); return it; };
    const scan = (o, ev) => (o.labels || []).forEach((lab, i) => {
      const b = o.bboxes && o.bboxes[i], box = b ? [b[0] / dim.w, b[1] / dim.h, (b[2] - b[0]) / dim.w, (b[3] - b[1]) / dim.h] : null;
      const ing = enToIng(lab)[0], dish = !ing && findFood(Vision.foodFor(lab));
      if (ing) add(ing, 'box', ev === 'b' && by[ing] && by[ing].boxes.length ? null : box, ev); else if (dish) (foodEv[dish.name] = foodEv[dish.name] || new Set()).add(ev); else if (!EN_SKIP.test(lab.toLowerCase().trim()) && !unknown.includes(lab)) unknown.push(lab);
    });
    scan(od, 'a'); scan(od2, 'b');
    for (const n of enToIng(cap)) add(n, 'cap', null, 'c');
    const capDish = findFood(Vision.foodFor(cap.split(/[.,]/)[0])); if (capDish && foodEv[capDish.name]) foodEv[capDish.name].add('c');
    for (const [name, ev] of Object.entries(foodEv)) { if (ev.size >= 2) foods.push(findFood(name)); else unknown.push(name); }
    const ocr = (E.ocr && E.ocr.dish && E.ocr.dish.parts) || [];
    for (const p of ocr) { const it = add(p.n, by[p.n] ? by[p.n].src : 'ocr', null, 'o'); it.g = p.g; }
    for (const it of items) { it.n = it.ev.size; it.flag = flagged(it.name); it.on = !it.flag && (it.src === 'ocr' || it.n >= 2); }
    return { status: 'done', ai: true, at: Date.now(), items, foods, memFoods: [], unknown, cap, often: [], device: a.device, proposed: items.map(i => i.name) };
  }
  // Lưu / khôi phục danh sách thành phần cùng bữa ăn để xem lại sau
  function packDeep(d) {
    return { at: d.at || Date.now(), ai: !!d.ai, device: d.device, cap: d.cap, unknown: d.unknown, counted: !!d.counted, memCounted: !!d.memCounted, foods: d.foods.map(f => f.name), memFoods: d.memFoods || [], taughtFoods: d.taughtFoods || [],
      items: d.items.map(i => ({ name: i.name, g: i.g, src: i.src, on: !!i.on, flag: !!i.flag, n: i.n || 0, sim: i.sim, note: i.note || '', kept: !!i.kept, photoMem: !!i.photoMem, boxes: i.boxes, ev: [...(i.ev || [])] })) };
  }
  function reviveDeep(p) {
    if (!p || !Array.isArray(p.items)) return null;
    return { status: 'done', saved: true, ai: p.ai !== false, at: p.at, device: p.device, cap: p.cap || '', unknown: p.unknown || [], counted: !!p.counted, memCounted: true, often: [], memFoods: p.memFoods || [], taughtFoods: p.taughtFoods || [],
      foods: (p.foods || []).map(findFood).filter(Boolean), items: p.items.map(i => Object.assign({}, i, { boxes: i.boxes || [], ev: new Set(i.ev || []) })), proposed: p.items.map(i => i.name) };
  }
  async function deepAnalyze() {
    const mine = E; if (!E.photo) return;
    if (vlmMode() === 'off') { alert('Bộ phân tích kỹ đã tắt trên máy này vì lần trước nó làm app bị đóng do thiếu bộ nhớ.  Bạn vẫn dùng được: nhận diện nhanh, đọc chữ, khoanh vùng & dạy AI, và thêm tay. Muốn thử lại: tab Cá nhân → Bộ phân tích kỹ → Thử lại.'); return; }
    if (!(await VLM.downloaded()) && !confirm('Lần đầu cần tải bộ phân tích kỹ (khoảng ' + VLM_MB + ' MB) về máy. Sau đó dùng được khi không có mạng. Tải bây giờ?')) return;
    const prev = E.deep && E.deep.status === 'done' ? E.deep : null, keep = prev ? prev.items.filter(i => i.on || i.src === 'user' || i.src === 'mem') : [];
    E.deep = { status: 'run', msg: 'Đang nạp bộ phân tích…', p: 0 }; updDeep();
    try {
      const img = await ensureImg(), c = drawScaled(img, 1024), png = await new Promise(r => c.toBlob(r, 'image/png')), jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      const seen = {};
      if (MOBILE && ocrWorker) { try { await ocrWorker.terminate(); } catch (e) { /* bỏ qua */ } ocrWorker = null; }   // nhường bộ nhớ cho mô hình
      lsSet('nl-vlm-busy', vlmMode());
      const a = await VLM.run([{ image: png, task: '<OD>' }, { image: jpg, task: '<OD>' }, { image: png, task: '<MORE_DETAILED_CAPTION>' }], m => {
        if (E !== mine || !E.deep || E.deep.status !== 'run') return;
        if (m.type === 'progress') { seen[m.file] = [m.loaded, m.total]; const v = Object.values(seen), l = v.reduce((x, y) => x + y[0], 0), t = v.reduce((x, y) => x + y[1], 0); E.deep.p = t ? l / t : 0; E.deep.msg = 'Đang tải mô hình ' + fmt0(l / 1048576) + ' / ' + fmt0(t / 1048576) + ' MB…'; }
        else { E.deep.p = (m.i + 0.5) / m.n; E.deep.msg = ['Đang tìm từng thành phần trên ảnh (lượt 1/3)…', 'Đang tìm lại trên bản ảnh khác để đối chiếu (lượt 2/3)…', 'Đang mô tả ảnh để đối chiếu (lượt 3/3)…'][m.i]; }
        const b = $('#e-deep .progress i'), s = $('#e-deep .msg'); if (b) b.style.width = Math.round(E.deep.p * 100) + '%'; if (s) s.textContent = E.deep.msg;
      });
      lsSet('nl-vlm-busy', null);
      if (E !== mine) return;
      const d = buildDeep(a, { w: c.width, h: c.height });
      // giữ lại những gì người dùng đã tự thêm / app đã nhận ra từ mẫu đã dạy
      for (const k of keep) {
        const it = d.items.find(i => i.name === k.name);
        if (!it) { if (k.on && k.src !== 'user' && k.src !== 'mem') k.kept = true; d.items.push(k); }   // AI lần này không thấy lại nhưng người dùng đã xác nhận → vẫn giữ
        else { it.on = it.on || k.on; if (k.on) it.g = k.g; if (k.note) it.note = k.note; if (k.src === 'mem') { it.ev.add('m'); it.n = it.ev.size; it.sim = k.sim; it.vec = k.vec; if (!it.boxes.length) it.boxes = k.boxes; } }
      }
      if (prev) { d.memFoods = prev.memFoods || []; d.taughtFoods = prev.taughtFoods || []; d.counted = false; d.memCounted = false; }
      // đối chiếu với những gì người dùng đã dạy: quét lưới + đúng các khung AI vừa tìm được
      let found = [];
      if (S.taught.some(t => !t.neg)) {
        if (E.deep && E.deep.status === 'run') { E.deep.msg = 'Đang đối chiếu với những gì bạn đã dạy…'; const sm = $('#e-deep .msg'); if (sm) sm.textContent = E.deep.msg; }
        const aiBoxes = d.items.flatMap(i => i.boxes || []).map(b => [b[0], b[1], b[0] + b[2], b[1] + b[3]]);
        try { found = await recallTaught(img, aiBoxes); } catch (e) { found = []; }
        if (E !== mine) return;
      }
      E.deep = d; applyRecall(found);
    } catch (err) { lsSet('nl-vlm-busy', null); if (E !== mine) return; E.deep = prev || null; updDeep(); toast('Không chạy được bộ phân tích kỹ: ' + (err && err.message || err)); return; }
    updDeep();
  }
  const searchIng = q => {
    const ws = L.strip(q).trim().split(/\s+/).filter(Boolean); if (!ws.length) return [];
    const all = Object.keys(FD.ING), head = all.filter(n => { const t = L.strip(n).split(/[^a-z0-9]+/); return ws.every(w => t.some(x => x.startsWith(w))); });
    const exact = n => L.strip(n).split(/[^a-z0-9]+/).some(x => ws.includes(x)) ? 0 : 1;
    head.sort((a, b) => exact(a) - exact(b));
    return head.length ? head : all.filter(n => { const t = L.strip(n); return ws.every(w => t.includes(w)); });
  };
  // chip thêm tay: gõ để lọc nguyên liệu + món; để trống thì hiện thứ hay dùng
  function addChips(q, present, ingAct, opts) {
    opts = opts || {};
    if (!L.strip(q).trim()) return (opts.often || []).filter(n => !present.has(n)).map(n => '<button class="chip" data-act="' + ingAct + '" data-kind="ing" data-n="' + esc(n) + '">+ ' + esc(n) + ' <span class="tag">bạn hay thêm</span></button>').join('')
      + QUICK.map(x => x[0]).filter(n => !present.has(n) && !(opts.often || []).includes(n)).map(n => '<button class="chip" data-act="' + ingAct + '" data-kind="ing" data-n="' + esc(n) + '">+ ' + esc(n) + '</button>').join('');
    const ing = searchIng(q).filter(n => !present.has(n)).slice(0, 12), foods = opts.foodAct ? searchFoods(q, '').slice(0, 5) : [];
    const mk = opts.ctx && !FD.ING[q.trim()] ? '<button class="chip on" data-act="ing-new" data-ctx="' + opts.ctx + '">+ Tạo nguyên liệu mới “' + esc(q.trim()) + '”</button>' : '';
    if (!ing.length && !foods.length) return '<span class="small muted">Chưa có “' + esc(q) + '” trong danh sách.</span> ' + mk;
    return ing.map(n => '<button class="chip" data-act="' + ingAct + '" data-kind="ing" data-n="' + esc(n) + '">+ ' + esc(n) + '</button>').join('')
      + foods.map(f => '<button class="chip" data-act="' + opts.foodAct + '" data-kind="food" data-name="' + esc(f.name) + '" data-n="' + esc(f.name) + '">+ ' + esc(f.name) + ' <span class="tag">món</span></button>').join('') + mk;
  }
  function updDeepChips() { const el = $('#deep-chips'), d = E.deep; if (!el || !d || d.status !== 'done') return; const often = Object.entries(S.vlmStats).filter(([n, x]) => (x.miss || 0) >= 2 && FD.ING[n]).sort((x, y) => y[1].miss - x[1].miss).slice(0, 5).map(e => e[0]); el.innerHTML = addChips(E.deepQ || '', new Set(d.items.map(i => i.name)), 'deep-add', { often, foodAct: 'add-food', ctx: 'deep' }); }
  function updDeep() {
    const box = $('#e-deep'); if (!box || !E) return;
    const d = E.deep;
    if (!E.photo) { box.innerHTML = ''; return; }
    if (!d) { box.innerHTML = '<div class="ocrbox" style="border-style:solid"><div><b>Phân tích kỹ từng thành phần</b></div><div class="small muted" style="margin:4px 0 8px">Dành cho đĩa nhiều món. Ba cách, dùng kết hợp được; bạn luôn xác nhận từng thành phần trước khi thêm, và app ghi nhớ để lần sau tự bắt.</div><div class="dacts"><button class="btn primary" data-act="deep">Chạy AI trên máy</button><button class="btn" data-act="crop">Khoanh vùng & giải thích món</button><button class="btn" data-act="deep-manual">Gõ tên để chọn</button></div><div class="small muted" style="margin-top:6px">AI mất khoảng nửa phút đến vài phút tùy máy.' + (S.taught.some(t => !t.neg) ? ' Đang nhớ ' + new Set(S.taught.filter(t => !t.neg).map(t => t.label)).size + ' món/thành phần bạn đã dạy.' : '') + '</div></div>'; return; }
    if (d.status === 'run') { box.innerHTML = '<div class="ocrbox"><span class="msg">' + esc(d.msg) + '</span><div class="progress"><i style="width:' + Math.round(d.p * 100) + '%"></i></div><div class="small muted" style="margin-top:6px">Chạy ngay trên máy, không gửi ảnh đi đâu. Có thể mất một lúc.</div></div>'; return; }
    const pct = x => Math.round(x * 100) + '%';
    let num = 0; const boxes = [];
    const rowArr = d.items.map((it, i) => {
      const tag = it.boxes.length ? ++num : 0; if (tag) for (const b of it.boxes) boxes.push({ b, tag, on: it.on });
      const s = it.flag ? ['bad', 'hay nhận nhầm — lần trước bạn đã bỏ']
        : it.kept ? ['ok', 'bạn đã xác nhận ở lần trước']
        : it.src === 'user' ? ['none', it.boxes.length ? 'bạn khoanh và đặt tên · đã nhớ vùng ảnh' : 'bạn bổ sung · nhớ kèm ảnh bữa này']
        : it.src === 'ocr' ? ['ok', 'từ chữ trên ảnh']
        : it.src === 'mem' ? (it.sim >= 0.85 ? ['ok', 'giống mẫu bạn đã dạy (' + pct(it.sim) + ')'] : ['warn', 'hơi giống mẫu bạn đã dạy (' + pct(it.sim) + ') — cần bạn xác nhận'])
        : it.n >= 2 ? ['ok', 'thấy ở ' + it.n + ' nguồn' + (it.boxes.length ? ' (có khung)' : '')]
        : it.src === 'box' ? ['warn', 'AI chỉ thấy 1 lượt (có khung) — cần bạn xác nhận'] : ['warn', 'AI chỉ nhắc trong mô tả — cần bạn xác nhận'];
      return '<label class="drow ' + (it.on ? 'on' : '') + '"><input type="checkbox" data-chg="deep-on" data-i="' + i + '" ' + (it.on ? 'checked' : '') + '><span class="dnum">' + (tag || '·') + '</span><span class="grow"><b>' + esc(it.name) + '</b><br><span class="badge ' + s[0] + '">' + s[1] + '</span>' + (it.note ? '<br><span class="small muted">“' + esc(it.note) + '”</span>' : '') + '</span><span class="qty"><input type="number" inputmode="decimal" min="0" step="5" value="' + it.g + '" data-chg="deep-g" data-i="' + i + '" aria-label="Số gam"><span class="small muted">g</span></span></label>';
    });
    const offIdx = d.saved ? d.items.map((it, i) => it.on ? -1 : i).filter(i => i >= 0) : [];
    const rows = d.saved ? rowArr.filter((r, i) => d.items[i].on).join('') + (offIdx.length ? '<details class="doff"><summary>Đã bỏ tích (' + offIdx.length + ') — bấm để xem / tích lại</summary>' + offIdx.map(i => rowArr[i]).join('') + '</details>' : '') : rowArr.join('');
    const nOn = d.items.filter(i => i.on).length, mf = (d.memFoods || []).map(x => ({ f: findFood(x.name), sim: x.sim, note: x.note })).filter(x => x.f), tf = d.taughtFoods || [];
    for (const x of tf) if (x.box) boxes.push({ b: x.box, tag: '★', on: true });
    box.innerHTML = '<div class="ocrbox" style="border-style:solid"><div><b>Phân tích kỹ từng thành phần</b>' + (d.ai ? ' <span class="small muted">(AI trên máy' + (d.device === 'webgpu' ? ', dùng GPU' : '') + ')</span>' : '') + '</div>'
      + (d.at ? '<div class="small muted" style="margin-top:2px">' + (d.saved ? 'Kết quả đã lưu lúc ' + hm(d.at) + ' ' + dayLabel(L.dayKey(d.at)) + '. Bạn vẫn sửa được rồi bấm Lưu bữa ăn để cập nhật.' : 'Sẽ được lưu kèm bữa ăn để xem lại.') + '</div>' : '')
      + '<div class="dphoto"><img src="' + E.photo + '" alt="">' + boxes.map(x => '<i class="' + (x.on ? 'on' : '') + '" style="left:' + x.b[0] * 100 + '%;top:' + x.b[1] * 100 + '%;width:' + x.b[2] * 100 + '%;height:' + x.b[3] * 100 + '%"><b>' + x.tag + '</b></i>').join('') + '</div>'
      + (d.items.length ? '<div class="small muted" style="margin:8px 0 2px">Tích những thứ <b>thật sự có</b> trong bữa, bỏ tích thứ không có. Chưa có gì được thêm cho tới khi bạn xác nhận.</div>' + rows : '<div class="small muted" style="margin-top:8px">' + (d.ai ? 'AI không nhận ra thành phần nào khớp bảng nguyên liệu.' : 'Chưa có thành phần nào.') + ' Gõ tìm bên dưới, hoặc khoanh vùng trên ảnh để dạy AI.</div>')
      + (mf.length ? '<div style="margin-top:8px">Giống món bạn đã dạy:</div><div class="wrapchips">' + mf.map(x => '<button class="chip" data-act="add-food" data-name="' + esc(x.f.name) + '">+ ' + esc(x.f.name) + ' · ' + pct(x.sim) + '</button>').join('') + '</div>' + mf.filter(x => x.note).map(x => '<div class="small muted">' + esc(x.f.name) + ': “' + esc(x.note) + '”</div>').join('') : '')
      + (tf.length ? '<div style="margin-top:8px">Món bạn khoanh và đặt tên (★ trên ảnh, đã thêm vào bữa):</div>' + tf.map(x => '<div class="small"><b>' + esc(x.name) + '</b>' + (x.note ? ' — “' + esc(x.note) + '”' : '') + '</div>').join('') : '')
      + (d.foods.length ? '<div style="margin-top:8px">Món AI nhận ra:</div><div class="wrapchips">' + d.foods.map(f => '<button class="chip" data-act="add-food" data-name="' + esc(f.name) + '">+ ' + esc(f.name) + '</button>').join('') + '</div>' : '')
      + '<div class="dacts" style="margin-top:10px"><button class="btn" data-act="crop">AI bỏ sót hoặc nhận sai? Khoanh vùng & giải thích món</button></div>'
      + '<div style="margin-top:12px"><b>Hoặc gõ tên để thêm</b></div><input class="inp" id="deep-q" type="search" autocomplete="off" placeholder="Gõ để tìm: trứng, đậu hũ, cá hồi, bún…" value="' + esc(E.deepQ || '') + '"><div class="wrapchips" id="deep-chips"></div>'
      + '<div class="btns" style="margin-top:10px"><button class="btn sm" data-act="deep">' + (d.ai ? 'Chạy lại AI (giữ các mục đã tích)' : 'Chạy AI trên máy') + '</button></div>'
      + (d.cap ? '<details><summary>AI mô tả ảnh (tiếng Anh)</summary><div class="small muted" style="margin-top:4px">' + esc(d.cap) + '</div></details>' : '')
      + (d.unknown.length ? '<div class="small muted" style="margin-top:6px">Đã loại (không khớp bảng nguyên liệu, hoặc chỉ thấy ở 1 lượt): ' + esc(d.unknown.join(', ')) + '.</div>' : '')
      + '<div class="btns" style="margin-top:10px"><button class="btn primary" data-act="deep-confirm" ' + (nOn ? '' : 'disabled') + '>' + (d.memCounted && (d.counted || !d.ai) ? 'Ghép lại đĩa từ ' : 'Xác nhận ') + nOn + ' thành phần' + (d.memCounted && (d.counted || !d.ai) ? '' : ' & ghép đĩa') + '</button></div></div>';
    updDeepChips();
  }
  /* Trí nhớ hình ảnh từ danh sách thành phần:
     - mẫu app gợi ý được giữ → thêm mẫu "đúng"; bị bỏ tích → nhớ là "KHÔNG phải"
     - khung AI được người dùng xác nhận → thành mẫu
     - mục người dùng BỔ SUNG TAY mà không khoanh vùng → nhớ kèm CẢ TẤM ẢNH của bữa (lần sau gặp ảnh giống sẽ tự gợi ý lại) */
  async function learnFromDeep(d) {
    if (d.memCounted) return;
    let changed = false; const img = await ensureImg(); let whole = null, wholeThumb = '';
    for (const it of d.items) {
      try {
        if (it.src === 'mem' && it.vec) changed = teachVec(it.name, 'ing', it.vec, !it.on) || changed;
        else if (it.on && it.src === 'box' && it.boxes.length && img) { const b = it.boxes[0], c = cropCanvas(img, [b[0], b[1], b[0] + b[2], b[1] + b[3]]); changed = teachVec(it.name, 'ing', await Vision.fingerprint(c), false, thumbOf(c), [b[0], b[1], b[0] + b[2], b[1] + b[3]]) || changed; }
        else if (it.on && it.src === 'user' && !it.boxes.length && img) {
          if (!whole) { const c = cropCanvas(img, [0, 0, 1, 1]); whole = await Vision.fingerprint(c); wholeThumb = thumbOf(c); }
          if (teachVec(it.name, 'ing', whole, false, wholeThumb, [0, 0, 1, 1])) { changed = true; it.photoMem = true; }
        }
      } catch (e) { /* bỏ qua mẫu lỗi */ }
    }
    if (changed) await saveKV('taught', S.taught);
    d.memCounted = true;
  }
  async function deepConfirm() {
    const d = E.deep, on = d.items.filter(i => i.on);
    if (!on.length) return;
    // phản hồi cho AI: thứ AI đề xuất mà người dùng giữ / bỏ; thứ người dùng phải tự thêm
    if (d.ai && !d.counted) {
      for (const it of d.items) { const s = S.vlmStats[it.name] = S.vlmStats[it.name] || {}; if (it.src === 'user') { if (it.on) s.miss = (s.miss || 0) + 1; } else if (it.src === 'box' || it.src === 'cap') { if (it.on) s.ok = (s.ok || 0) + 1; else s.no = (s.no || 0) + 1; } }
      await saveKV('vlmStats', S.vlmStats); d.counted = true;
    }
    // trí nhớ hình ảnh: mẫu được giữ → thêm mẫu "đúng"; mẫu bị bỏ → nhớ là "KHÔNG phải"; khung AI được xác nhận → cũng thành mẫu
    await learnFromDeep(d);
    const od = E.ocr && E.ocr.dish;
    const onNames = new Set(on.map(i => i.name)), useOcr = od && od.name && od.parts.filter(p => p.n !== 'Dầu ăn').every(p => onNames.has(p.n));
    const main = on.slice().sort((a, b) => (FD.ING[b.name] ? FD.ING[b.name].k * b.g : 0) - (FD.ING[a.name] ? FD.ING[a.name].k * a.g : 0)).slice(0, 2);
    openParts({ mode: 'add-to-meal', name: useOcr ? od.name : main.map((p, i) => i ? p.name.toLowerCase() : p.name).join(' + '), portion: '1 đĩa', parts: on.map(i => ({ n: i.name, g: i.g })) });
  }

  /* ---------- Dạy AI bằng cách khoanh vùng + đặt tên; lần sau app tự tìm vùng giống ---------- */
  function cropCanvas(img, r, max) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height, w = Math.max(1, (r[2] - r[0]) * W), h = Math.max(1, (r[3] - r[1]) * H), k = Math.min(1, (max || 256) / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.max(16, Math.round(w * k)); c.height = Math.max(16, Math.round(h * k));
    c.getContext('2d').drawImage(img, r[0] * W, r[1] * H, w, h, 0, 0, c.width, c.height); return c;
  }
  const thumbOf = c => { const k = 64 / Math.max(c.width, c.height), t = document.createElement('canvas'); t.width = Math.round(c.width * k); t.height = Math.round(c.height * k); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', 0.7); };
  function teachVec(label, kind, vec, neg, thumb, r, note) {
    if (!vec || !vec.length) return false;
    if (S.taught.some(t => t.label === label && !!t.neg === !!neg && Vision.cosine(t.vec, vec) >= 0.98)) return false; // đã có mẫu gần như trùng
    S.taught.push({ id: uid(), label, kind, vec, neg: !!neg, thumb: thumb || '', r: r || null, note: note || '', at: Date.now() });
    const same = S.taught.filter(t => t.label === label && !!t.neg === !!neg);
    if (same.length > 12) S.taught.splice(S.taught.indexOf(same[0]), 1);     // mỗi nhãn giữ tối đa 12 mẫu mỗi loại
    return true;
  }
  const WINS = (() => { const w = [[0, 0, 1, 1]]; for (const [sz, st] of [[0.5, 0.25], [1 / 3, 1 / 6]]) for (let y = 0; y + sz <= 1.001; y += st) for (let x = 0; x + sz <= 1.001; x += st) w.push([x, y, x + sz, y + sz]); for (let y = 0; y + 0.4 <= 1.001; y += 0.2) for (let x = 0; x + 0.4 <= 1.001; x += 0.2) w.push([x, y, x + 0.4, y + 0.4]); return w; })();
  // Quét ~50 ô trên ảnh (lưới 3 cỡ + đúng vị trí các vùng đã dạy), so với các mẫu đã dạy. Ngưỡng đo thực tế: cùng món khác ảnh 0,95–1,0; vùng nguyên liệu 0,5–0,6; khác món < 0,45.
  async function recallTaught(img, moreBoxes) {
    const pos = S.taught.filter(t => !t.neg); if (!pos.length) return [];
    const neg = S.taught.filter(t => t.neg), best = {}, seenR = new Set(), negCount = {};
    for (const t of neg) negCount[t.label] = (negCount[t.label] || 0) + 1;
    const extra = pos.filter(t => t.r && !seenR.has(t.r.join()) && seenR.add(t.r.join())).map(t => t.r).slice(-16);
    for (const w of WINS.concat(extra, (moreBoxes || []).filter(b => b[2] - b[0] > 0.05 && b[3] - b[1] > 0.05).slice(0, 12))) {
      const vec = await Vision.fingerprint(cropCanvas(img, w));
      const sc = {};
      for (const t of pos) { const c = Vision.cosine(vec, t.vec); if (c > (sc[t.label] ? sc[t.label].p : 0)) sc[t.label] = { p: c, kind: t.kind, n: 0, note: t.note || '' }; }
      for (const t of neg) { if (sc[t.label]) sc[t.label].n = Math.max(sc[t.label].n, Vision.cosine(vec, t.vec)); }
      // nhãn càng hay bị người dùng bác thì càng phải giống hơn mới được gợi ý
      for (const [label, x] of Object.entries(sc)) if (x.p >= Math.min(0.8, 0.5 + 0.05 * (negCount[label] || 0)) && x.p > x.n + 0.02 && (!best[label] || x.p > best[label].sim)) best[label] = { label, kind: x.kind, note: x.note, sim: Math.round(x.p * 100) / 100, box: [w[0], w[1], w[2] - w[0], w[3] - w[1]], vec };
    }
    return Object.values(best).sort((a, b) => b.sim - a.sim).slice(0, 8);
  }
  function applyRecall(found) {
    const d = ensureDeep();
    for (const f of found) {
      if (f.kind === 'food') { if (E.items.some(i => i.name === f.label) || (d.taughtFoods || []).some(x => x.name === f.label)) continue; if (findFood(f.label) && !(d.memFoods || (d.memFoods = [])).some(x => x.name === f.label)) d.memFoods.push({ name: f.label, sim: f.sim, note: f.note || '' }); continue; }
      if (!FD.ING[f.label]) continue;
      const it = d.items.find(i => i.name === f.label);
      if (it) { if (it.ev) { it.ev.add('m'); it.n = it.ev.size; } it.sim = f.sim; it.vec = f.vec; if (f.note && !it.note) it.note = f.note; if (!it.boxes.length) it.boxes = [f.box]; if (!it.flag && (f.sim >= 0.85 || (it.ev && it.n >= 2))) it.on = true; }
      else d.items.push({ name: f.label, note: f.note || '', g: gramsOf(f.label), src: 'mem', sim: f.sim, vec: f.vec, boxes: [f.box], on: f.sim >= 0.85 && !flagged(f.label), n: 1, ev: new Set(['m']) });
    }
  }
  function updTeach() {
    const el = $('#teach-res'); if (!el) return; const q = (($('#teach-q') || {}).value || '').trim();
    const exists = q && (FD.ING[q] || findFood(q));
    el.innerHTML = addChips(q, new Set(), 'teach', { foodAct: 'teach', ctx: 'teach' }).replace(/<span class="small muted">Chưa có[^<]*<\/span>/, '') + (q && !exists ? '<button class="chip on" data-act="teach-new">+ Tạo món mới “' + esc(q) + '”</button>' : '');
  }
  const regionOk = () => CR && Math.abs(CR.x1 - CR.x0) >= 0.06 && Math.abs(CR.y1 - CR.y0) >= 0.06;
  // món chưa có trong danh sách: khoanh vùng → đặt tên mới → nhập số dinh dưỡng một lần → app nhớ cả món lẫn hình ảnh
  async function teachNew() {
    if (!regionOk()) return toast('Kéo trên ảnh để khoanh vùng trước');
    const name = $('#teach-q').value.trim(), note = $('#teach-note').value.trim(), img = await ensureImg();
    const r = [Math.min(CR.x0, CR.x1), Math.min(CR.y0, CR.y1), Math.max(CR.x0, CR.x1), Math.max(CR.y0, CR.y1)], c = cropCanvas(img, r);
    let vec = null; try { vec = await Vision.fingerprint(c); } catch (e) { /* vẫn cho tạo món */ }
    openFoodForm({ mode: 'add-to-meal', title: 'Món mới (dạy AI)', prefill: { name, cat: 'mon' }, teach: { vec, thumb: thumbOf(c), r, note } });
  }
  async function teachRegion(el) {
    if (!regionOk()) return toast('Kéo trên ảnh để khoanh vùng trước, rồi chọn tên');
    const name = el.dataset.n, kind = el.dataset.kind, img = await ensureImg(), note = $('#teach-note').value.trim();
    const r = [Math.min(CR.x0, CR.x1), Math.min(CR.y0, CR.y1), Math.max(CR.x0, CR.x1), Math.max(CR.y0, CR.y1)], c = cropCanvas(img, r);
    let vec = null; try { vec = await Vision.fingerprint(c); } catch (e) { /* vẫn thêm vào bữa dù không tạo được mẫu */ }
    const learned = teachVec(name, kind, vec, false, thumbOf(c), r, note); if (learned) await saveKV('taught', S.taught);
    if (kind === 'ing') { const d = ensureDeep(), it = d.items.find(i => i.name === name), b = [r[0], r[1], r[2] - r[0], r[3] - r[1]]; if (it) { it.on = true; it.boxes.push(b); if (note) it.note = note; } else d.items.push({ name, g: gramsOf(name), src: 'user', boxes: [b], on: true, n: 0, note }); updDeep(); }
    else { const f = findFood(name); if (f) { E.items.push(itemFromFood(f, 1)); updItems(); } }
    CR = null; $('#crop-sel').hidden = true; $('#teach-q').value = ''; $('#teach-note').value = ''; updTeach();
    toast((learned ? 'Đã nhớ: vùng này là ' : 'Đã thêm ') + name + '. Khoanh tiếp vùng khác hoặc bấm Đóng.');
  }

  /* ---------- Nguyên liệu do người dùng tự thêm (số liệu trên 100 g) ---------- */
  function applyCustomIng() { for (const g of S.customIng) FD.ING[g.name] = Object.assign({}, g); }
  let IF = null;
  function openIngForm(name, ctx) {
    IF = { ctx };
    const inp = (id, label) => `<label class="f">${label}<input class="inp" id="if-${id}" type="number" inputmode="decimal" step="any" min="0"></label>`;
    $('#sheet3').innerHTML = `<div class="bar"><button class="btn ghost" data-act="close-sheet3">✕ Đóng</button><h2>Nguyên liệu mới</h2><span class="sp"></span></div><div class="in">
      <label class="f">Tên nguyên liệu<input class="inp" id="if-name" type="text" autocomplete="off" value="${esc(name || '')}"></label>
      <label class="f">Nhóm<select class="inp" id="if-grp">${Object.entries(FD.GRP).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <p class="small muted" style="margin:10px 0 0">Số liệu tính trên <b>100 g</b> (hoặc 100 ml). Lấy từ nhãn bao bì là chính xác nhất.</p>
      <div class="cols3">${inp('k', 'Năng lượng (kcal)')}${inp('c', 'Tinh bột (g)')}${inp('s', 'Đường (g)')}${inp('f', 'Chất xơ (g)')}${inp('pr', 'Đạm (g)')}${inp('fa', 'Chất béo (g)')}</div>
      <label class="f">Tốc độ làm tăng đường huyết (GI)<select class="inp" id="if-gi"><option value="55">Không rõ</option><option value="0">Gần như không có tinh bột</option><option value="35">Thấp</option><option value="60">Trung bình</option><option value="75">Cao</option></select></label>
      <label class="check"><input type="checkbox" id="if-n"> Có đường thêm vào (nước chấm ngọt, sốt ngọt…)</label>
      <label class="check"><input type="checkbox" id="if-c"> Đồ chiên / nhiều dầu mỡ</label></div>${footHtml('save-ing', 'Lưu nguyên liệu', 'close-sheet3')}`;
    $('#if-grp').value = 'gv'; $('#sheet3').hidden = false; $('#sheet3').scrollTop = 0;
  }
  function closeSheet3() { $('#sheet3').hidden = true; $('#sheet3').innerHTML = ''; IF = null; }
  async function saveIng() {
    const name = $('#if-name').value.trim(); if (!name) return toast('Nhập tên nguyên liệu');
    const g = { name, k: num($('#if-k').value), c: num($('#if-c').value), s: num($('#if-s').value), f: num($('#if-f').value), pr: num($('#if-pr').value), fa: num($('#if-fa').value), gi: +$('#if-gi').value, grp: $('#if-grp').value, flags: ($('#if-n').checked ? 'n' : '') + ($('#if-c').checked ? 'c' : ''), custom: true };
    if (!g.k && !g.c && !g.pr && !g.fa) return toast('Nhập ít nhất năng lượng hoặc tinh bột');
    if (g.s > g.c) return toast('Đường không thể lớn hơn tổng tinh bột');
    if (FD.ING[name] && !FD.ING[name].custom && !confirm('Đã có nguyên liệu “' + name + '” dựng sẵn. Ghi đè bằng số liệu của bạn?')) return;
    S.customIng = S.customIng.filter(x => x.name !== name).concat(g); applyCustomIng(); await saveKV('customIng', S.customIng);
    const ctx = IF.ctx; closeSheet3();
    if (ctx === 'pe' && PE) { PE.parts.push({ n: name, g: gramsOf(name) }); PE.q = ''; if ($('#pe-q')) $('#pe-q').value = ''; updParts(); }
    else if (ctx === 'teach' && $('#teach-q')) { $('#teach-q').value = name; updTeach(); }
    else if (E) { const d = ensureDeep(); if (!d.items.some(i => i.name === name)) d.items.push({ name, g: gramsOf(name), src: 'user', boxes: [], on: true, n: 0 }); E.deepQ = ''; updDeep(); }
    toast('Đã lưu nguyên liệu: ' + name);
  }

  /* ================= FORM MÓN (nhập số) ================= */
  function openFoodForm(ctx) {
    F = ctx; const f = ctx.prefill || {};
    const basis = f.basis || 'serving', inMeal = ctx.mode === 'add-to-meal';
    const inp = (id, label, val, extra) => `<label class="f">${label}<input class="inp" id="ff-${id}" ${extra || 'type="number" inputmode="decimal" step="any" min="0"'} value="${val == null ? '' : esc(val)}"></label>`;
    $('#sheet2').innerHTML = `<div class="bar"><button class="btn ghost" data-act="close-sheet2">✕ Đóng</button><h2>${esc(ctx.title || 'Món mới')}</h2><span class="sp"></span></div><div class="in">
      ${inp('name', 'Tên món / sản phẩm', f.name, 'type="text" autocomplete="off"')}
      <div class="cols"><label class="f">Số liệu tính trên<select class="inp" id="ff-basis"><option value="serving">1 khẩu phần</option><option value="100">100 g / ml</option></select></label>
      ${inp('portion', 'Mô tả khẩu phần', f.portion || (f.servingSize ? `1 khẩu phần (${f.servingSize}${f.unit || 'g'})` : ''), 'type="text" placeholder="vd: 1 hộp 180ml"')}</div>
      <div class="cols3">${inp('k', 'Năng lượng (kcal)', f.k)}${inp('c', 'Tinh bột (g)', f.c)}${inp('s', 'Đường (g)', f.s)}${inp('f', 'Chất xơ (g)', f.f)}${inp('pr', 'Đạm (g)', f.pr)}${inp('fa', 'Chất béo (g)', f.fa)}</div>
      <div class="cols"><label class="f">Tốc độ làm tăng đường huyết (GI)<select class="inp" id="ff-gi"><option value="55">Không rõ</option><option value="35">Thấp (rau, đậu, sữa không đường)</option><option value="60">Trung bình</option><option value="75">Cao (bột tinh chế, đồ ngọt)</option></select></label>
      <label class="f">Nhóm<select class="inp" id="ff-cat">${Object.entries(CATS).filter(([k]) => k !== 'rieng').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label></div>
      <label class="check"><input type="checkbox" id="ff-fn" ${(f.flags || '').includes('n') ? 'checked' : ''}> Có đường thêm vào (nước ngọt, bánh kẹo…)</label>
      <label class="check"><input type="checkbox" id="ff-fc" ${(f.flags || '').includes('c') ? 'checked' : ''}> Món chiên / nhiều dầu mỡ</label>
      ${inMeal ? `<div class="card"><label class="f" style="margin-top:0"><span id="ff-amt-l"></span><input class="inp" id="ff-amt" type="number" inputmode="decimal" step="any" min="0"></label>
        <label class="check"><input type="checkbox" id="ff-keep" checked> Lưu vào “Món của tôi” để lần sau dùng lại (quét lại bao bì này app sẽ tự nhận ra)</label></div>` : ''}
      <p class="small muted">Số liệu lấy từ bảng “Giá trị dinh dưỡng” trên bao bì là chính xác nhất.</p></div>`;
    $('#ff-basis').value = basis; $('#ff-cat').value = f.cat && CATS[f.cat] && f.cat !== 'rieng' ? f.cat : 'nhan';
    const gi = f.gi == null ? 55 : f.gi; $('#ff-gi').value = gi <= 45 && f.gi != null ? 35 : gi >= 68 ? 75 : f.gi == null || gi === 55 ? 55 : 60;
    F.rawGi = f.gi;
    $('#sheet2').insertAdjacentHTML('beforeend', footHtml('save-food', inMeal ? 'Lưu & thêm vào bữa' : 'Lưu món', 'close-sheet2'));
    syncFoodForm(true);
    $('#sheet2').hidden = false; $('#sheet2').scrollTop = 0;
  }
  function syncFoodForm(init) {
    const b = $('#ff-basis').value, amt = $('#ff-amt');
    $('#ff-portion').disabled = b === '100';
    if (amt) { $('#ff-amt-l').textContent = b === '100' ? 'Lượng đã ăn (g hoặc ml)' : 'Số khẩu phần đã ăn'; if (init || F.lastBasis !== b) amt.value = b === '100' ? ((F.prefill && F.prefill.servingSize) || 100) : 1; }
    F.lastBasis = b;
  }
  async function saveFoodForm() {
    const name = $('#ff-name').value.trim();
    if (!name) return toast('Nhập tên món');
    const b = $('#ff-basis').value, unit = (F.prefill && F.prefill.unit) || 'g';
    const giSel = +$('#ff-gi').value, gi = (F.rawGi != null && $('#ff-gi').dataset.touched !== '1') ? F.rawGi : giSel;
    const food = { name, portion: b === '100' ? `100 ${unit}` : ($('#ff-portion').value.trim() || '1 khẩu phần'), k: num($('#ff-k').value), c: num($('#ff-c').value), s: num($('#ff-s').value), f: num($('#ff-f').value), pr: num($('#ff-pr').value), fa: num($('#ff-fa').value), gi, cat: $('#ff-cat').value, flags: ($("#ff-fn").checked ? 'n' : '') + ($("#ff-fc").checked ? 'c' : ''), swap: (F.prefill && F.prefill.swap) || '' };
    if (!food.k && !food.c && !food.pr && !food.fa) return toast('Nhập ít nhất năng lượng hoặc tinh bột');
    if (food.s > food.c) return toast('Đường không thể lớn hơn tổng tinh bột');
    if (F.sig) food.sig = F.sig;
    const tch = F.teach, keep = !!tch || F.mode !== 'add-to-meal' || $('#ff-keep').checked;
    if (keep) await upsertCustom(food, F.origName);
    if (F.mode === 'add-to-meal') { const amt = num($('#ff-amt').value) || 1; E.items.push(itemFromFood(food, b === '100' ? Math.round(amt) / 100 : amt)); noteChoice(food.name); updItems(); updResults(); }
    else if (F.mode === 'item-edit') { const q = E.items[F.idx].qty; E.items[F.idx] = itemFromFood(food, q); updItems(); }
    if (tch) { if (teachVec(food.name, 'food', tch.vec, false, tch.thumb, tch.r, tch.note)) await saveKV('taught', S.taught); const d = ensureDeep(); (d.memFoods = d.memFoods || []); (d.taughtFoods = d.taughtFoods || []).push({ name: food.name, note: tch.note, box: [tch.r[0], tch.r[1], tch.r[2] - tch.r[0], tch.r[3] - tch.r[1]] }); updDeep(); }
    closeSheet2(); toast(tch ? 'Đã thêm và ghi nhớ: ' + food.name : keep ? 'Đã lưu vào “Món của tôi”' : 'Đã thêm vào bữa');
    if (S.tab === 'foods' && $('#sheet').hidden) render();
  }
  async function upsertCustom(food, origName) {
    S.custom = S.custom.filter(f => f.name !== food.name && f.name !== origName);
    S.custom.unshift(food); await saveKV('custom', S.custom);
  }

  /* ================= FORM GHÉP NGUYÊN LIỆU ================= */
  const ingOptions = sel => Object.entries(FD.GRP).map(([g, label]) => `<optgroup label="${label}">${Object.values(FD.ING).filter(i => i.grp === g).map(i => `<option ${i.name === sel ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</optgroup>`).join('');
  const QUICK = [['Cơm trắng', 150], ['Cơm gạo lứt', 150], ['Ức gà', 100], ['Thịt heo nạc', 80], ['Thịt bò', 80], ['Cá thịt trắng', 100], ['Tôm', 80], ['Trứng', 50], ['Đậu hũ', 100], ['Rau lá xanh', 80], ['Bông cải xanh', 80], ['Cà rốt', 50], ['Bắp hạt', 80], ['Dưa leo', 50], ['Nước dùng', 200], ['Dầu ăn', 8]];
  function openParts(ctx) {
    PE = ctx; PE.parts = (ctx.parts || []).map(p => ({ n: p.n, g: p.g }));
    if (!PE.parts.length) PE.parts = [{ n: 'Cơm trắng', g: 150 }, { n: 'Ức gà', g: 80 }, { n: 'Rau lá xanh', g: 100 }];
    const isItem = ctx.mode === 'item';
    $('#sheet2').innerHTML = `<div class="bar"><button class="btn ghost" data-act="close-sheet2">✕ Đóng</button><h2>${isItem ? 'Chỉnh nguyên liệu' : 'Món ghép nguyên liệu'}</h2><span class="sp"></span></div><div class="in">
      <label class="f">Tên món<input class="inp" id="pe-name" type="text" value="${esc(ctx.name || '')}" placeholder="vd: Phở gà ít bánh"></label>
      <label class="f">Khẩu phần<input class="inp" id="pe-portion" type="text" value="${esc(ctx.portion || '1 phần')}"></label>
      <div class="card"><h3>Nguyên liệu trong 1 khẩu phần</h3><p class="small muted" style="margin:4px 0 0">Đổi loại (bò → gà), sửa số gam, bỏ hoặc thêm nguyên liệu — số liệu tự tính lại.</p><div class="small muted" style="margin-top:10px">Chạm để thêm / bỏ nhanh:</div><input class="inp" id="pe-q" type="search" autocomplete="off" placeholder="Gõ để tìm nguyên liệu: trứng, cá hồi, kim chi…"><div class="wrapchips" id="pe-quick"></div><div id="pe-rows"></div>
        <button class="btn sm" style="margin-top:8px" data-act="pe-add">+ Thêm nguyên liệu</button><div id="pe-tot"></div></div>
      ${isItem ? `<label class="check"><input type="checkbox" id="pe-keep"> Lưu thành “Món của tôi” để lần sau chọn nhanh</label>` : ''}</div>`;
    $('#sheet2').insertAdjacentHTML('beforeend', footHtml('save-parts', isItem ? 'Áp dụng' : ctx.mode === 'add-to-meal' ? 'Lưu & thêm vào bữa' : 'Lưu món', 'close-sheet2'));
    updParts(); $('#sheet2').hidden = false; $('#sheet2').scrollTop = 0;
  }
  function updParts() {
    $('#pe-rows').innerHTML = PE.parts.map((p, i) => `<div class="item"><select class="inp grow" style="margin:0" data-chg="pe-n" data-i="${i}">${ingOptions(p.n)}</select>
      <div class="qty"><input type="number" inputmode="decimal" min="0" step="5" value="${p.g}" data-chg="pe-g" data-i="${i}" style="width:66px" aria-label="Số gam"><span class="small muted">g</span></div>
      <button class="iconbtn" data-act="pe-rm" data-i="${i}" aria-label="Bỏ">✕</button></div>`).join('');
    updPartsQuick();
    updPartsTot();
  }
  function updPartsQuick() {
    const has = new Set(PE.parts.map(p => p.n)), q = PE.q || '', list = L.strip(q).trim() ? searchIng(q).slice(0, 14) : QUICK.map(x => x[0]);
    $('#pe-quick').innerHTML = list.length ? list.map(n => `<button class="chip ${has.has(n) ? 'on' : ''}" data-act="pe-quick" data-n="${esc(n)}">${has.has(n) ? '✓ ' : '+ '}${esc(n)}</button>`).join('') : `<span class="small muted">Chưa có “${esc(q)}” trong danh sách.</span>`;
    if (L.strip(q).trim() && !FD.ING[q.trim()]) $('#pe-quick').insertAdjacentHTML('beforeend', ` <button class="chip on" data-act="ing-new" data-ctx="pe">+ Tạo nguyên liệu mới “${esc(q.trim())}”</button>`);
  }
  function updPartsTot() {
    const v = FD.compose(PE.parts);
    $('#pe-tot').innerHTML = `<div class="totals"><div><b>${fmt0(v.k)}</b><span>kcal</span></div><div><b>${fmt(v.c)}</b><span>tinh bột (g)</span></div><div><b>${fmt(v.pr)}</b><span>đạm (g)</span></div><div><b>${v.gi || '–'}</b><span>GI ước tính</span></div></div>
      <div class="small muted num" style="margin-top:6px">Đường ${fmt(v.s)}g (thêm vào ${fmt(v.sA)}g) · xơ ${fmt(v.f)}g · béo ${fmt(v.fa)}g · rau ${v.veg}g</div>`;
  }
  async function saveParts() {
    const name = $('#pe-name').value.trim();
    if (!name) return toast('Nhập tên món');
    if (!PE.parts.length) return toast('Cần ít nhất một nguyên liệu');
    const v = FD.compose(PE.parts);
    const food = Object.assign({ name, portion: $('#pe-portion').value.trim() || '1 phần', cat: PE.cat || 'mon', swap: PE.swap || '' }, v);
    if (PE.mode === 'item') {
      const q = E.items[PE.idx].qty; E.items[PE.idx] = itemFromFood(food, q);
      if ($('#pe-keep').checked) { await upsertCustom(food); toast('Đã lưu vào “Món của tôi”'); }
      updItems(); updResults();
    } else {
      await upsertCustom(food, PE.origName); toast('Đã lưu vào “Món của tôi”');
      if (PE.mode === 'add-to-meal') { E.items.push(itemFromFood(food, 1)); noteChoice(food.name); updItems(); updResults(); }
    }
    closeSheet2(); if (S.tab === 'foods' && $('#sheet').hidden) render();
  }
  function closeSheet2() { $('#sheet2').hidden = true; $('#sheet2').innerHTML = ''; F = null; PE = null; }

  /* ================= ĐƯỜNG HUYẾT ================= */
  function openGlucose() {
    const now = Date.now(), ts = S.day === L.dayKey(now) ? now : new Date(S.day + 'T12:00').getTime();
    $('#sheet2').innerHTML = `<div class="bar"><button class="btn ghost" data-act="close-sheet2">✕ Đóng</button><h2>Đường huyết</h2><span class="sp"></span></div><div class="in">
      <label class="f">Thời gian đo<input class="inp" type="datetime-local" id="g-ts" value="${toLocalInput(ts)}"></label>
      <label class="f">Kết quả (${gunit()})<input class="inp" id="g-val" type="number" inputmode="decimal" step="any" min="0" placeholder="${S.profile.gunit === 'mgdl' ? 'vd: 126' : 'vd: 7,0'}"></label>
      <label class="f">Thời điểm<select class="inp" id="g-ctx">${Object.entries(L.GCTX).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <p class="small muted">Đổi đơn vị mmol/L ↔ mg/dL trong tab Cá nhân.</p></div>`;
    const h = new Date(ts).getHours(); $('#g-ctx').value = h < 9 ? 'doi' : h >= 21 ? 'ngu' : 'sau';
    $('#sheet2').insertAdjacentHTML('beforeend', footHtml('save-glucose', 'Lưu số đo', 'close-sheet2'));
    $('#sheet2').hidden = false;
  }

  /* ================= PHÂN TÍCH ================= */
  function barChart(series, key, target, unit, title) {
    const W = 340, H = 150, pl = 4, pr = 4, pt = 24, pb = 20, n = series.length;
    const max = Math.max(target * 1.2, ...series.map(d => d[key])) || 1, col = (W - pl - pr) / n, bw = Math.max(3, Math.min(18, col - 2));
    const y = v => pt + (H - pt - pb) * (1 - v / max), base = H - pb, step = Math.ceil(n / 7);
    let bars = '', hits = '', labels = '';
    series.forEach((d, i) => {
      const cx = pl + col * (i + 0.5), x = cx - bw / 2, v = d[key];
      if (d.n && v > 0) { const top = y(v), r = Math.min(4, bw / 2, (base - top)); bars += `<path d="M${x},${base}V${top + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${base}z"/>`; }
      hits += `<rect class="hit" x="${pl + col * i}" y="${pt - 6}" width="${col}" height="${H - pt - pb + 6}" data-tip="${esc(dayLabel(d.key))}: ${d.n ? fmt(v) + ' ' + unit : 'chưa ghi'}"/>`;
      if ((n - 1 - i) % step === 0) labels += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${+d.key.slice(8)}/${+d.key.slice(5, 7)}</text>`;
    });
    const ty = y(target);
    return `<div class="card chart"><h3>${title}</h3><div class="tip">Chạm vào cột để xem số liệu từng ngày</div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><g>${hits}</g><line class="axis" x1="${pl}" x2="${W - pr}" y1="${base}" y2="${base}"/><g class="bars">${bars}</g>
      <line class="tgt" x1="${pl}" x2="${W - pr}" y1="${ty}" y2="${ty}"/><line class="tgt" x1="${W - pr - 132}" x2="${W - pr - 112}" y1="8" y2="8"/><text x="${W - pr}" y="11" text-anchor="end">Mục tiêu ${fmt0(target)} ${unit}</text>${labels}</svg></div>`;
  }
  function renderStats() {
    const t = targets(), a = L.analyzePeriod(S.meals, S.glucose, t, S.profile, S.range);
    let h = `<div class="row between"><h1>Phân tích</h1><div class="seg">${[7, 14, 30].map(d => `<button class="${S.range === d ? 'on' : ''}" data-act="range" data-d="${d}">${d} ngày</button>`).join('')}</div></div>`;
    if (!a.loggedDays) { $('#view').innerHTML = h + `<div class="empty">Chưa có dữ liệu trong ${S.range} ngày gần đây.<br>Ghi vài bữa ăn để xem xu hướng và đề xuất.</div>`; return; }
    const lv = a.avg.score >= 80 ? 'ok' : a.avg.score >= 55 ? 'warn' : 'bad';
    h += `<div class="tiles"><div class="tile"><b>${fmt0(a.avg.k)}</b><span>kcal trung bình / ngày</span></div><div class="tile"><b>${fmt(a.avg.c)} g</b><span>tinh bột trung bình / ngày</span></div>
      <div class="tile"><b>${a.avg.score}<span class="badge ${lv}" style="margin-left:8px;vertical-align:middle">${ICON[lv]}</span></b><span>điểm ăn uống trung bình</span></div><div class="tile"><b>${a.loggedDays}/${S.range}</b><span>ngày có ghi nhật ký</span></div></div>`;
    h += `<div class="card"><h2>Đề xuất thay đổi</h2>${notesHtml(a.actions.map(x => ({ lv: 'tip', text: x })))}</div>`;
    h += `<div class="card"><h2>Nhận xét</h2>${notesHtml(a.insights)}</div>`;
    h += barChart(a.series, 'k', t.kcal, 'kcal', 'Năng lượng mỗi ngày') + barChart(a.series, 'c', t.carb, 'g', 'Tinh bột mỗi ngày');
    if (a.topCarb && a.topCarb.length) h += `<div class="card"><h2>Món góp nhiều tinh bột nhất</h2><table class="t"><tr><th>Món</th><th class="r">Số lần</th><th class="r">Tinh bột</th><th class="r">Tỷ lệ</th></tr>${a.topCarb.map(f => `<tr><td>${esc(f.name)}</td><td class="r">${f.n}</td><td class="r">${fmt0(f.c)} g</td><td class="r">${f.pct}%</td></tr>`).join('')}</table></div>`;
    if (a.highResponse && a.highResponse.length) h += `<div class="card"><h2>Món làm đường huyết của bạn tăng cao</h2><p class="small muted" style="margin:4px 0">App tự học từ các lần bạn đo sau ăn 1–3 giờ.</p><table class="t"><tr><th>Món</th><th class="r">Số lần đo</th><th class="r">Trung bình (${gunit()})</th></tr>${a.highResponse.map(f => `<tr><td>${esc(f.name)}</td><td class="r">${f.n}</td><td class="r">${gdisp(f.avg)}</td></tr>`).join('')}</table></div>`;
    $('#view').innerHTML = h;
  }

  /* ================= MÓN ĂN ================= */
  function renderFoods() {
    const list = searchFoods(S.foodQ, S.foodCat);
    $('#view').innerHTML = `<h1>Món ăn</h1><p class="muted small" style="margin:4px 0 8px">${allFoods().length} món, trong đó ${S.custom.length} món của bạn. Số liệu dựng sẵn là ước lượng — bấm vào món để sửa cho đúng với thực tế của bạn.</p>
      <input class="inp" id="fd-q" type="search" placeholder="Tìm món…" value="${esc(S.foodQ)}" autocomplete="off"><div class="chips">${catChips(S.foodCat, 'fd-cat')}</div>
      <div class="btns" style="margin:8px 0"><button class="btn sm" data-act="new-food-num">+ Món mới (nhập số)</button><button class="btn sm" data-act="new-food-parts">+ Món mới (ghép nguyên liệu)</button></div>
      <div class="card" id="fd-list">${foodsListHtml(list)}</div>`;
  }
  const foodsListHtml = list => list.length ? list.slice(0, 80).map(f => foodRow(f, 'open-food')).join('') + (list.length > 80 ? `<p class="small muted">Còn ${list.length - 80} món — gõ tên để lọc.</p>` : '') : `<div class="empty">Không có món phù hợp.</div>`;
  function openFood(name, mode) {
    const f = findFood(name); if (!f) return;
    if (f.parts) openParts({ mode: mode || 'food', name: f.name, origName: f.custom ? f.name : null, portion: f.portion, parts: f.parts, cat: f.cat, swap: f.swap, canDelete: f.custom });
    else openFoodForm({ mode: mode || 'food', title: f.custom ? 'Sửa món của tôi' : 'Sửa món', origName: f.custom ? f.name : null, prefill: Object.assign({}, f, { basis: /^100 (g|ml)$/.test(f.portion) ? '100' : 'serving', unit: /ml$/.test(f.portion) ? 'ml' : 'g' }), sig: f.sig });
    if (f.custom) $('#sheet2 .in').insertAdjacentHTML('beforeend', `<button class="btn danger block" style="margin-top:16px" data-act="del-food" data-name="${esc(f.name)}">Xóa món này khỏi “Món của tôi”</button>`);
  }

  /* ================= CÁ NHÂN ================= */
  function renderSettings() {
    const p = S.profile, t = targets();
    const sel = (id, label, opts) => `<label class="f">${label}<select class="inp" data-chg="prof" data-k="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(p[id] == null ? opts[0][0] : p[id]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    const inp = (id, label, ph) => `<label class="f">${label}<input class="inp" type="number" inputmode="decimal" min="0" step="any" data-chg="prof" data-k="${id}" value="${p[id] || ''}" placeholder="${ph || ''}"></label>`;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    $('#view').innerHTML = `<h1>Cá nhân</h1>
      <div class="card"><h2>Thông tin để tính mục tiêu</h2>
        <div class="cols">${sel('sex', 'Giới tính', [['nam', 'Nam'], ['nu', 'Nữ']])}${inp('age', 'Tuổi')}${inp('height', 'Chiều cao (cm)')}${inp('weight', 'Cân nặng (kg)')}</div>
        ${sel('activity', 'Mức vận động', [['nhe', 'Nhẹ (đi lại, việc nhà)'], ['it', 'Ít vận động (ngồi nhiều)'], ['vua', 'Vừa (tập 3–5 buổi/tuần)'], ['nang', 'Nặng (lao động tay chân, tập hằng ngày)']])}
        ${sel('goal', 'Mục tiêu cân nặng', [['giu', 'Giữ cân'], ['giam', 'Giảm cân'], ['tang', 'Tăng cân']])}
        ${sel('dtype', 'Tình trạng đường huyết', [['type2', 'Tuýp 2'], ['type1', 'Tuýp 1'], ['thai', 'Thai kỳ'], ['tien', 'Tiền tiểu đường'], ['khong', 'Chỉ muốn ăn lành mạnh']])}
        ${sel('med', 'Thuốc đang dùng', [['none', 'Không / chỉ ăn uống, vận động'], ['khac', 'Thuốc uống (metformin…)'], ['su', 'Thuốc uống nhóm sulfonylurea (gliclazide, glimepiride…)'], ['insulin', 'Insulin']])}
        <div class="cols">${sel('carbPct', 'Tỷ lệ tinh bột', [[45, '45% (thông dụng)'], [40, '40% (ít tinh bột)'], [50, '50%']])}${inp('kcalOverride', 'Kcal/ngày do bác sĩ chỉ định', 'để trống = tự tính')}</div>
        ${sel('gunit', 'Đơn vị đường huyết', [['mmol', 'mmol/L'], ['mgdl', 'mg/dL']])}</div>
      <div class="card"><h2>Mục tiêu mỗi ngày</h2><div class="totals"><div><b>${fmt0(t.kcal)}</b><span>kcal</span></div><div><b>${t.carb}</b><span>tinh bột (g)</span></div><div><b>${t.sugar}</b><span>đường tối đa (g)</span></div><div><b>${t.fiber}</b><span>chất xơ (g)</span></div></div>
        <p class="small muted" style="margin:10px 0 0">${t.bmi ? `BMI ${fmt(t.bmi)}. ` : ''}Mỗi bữa chính ~${L.mealBudget('trua', t).carb}g tinh bột, bữa phụ ~${L.mealBudget('phu', t).carb}g. ${t.personalized ? '' : 'Chưa đủ thông tin nên đang dùng mức mặc định.'}</p></div>
      <div class="card"><h2>Cài lên máy</h2>${standalone ? `<p style="margin:6px 0"><span class="badge ok">✓ Đang chạy như ứng dụng đã cài</span></p>` : `<p class="small muted" style="margin:4px 0">Sau khi cài, app mở từ màn hình chính và chạy không cần mạng.</p>
        <b>iPhone / iPad (Safari)</b><ol class="steps small"><li>Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên lên).</li><li>Chọn <b>Thêm vào MH chính</b>.</li><li>Bấm <b>Thêm</b>.</li></ol>
        <b>Máy tính / Android (Chrome, Edge)</b><ol class="steps small"><li>Bấm biểu tượng <b>Cài đặt ứng dụng</b> ở thanh địa chỉ, hoặc nút bên dưới.</li></ol>
        <button class="btn sm" data-act="install" id="btn-install" ${S.installEvt ? '' : 'hidden'}>Cài ứng dụng</button>`}
        <p class="small" id="offline-state" style="margin:8px 0 0"></p></div>
      <div class="card"><h2>Phân tích kỹ (AI trên máy)</h2><p class="small muted" style="margin:4px 0 8px">Mô hình Florence-2 tìm từng thành phần trên đĩa nhiều món. Nặng khoảng ${VLM_MB} MB, tải một lần rồi chạy không cần mạng. Máy có GPU hỗ trợ WebGPU thì nhanh hơn nhiều.</p>
        <p class="small" id="vlm-state" style="margin:0 0 8px">Đang kiểm tra…</p><div class="btns"><button class="btn sm" data-act="vlm-download">Tải về máy</button><button class="btn sm danger" data-act="vlm-delete">Xóa khỏi máy</button></div><p class="small muted" style="margin:8px 0 0">Chế độ chạy: <b>${VLM_MODE_TXT[vlmMode()]}</b>.${vlmMode() !== VLM_LADDER[0] ? ' <button class="btn sm" data-act="vlm-retry">Thử lại</button>' : ''}</p></div>
      <div class="card"><h2>Những gì bạn đã dạy AI</h2>${(() => { const g = {}; for (const t of S.taught) { const o = g[t.label] = g[t.label] || { pos: [], neg: 0 }; if (t.neg) o.neg++; else o.pos.push(t); } const ks = Object.keys(g); return ks.length ? `<p class="small muted" style="margin:4px 0 0">Mỗi lần bạn khoanh vùng và đặt tên, hoặc xác nhận / bỏ một gợi ý, app lưu một mẫu. Càng nhiều mẫu càng nhận đúng.</p>` + ks.map(k => `<div class="item"><div class="grow"><b>${esc(k)}</b><div class="small muted">${g[k].pos.length} mẫu đúng${g[k].neg ? ` · ${g[k].neg} mẫu “không phải”` : ''}</div>${[...new Set(g[k].pos.map(t => t.note).filter(Boolean))].map(n => `<div class="small muted">“${esc(n)}”</div>`).join('')}<div class="thumbs">${g[k].pos.filter(t => t.thumb).slice(-6).map(t => `<img src="${t.thumb}" alt="">`).join('')}</div></div><button class="btn sm danger" data-act="taught-del" data-label="${esc(k)}">Xóa</button></div>`).join('') + `<div class="btns" style="margin-top:8px"><button class="btn sm danger" data-act="taught-clear">Xóa tất cả mẫu</button></div>` : `<p class="small muted" style="margin:4px 0 0">Chưa có mẫu nào. Khi nhập bữa, bấm <b>Khoanh vùng</b> trên ảnh, khoanh một thành phần rồi chọn tên — app sẽ nhớ để lần sau tự gợi ý.</p>`; })()}</div>
      <div class="card"><h2>Dữ liệu</h2><p class="small muted" style="margin:4px 0 8px">Mọi dữ liệu chỉ nằm trên máy này. Nên xuất bản sao lưu định kỳ, nhất là trước khi đổi máy hoặc xóa dữ liệu trình duyệt.</p>
        <div class="btns"><button class="btn sm" data-act="export">Xuất bản sao lưu</button><button class="btn sm" data-act="import">Nhập bản sao lưu</button><button class="btn sm danger" data-act="wipe">Xóa toàn bộ</button></div>
        <label class="check small"><input type="checkbox" id="exp-photos" checked> Kèm ảnh trong bản sao lưu</label><input type="file" id="imp-file" accept="application/json,.json" hidden>
        <p class="small muted" id="store-state" style="margin:8px 0 0"></p></div>
      <p class="small muted">Phiên bản ${APP_VERSION}.</p>
      <p class="small muted">NutriLens là công cụ ghi chép và tham khảo; số liệu dinh dưỡng là ước lượng. App không thay thế tư vấn của bác sĩ hay chuyên gia dinh dưỡng, và không dùng để tự chỉnh liều thuốc.</p>`;
    offlineState();
    VLM.downloaded().then(ok => { const el = $('#vlm-state'); if (el) el.innerHTML = (ok ? '<span class="badge ok">✓ Đã có trên máy</span>' : '<span class="badge none">Chưa tải</span>') + ' · ' + (navigator.gpu ? 'Máy này có WebGPU' : 'Máy này không có WebGPU — sẽ chạy bằng CPU, chậm hơn') + (self.crossOriginIsolated ? '' : ' · chưa bật đa luồng (mở lại app một lần)'); });
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { const el = $('#store-state'); if (el) el.textContent = `Đang dùng ${fmt(e.usage / 1048576)} MB trên máy.`; });
  }
  async function offlineState() {
    const el = $('#offline-state'); if (!el) return;
    if (!('serviceWorker' in navigator)) { el.innerHTML = `<span class="badge warn">! Trình duyệt này không hỗ trợ chạy không mạng</span>`; return; }
    const reg = await navigator.serviceWorker.getRegistration();
    const ok = reg && reg.active && 'caches' in window && (await caches.keys()).some(k => k.startsWith('nutrilens-'));
    if ($('#offline-state')) $('#offline-state').innerHTML = ok ? `<span class="badge ok">✓ Đã tải đủ để chạy không cần mạng (kể cả bộ đọc chữ)</span>` : `<span class="badge none">Đang tải dữ liệu để chạy không mạng…</span>`;
  }

  /* ---------- Sao lưu ---------- */
  async function exportData() {
    const data = { app: 'nutrilens', v: 1, exportedAt: new Date().toISOString(), profile: S.profile, custom: S.custom, labelLearn: S.labelLearn, vlmStats: S.vlmStats, taught: S.taught, customIng: S.customIng, meals: S.meals, glucose: S.glucose };
    if ($('#exp-photos').checked) data.photos = await Store.all('photos');
    const name = `nutrilens-saoluu-${L.dayKey(Date.now())}.json`, blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    try { const file = new File([blob], name, { type: 'application/json' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function importData(file) {
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== 'nutrilens' || !Array.isArray(d.meals)) throw new Error('Không phải bản sao lưu của NutriLens');
      if (!confirm(`Nhập ${d.meals.length} bữa ăn, ${(d.glucose || []).length} lần đo? Dữ liệu trùng mã sẽ được ghi đè, dữ liệu khác giữ nguyên.`)) return;
      for (const m of d.meals) await Store.put('meals', m);
      for (const g of d.glucose || []) await Store.put('glucose', g);
      for (const p of d.photos || []) await Store.put('photos', p);
      if (d.profile && Object.keys(d.profile).length) { S.profile = d.profile; await saveKV('profile', S.profile); }
      if (d.labelLearn) { S.labelLearn = Object.assign({}, d.labelLearn, S.labelLearn); await saveKV('labelLearn', S.labelLearn); }
      if (Array.isArray(d.customIng)) { const nm = new Set(S.customIng.map(x => x.name)); S.customIng = S.customIng.concat(d.customIng.filter(x => !nm.has(x.name))); applyCustomIng(); await saveKV('customIng', S.customIng); }
      if (d.vlmStats) { S.vlmStats = Object.assign({}, d.vlmStats, S.vlmStats); await saveKV('vlmStats', S.vlmStats); }
      if (Array.isArray(d.taught)) { const ids = new Set(S.taught.map(t => t.id)); S.taught = S.taught.concat(d.taught.filter(t => !ids.has(t.id))); await saveKV('taught', S.taught); }
      if (d.custom) { const names = new Set(d.custom.map(f => f.name)); S.custom = d.custom.concat(S.custom.filter(f => !names.has(f.name))); await saveKV('custom', S.custom); }
      await loadAll(); render(); toast('Đã nhập bản sao lưu');
    } catch (e) { toast(e.message || 'Tệp không hợp lệ'); }
  }

  /* ---------- Điều hướng ---------- */
  function render() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    ({ home: renderHome, stats: renderStats, foods: renderFoods, settings: renderSettings })[S.tab]();
  }
  async function loadAll() {
    const [meals, glucose, prof, cust] = await Promise.all([Store.all('meals'), Store.all('glucose'), Store.get('kv', 'profile'), Store.get('kv', 'custom')]);
    const ll = await Store.get('kv', 'labelLearn'); S.labelLearn = (ll && ll.v) || {};
    const vs = await Store.get('kv', 'vlmStats'); S.vlmStats = (vs && vs.v) || {};
    const tg = await Store.get('kv', 'taught'); S.taught = (tg && tg.v) || [];
    const ci = await Store.get('kv', 'customIng'); S.customIng = (ci && ci.v) || []; applyCustomIng();
    S.meals = meals; S.glucose = glucose; S.profile = (prof && prof.v) || {}; S.custom = (cust && cust.v) || [];
    // Món ghép: tính lại từ nguyên liệu để luôn khớp bảng nguyên liệu hiện tại
    S.custom = S.custom.map(f => f.parts ? Object.assign({}, f, FD.compose(f.parts)) : f);
    relearn();
  }

  const ACT = {
    tab(el) { S.tab = el.dataset.tab; render(); scrollTo(0, 0); },
    day(el) { const d = +el.dataset.d; S.day = d === 0 ? L.dayKey(Date.now()) : L.dayKey(new Date(S.day + 'T12:00').getTime() + d * DAY); render(); },
    range(el) { S.range = +el.dataset.d; render(); },
    'new-meal'() { openEditor(null); },
    'edit-meal'(el) { openEditor(S.meals.find(m => m.id === el.dataset.id)); },
    'close-editor'() { if (E.isNew && (E.items.length || E.photo) && !confirm('Bỏ bữa đang nhập?')) return; E = null; $('#sheet').hidden = true; $('#sheet').innerHTML = ''; },
    async 'save-meal'() {
      if (!E.items.length && !E.photo) return toast('Chọn ít nhất một món hoặc chụp ảnh');
      const ts = new Date($('#e-ts').value).getTime(); if (!isFinite(ts)) return toast('Thời gian không hợp lệ');
      const m = { id: E.id, ts, type: $('#e-type').value, items: E.items, note: $('#e-note').value.trim(), hasPhoto: !!E.photo || (E.hasPhoto && !E.photoChanged) };
      const vec = E.fullVec || (E.photoChanged ? null : E.vec); if (vec && m.hasPhoto) m.vec = vec;
      if (E.deep && E.deep.status === 'done' && m.hasPhoto) { try { await learnFromDeep(E.deep); } catch (e) { /* không chặn việc lưu */ } m.deep = packDeep(E.deep); }
      const kept = new Set(m.items.map(i => i.name)), done = new Set();
      for (const [idx, name] of E.pending) { const k = idx + '|' + name; if (!kept.has(name) || done.has(k)) continue; done.add(k); const o = S.labelLearn[idx] = S.labelLearn[idx] || {}; o[name] = (o[name] || 0) + 1; }
      if (done.size) await saveKV('labelLearn', S.labelLearn);
      await Store.put('meals', m);
      if (E.photoChanged) { if (E.photo) await Store.put('photos', { id: m.id, data: E.photo }); else await Store.del('photos', m.id); }
      S.meals = S.meals.filter(x => x.id !== m.id).concat(m); relearn();
      S.day = L.dayKey(ts); E = null; $('#sheet').hidden = true; $('#sheet').innerHTML = ''; S.tab = 'home'; render();
      toast(m.items.length ? 'Đã lưu bữa ăn' : 'Đã lưu ảnh — nhớ chọn món để app tính được');
    },
    async 'del-meal'() { if (!confirm('Xóa bữa ăn này?')) return; await Store.del('meals', E.id); await Store.del('photos', E.id); S.meals = S.meals.filter(m => m.id !== E.id); relearn(); E = null; $('#sheet').hidden = true; render(); },
    'pick-cam'() { $('#e-cam').click(); }, 'pick-lib'() { $('#e-lib').click(); },
    'rm-photo'() { E.photo = null; E.photoChanged = true; E.ocr = null; E.vis = null; E.deep = null; E.ocrImg = null; E.fullVec = null; updPhoto(); updVis(); updOcr(); },
    'ocr-dish'() { const d = E.ocr.dish; openParts({ mode: 'add-to-meal', name: d.name, portion: '1 phần', parts: d.parts }); },
    'ocr-again'() { analyze(); },
    crop() { openCrop(); },
    deep() { deepAnalyze(); },
    'deep-add'(el) { const d = ensureDeep(); if (!d.items.some(i => i.name === el.dataset.n)) d.items.push({ name: el.dataset.n, g: gramsOf(el.dataset.n), src: 'user', boxes: [], on: true, n: 0 }); E.deepQ = ''; updDeep(); },
    'deep-manual'() { const mine = E; ensureDeep(); updDeep(); if (S.taught.some(t => !t.neg)) ensureImg().then(img => img && recallTaught(img)).then(f => { if (E === mine && f && f.length) { applyRecall(f); updDeep(); } }).catch(() => {}); },
    teach(el) { teachRegion(el); },
    'ing-new'(el) { const c = el.dataset.ctx, q = c === 'pe' ? (PE && PE.q) : c === 'teach' ? ($('#teach-q') || {}).value : (E && E.deepQ); openIngForm((q || '').trim(), c); },
    'save-ing'() { saveIng(); },
    'close-sheet3'() { closeSheet3(); },
    'teach-new'() { teachNew(); },
    async 'taught-del'(el) { if (!confirm('Xóa các mẫu đã dạy cho “' + el.dataset.label + '”?')) return; S.taught = S.taught.filter(t => t.label !== el.dataset.label); await saveKV('taught', S.taught); renderSettings(); },
    async 'taught-clear'() { if (!confirm('Xóa TẤT CẢ mẫu đã dạy AI?')) return; S.taught = []; await saveKV('taught', S.taught); renderSettings(); },
    'deep-confirm'() { deepConfirm(); },
    async 'vlm-download'() { const el = $('#vlm-state'); if (vlmMode() === 'off') return toast('Bộ phân tích kỹ đang tắt trên máy này. Bấm “Thử lại” nếu muốn bật.'); try { const seen = {}; lsSet('nl-vlm-busy', vlmMode()); await VLM.load(m => { if (m.type !== 'progress') return; seen[m.file] = [m.loaded, m.total]; const v = Object.values(seen), l = v.reduce((x, y) => x + y[0], 0), t = v.reduce((x, y) => x + y[1], 0); if ($('#vlm-state')) $('#vlm-state').textContent = 'Đang tải ' + fmt0(l / 1048576) + ' / ' + fmt0(t / 1048576) + ' MB…'; }); lsSet('nl-vlm-busy', null); toast('Đã tải xong bộ phân tích kỹ'); } catch (e) { lsSet('nl-vlm-busy', null); toast('Tải không thành công: ' + (e.message || e)); } if (S.tab === 'settings') renderSettings(); void el; },
    'vlm-retry'() { lsSet('nl-vlm-mode', null); lsSet('nl-vlm-busy', null); vlmCrashNote = ''; VLM.reset(); renderSettings(); toast('Đã đặt lại. Bạn có thể chạy thử phân tích kỹ.'); },
    async 'vlm-delete'() { if (!confirm('Xóa bộ phân tích kỹ khỏi máy? Có thể tải lại sau.')) return; VLM.reset(); await caches.delete('transformers-cache'); renderSettings(); toast('Đã xóa'); },
    'crop-apply'() { applyCrop(); },
    'add-sim'(el) { const m = S.meals.find(x => x.id === el.dataset.id); if (!m) return; for (const it of m.items) { E.items.push(JSON.parse(JSON.stringify(it))); noteChoice(it.name); } updItems(); toast('Đã thêm ' + m.items.length + ' món'); },
    'ocr-use'() { const p = (E.ocr && E.ocr.parsed) || {}; openFoodForm({ mode: 'add-to-meal', title: 'Món theo nhãn', sig: E.ocr ? L.ocrSignature(E.ocr.text) : null, prefill: { basis: p.basis, unit: p.unit, servingSize: p.servingSize, k: p.kcal, c: p.carb, s: p.sugar, f: p.fiber, pr: p.protein, fa: p.fat, cat: 'nhan', gi: (p.carb && p.sugar / p.carb > 0.5) ? 68 : null } }); },
    'add-food'(el) { const f = findFood(el.dataset.name); if (!f) return; const ex = E.items.find(i => i.name === f.name && !i.parts); if (ex) ex.qty += 1; else E.items.push(itemFromFood(f, 1)); noteChoice(f.name); updItems(); toast('Đã thêm ' + f.name); },
    qty(el) { const it = E.items[+el.dataset.i]; it.qty = Math.max(0.25, Math.round((it.qty + +el.dataset.d) * 100) / 100); updItems(); },
    'rm-item'(el) { E.items.splice(+el.dataset.i, 1); updItems(); },
    'edit-item'(el) { const i = +el.dataset.i, it = E.items[i]; openFoodForm({ mode: 'item-edit', idx: i, title: 'Sửa giá trị món', prefill: Object.assign({}, it, { basis: /^100 (g|ml)$/.test(it.portion) ? '100' : 'serving', unit: /ml$/.test(it.portion) ? 'ml' : 'g' }) }); },
    'edit-parts'(el) { const i = +el.dataset.i, it = E.items[i]; openParts({ mode: 'item', idx: i, name: it.name, portion: it.portion, parts: it.parts, cat: it.cat, swap: it.swap }); },
    'e-cat'(el) { E.cat = el.dataset.cat; updResults(); },
    'new-food-num'() { openFoodForm({ mode: E ? 'add-to-meal' : 'food', title: 'Món mới', prefill: { name: E ? E.q : S.foodQ, cat: 'mon' } }); },
    'new-food-parts'() { openParts({ mode: E ? 'add-to-meal' : 'food', name: E ? E.q : S.foodQ, parts: [] }); },
    'close-sheet2'() { closeSheet2(); },
    'save-food'() { saveFoodForm(); },
    'save-parts'() { saveParts(); },
    'pe-quick'(el) { const n = el.dataset.n, i = PE.parts.findIndex(p => p.n === n); if (i >= 0) PE.parts.splice(i, 1); else PE.parts.push({ n, g: gramsOf(n) }); if (PE.q) { PE.q = ''; $('#pe-q').value = ''; } updParts(); },
    plate() { const d = E.ocr && E.ocr.dish; openParts({ mode: 'add-to-meal', name: (d && d.name) || 'Đĩa cơm', portion: '1 đĩa', parts: d && d.parts.length ? d.parts : [{ n: 'Cơm trắng', g: 150 }] }); },
    'pe-add'() { PE.parts.push({ n: 'Rau lá xanh', g: 50 }); updParts(); },
    'pe-rm'(el) { PE.parts.splice(+el.dataset.i, 1); updParts(); },
    'fd-cat'(el) { S.foodCat = el.dataset.cat; renderFoods(); },
    'open-food'(el) { openFood(el.dataset.name); },
    async 'del-food'(el) { if (!confirm('Xóa món này? Các bữa đã ghi không bị ảnh hưởng.')) return; S.custom = S.custom.filter(f => f.name !== el.dataset.name); await saveKV('custom', S.custom); closeSheet2(); render(); },
    'add-glucose'() { openGlucose(); },
    async 'save-glucose'() {
      let v = num($('#g-val').value); const ts = new Date($('#g-ts').value).getTime();
      if (!v || !isFinite(ts)) return toast('Nhập kết quả đo');
      if (S.profile.gunit === 'mgdl') v = v / 18;
      if (v < 1 || v > 40) return toast('Giá trị ngoài khoảng hợp lý — kiểm tra đơn vị');
      const g = { id: uid(), ts, val: Math.round(v * 10) / 10, ctx: $('#g-ctx').value };
      await Store.put('glucose', g); S.glucose.push(g); relearn(); closeSheet2(); S.day = L.dayKey(ts); render();
    },
    async 'del-glucose'(el) { if (!confirm('Xóa lần đo này?')) return; await Store.del('glucose', el.dataset.id); S.glucose = S.glucose.filter(g => g.id !== el.dataset.id); relearn(); render(); },
    export() { exportData(); }, import() { $('#imp-file').click(); },
    async wipe() { if (!confirm('Xóa TOÀN BỘ bữa ăn, ảnh, số đo, món của tôi và thông tin cá nhân trên máy này?') || !confirm('Không thể khôi phục. Chắc chắn xóa?')) return; for (const s of ['meals', 'photos', 'glucose', 'kv']) await Store.clear(s); await loadAll(); render(); toast('Đã xóa'); },
    async install() { if (!S.installEvt) return; S.installEvt.prompt(); await S.installEvt.userChoice; S.installEvt = null; render(); },
  };
  const CHG = {
    qty(el) { const it = E.items[+el.dataset.i]; it.qty = Math.max(0.05, num(el.value) || 1); updItems(); },
    'deep-on'(el) { E.deep.items[+el.dataset.i].on = el.checked; updDeep(); },
    'deep-g'(el) { E.deep.items[+el.dataset.i].g = Math.max(0, num(el.value)); },
    'pe-n'(el) { PE.parts[+el.dataset.i].n = el.value; updPartsTot(); },
    'pe-g'(el) { PE.parts[+el.dataset.i].g = Math.max(0, num(el.value)); updPartsTot(); },
    async prof(el) { const k = el.dataset.k, v = el.type === 'number' ? num(el.value) : el.value; S.profile[k] = v; await saveKV('profile', S.profile); const y = scrollY; renderSettings(); scrollTo(0, y); },
  };
  document.addEventListener('click', e => {
    const hit = e.target.closest('.chart .hit');
    if (hit) { const c = hit.closest('.chart'); c.querySelectorAll('.hit.on').forEach(x => x.classList.remove('on')); hit.classList.add('on'); c.querySelector('.tip').textContent = hit.dataset.tip; return; }
    const el = e.target.closest('[data-act]'); if (el && ACT[el.dataset.act]) ACT[el.dataset.act](el, e);
  });
  document.addEventListener('pointerover', e => { const hit = e.target.closest && e.target.closest('.chart .hit'); if (hit && e.pointerType === 'mouse') hit.closest('.chart').querySelector('.tip').textContent = hit.dataset.tip; });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.chg && CHG[t.dataset.chg]) return CHG[t.dataset.chg](t);
    if (t.id === 'e-cam' || t.id === 'e-lib') { onPhoto(t.files[0]); t.value = ''; }
    else if (t.id === 'imp-file') { if (t.files[0]) importData(t.files[0]); t.value = ''; }
    else if (t.id === 'e-ts' && E) { const ts = new Date(t.value).getTime(); if (isFinite(ts)) { E.ts = ts; if (E.typeAuto) { E.type = L.mealTypeByTime(ts); $('#e-type').value = E.type; } updItems(); updResults(); } }
    else if (t.id === 'e-type' && E) { E.type = t.value; E.typeAuto = false; updItems(); updResults(); }
    else if (t.id === 'ff-basis') syncFoodForm(false);
    else if (t.id === 'ff-gi') t.dataset.touched = '1';
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'deep-q' && E) { E.deepQ = t.value; updDeepChips(); }
    else if (t.id === 'teach-q') updTeach();
    else if (t.id === 'pe-q' && PE) { PE.q = t.value; updPartsQuick(); }
    else if (t.id === 'e-q' && E) { E.q = t.value; updResults(); }
    else if (t.id === 'fd-q') { S.foodQ = t.value; $('#fd-list').innerHTML = foodsListHtml(searchFoods(S.foodQ, S.foodCat)); }
    else if (t.dataset && t.dataset.chg === 'pe-g') CHG['pe-g'](t);
  });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; const b = $('#btn-install'); if (b) b.hidden = false; });

  /* ---------- Khởi động ---------- */
  (async function init() {
    try { await loadAll(); } catch (e) { $('#view').innerHTML = `<div class="empty">Không mở được bộ nhớ trên máy (IndexedDB). Hãy tắt chế độ duyệt riêng tư rồi mở lại.</div>`; return; }
    vlmCrashCheck(); render();
    if (vlmCrashNote) setTimeout(() => alert(vlmCrashNote), 400);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => { setTimeout(offlineState, 1500); let done = false; try { done = sessionStorage.getItem('coi') === '1'; } catch (e) { done = true; } const go = () => { if (!self.crossOriginIsolated && !done && !E && $('#sheet2').hidden) { try { sessionStorage.setItem('coi', '1'); } catch (e) { return; } location.reload(); } }; if (navigator.serviceWorker.controller) go(); else navigator.serviceWorker.addEventListener('controllerchange', go, { once: true }); }).catch(() => {});
  })();
  window.__nutrilens = { vlmMode, VLM, S, L, FD, openEditor, runOcr, analyze, getE: () => E, render, loadAll };
})();
