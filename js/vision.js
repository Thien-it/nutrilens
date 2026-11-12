/* Nhận diện món ăn từ ảnh — chạy hoàn toàn trên máy (MediaPipe WASM + mô hình TFLite ~2.000 món).
   Mô hình giỏi với MÓN ĐƠN (phở, pizza, sushi…); đĩa nhiều món thì độ tin cậy thấp → dùng khoanh vùng + phần tự học. */
(function (root) {
  // nhãn của mô hình (tiếng Anh) → tên món trong FoodDB. Khớp nguyên văn trước, rồi tới luật theo từ khóa.
  const EXACT = {
    'pho': 'Phở bò', 'beef noodle soup': 'Phở bò', 'bún bò huế': 'Bún bò Huế', 'bún riêu': 'Bún riêu', 'bún ốc': 'Bún riêu', 'cơm tấm': 'Cơm tấm sườn',
    'bánh cuốn': 'Bánh cuốn', 'bánh xèo': 'Bánh xèo', 'bánh chưng': 'Bánh chưng', 'bánh bao': 'Bánh bao nhân thịt', 'cha siu bao': 'Bánh bao nhân thịt',
    'gỏi cuốn': 'Gỏi cuốn', 'chả giò': 'Chả giò', 'chả lụa': 'Chả lụa', 'xôi': 'Xôi', 'mango sticky rice': 'Xôi', 'chè': 'Chè', 'bánh canh': 'Hủ tiếu', 'boat noodles': 'Hủ tiếu', 'wonton noodles': 'Hủ tiếu',
    'white rice': 'Cơm trắng', 'hainanese chicken rice': 'Cơm gà Hải Nam', 'claypot chicken rice': 'Cơm gà', 'duck rice': 'Cơm vịt quay', 'peking duck': 'Vịt quay',
    'bento': 'Cơm văn phòng (thịt + rau)', 'beef chow fun': 'Phở xào bò', 'udon': 'Udon', 'yaki udon': 'Mì xào', 'okinawa soba': 'Soba', 'gimbap': 'Kimbap', 'tempura': 'Tempura', 'fried shrimp': 'Tempura',
    'tonkatsu': 'Cơm thịt heo chiên xù (tonkatsu)', 'katsudon': 'Cơm thịt heo chiên xù (tonkatsu)', 'japanese curry': 'Cơm cà ri Nhật', 'hayashi rice': 'Cơm cà ri Nhật', 'omurice': 'Cơm chiên', 'miso soup': 'Súp miso',
    'kimchi-jjigae': 'Canh kim chi + cơm', 'tteok': 'Tteokbokki (bánh gạo cay)', 'green curry': 'Cà ri xanh Thái + cơm', 'red curry': 'Cà ri xanh Thái + cơm', 'massaman curry': 'Cà ri xanh Thái + cơm', 'phanaeng curry': 'Cà ri xanh Thái + cơm',
    'dim sum': 'Há cảo / sủi cảo hấp', 'sweet and sour pork': 'Thịt heo chua ngọt + cơm', 'carbonara': 'Mì Ý carbonara', 'macaroni and cheese': 'Mì ống phô mai (mac and cheese)',
    'steak sandwich': 'Bánh mì thịt', 'submarine sandwich': 'Bánh mì thịt', 'cheesesteak': 'Bánh mì thịt', 'roast beef sandwich': 'Bánh mì thịt', 'italian beef': 'Bánh mì thịt', 'pork roll': 'Bánh mì thịt',
    'greek salad': 'Salad Hy Lạp', 'eggs benedict': 'Trứng ốp + bánh mì + thịt xông khói', 'breakfast sandwich': 'Trứng ốp + bánh mì + thịt xông khói', 'tandoori chicken': 'Gà nướng + khoai + rau',
    'shawarma': 'Kebab / shawarma cuộn', 'french toast': 'Pancake siro', 'frozen yogurt': 'Sữa chua có đường', 'sausage': 'Xúc xích', 'fried fish': 'Cá chiên', 'french fries': 'Khoai tây chiên', 'croissant': 'Bánh sừng bò',
  };
  const RULES = [
    [/pizza/, 'Pizza'], [/burger/, 'Hamburger'], [/hot dog|corn dog/, 'Hot dog'], [/sandwich/, 'Sandwich giăm bông phô mai'],
    [/fried rice|nasi goreng/, 'Cơm chiên'], [/sushi|maki|nigiri/, 'Sushi'], [/sashimi/, 'Sashimi'], [/ramen/, 'Ramen (mì Nhật)'], [/\bpho\b/, 'Phở bò'],
    [/pad thai/, 'Pad Thai (hủ tiếu xào Thái)'], [/tom yum/, 'Tom yum (canh chua Thái)'], [/laksa/, 'Laksa (bún cà ri)'], [/bibimbap/, 'Bibimbap (cơm trộn Hàn)'], [/tteokbokki/, 'Tteokbokki (bánh gạo cay)'],
    [/chow mein|lo mein|yakisoba|fried noodles|drunken noodles|chinese noodles|hot dry noodles/, 'Mì xào'], [/noodle soup|noodles/, 'Hủ tiếu'],
    [/dumpling|gyoza|jiaozi|wonton|momo/, 'Há cảo / sủi cảo hấp'], [/biryani/, 'Biryani (cơm gà Ấn)'], [/curry|butter chicken|karahi/, 'Cà ri gà Ấn + cơm'],
    [/fried chicken|chicken nugget|chicken fingers|hot chicken|chicken wings/, 'Gà rán'], [/fries|potato chips/, 'Khoai tây chiên'],
    [/spaghetti|pasta|penne|fettuccine|linguine|ravioli/, 'Spaghetti sốt bò bằm'], [/lasagn/, 'Lasagna'], [/risotto/, 'Risotto nấm'], [/paella/, 'Paella (cơm hải sản Tây Ban Nha)'],
    [/taco/, 'Taco'], [/burrito/, 'Burrito'], [/kebab/, 'Kebab / shawarma cuộn'], [/falafel/, 'Falafel kẹp pita'], [/hummus/, 'Hummus + bánh pita'],
    [/steak/, 'Bít tết + khoai tây chiên'], [/omelet/, 'Trứng tráng (omelette)'], [/congee|porridge/, 'Cháo thịt bằm'], [/salad/, 'Salad rau trộn'],
    [/doughnut|donut/, 'Bánh donut'], [/cheesecake/, 'Bánh phô mai (cheesecake)'], [/pancake|waffle|crêpe|crepe/, 'Pancake siro'], [/ice cream|gelato|sundae/, 'Kem'],
    [/cookie|biscuit/, 'Bánh quy'], [/flan|custard|pudding/, 'Bánh flan'], [/cake|brownie|\bpie\b|tart|muffin|strudel/, 'Bánh ngọt / bông lan'],
  ];
  function foodFor(label) {
    const l = String(label || '').toLowerCase().trim();
    if (EXACT[l]) return EXACT[l];
    for (const [re, name] of RULES) if (re.test(l)) return name;
    return null;
  }

  let clf = null, labels = null, loading = null;
  function load() {
    if (clf) return Promise.resolve();
    return loading || (loading = (async () => {
      const base = new URL('vendor/', location.href).href;
      const [V, lab] = await Promise.all([import(base + 'vision/vision_bundle.mjs'), fetch(base + 'model/labels.json').then(r => r.json())]);
      const fileset = { wasmLoaderPath: base + 'vision/wasm/vision_wasm_internal.js', wasmBinaryPath: base + 'vision/wasm/vision_wasm_internal.wasm' };
      clf = await V.ImageClassifier.createFromOptions(fileset, { baseOptions: { modelAssetPath: base + 'model/food_v1.tflite', delegate: 'CPU' }, maxResults: -1, runningMode: 'IMAGE' });
      labels = lab;
    })().catch(e => { loading = null; throw e; }));
  }
  function toCanvas(src, frac) {
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, k = Math.min(1, 640 / Math.max(w, h));
    const cw = w * frac, ch = h * frac, c = document.createElement('canvas');
    c.width = Math.max(32, Math.round(cw * k)); c.height = Math.max(32, Math.round(ch * k));
    c.getContext('2d').drawImage(src, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, c.width, c.height);
    return c;
  }
  const run = c => clf.classify(c).classifications[0].categories.filter(x => x.index > 0); // 0 = nền, không phải món
  async function classify(src) {
    await load();
    const whole = run(toCanvas(src, 1)).sort((a, b) => b.score - a.score);
    const score = new Map(whole.map(c => [c.index, c.score]));
    if (whole[0] && whole[0].score < 0.5) for (const c of run(toCanvas(src, 0.7))) if (c.score > (score.get(c.index) || 0)) score.set(c.index, c.score); // món nằm giữa ảnh
    const top = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).filter(e => e[1] >= 0.04).map(([idx, s]) => ({ idx, label: labels[idx], score: Math.round(s * 100) / 100 }));
    // "dấu vân tay" của ảnh = 64 điểm số cao nhất trên toàn ảnh; dùng để so với các bữa đã ghi
    const vec = whole.slice(0, 64).filter(c => c.score > 0).map(c => [c.index, Math.round(c.score * 1000) / 1000]);
    return { top, vec };
  }
  // Dấu vân tay của một vùng ảnh (64 điểm số cao nhất của mô hình món ăn) — dùng cho phần "dạy AI"
  async function fingerprint(src) { await load(); return run(toCanvas(src, 1)).sort((a, b) => b.score - a.score).slice(0, 64).filter(c => c.score > 0).map(c => [c.index, Math.round(c.score * 1000) / 1000]); }
  function cosine(a, b) {
    if (!a || !b || !a.length || !b.length) return 0;
    const m = new Map(a); let dot = 0, na = 0, nb = 0;
    for (const [, s] of a) na += s * s;
    for (const [i, s] of b) { nb += s * s; const x = m.get(i); if (x) dot += x * s; }
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }
  root.Vision = { load, classify, fingerprint, cosine, foodFor, labelName: i => labels && labels[i] };
})(typeof self !== 'undefined' ? self : this);
