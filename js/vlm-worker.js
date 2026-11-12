/* Phân tích kỹ ảnh món ăn bằng mô hình thị giác–ngôn ngữ Florence-2 (base), chạy trong Web Worker ngay trên máy.
   Mô hình trả về TÊN + KHUNG VỊ TRÍ của từng thứ nó thấy, nên người dùng kiểm tra được nó đang chỉ vào đâu.
   Dùng WebGPU nếu có, không thì WASM/CPU. Không gọi máy chủ nào. */
import { env, AutoProcessor, Florence2ForConditionalGeneration, RawImage } from '../vendor/tfjs/transformers.min.js';

const base = new URL('../vendor/', import.meta.url).href;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('vlm/', base).pathname; // phải là ĐƯỜNG DẪN (không phải URL đầy đủ) thì thư viện mới coi là model cục bộ
env.backends.onnx.wasm.wasmPaths = { mjs: base + 'tfjs/ort-wasm-simd-threaded.asyncify.mjs', wasm: base + 'tfjs/ort-wasm-simd-threaded.asyncify.wasm' };
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;

const ID = 'Florence-2-base-ft';
const DTYPE = { embed_tokens: 'int8', vision_encoder: 'q4', encoder_model: 'q4', decoder_model_merged: 'q4' };
let processor = null, model = null, device = null, loading = null;

function load(force) {
  if (model) return Promise.resolve();
  return loading || (loading = (async () => {
    const progress_callback = p => { if (p.status === 'progress' && p.total) postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); };
    processor = await AutoProcessor.from_pretrained(ID, { progress_callback });
    let want = 'wasm';
    try { if (force !== 'wasm' && navigator.gpu && await navigator.gpu.requestAdapter()) want = 'webgpu'; } catch (e) { /* không có GPU dùng được */ }
    try { model = await Florence2ForConditionalGeneration.from_pretrained(ID, { device: want, dtype: DTYPE, progress_callback }); device = want; }
    catch (e) {
      if (want !== 'webgpu') throw e;
      model = await Florence2ForConditionalGeneration.from_pretrained(ID, { device: 'wasm', dtype: DTYPE, progress_callback }); device = 'wasm';
    }
  })().catch(e => { loading = null; throw e; }));
}

async function run(image, spec, maxTokens) {
  // spec = '<OD>' hoặc '<CAPTION_TO_PHRASE_GROUNDING>danh sách cần tìm'
  const task = spec.match(/^<[A-Z_]+>/)[0];
  const prompts = processor.construct_prompts(spec);
  const inputs = await processor(image, prompts);
  const ids = await model.generate({ ...inputs, max_new_tokens: maxTokens, do_sample: false, num_beams: 1 });
  const text = processor.batch_decode(ids, { skip_special_tokens: false })[0];
  return processor.post_process_generation(text, task, image.size)[task];
}

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'load') { await load(m.device); postMessage({ type: 'ready', id: m.id, device }); }
    else if (m.type === 'run') {
      await load(m.device);
      const results = [];
      for (let i = 0; i < m.jobs.length; i++) {
        postMessage({ type: 'step', id: m.id, i, n: m.jobs.length });
        const image = await RawImage.fromBlob(m.jobs[i].image);
        results.push(await run(image, m.jobs[i].task, m.maxTokens || 160));
      }
      postMessage({ type: 'answer', id: m.id, results, device });
    }
  } catch (err) { postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) }); }
};
