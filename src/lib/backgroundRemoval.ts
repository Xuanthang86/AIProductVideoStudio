// Browser-based background removal & subject cutout engine (Canvas 2D, zero paid APIs).
// Protects product interior details, logos, text labels, and colors via border flood-fill + soft alpha feathering.

export interface CutoutOptions {
  sensitivity?: number; // 10..60 (default 28)
}

export interface CutoutResult {
  canvas: HTMLCanvasElement;
  cutoutApplied: boolean;
  alreadyTransparent: boolean;
  coverageRatio: number;
  notice?: string;
}

const cutoutCache = new Map<string, CutoutResult>();
const MAX_CACHE_ENTRIES = 36;

function colorDistanceSq(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  // Perceptual RGB weights
  return 0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db;
}

function cacheResult(key: string, value: CutoutResult) {
  if (cutoutCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cutoutCache.keys().next().value;
    if (oldestKey) cutoutCache.delete(oldestKey);
  }
  cutoutCache.set(key, value);
}

export function clearCutoutCache() {
  cutoutCache.clear();
}

export function getProductCutout(
  image: HTMLImageElement,
  sourceKey: string,
  options?: CutoutOptions
): CutoutResult {
  const sensitivity = Math.min(60, Math.max(10, Math.round(options?.sensitivity ?? 28)));
  const cacheKey = `${sourceKey}|s=${sensitivity}`;
  const cached = cutoutCache.get(cacheKey);
  if (cached) return cached;

  const natW = Math.max(1, image.naturalWidth || image.width || 1);
  const natH = Math.max(1, image.naturalHeight || image.height || 1);
  // Process up to 720px max edge for crisp studio edges & fast interactive preview
  const maxEdge = 720;
  const scale = Math.min(1, maxEdge / Math.max(natW, natH));
  const w = Math.max(8, Math.round(natW * scale));
  const h = Math.max(8, Math.round(natH * scale));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = w;
  workCanvas.height = h;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    const fallback: CutoutResult = {
      canvas: workCanvas,
      cutoutApplied: false,
      alreadyTransparent: false,
      coverageRatio: 1,
      notice: 'Trình duyệt không hỗ trợ tách nền Canvas.',
    };
    return fallback;
  }

  ctx.drawImage(image, 0, 0, w, h);
  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch {
    // Tainted CORS canvas guard: draw cleanly without modifying pixels
    const taintedFallback: CutoutResult = {
      canvas: workCanvas,
      cutoutApplied: false,
      alreadyTransparent: false,
      coverageRatio: 1,
      notice: 'Ảnh ngoài miền chưa hỗ trợ tách nền trực tiếp; đang hiển thị ảnh gốc.',
    };
    cacheResult(cacheKey, taintedFallback);
    return taintedFallback;
  }

  const data = imgData.data;
  const totalPixels = w * h;

  // 1. Check if PNG/WebP already has a transparent background
  let transparentCount = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (data[i * 4 + 3] < 230) transparentCount++;
  }
  if (transparentCount / totalPixels > 0.08) {
    const opaqueRatio = 1 - transparentCount / totalPixels;
    const ready: CutoutResult = {
      canvas: workCanvas,
      cutoutApplied: true,
      alreadyTransparent: true,
      coverageRatio: opaqueRatio,
    };
    cacheResult(cacheKey, ready);
    return ready;
  }

  // 2. Sample perimeter strips (4 corners + border midpoints) to build background color seeds
  const sampleCoords: Array<[number, number]> = [];
  const stepX = Math.max(1, Math.floor(w / 10));
  const stepY = Math.max(1, Math.floor(h / 10));
  for (let x = 0; x < w; x += stepX) {
    sampleCoords.push([x, 0], [x, h - 1]);
  }
  for (let y = 0; y < h; y += stepY) {
    sampleCoords.push([0, y], [w - 1, y]);
  }

  const bgSeeds: Array<[number, number, number]> = [];
  for (const [sx, sy] of sampleCoords) {
    const off = (sy * w + sx) * 4;
    const r = data[off];
    const g = data[off + 1];
    const b = data[off + 2];
    const duplicate = bgSeeds.some(([sr, sg, sb]) => colorDistanceSq(r, g, b, sr, sg, sb) < 18 * 18);
    if (!duplicate && bgSeeds.length < 8) {
      bgSeeds.push([r, g, b]);
    }
  }

  // Fallback median corner color
  const cornerIdx = (0 * w + 0) * 4;
  if (bgSeeds.length === 0) {
    bgSeeds.push([data[cornerIdx], data[cornerIdx + 1], data[cornerIdx + 2]]);
  }

  const hardThresholdSq = sensitivity * sensitivity;
  const softThresholdSq = (sensitivity * 1.48) * (sensitivity * 1.48);

  const isBgLike = (pixelIndex: number, tolSq: number) => {
    const off = pixelIndex * 4;
    const r = data[off];
    const g = data[off + 1];
    const b = data[off + 2];
    for (let s = 0; s < bgSeeds.length; s++) {
      const [sr, sg, sb] = bgSeeds[s];
      if (colorDistanceSq(r, g, b, sr, sg, sb) <= tolSq) return true;
    }
    return false;
  };

  // 3. Border-connected flood fill (protects any enclosed highlights/text inside the product)
  const visited = new Uint8Array(totalPixels);
  const bgMask = new Uint8Array(totalPixels); // 1 = confirmed background
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const enqueueIfBg = (x: number, y: number) => {
    const idx = y * w + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    if (isBgLike(idx, hardThresholdSq)) {
      bgMask[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    enqueueIfBg(x, 0);
    enqueueIfBg(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    enqueueIfBg(0, y);
    enqueueIfBg(w - 1, y);
  }

  while (head < tail) {
    const curr = queue[head++];
    const cx = curr % w;
    const cy = (curr - cx) / w;

    // 4-connected neighbors
    if (cx > 0) {
      const n = curr - 1;
      if (!visited[n]) {
        visited[n] = 1;
        if (isBgLike(n, hardThresholdSq)) {
          bgMask[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    if (cx + 1 < w) {
      const n = curr + 1;
      if (!visited[n]) {
        visited[n] = 1;
        if (isBgLike(n, hardThresholdSq)) {
          bgMask[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    if (cy > 0) {
      const n = curr - w;
      if (!visited[n]) {
        visited[n] = 1;
        if (isBgLike(n, hardThresholdSq)) {
          bgMask[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    if (cy + 1 < h) {
      const n = curr + w;
      if (!visited[n]) {
        visited[n] = 1;
        if (isBgLike(n, hardThresholdSq)) {
          bgMask[n] = 1;
          queue[tail++] = n;
        }
      }
    }
  }

  // 4. Safety check: ensure we didn't wipe out the product or fail to segment anything
  let bgPixels = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (bgMask[i]) bgPixels++;
  }
  const fgRatio = 1 - bgPixels / totalPixels;

  if (fgRatio < 0.06 || fgRatio > 0.96) {
    const notice = fgRatio < 0.06
      ? 'Ảnh nền và chủ thể gần tương đồng; giảm mức tách nền hoặc giữ ảnh gốc để bảo toàn sản phẩm.'
      : 'Ảnh có hậu cảnh phức tạp nên giữ nguyên toàn khung hình nhằm bảo toàn chi tiết sản phẩm.';
    const untouched: CutoutResult = {
      canvas: workCanvas,
      cutoutApplied: false,
      alreadyTransparent: false,
      coverageRatio: 1,
      notice,
    };
    cacheResult(cacheKey, untouched);
    return untouched;
  }

  // 5. Soft edge matting on foreground pixels adjacent to removed background
  const alphaMap = new Uint8ClampedArray(totalPixels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (bgMask[idx]) {
        alphaMap[idx] = 0;
        continue;
      }
      // Check if boundary pixel next to bgMask
      let bgNeighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (bgMask[ny * w + nx]) bgNeighbors++;
        }
      }
      if (bgNeighbors > 0 && isBgLike(idx, softThresholdSq)) {
        alphaMap[idx] = bgNeighbors >= 5 ? 64 : 150;
      } else if (bgNeighbors >= 4) {
        alphaMap[idx] = 205;
      } else {
        alphaMap[idx] = 255;
      }
    }
  }

  for (let i = 0; i < totalPixels; i++) {
    const a = alphaMap[i];
    data[i * 4 + 3] = Math.min(data[i * 4 + 3], a);
  }
  ctx.putImageData(imgData, 0, 0);

  // 6. Auto-crop tight bounding box of the cutout product for cleaner scaling & pedestal centering
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX > minX + 4 && maxY > minY + 4) {
    const pad = Math.round(Math.max(w, h) * 0.02);
    const cx0 = Math.max(0, minX - pad);
    const cy0 = Math.max(0, minY - pad);
    const cw = Math.min(w - cx0, maxX - minX + 1 + pad * 2);
    const ch = Math.min(h - cy0, maxY - minY + 1 + pad * 2);
    const cropped = document.createElement('canvas');
    cropped.width = cw;
    cropped.height = ch;
    const cctx = cropped.getContext('2d');
    if (cctx) {
      cctx.drawImage(workCanvas, cx0, cy0, cw, ch, 0, 0, cw, ch);
      const res: CutoutResult = {
        canvas: cropped,
        cutoutApplied: true,
        alreadyTransparent: false,
        coverageRatio: fgRatio,
      };
      cacheResult(cacheKey, res);
      return res;
    }
  }

  const res: CutoutResult = {
    canvas: workCanvas,
    cutoutApplied: true,
    alreadyTransparent: false,
    coverageRatio: fgRatio,
  };
  cacheResult(cacheKey, res);
  return res;
}
