/* Nguyên liệu (giá trị trên 100 g đã nấu chín, ƯỚC LƯỢNG) + công thức món = tổ hợp nguyên liệu.
   Món tính từ nguyên liệu nên đổi/bớt/thêm nguyên liệu là kcal, tinh bột, GI tự tính lại. */
(function (root) {
  const DB = (typeof module !== 'undefined' && module.exports) ? require('./db.js') : root.FoodDB;

  // tên | kcal | carb | đường | xơ | đạm | béo | GI | nhóm (tb/dam/rau/gv/sua/tc) | cờ (n=đường thêm, c=chiên)
  const I = [
    // Tinh bột
    ['Bánh phở', 135, 31, 0, 0.5, 2, 0.3, 61, 'tb'],
    ['Bún', 110, 25.7, 0, 0.5, 1.7, 0.2, 58, 'tb'],
    ['Hủ tiếu / mì gạo', 110, 25, 0, 0.5, 1.8, 0.2, 60, 'tb'],
    ['Mì trứng', 138, 25, 0.4, 1.2, 4.5, 2, 50, 'tb'],
    ['Mì ramen', 140, 27, 0.5, 1, 4.5, 1.5, 60, 'tb'],
    ['Mì udon', 105, 22, 0.3, 0.8, 3, 0.3, 62, 'tb'],
    ['Mì soba', 99, 21, 0.3, 1.5, 5, 0.1, 50, 'tb'],
    ['Mì Ý', 158, 31, 0.6, 1.8, 5.8, 0.9, 50, 'tb'],
    ['Miến', 85, 20.6, 0, 0.3, 0.1, 0, 40, 'tb'],
    ['Mì gói (vắt khô)', 450, 62, 2, 2.5, 9, 18, 70, 'tb', 'c'],
    ['Cơm trắng', 130, 28.5, 0.1, 0.4, 2.7, 0.3, 73, 'tb'],
    ['Cơm gạo lứt', 112, 23.5, 0.3, 1.8, 2.6, 0.9, 55, 'tb'],
    ['Cơm sushi', 140, 31, 2, 0.3, 2.5, 0.2, 80, 'tb'],
    ['Cơm basmati', 121, 25, 0.1, 0.4, 3, 0.4, 58, 'tb'],
    ['Xôi nếp', 210, 45, 0.5, 1.3, 4.5, 1, 87, 'tb'],
    ['Bánh mì trắng', 265, 49, 5, 2.7, 9, 3.2, 75, 'tb'],
    ['Bánh mì nguyên cám', 247, 41, 6, 7, 13, 3.4, 53, 'tb'],
    ['Bánh burger', 280, 50, 6, 2, 9, 4.5, 66, 'tb'],
    ['Bánh tortilla', 310, 52, 3, 3, 8, 8, 45, 'tb'],
    ['Bánh naan', 290, 50, 3.5, 2, 9, 6, 71, 'tb'],
    ['Bánh pita', 275, 55, 1.3, 2.2, 9, 1.2, 57, 'tb'],
    ['Đế pizza', 270, 50, 3, 2.5, 9, 4, 65, 'tb'],
    ['Bánh tráng', 340, 83, 0, 1, 0.5, 0.3, 65, 'tb'],
    ['Vỏ há cảo / sủi cảo', 290, 58, 0.5, 2, 10, 1.5, 60, 'tb'],
    ['Bánh gạo Hàn (tteok)', 230, 51, 0.5, 1, 4, 0.5, 82, 'tb'],
    ['Bột mì / bột áo', 364, 76, 0.3, 2.7, 10, 1, 70, 'tb'],
    ['Khoai tây', 87, 20, 0.9, 1.8, 1.9, 0.1, 78, 'tb'],
    ['Khoai tây chiên', 312, 41, 0.3, 3.8, 3.4, 15, 70, 'tb', 'c'],
    ['Khoai lang', 86, 20, 6, 3, 1.6, 0.1, 55, 'tb'],
    ['Yến mạch (khô)', 380, 67, 1, 10, 13, 7, 55, 'tb'],
    ['Ngũ cốc bắp (cornflakes)', 357, 84, 8, 3, 7.5, 0.4, 81, 'tb'],
    ['Bánh kếp (pancake)', 227, 28, 5, 1, 6.4, 10, 67, 'tb'],
    ['Bánh sừng bò', 406, 46, 11, 2.6, 8, 21, 67, 'tb'],
    ['Bánh donut', 420, 50, 22, 1.5, 5, 22, 76, 'tb', 'nc'],
    ['Bánh phô mai (cheesecake)', 321, 25.5, 22, 0.4, 5.5, 22.5, 50, 'tb', 'n'],
    ['Đậu đỏ / đậu đen', 127, 23, 0.3, 7, 8.7, 0.5, 30, 'tb'],
    ['Đậu gà', 164, 27, 4.8, 7.6, 8.9, 2.6, 28, 'tb'],
    ['Bắp hạt', 96, 21, 4.5, 2.4, 3.4, 1.5, 55, 'tb'],
    // Đạm
    ['Thịt bò', 200, 0, 0, 0, 27, 10, 0, 'dam'],
    ['Thịt bò xay', 250, 0, 0, 0, 26, 17, 0, 'dam'],
    ['Bò bít tết', 230, 0, 0, 0, 27, 13, 0, 'dam'],
    ['Thịt heo nạc', 180, 0, 0, 0, 26, 8, 0, 'dam'],
    ['Thịt heo ba chỉ', 450, 0, 0, 0, 14, 43, 0, 'dam'],
    ['Thịt heo xay', 260, 0, 0, 0, 24, 18, 0, 'dam'],
    ['Ức gà', 165, 0, 0, 0, 31, 3.6, 0, 'dam'],
    ['Đùi gà (có da)', 215, 0, 0, 0, 24, 14, 0, 'dam'],
    ['Gà chiên bột', 290, 10, 0, 0.5, 22, 18, 50, 'dam', 'c'],
    ['Thịt vịt', 337, 0, 0, 0, 19, 28, 0, 'dam'],
    ['Thịt cừu', 290, 0, 0, 0, 25, 21, 0, 'dam'],
    ['Xúc xích', 300, 2, 1, 0, 12, 27, 0, 'dam'],
    ['Thịt xông khói', 500, 1, 0, 0, 35, 40, 0, 'dam'],
    ['Giăm bông', 145, 1.5, 1, 0, 21, 5.5, 0, 'dam'],
    ['Chả lụa', 136, 1, 0.5, 0, 21.5, 5.5, 0, 'dam'],
    ['Cá thịt trắng', 105, 0, 0, 0, 23, 1, 0, 'dam'],
    ['Cá hồi', 206, 0, 0, 0, 22, 12, 0, 'dam'],
    ['Cá ngừ', 130, 0, 0, 0, 29, 0.6, 0, 'dam'],
    ['Cá chiên bột', 230, 17, 0.5, 0.8, 15, 12, 55, 'dam', 'c'],
    ['Tôm', 99, 0.2, 0, 0, 24, 0.3, 0, 'dam'],
    ['Mực', 100, 3, 0, 0, 18, 1.4, 0, 'dam'],
    ['Thịt cua / riêu cua', 100, 1, 0, 0, 18, 2.5, 0, 'dam'],
    ['Trứng', 155, 1.1, 1.1, 0, 13, 11, 0, 'dam'],
    ['Đậu hũ', 76, 1.9, 0.5, 0.5, 8, 4.8, 15, 'dam'],
    ['Falafel', 333, 32, 2, 5, 13, 18, 40, 'dam', 'c'],
    ['Hummus', 166, 14, 0.3, 6, 8, 10, 10, 'dam'],
    ['Đậu phộng', 567, 16, 4, 8.5, 26, 49, 14, 'dam'],
    // Sữa – phô mai
    ['Phô mai mozzarella', 290, 2.5, 1, 0, 22, 21, 0, 'sua'],
    ['Phô mai cứng (cheddar, parmesan)', 400, 1.3, 0.5, 0, 25, 33, 0, 'sua'],
    ['Kem béo (cream)', 340, 2.8, 2.8, 0, 2, 36, 0, 'sua'],
    ['Sữa tươi', 62, 4.8, 4.8, 0, 3.2, 3.3, 31, 'sua'],
    ['Nước cốt dừa', 200, 3, 2, 0, 2, 21, 40, 'sua'],
    // Rau – trái
    ['Rau lá xanh', 23, 3.6, 1, 2.2, 2.5, 0.3, 15, 'rau'],
    ['Rau sống / xà lách', 15, 2.9, 1.3, 1.3, 1.4, 0.2, 15, 'rau'],
    ['Giá đỗ', 30, 6, 4, 1.8, 3, 0.2, 15, 'rau'],
    ['Hành tây', 40, 9.3, 4.2, 1.7, 1.1, 0.1, 15, 'rau'],
    ['Cà chua', 18, 3.9, 2.6, 1.2, 0.9, 0.2, 15, 'rau'],
    ['Cà rốt', 41, 9.6, 4.7, 2.8, 0.9, 0.2, 39, 'rau'],
    ['Dưa leo', 15, 3.6, 1.7, 0.5, 0.7, 0.1, 15, 'rau'],
    ['Bông cải xanh', 34, 7, 1.7, 2.6, 2.8, 0.4, 15, 'rau'],
    ['Nấm', 22, 3.3, 2, 1, 3.1, 0.3, 15, 'rau'],
    ['Bắp cải', 25, 5.8, 3.2, 2.5, 1.3, 0.1, 15, 'rau'],
    ['Kim chi', 23, 4, 2, 1.6, 1.1, 0.5, 15, 'rau'],
    ['Ớt chuông', 31, 6, 4.2, 2.1, 1, 0.3, 15, 'rau'],
    ['Bơ (trái)', 160, 8.5, 0.7, 6.7, 2, 14.7, 15, 'rau'],
    ['Dứa (thơm)', 50, 13, 10, 1.4, 0.5, 0.1, 59, 'rau'],
    // Gia vị – nước dùng – sốt
    ['Dầu ăn', 884, 0, 0, 0, 0, 100, 0, 'gv'],
    ['Bơ (butter)', 717, 0.1, 0.1, 0, 0.9, 81, 0, 'gv'],
    ['Sốt mayonnaise', 680, 0.6, 0.6, 0, 1, 75, 0, 'gv'],
    ['Đường', 387, 100, 100, 0, 0, 0, 65, 'gv', 'n'],
    ['Siro / mật', 260, 67, 60, 0, 0, 0, 54, 'gv', 'n'],
    ['Nước mắm pha ngọt', 70, 16, 15, 0, 1.5, 0, 65, 'gv', 'n'],
    ['Nước tương pha ngọt', 110, 24, 20, 0, 4, 0.3, 65, 'gv', 'n'],
    ['Nước tương (xì dầu)', 53, 5, 0.4, 0.8, 8, 0.6, 20, 'gv'],
    ['Nước mắm nguyên chất', 35, 3.6, 3.6, 0, 5, 0, 0, 'gv'],
    ['Tương ớt', 90, 20, 15, 1, 1, 0.5, 60, 'gv', 'n'],
    ['Tương cà (ketchup)', 100, 25, 21, 0.3, 1.2, 0.1, 55, 'gv', 'n'],
    ['Dầu hào', 51, 11, 5, 0.3, 1.4, 0.3, 50, 'gv'],
    ['Mắm tôm pha', 90, 12, 10, 0, 8, 1, 60, 'gv', 'n'],
    ['Sốt mè rang', 420, 14, 11, 1, 3, 39, 40, 'gv'],
    ['Muối tiêu chanh', 20, 4, 1, 0.5, 0.3, 0.2, 0, 'gv'],
    ['Sốt ngọt (teriyaki, BBQ, tương đen, ketchup)', 130, 28, 23, 0.5, 2, 0.5, 65, 'gv', 'n'],
    ['Sốt cà chua', 50, 8, 5.5, 1.8, 1.4, 1.5, 45, 'gv'],
    ['Sốt cà ri Ấn', 120, 8, 4, 1.5, 2, 9, 40, 'gv'],
    ['Sốt cà ri Nhật', 100, 12, 3, 1, 1.5, 5, 60, 'gv'],
    ['Nước dùng', 15, 0.6, 0.3, 0, 1.2, 0.9, 0, 'gv'],
    ['Nước dùng ramen (béo)', 40, 1.5, 0.5, 0, 2, 3, 0, 'gv'],
  ];
  const ING = {};
  for (const r of I) ING[r[0]] = { name: r[0], k: r[1], c: r[2], s: r[3], f: r[4], pr: r[5], fa: r[6], gi: r[7], grp: r[8], flags: r[9] || '' };
  const GRP = { tb: 'Tinh bột', dam: 'Đạm', sua: 'Sữa – phô mai', rau: 'Rau – trái', gv: 'Gia vị – nước dùng – sốt' };

  /* Tính dinh dưỡng một món từ danh sách nguyên liệu [{n, g}] */
  function compose(parts) {
    const t = { k: 0, c: 0, s: 0, f: 0, pr: 0, fa: 0 };
    let giW = 0, net = 0, sA = 0, fried = 0, oil = 0, veg = 0;
    const out = [];
    for (const p of parts) {
      const ing = ING[p.n]; if (!ing) continue;
      const g = Math.max(0, +p.g || 0), x = g / 100;
      t.k += ing.k * x; t.c += ing.c * x; t.s += ing.s * x; t.f += ing.f * x; t.pr += ing.pr * x; t.fa += ing.fa * x;
      const n = Math.max(0, ing.c - ing.f) * x; giW += ing.gi * n; net += n;
      if (ing.flags.includes('n')) sA += ing.s * x;
      if (ing.flags.includes('c')) fried += g;
      if (p.n === 'Dầu ăn' || p.n === 'Bơ (butter)') oil += g;
      if (ing.grp === 'rau') veg += g;
      out.push({ n: p.n, g, c: Math.round(ing.c * x * 10) / 10, grp: ing.grp, fl: ing.flags });
    }
    const r = v => Math.round(v * 10) / 10;
    let flags = '';
    if (sA >= 8) flags += 'n';
    if (fried >= 40 || oil >= 15) flags += 'c';
    return { k: Math.round(t.k), c: r(t.c), s: r(t.s), f: r(t.f), pr: r(t.pr), fa: r(t.fa), gi: net > 0.5 ? Math.round(giW / net) : 0, sA: r(sA), veg: Math.round(veg), flags, parts: out };
  }

  const P = s => s.split(';').map(x => { const i = x.lastIndexOf(' '); return { n: x.slice(0, i).trim(), g: +x.slice(i + 1) }; });
  // tên | khẩu phần | nhóm | nguyên liệu "tên gam;..." | gợi ý chung (tuỳ chọn)
  const RC = [
    // ---- Việt Nam ----
    ['Phở bò', '1 tô', 'mon', 'Bánh phở 200;Thịt bò 70;Nước dùng 400;Giá đỗ 30;Rau sống / xà lách 15;Hành tây 10'],
    ['Phở gà', '1 tô', 'mon', 'Bánh phở 200;Ức gà 80;Nước dùng 400;Giá đỗ 30;Rau sống / xà lách 15'],
    ['Phở xào bò', '1 dĩa', 'mon', 'Bánh phở 230;Thịt bò 70;Rau lá xanh 60;Dầu ăn 15'],
    ['Bún bò Huế', '1 tô', 'mon', 'Bún 250;Thịt bò 50;Chả lụa 30;Thịt heo nạc 30;Nước dùng 400;Rau sống / xà lách 30'],
    ['Bún chả', '1 suất', 'mon', 'Bún 250;Thịt heo xay 60;Thịt heo ba chỉ 40;Nước mắm pha ngọt 60;Rau sống / xà lách 50'],
    ['Bún riêu', '1 tô', 'mon', 'Bún 230;Thịt cua / riêu cua 60;Đậu hũ 40;Cà chua 50;Nước dùng 400;Rau sống / xà lách 30'],
    ['Bún thịt nướng', '1 tô', 'mon', 'Bún 230;Thịt heo nạc 80;Đậu phộng 10;Nước mắm pha ngọt 40;Rau sống / xà lách 50;Dầu ăn 5'],
    ['Bún đậu mắm tôm', '1 suất', 'mon', 'Bún 200;Đậu hũ 120;Thịt heo ba chỉ 50;Chả lụa 30;Dầu ăn 15;Rau sống / xà lách 40'],
    ['Hủ tiếu', '1 tô', 'mon', 'Hủ tiếu / mì gạo 220;Thịt heo nạc 50;Tôm 30;Nước dùng 400;Giá đỗ 30'],
    ['Mì Quảng', '1 tô', 'mon', 'Hủ tiếu / mì gạo 230;Tôm 40;Thịt heo nạc 50;Đậu phộng 10;Nước dùng 150;Rau sống / xà lách 40;Dầu ăn 5'],
    ['Miến gà', '1 tô', 'mon', 'Miến 200;Ức gà 70;Nước dùng 400;Rau lá xanh 10'],
    ['Bò kho bánh mì', '1 suất', 'mon', 'Bánh mì trắng 80;Thịt bò 100;Cà rốt 50;Nước dùng 250;Dầu ăn 5'],
    ['Cơm tấm sườn', '1 dĩa', 'mon', 'Cơm trắng 280;Thịt heo nạc 90;Sốt ngọt (teriyaki, BBQ, tương đen, ketchup) 10;Dầu ăn 8;Dưa leo 30;Nước mắm pha ngọt 20'],
    ['Cơm gà', '1 dĩa', 'mon', 'Cơm trắng 280;Đùi gà (có da) 100;Dầu ăn 5;Dưa leo 30'],
    ['Cơm chiên', '1 dĩa', 'mon', 'Cơm trắng 280;Trứng 50;Chả lụa 30;Cà rốt 20;Dầu ăn 15'],
    ['Cơm văn phòng (thịt + rau)', '1 phần', 'mon', 'Cơm trắng 300;Thịt heo nạc 80;Rau lá xanh 80;Dầu ăn 10'],
    ['Bánh mì thịt', '1 ổ', 'mon', 'Bánh mì trắng 90;Chả lụa 30;Thịt heo nạc 30;Bơ (butter) 8;Dưa leo 20;Rau sống / xà lách 10'],
    ['Bánh mì trứng', '1 ổ', 'mon', 'Bánh mì trắng 90;Trứng 100;Dầu ăn 8;Dưa leo 20'],
    ['Bánh cuốn', '1 dĩa', 'mon', 'Bánh phở 200;Thịt heo xay 40;Nấm 10;Chả lụa 30;Nước mắm pha ngọt 30;Dầu ăn 5'],
    ['Bánh xèo', '1 cái', 'mon', 'Bột mì / bột áo 40;Tôm 30;Thịt heo ba chỉ 20;Giá đỗ 50;Dầu ăn 12;Rau sống / xà lách 50'],
    ['Gỏi cuốn', '2 cuốn', 'mon', 'Bánh tráng 20;Bún 40;Tôm 30;Thịt heo nạc 20;Rau sống / xà lách 20'],
    ['Xôi mặn', '1 gói', 'mon', 'Xôi nếp 150;Chả lụa 30;Trứng 25;Dầu ăn 5'],
    ['Mì gói', '1 gói', 'mon', 'Mì gói (vắt khô) 75;Nước dùng 300'],
    ['Mì xào', '1 dĩa', 'mon', 'Mì trứng 250;Thịt bò 50;Rau lá xanh 60;Dầu ăn 15'],
    // ---- Nhật ----
    ['Sushi', '8 miếng', 'mon', 'Cơm sushi 200;Cá hồi 60;Cá ngừ 40', 'Cơm sushi có trộn đường và giấm nên đường huyết tăng nhanh; chọn thêm sashimi, bớt số miếng cơm.'],
    ['Cơm cuộn California', '8 miếng', 'mon', 'Cơm sushi 180;Thịt cua / riêu cua 40;Bơ (trái) 30;Dưa leo 20;Sốt mayonnaise 8'],
    ['Sashimi', '1 phần', 'dam', 'Cá hồi 100;Cá ngừ 50'],
    ['Ramen (mì Nhật)', '1 tô', 'mon', 'Mì ramen 220;Thịt heo ba chỉ 40;Trứng 50;Nước dùng ramen (béo) 400;Giá đỗ 30'],
    ['Udon', '1 tô', 'mon', 'Mì udon 250;Nước dùng 350;Tôm 30;Bột mì / bột áo 10;Dầu ăn 5;Rau lá xanh 20'],
    ['Soba', '1 phần', 'mon', 'Mì soba 220;Rau lá xanh 30;Trứng 50'],
    ['Tempura', '5 miếng', 'mon', 'Tôm 60;Cà rốt 60;Bột mì / bột áo 40;Dầu ăn 20'],
    ['Cơm cà ri Nhật', '1 dĩa', 'mon', 'Cơm trắng 250;Sốt cà ri Nhật 180;Thịt heo nạc 70;Khoai tây 50;Cà rốt 30'],
    ['Cơm thịt heo chiên xù (tonkatsu)', '1 phần', 'mon', 'Cơm trắng 220;Thịt heo nạc 100;Bột mì / bột áo 25;Dầu ăn 15;Bắp cải 60;Sốt ngọt (teriyaki, BBQ, tương đen, ketchup) 15'],
    ['Cơm bò Nhật (gyudon)', '1 tô', 'mon', 'Cơm trắng 250;Thịt bò 80;Hành tây 40;Sốt ngọt (teriyaki, BBQ, tương đen, ketchup) 20'],
    ['Súp miso', '1 chén', 'rau', 'Đậu hũ 40;Nước dùng 200'],
    // ---- Hàn ----
    ['Bibimbap (cơm trộn Hàn)', '1 tô', 'mon', 'Cơm trắng 250;Thịt bò 50;Trứng 50;Rau lá xanh 60;Giá đỗ 40;Cà rốt 30;Sốt ngọt (teriyaki, BBQ, tương đen, ketchup) 20;Dầu ăn 5'],
    ['Kimbap', '1 cuộn', 'mon', 'Cơm sushi 180;Trứng 30;Cà rốt 20;Giăm bông 20;Rau lá xanh 20;Dầu ăn 4'],
    ['Tteokbokki (bánh gạo cay)', '1 phần', 'mon', 'Bánh gạo Hàn (tteok) 200;Sốt ngọt (teriyaki, BBQ, tương đen, ketchup) 50;Cá thịt trắng 40;Bắp cải 30'],
    ['Canh kim chi + cơm', '1 suất', 'mon', 'Cơm trắng 200;Kim chi 100;Thịt heo ba chỉ 40;Đậu hũ 60;Nước dùng 250'],
    ['Gà rán sốt Hàn', '1 phần', 'mon', 'Gà chiên bột 200;Sốt ngọt (teriyaki, BBQ, tương đen, ketchup) 30'],
    ['Thịt nướng Hàn + cơm', '1 suất', 'mon', 'Thịt heo ba chỉ 120;Cơm trắng 150;Rau sống / xà lách 60;Kim chi 40'],
    ['Mì cay Hàn', '1 tô', 'mon', 'Mì gói (vắt khô) 110;Trứng 50;Kim chi 30;Nước dùng 350'],
    // ---- Thái / Đông Nam Á ----
    ['Pad Thai (hủ tiếu xào Thái)', '1 dĩa', 'mon', 'Hủ tiếu / mì gạo 230;Tôm 50;Trứng 50;Đậu hũ 30;Giá đỗ 40;Đậu phộng 12;Sốt ngọt (teriyaki, BBQ, tương đen, ketchup) 30;Dầu ăn 15'],
    ['Tom yum (canh chua Thái)', '1 tô', 'rau', 'Tôm 80;Nấm 50;Nước dùng 300;Nước cốt dừa 30;Cà chua 30'],
    ['Cà ri xanh Thái + cơm', '1 suất', 'mon', 'Cơm trắng 220;Đùi gà (có da) 80;Nước cốt dừa 100;Ớt chuông 50;Đường 5'],
    ['Cơm gà Hải Nam', '1 dĩa', 'mon', 'Cơm trắng 250;Dầu ăn 8;Đùi gà (có da) 100;Dưa leo 30'],
    ['Nasi goreng (cơm chiên Indonesia)', '1 dĩa', 'mon', 'Cơm trắng 280;Trứng 50;Ức gà 40;Tôm 20;Sốt ngọt (teriyaki, BBQ, tương đen, ketchup) 20;Dầu ăn 15'],
    ['Laksa (bún cà ri)', '1 tô', 'mon', 'Bún 220;Tôm 40;Đậu hũ 40;Nước cốt dừa 120;Nước dùng 250;Giá đỗ 30'],
    // ---- Trung Hoa ----
    ['Há cảo / sủi cảo hấp', '6 cái', 'mon', 'Vỏ há cảo / sủi cảo 60;Thịt heo xay 60;Bắp cải 40'],
    ['Sủi cảo chiên (gyoza)', '6 cái', 'mon', 'Vỏ há cảo / sủi cảo 60;Thịt heo xay 60;Bắp cải 40;Dầu ăn 10'],
    ['Đậu hũ Tứ Xuyên + cơm', '1 suất', 'mon', 'Cơm trắng 220;Đậu hũ 150;Thịt heo xay 40;Dầu ăn 12'],
    ['Thịt heo chua ngọt + cơm', '1 suất', 'mon', 'Cơm trắng 220;Thịt heo nạc 90;Bột mì / bột áo 20;Dầu ăn 15;Sốt ngọt (teriyaki, BBQ, tương đen, ketchup) 50;Dứa (thơm) 30;Ớt chuông 30'],
    ['Cơm vịt quay', '1 dĩa', 'mon', 'Cơm trắng 250;Thịt vịt 90;Rau lá xanh 50'],
    // ---- Âu – Mỹ ----
    ['Spaghetti sốt bò bằm', '1 dĩa', 'mon', 'Mì Ý 220;Thịt bò xay 70;Sốt cà chua 120;Dầu ăn 8;Phô mai cứng (cheddar, parmesan) 8'],
    ['Mì Ý carbonara', '1 dĩa', 'mon', 'Mì Ý 220;Thịt xông khói 30;Trứng 50;Phô mai cứng (cheddar, parmesan) 20;Kem béo (cream) 30'],
    ['Lasagna', '1 miếng', 'mon', 'Mì Ý 90;Thịt bò xay 60;Sốt cà chua 80;Phô mai mozzarella 40;Sữa tươi 50'],
    ['Mì ống phô mai (mac and cheese)', '1 dĩa', 'mon', 'Mì Ý 200;Phô mai cứng (cheddar, parmesan) 50;Sữa tươi 60;Bơ (butter) 10'],
    ['Pizza', '2 miếng', 'mon', 'Đế pizza 130;Phô mai mozzarella 50;Sốt cà chua 40;Xúc xích 20'],
    ['Risotto nấm', '1 dĩa', 'mon', 'Cơm trắng 250;Bơ (butter) 10;Phô mai cứng (cheddar, parmesan) 15;Nấm 50;Nước dùng 100'],
    ['Hamburger', '1 cái', 'mon', 'Bánh burger 70;Thịt bò xay 90;Phô mai cứng (cheddar, parmesan) 15;Rau sống / xà lách 20;Cà chua 20;Sốt mayonnaise 8;Sốt ngọt (teriyaki, BBQ, tương đen, ketchup) 10'],
    ['Hot dog', '1 cái', 'mon', 'Bánh burger 55;Xúc xích 55;Sốt ngọt (teriyaki, BBQ, tương đen, ketchup) 10'],
    ['Sandwich giăm bông phô mai', '1 cái', 'mon', 'Bánh mì trắng 70;Giăm bông 40;Phô mai cứng (cheddar, parmesan) 15;Rau sống / xà lách 20;Sốt mayonnaise 8'],
    ['Bít tết + khoai tây chiên', '1 suất', 'mon', 'Bò bít tết 180;Khoai tây chiên 100;Rau lá xanh 60;Bơ (butter) 8'],
    ['Cá chiên + khoai tây chiên (fish and chips)', '1 suất', 'mon', 'Cá chiên bột 180;Khoai tây chiên 150'],
    ['Gà nướng + khoai + rau', '1 suất', 'mon', 'Đùi gà (có da) 150;Khoai tây 100;Bông cải xanh 80;Dầu ăn 5'],
    ['Cá hồi áp chảo + rau', '1 suất', 'mon', 'Cá hồi 150;Bông cải xanh 100;Khoai tây 80;Dầu ăn 5'],
    ['Salad Caesar gà', '1 dĩa', 'mon', 'Rau sống / xà lách 120;Ức gà 80;Bánh mì trắng 20;Phô mai cứng (cheddar, parmesan) 10;Sốt mayonnaise 20'],
    ['Salad Hy Lạp', '1 dĩa', 'rau', 'Cà chua 100;Dưa leo 80;Phô mai mozzarella 40;Hành tây 20;Dầu ăn 10'],
    ['Poke bowl (cơm cá sống)', '1 tô', 'mon', 'Cơm sushi 200;Cá hồi 80;Bơ (trái) 40;Dưa leo 40;Sốt ngọt (teriyaki, BBQ, tương đen, ketchup) 10'],
    ['Trứng ốp + bánh mì + thịt xông khói', '1 suất', 'mon', 'Bánh mì trắng 60;Trứng 100;Thịt xông khói 20;Bơ (butter) 8'],
    ['Trứng tráng (omelette)', '1 phần', 'dam', 'Trứng 110;Bơ (butter) 8;Phô mai mozzarella 20'],
    ['Pancake siro', '3 cái', 'vat', 'Bánh kếp (pancake) 150;Siro / mật 30;Bơ (butter) 8'],
    ['Bánh sừng bò', '1 cái', 'tb', 'Bánh sừng bò 60'],
    ['Ngũ cốc + sữa', '1 tô', 'tb', 'Ngũ cốc bắp (cornflakes) 40;Sữa tươi 200', 'Ngũ cốc bắp hấp thu rất nhanh; đổi sang yến mạch nấu sữa không đường.'],
    ['Yến mạch nấu sữa', '1 tô', 'tb', 'Yến mạch (khô) 40;Sữa tươi 200'],
    ['Bánh donut', '1 cái', 'vat', 'Bánh donut 60', 'Đổi sang trái cây ít ngọt hoặc một nắm hạt.'],
    ['Bánh phô mai (cheesecake)', '1 miếng', 'vat', 'Bánh phô mai (cheesecake) 100', 'Chia đôi miếng bánh, ăn sau bữa có rau và đạm.'],
    // ---- Mexico – Ấn – Trung Đông – Tây Ban Nha ----
    ['Taco', '2 cái', 'mon', 'Bánh tortilla 60;Thịt bò xay 70;Rau sống / xà lách 30;Cà chua 30;Phô mai cứng (cheddar, parmesan) 15'],
    ['Burrito', '1 cuộn', 'mon', 'Bánh tortilla 70;Cơm trắng 100;Đậu đỏ / đậu đen 60;Thịt bò xay 70;Phô mai cứng (cheddar, parmesan) 20;Cà chua 30'],
    ['Cà ri gà Ấn + bánh naan', '1 suất', 'mon', 'Bánh naan 90;Đùi gà (có da) 100;Sốt cà ri Ấn 150'],
    ['Cà ri gà Ấn + cơm', '1 suất', 'mon', 'Cơm basmati 220;Đùi gà (có da) 100;Sốt cà ri Ấn 150'],
    ['Biryani (cơm gà Ấn)', '1 dĩa', 'mon', 'Cơm basmati 280;Đùi gà (có da) 90;Dầu ăn 12;Hành tây 30'],
    ['Kebab / shawarma cuộn', '1 cuộn', 'mon', 'Bánh pita 80;Thịt cừu 80;Rau sống / xà lách 40;Cà chua 30;Sốt mayonnaise 15'],
    ['Falafel kẹp pita', '1 cái', 'mon', 'Bánh pita 80;Falafel 80;Hummus 40;Rau sống / xà lách 40'],
    ['Hummus + bánh pita', '1 phần', 'vat', 'Bánh pita 60;Hummus 80'],
    ['Paella (cơm hải sản Tây Ban Nha)', '1 dĩa', 'mon', 'Cơm trắng 280;Tôm 50;Mực 40;Ức gà 40;Dầu ăn 12;Ớt chuông 30'],
  ];

  const flat = {};
  for (const f of DB.FOODS) flat[f.name] = f;
  const recipes = RC.map(r => {
    const v = compose(P(r[3]));
    const old = flat[r[0]];
    return Object.assign({ name: r[0], portion: r[1], cat: r[2], swap: r[4] || (old && old.swap) || '' }, v);
  });
  const names = new Set(recipes.map(r => r.name));
  DB.FOODS = recipes.concat(DB.FOODS.filter(f => !names.has(f.name)));
  DB.ING = ING; DB.GRP = GRP; DB.compose = compose;
  if (typeof module !== 'undefined' && module.exports) module.exports = DB;
})(typeof self !== 'undefined' ? self : this);
