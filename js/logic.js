/* Logic thuần (không đụng DOM): mục tiêu dinh dưỡng, đánh giá bữa/ngày/giai đoạn,
   đọc nhãn dinh dưỡng từ chữ OCR, và phần "tự học" theo thói quen người dùng. */
(function (root) {
  const strip = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const r1 = x => Math.round(x * 10) / 10;
  const DAY = 86400000;

  const MEALS = {
    sang: { label: 'Bữa sáng', share: 0.25, main: true },
    trua: { label: 'Bữa trưa', share: 0.30, main: true },
    toi: { label: 'Bữa tối', share: 0.30, main: true },
    phu: { label: 'Bữa phụ', share: 0.075, main: false },
  };
  const ACT = { it: 1.2, nhe: 1.375, vua: 1.55, nang: 1.725 };

  function mealTypeByTime(ts) {
    const d = new Date(ts), h = d.getHours() + d.getMinutes() / 60;
    if (h >= 5 && h < 10) return 'sang';
    if (h >= 10.5 && h < 14) return 'trua';
    if (h >= 17 && h < 20.75) return 'toi';
    return 'phu';
  }
  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------- Mục tiêu ---------- */
  function calcTargets(p) {
    p = p || {};
    let kcal = 1800, bmi = null, personalized = false;
    if (p.weight > 0 && p.height > 0 && p.age > 0) {
      const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'nu' ? -161 : 5);
      const tdee = bmr * (ACT[p.activity] || 1.375);
      const adj = { giam: -500, giu: 0, tang: 300 }[p.goal || 'giu'] || 0;
      kcal = Math.max(p.sex === 'nu' ? 1200 : 1500, Math.round((tdee + adj) / 50) * 50);
      bmi = r1(p.weight / Math.pow(p.height / 100, 2));
      personalized = true;
    }
    if (p.kcalOverride > 0) { kcal = +p.kcalOverride; personalized = true; }
    const carbPct = p.carbPct > 0 ? +p.carbPct : 45;
    return {
      kcal, carbPct, bmi, personalized,
      carb: Math.round(kcal * carbPct / 400),
      sugar: Math.round(kcal * 0.10 / 4),
      fiber: Math.max(25, Math.round(kcal * 14 / 1000)),
      protein: Math.round(kcal * 0.20 / 4),
      fat: Math.round(kcal * 0.35 / 9),
    };
  }
  function mealBudget(type, t) {
    const m = MEALS[type] || MEALS.phu;
    return { kcal: Math.round(t.kcal * m.share), carb: Math.round(t.carb * m.share) };
  }

  // Đường THÊM VÀO của một món: món ghép từ nguyên liệu có số riêng (sA); món đơn thì lấy theo cờ 'n'
  function addedSugar(it) { return it.sA != null ? it.sA : ((it.flags || '').includes('n') ? it.s : 0); }

  /* Gợi ý theo NGUYÊN LIỆU bên trong món: chỉ đúng thứ đang gây vấn đề, kèm con số giảm được */
  function partAdvice(it, overCarb) {
    const out = [], q = it.qty || 1, parts = it.parts || [];
    if (!parts.length) return out;
    const main = parts.filter(p => p.grp === 'tb').sort((a, b) => b.c - a.c)[0];
    if (main && main.c * q >= 20 && (overCarb || it.gi >= 65)) {
      const share = it.c ? Math.round(main.c / it.c * 100) : 0, cut = Math.round(main.c * q / 3);
      out.push(`${share}% tinh bột đến từ ${main.n.toLowerCase()} (${Math.round(main.g * q)}g ≈ ${Math.round(main.c * q)}g tinh bột). Bớt 1/3 lượng này giảm được ~${cut}g tinh bột.`);
    }
    const sweet = parts.filter(p => (p.fl || '').includes('n') && p.grp === 'gv').sort((a, b) => b.c - a.c)[0];
    if (sweet && sweet.c * q >= 6) out.push(`${sweet.n} góp ~${Math.round(sweet.c * q)}g đường — xin để riêng và dùng một nửa.`);
    const fat = parts.find(p => ['Thịt heo ba chỉ', 'Thịt xông khói', 'Xúc xích', 'Thịt vịt'].includes(p.n) && p.g * q >= 40);
    if (fat) out.push(`${fat.n} nhiều chất béo bão hòa — đổi sang thịt nạc, ức gà, cá hoặc đậu hũ.`);
    const veg = parts.filter(p => p.grp === 'rau').reduce((a, p) => a + p.g, 0) * q;
    if (it.cat === 'mon' && veg < 60) out.push(`Món này chỉ có ~${Math.round(veg)}g rau — gọi thêm một phần rau/giá và ăn trước.`);
    return out;
  }

  /* ---------- Tổng hợp ---------- */
  function sumItems(items) {
    const t = { k: 0, c: 0, s: 0, f: 0, pr: 0, fa: 0, gl: 0, sAdded: 0 };
    for (const it of items || []) {
      const q = +it.qty || 1;
      t.k += it.k * q; t.c += it.c * q; t.s += it.s * q; t.f += it.f * q; t.pr += it.pr * q; t.fa += it.fa * q;
      const net = Math.max(0, it.c - it.f) * q;
      t.gl += (it.gi || 0) * net / 100;
      t.sAdded += addedSugar(it) * q;
    }
    for (const k in t) t[k] = r1(t[k]);
    return t;
  }

  /* ---------- Đánh giá một bữa ---------- */
  function evaluateMeal(meal, targets, profile, learned) {
    const items = meal.items || [], type = meal.type || 'phu', M = MEALS[type] || MEALS.phu;
    const tot = sumItems(items), b = mealBudget(type, targets);
    const notes = [], swaps = [];
    let score = 100;
    const add = (lv, text, pen) => { notes.push({ lv, text }); score -= pen || 0; };
    if (!items.length) return { tot, budget: b, score: 0, level: 'none', label: 'Chưa có món', notes, swaps };

    // Tinh bột so với ngân sách bữa
    const cr = b.carb ? tot.c / b.carb : 0;
    if (cr > 1.5) add('bad', `Tinh bột ${tot.c}g, vượt xa mức nên dùng cho ${M.label.toLowerCase()} (~${b.carb}g). Đường huyết sau ăn dễ tăng cao.`, 35);
    else if (cr > 1.15) add('warn', `Tinh bột ${tot.c}g, hơi nhiều so với mức ~${b.carb}g của ${M.label.toLowerCase()}.`, 18);
    else if (M.main && tot.c < 15 && ['insulin', 'su'].includes(profile && profile.med)) add('warn', `Bữa chính chỉ có ${tot.c}g tinh bột trong khi đang dùng ${profile.med === 'insulin' ? 'insulin' : 'thuốc nhóm sulfonylurea'} — có nguy cơ hạ đường huyết. Hỏi bác sĩ về liều khi ăn ít.`, 12);
    else add('ok', `Tinh bột ${tot.c}g, nằm trong mức ~${b.carb}g của ${M.label.toLowerCase()}.`);

    // Tải đường huyết
    if (tot.gl > 30) add('bad', `Tải đường huyết (GL) ${tot.gl} — cao. Bữa này gồm nhiều món hấp thu nhanh.`, 25);
    else if (tot.gl > 20) add('warn', `Tải đường huyết (GL) ${tot.gl} — trung bình cao.`, 12);
    else add('ok', `Tải đường huyết (GL) ${tot.gl} — thấp, đường huyết tăng chậm.`);

    // Đường thêm vào
    if (tot.sAdded >= 20) add('bad', `Có khoảng ${tot.sAdded}g đường thêm vào (nước ngọt/đồ ngọt) — riêng bữa này đã gần hết giới hạn cả ngày (${targets.sugar}g).`, 22);
    else if (tot.sAdded >= 8) add('warn', `Có khoảng ${tot.sAdded}g đường thêm vào từ đồ uống/đồ ngọt.`, 10);

    // Năng lượng
    if (tot.k > b.kcal * 1.35) add('warn', `Năng lượng ${Math.round(tot.k)} kcal, nhiều hơn mức ~${b.kcal} kcal của bữa này.`, 10);

    if (M.main) {
      const vegG = items.reduce((a, i) => a + (i.veg || 0) * (i.qty || 1), 0); // rau nằm trong món ghép nguyên liệu
      const hasVeg = items.some(i => i.cat === 'rau') || tot.f >= 6 || vegG >= 60;
      if (!hasVeg) add('warn', 'Bữa này thiếu rau/chất xơ. Rau giúp đường hấp thu chậm lại — nên có nửa dĩa rau mỗi bữa chính.', 8);
      if (tot.pr < 12) add('warn', `Đạm chỉ ${tot.pr}g. Thêm thịt nạc, cá, trứng hoặc đậu hũ để no lâu và ổn định đường huyết.`, 6);
    }
    const fried = items.filter(i => (i.flags || '').includes('c'));
    if (fried.length) add('warn', `Món chiên/nhiều dầu mỡ: ${fried.map(i => i.name).join(', ')}.`, 5);

    // Món mà dữ liệu của chính người dùng cho thấy hay làm đường huyết cao
    if (learned && learned.response) {
      for (const it of items) {
        const r = learned.response[it.name];
        if (r && r.n >= 2 && r.avg >= 10) add('warn', `Theo ${r.n} lần đo của bạn, sau khi ăn "${it.name}" đường huyết trung bình ${r.avg} mmol/L — cao hơn mục tiêu (<10).`, 8);
      }
    }

    // Gợi ý thay thế: ưu tiên món góp nhiều tinh bột/đường nhất
    const ranked = items.slice().sort((a, b2) => (b2.c * (b2.qty || 1) * (b2.gi || 50)) - (a.c * (a.qty || 1) * (a.gi || 50)));
    for (const it of ranked) {
      if (swaps.length >= 4) break;
      for (const text of partAdvice(it, cr > 1.15).slice(0, 2)) swaps.push({ name: it.name, text });
    }
    for (const it of ranked) {
      if (!it.swap) continue;
      const heavy = (it.flags || '').includes('n') || (it.flags || '').includes('c') || it.gi >= 70 || cr > 1.15;
      if (heavy && swaps.length < 5) swaps.push({ name: it.name, text: it.swap });
    }
    if (cr > 1.15 && !swaps.length) swaps.push({ name: '', text: `Giảm khoảng ${Math.round(tot.c - b.carb)}g tinh bột: bớt cơm/bún/bánh, bù bằng rau và đạm.` });

    score = Math.max(0, Math.min(100, score));
    const level = score >= 80 ? 'ok' : score >= 55 ? 'warn' : 'bad';
    const label = { ok: 'Phù hợp', warn: 'Cần lưu ý', bad: 'Chưa phù hợp' }[level];
    return { tot, budget: b, score, level, label, notes, swaps };
  }

  /* ---------- Đánh giá một ngày ---------- */
  function evaluateDay(meals, targets, profile, opts) {
    opts = opts || {};
    meals = meals.slice().sort((a, b) => a.ts - b.ts);
    const tot = sumItems(meals.flatMap(m => m.items || []));
    const notes = [];
    let score = 100;
    const add = (lv, text, pen) => { notes.push({ lv, text }); score -= pen || 0; };
    if (!meals.length) return { tot, score: null, level: 'none', label: 'Chưa có dữ liệu', notes, complete: false };
    const complete = !opts.isToday || new Date(opts.now || Date.now()).getHours() >= 20;
    const hm = ts => new Date(ts).toTimeString().slice(0, 5);

    const kr = tot.k / targets.kcal;
    if (kr > 1.15) add('bad', `Tổng năng lượng ${Math.round(tot.k)} kcal, vượt mục tiêu ${targets.kcal} kcal (${Math.round((kr - 1) * 100)}%).`, 20);
    else if (kr > 1.05) add('warn', `Tổng năng lượng ${Math.round(tot.k)} kcal, nhỉnh hơn mục tiêu ${targets.kcal} kcal.`, 8);
    else if (complete && kr < 0.6) add('warn', `Cả ngày mới ${Math.round(tot.k)} kcal (mục tiêu ${targets.kcal}). Ăn quá ít cũng làm đường huyết thất thường — hoặc bạn chưa nhập đủ bữa.`, 10);
    else add('ok', `Năng lượng ${Math.round(tot.k)} / ${targets.kcal} kcal.`);

    const cr = tot.c / targets.carb;
    if (cr > 1.2) add('bad', `Tinh bột ${tot.c}g, vượt mục tiêu ${targets.carb}g/ngày.`, 20);
    else if (cr > 1.05) add('warn', `Tinh bột ${tot.c}g, hơi cao so với ${targets.carb}g/ngày.`, 8);
    else add('ok', `Tinh bột ${tot.c} / ${targets.carb}g.`);

    if (tot.s > targets.sugar * 1.5) add('bad', `Đường ${tot.s}g, cao gấp ${r1(tot.s / targets.sugar)} lần mức nên dùng (${targets.sugar}g).`, 15);
    else if (tot.s > targets.sugar) add('warn', `Đường ${tot.s}g, vượt mức nên dùng ${targets.sugar}g.`, 8);
    if (tot.sAdded >= 25) add('bad', `Trong đó ~${tot.sAdded}g là đường thêm vào từ nước ngọt/đồ ngọt.`, 8);

    if (complete && tot.f < targets.fiber * 0.6) add('warn', `Chất xơ mới ${tot.f}g (nên ≥ ${targets.fiber}g). Thêm rau xanh, đậu, trái cây ít ngọt.`, 8);

    // Giờ giấc
    const mains = meals.filter(m => MEALS[m.type] && MEALS[m.type].main);
    const first = meals[0], last = meals[meals.length - 1];
    const fh = new Date(first.ts).getHours() + new Date(first.ts).getMinutes() / 60;
    if (fh >= 10 && (complete || fh >= 10)) add('warn', `Bữa đầu tiên trong ngày lúc ${hm(first.ts)} — bỏ hoặc ăn sáng muộn làm đường huyết dao động mạnh ở các bữa sau.`, 8);
    for (let i = 1; i < meals.length; i++) {
      const gap = (meals[i].ts - meals[i - 1].ts) / 3600000;
      if (gap > 6) add('warn', `Cách ${r1(gap)} giờ giữa ${hm(meals[i - 1].ts)} và ${hm(meals[i].ts)} không ăn gì. Khoảng nghỉ quá dài dễ gây hạ đường huyết rồi ăn bù quá nhiều; nên có bữa phụ nhỏ.`, 7);
    }
    const lh = new Date(last.ts).getHours() + new Date(last.ts).getMinutes() / 60;
    if (lh >= 21 && sumItems(last.items).c > 20) add('warn', `Ăn ${sumItems(last.items).c}g tinh bột lúc ${hm(last.ts)} — ăn muộn làm đường huyết sáng hôm sau cao hơn.`, 7);
    if (complete && mains.length < 3) add('warn', `Mới ghi nhận ${mains.length}/3 bữa chính. Ăn đủ bữa, đúng giờ giúp đường huyết ổn định.`, 6);
    const big = meals.map(m => ({ m, c: sumItems(m.items).c })).sort((a, b) => b.c - a.c)[0];
    if (complete && meals.length >= 2 && tot.c > 60 && big.c / tot.c > 0.55) add('warn', `${Math.round(big.c / tot.c * 100)}% tinh bột cả ngày dồn vào bữa lúc ${hm(big.m.ts)}. Nên chia đều cho các bữa.`, 8);

    score = Math.max(0, Math.min(100, score));
    const level = score >= 80 ? 'ok' : score >= 55 ? 'warn' : 'bad';
    return { tot, score, level, label: { ok: 'Tốt', warn: 'Cần điều chỉnh', bad: 'Chưa ổn' }[level], notes, complete };
  }

  /* ---------- Đường huyết ---------- */
  const GCTX = { doi: 'Lúc đói / trước ăn', sau: 'Sau ăn 2 giờ', ngu: 'Trước khi ngủ', khac: 'Khác' };
  function evalGlucose(v, ctx) {
    if (v < 3.9) return { lv: 'bad', text: 'Hạ đường huyết — ăn/uống ngay 15g đường nhanh và đo lại sau 15 phút.' };
    if (ctx === 'sau') return v > 13.9 ? { lv: 'bad', text: 'Rất cao sau ăn' } : v >= 10 ? { lv: 'warn', text: 'Cao hơn mục tiêu sau ăn (<10)' } : { lv: 'ok', text: 'Trong mục tiêu sau ăn' };
    if (ctx === 'doi') return v > 10 ? { lv: 'bad', text: 'Rất cao lúc đói' } : v > 7.2 ? { lv: 'warn', text: 'Cao hơn mục tiêu lúc đói (4,4–7,2)' } : { lv: 'ok', text: 'Trong mục tiêu lúc đói' };
    return v > 13.9 ? { lv: 'bad', text: 'Rất cao' } : v > 10 ? { lv: 'warn', text: 'Cao' } : { lv: 'ok', text: 'Ổn' };
  }

  /* ---------- Tự học từ dữ liệu của người dùng ---------- */
  function learn(meals, glucose) {
    // 1) tần suất món theo loại bữa  2) đáp ứng đường huyết sau ăn theo từng món
    const freq = {}, resp = {};
    const gs = (glucose || []).slice().sort((a, b) => a.ts - b.ts);
    for (const m of meals) {
      for (const it of m.items || []) {
        const f = (freq[m.type] = freq[m.type] || {});
        f[it.name] = (f[it.name] || 0) + 1;
      }
      const g = gs.find(x => x.ts - m.ts >= 60 * 60000 && x.ts - m.ts <= 180 * 60000);
      if (g) for (const it of m.items || []) {
        if (it.c * (it.qty || 1) < 10) continue; // món gần như không có tinh bột thì không quy trách nhiệm
        const r = (resp[it.name] = resp[it.name] || { n: 0, sum: 0 });
        r.n++; r.sum += g.val;
      }
    }
    for (const k in resp) resp[k].avg = r1(resp[k].sum / resp[k].n);
    return { freq, response: resp };
  }
  function frequentFoods(learned, type, limit) {
    const f = (learned && learned.freq && learned.freq[type]) || {};
    return Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, limit || 6).map(e => e[0]);
  }

  /* ---------- Phân tích giai đoạn ---------- */
  function analyzePeriod(meals, glucose, targets, profile, days, now) {
    now = now || Date.now();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const from = start.getTime() - (days - 1) * DAY;
    const series = [];
    for (let i = 0; i < days; i++) {
      const key = dayKey(from + i * DAY + DAY / 2);
      const ms = meals.filter(m => dayKey(m.ts) === key);
      const t = sumItems(ms.flatMap(m => m.items || []));
      const ev = ms.length ? evaluateDay(ms, targets, profile, { isToday: false }) : null;
      series.push({ key, n: ms.length, k: Math.round(t.k), c: t.c, s: t.s, f: t.f, score: ev ? ev.score : null });
    }
    const logged = series.filter(d => d.n > 0);
    const res = { series, loggedDays: logged.length, insights: [], actions: [] };
    if (!logged.length) return res;
    const avg = k => r1(logged.reduce((a, d) => a + d[k], 0) / logged.length);
    res.avg = { k: Math.round(avg('k')), c: avg('c'), s: avg('s'), f: avg('f'), score: Math.round(avg('score')) };
    const I = (lv, text) => res.insights.push({ lv, text }), A = t => res.actions.push(t);

    const overK = logged.filter(d => d.k > targets.kcal * 1.05).length, overC = logged.filter(d => d.c > targets.carb * 1.05).length;
    I(overK > logged.length / 2 ? 'bad' : overK ? 'warn' : 'ok', `Năng lượng trung bình ${res.avg.k} kcal/ngày (mục tiêu ${targets.kcal}); ${overK}/${logged.length} ngày vượt mục tiêu.`);
    I(overC > logged.length / 2 ? 'bad' : overC ? 'warn' : 'ok', `Tinh bột trung bình ${res.avg.c}g/ngày (mục tiêu ${targets.carb}g); ${overC}/${logged.length} ngày vượt.`);
    if (res.avg.s > targets.sugar) I('warn', `Đường trung bình ${res.avg.s}g/ngày, cao hơn mức nên dùng ${targets.sugar}g.`);
    if (res.avg.f < targets.fiber * 0.7) { I('warn', `Chất xơ trung bình ${res.avg.f}g/ngày, thấp hơn mức nên có ${targets.fiber}g.`); A('Thêm một dĩa rau luộc hoặc canh rau vào bữa trưa và bữa tối; ăn rau trước khi ăn cơm.'); }

    // Món góp nhiều tinh bột / đường thêm nhất
    const inRange = meals.filter(m => m.ts >= from);
    const byFood = {};
    for (const m of inRange) for (const it of m.items || []) {
      const o = (byFood[it.name] = byFood[it.name] || { name: it.name, c: 0, sAdded: 0, n: 0, swap: it.swap, gi: it.gi });
      const q = it.qty || 1; o.c += it.c * q; o.n++;
      o.sAdded += addedSugar(it) * q;
    }
    const foods = Object.values(byFood), totalC = foods.reduce((a, f) => a + f.c, 0) || 1;
    res.topCarb = foods.slice().sort((a, b) => b.c - a.c).slice(0, 5).map(f => ({ name: f.name, c: Math.round(f.c), pct: Math.round(f.c / totalC * 100), n: f.n }));
    const top = res.topCarb[0];
    if (top && top.pct >= 25) { I('warn', `"${top.name}" chiếm ${top.pct}% tổng tinh bột (${top.n} lần).`); const sw = byFood[top.name].swap; if (sw) A(`${top.name}: ${sw}`); }
    const sweet = foods.filter(f => f.sAdded / f.n >= 8).sort((a, b) => b.sAdded - a.sAdded);
    if (sweet.length) {
      const tot = Math.round(sweet.reduce((a, f) => a + f.sAdded, 0)), cnt = sweet.reduce((a, f) => a + f.n, 0);
      I(tot / logged.length > 15 ? 'bad' : 'warn', `Đồ uống/đồ ngọt có đường: ${cnt} lần, tổng ~${tot}g đường thêm vào. Nhiều nhất: ${sweet.slice(0, 3).map(f => f.name).join(', ')}.`);
      for (const f of sweet.slice(0, 2)) if (f.swap) A(`${f.name}: ${f.swap}`);
    } else I('ok', 'Không ghi nhận đồ uống/đồ ngọt có đường thêm vào. Rất tốt.');

    // Giờ giấc
    const dev = type => {
      const ts = inRange.filter(m => m.type === type).map(m => { const d = new Date(m.ts); return d.getHours() * 60 + d.getMinutes(); });
      if (ts.length < 3) return null;
      const mean = ts.reduce((a, b) => a + b, 0) / ts.length;
      return { mean, sd: Math.sqrt(ts.reduce((a, b) => a + (b - mean) ** 2, 0) / ts.length), n: ts.length };
    };
    const fmt = min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(Math.round(min % 60)).padStart(2, '0');
    for (const t of ['sang', 'trua', 'toi']) {
      const d = dev(t);
      if (d && d.sd > 60) { I('warn', `${MEALS[t].label} lệch giờ nhiều (trung bình ${fmt(d.mean)}, dao động ±${Math.round(d.sd)} phút).`); A(`Cố định ${MEALS[t].label.toLowerCase()} quanh ${fmt(d.mean)}, lệch không quá 30 phút.`); }
    }
    const noBreakfast = logged.filter(d => !inRange.some(m => dayKey(m.ts) === d.key && m.type === 'sang')).length;
    if (noBreakfast >= Math.max(2, logged.length / 3)) { I('warn', `${noBreakfast}/${logged.length} ngày không ghi nhận bữa sáng.`); A('Ăn sáng trước 9 giờ với món có đạm và chất xơ (trứng, yến mạch, bánh mì nguyên cám).'); }
    const late = inRange.filter(m => new Date(m.ts).getHours() >= 21 && sumItems(m.items).c > 20).length;
    if (late >= 2) { I('warn', `${late} lần ăn nhiều tinh bột sau 21 giờ.`); A('Kết thúc bữa tối trước 20 giờ; nếu đói về khuya chọn sữa không đường hoặc một nắm hạt.'); }

    // Đường huyết
    const gs = (glucose || []).filter(g => g.ts >= from);
    if (gs.length) {
      const hypo = gs.filter(g => g.val < 3.9).length, post = gs.filter(g => g.ctx === 'sau'), fast = gs.filter(g => g.ctx === 'doi');
      const mean = a => r1(a.reduce((x, g) => x + g.val, 0) / a.length);
      if (fast.length) I(mean(fast) > 7.2 ? 'warn' : 'ok', `Đường huyết lúc đói trung bình ${mean(fast)} mmol/L (${fast.length} lần đo, mục tiêu 4,4–7,2).`);
      if (post.length) I(mean(post) >= 10 ? 'warn' : 'ok', `Đường huyết sau ăn trung bình ${mean(post)} mmol/L (${post.length} lần đo, mục tiêu <10).`);
      if (hypo) { I('bad', `${hypo} lần hạ đường huyết (<3,9 mmol/L).`); A('Có hạ đường huyết: không bỏ bữa, mang theo kẹo/nước đường, và báo bác sĩ để xem lại liều thuốc.'); }
      const L = learn(inRange, gs);
      res.highResponse = Object.entries(L.response).filter(e => e[1].n >= 2 && e[1].avg >= 10).sort((a, b) => b[1].avg - a[1].avg).slice(0, 5).map(e => ({ name: e[0], avg: e[1].avg, n: e[1].n }));
      if (res.highResponse.length) { I('warn', `Món thường đi kèm đường huyết sau ăn cao ở chính bạn: ${res.highResponse.map(h => `${h.name} (${h.avg})`).join(', ')}.`); A(`Giảm khẩu phần hoặc đổi món: ${res.highResponse.map(h => h.name).join(', ')} — rồi đo lại sau ăn 2 giờ để so sánh.`); }
    } else A('Nhập thêm đường huyết sau ăn 2 giờ để app tìm ra món nào ảnh hưởng nhiều nhất đến riêng bạn.');

    if (!res.actions.length) A('Duy trì thói quen hiện tại. Tiếp tục ghi đều để app theo dõi xu hướng.');
    return res;
  }

  /* ---------- Đọc nhãn dinh dưỡng từ chữ OCR ---------- */
  function normText(text) {
    return strip(text).replace(/(\d)\s*,\s*(\d)/g, '$1.$2').replace(/[|]/g, ' ').replace(/[ \t]+/g, ' ');
  }
  const NUM = '(?:[<≤]\\s*)?(\\d+(?:\\.\\d+)?)\\s*(mg|kcal|kj|ml|g|9)?';
  function findAfter(t, kws) {
    for (const kw of kws) {
      const m = new RegExp(kw + '[^\\d\\n]{0,28}?' + NUM).exec(t);
      if (m) {
        // OCR hay đọc chữ 'g' dính sau số thành '9' (13,2 g → 13,29): nhãn hiếm khi ghi 2 số lẻ nên bỏ số 9 cuối
        let v = m[1], unit = m[2] === '9' ? 'g' : m[2] || '';
        if (!unit && /\.\d9$/.test(v)) { v = v.slice(0, -1); unit = 'g'; }
        return { val: +v, unit, kw };
      }
    }
    return null;
  }
  function parseNutritionText(text) {
    let t = normText(text);
    const out = { found: 0 };
    // Năng lượng
    let m = /(\d+(?:\.\d+)?)\s*k\s*cal/.exec(t);
    if (m) out.kcal = +m[1];
    else {
      const e = findAfter(t, ['nang luong', 'energy', 'calories', 'calo']);
      if (e) out.kcal = e.unit === 'kj' ? Math.round(e.val / 4.184) : e.val;
      else if ((m = /(\d+(?:\.\d+)?)\s*kj/.exec(t))) out.kcal = Math.round(+m[1] / 4.184);
    }
    const carb = findAfter(t, ['carbohydrate?s?', 'carbohydrat', 'cacbohydrat', 'chat bot duong', 'tong carb', 'glucid', 'tinh bot']);
    if (carb) out.carb = carb.val;
    const t2 = t.replace(/chat bot duong/g, 'chat bot dg').replace(/duong huyet/g, 'dg huyet');
    const sugar = findAfter(t2, ['duong tong so', 'tong duong', 'duong', 'total sugars?', 'sugars?']);
    if (sugar) out.sugar = sugar.val;
    const fat = findAfter(t, ['tong chat beo', 'chat beo', 'total fat', 'lipid', '\\bfat']);
    if (fat) out.fat = fat.val;
    const pro = findAfter(t, ['chat dam', 'protein', '\\bdam\\b']);
    if (pro) out.protein = pro.val;
    const fib = findAfter(t, ['chat xo', 'dietary fib(?:er|re)', 'fib(?:er|re)', '\\bxo\\b']);
    if (fib) out.fiber = fib.val;
    const na = findAfter(t, ['natri', 'sodium']);
    if (na) out.sodium = na.unit === 'g' ? na.val * 1000 : na.val;

    const sv = /(?:khau phan|serving size|serving|moi phan|per serving|1 goi|mot goi)[^\d\n]{0,30}?(\d+(?:\.\d+)?)\s*(g|ml)\b/.exec(t);
    if (sv) { out.servingSize = +sv[1]; out.unit = sv[2]; }
    const per100 = /(?:trong|per|tren|cho|\/)\s*100\s*(g|ml)\b|100\s*(g|ml)\s*(?:san pham|chua|contains?)/.exec(t);
    out.basis = per100 ? '100' : 'serving';
    if (per100 && !out.unit) out.unit = per100[1] || per100[2];
    out.unit = out.unit || 'g';

    for (const k of ['kcal', 'carb', 'sugar', 'fat', 'protein', 'fiber']) if (out[k] != null) out.found++;
    if (out.sugar != null && out.carb != null && out.sugar > out.carb) out.warn = 'Đường lớn hơn tổng carbohydrate — kiểm tra lại số.';
    if (out.kcal != null && out.carb != null && out.fat != null && out.protein != null) {
      const est = 4 * out.carb + 4 * out.protein + 9 * out.fat;
      if (est > 20 && Math.abs(est - out.kcal) / est > 0.4) out.warn = `Năng lượng đọc được (${out.kcal} kcal) lệch nhiều so với tính từ thành phần (~${Math.round(est)} kcal) — kiểm tra lại số.`;
    }
    return out;
  }

  /* Tìm món quen thuộc trong chữ OCR (thực đơn, hóa đơn, tên sản phẩm) */
  function baseName(n) { return strip(n).replace(/\(.*?\)/g, '').split('/')[0].trim(); }
  function matchFoodsInText(text, foods) {
    const t = ' ' + normText(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
    const hits = [];
    for (const f of foods) {
      const b = baseName(f.name).replace(/[^a-z0-9]+/g, ' ').trim();
      if (b.length < 7 && !b.includes(' ')) continue;
      if (t.includes(' ' + b + ' ')) hits.push(f);
    }
    return hits.sort((a, b) => baseName(b.name).length - baseName(a.name).length).slice(0, 6);
  }

  /* Dấu vân tay chữ của một bao bì: để lần sau quét lại là nhận ra món đã lưu */
  function ocrSignature(text) {
    const words = normText(text).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 4 && !/^\d+$/.test(w));
    return [...new Set(words)].slice(0, 60);
  }
  function matchSignature(text, customFoods) {
    const sig = new Set(ocrSignature(text));
    if (sig.size < 4) return null;
    let best = null;
    for (const f of customFoods || []) {
      if (!f.sig || f.sig.length < 4) continue;
      const inter = f.sig.filter(w => sig.has(w)).length, score = inter / Math.min(f.sig.length, sig.size);
      if (inter >= 4 && score >= 0.6 && (!best || score > best.score)) best = { food: f, score };
    }
    return best;
  }

  /* ---------- Hiểu chữ trên ảnh món ăn (chữ dán trên ảnh, bảng hiệu, thực đơn) ----------
     OCR trên ảnh chụp món cho ra nhiều ký tự rác. Cách xử lý: chỉ giữ những từ có trong "từ điển món ăn",
     rồi dò cụm từ → nguyên liệu. Đọc nhiều lượt (nhiều kênh màu) và lấy phiếu: từ đơn phải xuất hiện ≥2 lượt. */
  const SWEET = 'Sốt ngọt (teriyaki, BBQ, tương đen, ketchup)';
  const KW = [ // cụm không dấu | nguyên liệu | gam mặc định
    ['com gao lut', 'Cơm gạo lứt', 150], ['gao lut', 'Cơm gạo lứt', 150], ['com', 'Cơm trắng', 150], ['banh pho', 'Bánh phở', 200], ['pho', 'Bánh phở', 200],
    ['bun', 'Bún', 220], ['hu tieu', 'Hủ tiếu / mì gạo', 220], ['mien', 'Miến', 200], ['spaghetti', 'Mì Ý', 200], ['pasta', 'Mì Ý', 200], ['mi y', 'Mì Ý', 200],
    ['ramen', 'Mì ramen', 220], ['udon', 'Mì udon', 250], ['soba', 'Mì soba', 220], ['mi', 'Mì trứng', 200], ['xoi', 'Xôi nếp', 150], ['banh mi', 'Bánh mì trắng', 80],
    ['khoai lang', 'Khoai lang', 150], ['khoai tay chien', 'Khoai tây chiên', 100], ['khoai tay', 'Khoai tây', 120], ['bap', 'Bắp hạt', 80], ['ngo', 'Bắp hạt', 80], ['yen mach', 'Yến mạch (khô)', 40],
    ['uc ga', 'Ức gà', 100], ['dui ga', 'Đùi gà (có da)', 100], ['canh ga', 'Đùi gà (có da)', 100], ['ga ran', 'Gà chiên bột', 150], ['ga', 'Ức gà', 100],
    ['bo bit tet', 'Bò bít tết', 150], ['bit tet', 'Bò bít tết', 150], ['steak', 'Bò bít tết', 150], ['thit bo', 'Thịt bò', 80], ['bo', 'Thịt bò', 80],
    ['ba chi', 'Thịt heo ba chỉ', 60], ['ba roi', 'Thịt heo ba chỉ', 60], ['thit heo', 'Thịt heo nạc', 80], ['heo', 'Thịt heo nạc', 80], ['suon', 'Thịt heo nạc', 90], ['thit nuong', 'Thịt heo nạc', 80],
    ['ca hoi', 'Cá hồi', 100], ['salmon', 'Cá hồi', 100], ['ca ngu', 'Cá ngừ', 100], ['ca', 'Cá thịt trắng', 100], ['tom', 'Tôm', 80], ['muc', 'Mực', 80], ['vit', 'Thịt vịt', 90],
    ['trung', 'Trứng', 50], ['dau hu', 'Đậu hũ', 100], ['dau phu', 'Đậu hũ', 100], ['tofu', 'Đậu hũ', 100], ['cha lua', 'Chả lụa', 40], ['gio lua', 'Chả lụa', 40], ['xuc xich', 'Xúc xích', 40],
    ['bong cai', 'Bông cải xanh', 80], ['sup lo', 'Bông cải xanh', 80], ['ca rot', 'Cà rốt', 50], ['ca chua', 'Cà chua', 50], ['dua leo', 'Dưa leo', 50], ['dua chuot', 'Dưa leo', 50],
    ['kim chi', 'Kim chi', 50], ['nam', 'Nấm', 50], ['salad', 'Rau sống / xà lách', 100], ['xa lach', 'Rau sống / xà lách', 80], ['rau cu', 'Rau lá xanh', 100], ['rau', 'Rau lá xanh', 80],
    ['ap chao', 'Dầu ăn', 8], ['chien', 'Dầu ăn', 12], ['ran', 'Dầu ăn', 12], ['xao', 'Dầu ăn', 10], ['rang', 'Dầu ăn', 12],
    ['nuoc tuong', 'Nước tương (xì dầu)', 15], ['xi dau', 'Nước tương (xì dầu)', 15], ['tuong ot', 'Tương ớt', 15], ['nuoc mam', 'Nước mắm pha ngọt', 20],
    ['teriyaki', SWEET, 15], ['bbq', SWEET, 15], ['sot', SWEET, 15],
  ].map(r => ({ w: r[0].split(' '), n: r[1], g: r[2] })).sort((a, b) => b.w.length - a.w.length);
  const LIGHT = ['healthy', 'eat', 'clean', 'eatclean', 'giam', 'can', 'low', 'carb', 'kieng', 'diet'];
  let vocabCache = null, vocabFor = null;
  function vocab(foods) {
    if (vocabCache && vocabFor === foods.length) return vocabCache;
    const v = new Set(LIGHT);
    for (const k of KW) k.w.forEach(x => v.add(x));
    for (const f of foods) baseName(f.name).replace(/[^a-z0-9]+/g, ' ').split(' ').forEach(x => { if (x.length >= 2 && !/^\d+$/.test(x)) v.add(x); });
    vocabCache = v; vocabFor = foods.length; return v;
  }
  const knownWords = (text, v) => normText(text).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 2 && v.has(w));
  function interpretDishText(texts, foods) {
    const v = vocab(foods), votes = {}, order = [], foodVotes = {};
    let best = [];
    for (const text of texts) {
      const ws = knownWords(text, v), seen = new Set();
      if (ws.length > best.length) best = ws;
      for (let i = 0; i < ws.length;) {
        const k = KW.find(k => k.w.every((x, j) => ws[i + j] === x));
        if (!k) { i++; continue; }
        const key = k.n + '|' + k.w.length;
        if (!seen.has(k.n)) { seen.add(k.n); const o = votes[k.n] = votes[k.n] || { n: k.n, g: k.g, votes: 0, multi: false }; o.votes++; if (k.w.length > 1) o.multi = true; if (!order.includes(k.n)) order.push(k.n); }
        i += k.w.length; void key;
      }
      // món có sẵn: tên đầy đủ, hoặc 2 từ đầu của tên xuất hiện liền nhau
      const seq = ' ' + ws.join(' ') + ' ', hit = new Set();
      for (const f of foods) {
        const b = baseName(f.name).replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
        if (b.length < 2) continue;
        if (seq.includes(' ' + b.join(' ') + ' ')) hit.add(f.name + '|2'); else if (seq.includes(' ' + b[0] + ' ' + b[1] + ' ')) hit.add(f.name + '|1');
      }
      hit.forEach(h => { const [name, w] = h.split('|'); foodVotes[name] = Math.max(foodVotes[name] || 0, +w); });
    }
    const need = texts.length >= 3 ? 2 : 1;
    let parts = order.map(n => votes[n]).filter(o => o.multi || o.votes >= need).map(o => ({ n: o.n, g: o.g }));
    const light = texts.some(t => knownWords(t, v).some(w => ['healthy', 'clean', 'eatclean', 'kieng', 'diet'].includes(w)));
    if (light) parts = parts.map(p => p.n === 'Cơm trắng' ? { n: 'Cơm gạo lứt', g: p.g } : p);
    const seenN = new Set(); parts = parts.filter(p => !seenN.has(p.n) && seenN.add(p.n));
    const main = parts.filter(p => !['Dầu ăn', SWEET].includes(p.n));
    const hits = Object.entries(foodVotes).sort((a, b) => b[1] - a[1]).map(e => foods.find(f => f.name === e[0])).filter(Boolean).slice(0, 6);
    return { words: best, parts: main.length ? parts : [], name: main.map((p, i) => i ? p.n.toLowerCase() : p.n).join(' + '), light, hits };
  }

  const api = { interpretDishText, strip, r1, MEALS, GCTX, mealTypeByTime, dayKey, calcTargets, mealBudget, sumItems, evaluateMeal, evaluateDay, evalGlucose, learn, frequentFoods, analyzePeriod, parseNutritionText, matchFoodsInText, ocrSignature, matchSignature, normText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Logic = api;
})(typeof self !== 'undefined' ? self : this);
