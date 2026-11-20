// Browser-based background removal & subject cutout engine (Canvas 2D, zero paid APIs).
// Multi-cluster perimeter segmentation + soft shadow suppression + color-spill defringe + edge feathering.

export interface CutoutOptions {
  sensitivity?: number; // 10..60 (default 28)
  featherRadius?: number; // 0..3 (default 1)
  edgeChoke?: number; // -2..2 (default 0, positive tightens edge)
  defringeStrength?: number; // 0..1 (default 0.65)
}

export interface CutoutResult {
  canvas: HTMLCanvasElement;
  cutoutApplied: boolean;
  alreadyTransparent: boolean;
  complexBackground?: boolean;
  coverageRatio: number;
  notice?: string;
}

const cutoutCache = new Map<string, CutoutResult>();
const MAX_CACHE_ENTRIES = 36;

function colorDistanceSq(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  // Redmean perceptual RGB distance approximation
  const rMean = (r1 + r2) * 0.5;
  const wr = 2 + rMean / 256;
  const wg = 4;
  const wb = 2 + (255 - rMean) / 256;
  return (wr * dr * dr + wg * dg * dg + wb * db * db) / 8;
}

function chromaDistanceSq(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  // Luminance-normalized chromaticity distance (helps suppress neutral shadows on light backgrounds)
  const l1 = Math.max(1, 0.299 * r1 + 0.587 * g1 + 0.114 * b1);
  const l2 = Math.max(1, 0.299 * r2 + 0.587 * g2 + 0.114 * b2);
  const dr = (r1 / l1 - r2 / l2) * 180;
  const dg = (g1 / l1 - g2 / l2) * 180;
  const db = (b1 / l1 - b2 / l2) * 180;
  return dr * dr + dg * dg + db * db;
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
  const featherRadius = Math.min(3, Math.max(0, Math.round(options?.featherRadius ?? 1)));
  const defringeStrength = Math.min(1, Math.max(0, options?.defringeStrength ?? 0.65));
  const cacheKey = `${sourceKey}|s=${sensitivity}|f=${featherRadius}|d=${defringeStrength.toFixed(2)}`;
  const cached = cutoutCache.get(cacheKey);
  if (cached) return cached;

  const natW = Math.max(1, image.naturalWidth || image.width || 1);
  const natH = Math.max(1, image.naturalHeight || image.height || 1);
  const maxEdge = 768;
  const scale = Math.min(1, maxEdge / Math.max(natW, natH));
  const w = Math.max(8, Math.round(natW * scale));
  const h = Math.max(8, Math.round(natH * scale));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = w;
  workCanvas.height = h;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      canvas: workCanvas,
      cutoutApplied: false,
      alreadyTransparent: false,
      coverageRatio: 1,
      notice: 'Trình duyệt không hỗ trợ tách nền Canvas.',
    };
  }

  ctx.drawImage(image, 0, 0, w, h);
  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch {
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
    const ready: CutoutResult = {
      canvas: workCanvas,
      cutoutApplied: true,
      alreadyTransparent: true,
      coverageRatio: 1 - transparentCount / totalPixels,
    };
    cacheResult(cacheKey, ready);
    return ready;
  }

  // 2. Sample perimeter strips (corners + borders) to build up to 12 background color clusters
  const sampleCoords: Array<[number, number]> = [];
  const stepX = Math.max(1, Math.floor(w / 14));
  const stepY = Math.max(1, Math.floor(h / 14));
  for (let x = 0; x < w; x += stepX) {
    sampleCoords.push([x, 0], [x, h - 1]);
  }
  for (let y = 0; y < h; y += stepY) {
    sampleCoords.push([0, y], [w - 1, y]);
  }

  const bgSeeds: Array<[number, number, number]> = [];
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (const [sx, sy] of sampleCoords) {
    const off = (sy * w + sx) * 4;
    const r = data[off];
    const g = data[off + 1];
    const b = data[off + 2];
    sumR += r;
    sumG += g;
    sumB += b;
    const duplicate = bgSeeds.some(([sr, sg, sb]) => colorDistanceSq(r, g, b, sr, sg, sb) < 16 * 16);
    if (!duplicate && bgSeeds.length < 12) {
      bgSeeds.push([r, g, b]);
    }
  }
  const avgBgR = sampleCoords.length ? sumR / sampleCoords.length : data[0];
  const avgBgG = sampleCoords.length ? sumG / sampleCoords.length : data[1];
  const avgBgB = sampleCoords.length ? sumB / sampleCoords.length : data[2];

  if (bgSeeds.length === 0) {
    bgSeeds.push([data[0], data[1], data[2]]);
  }

  const hardThresholdSq = sensitivity * sensitivity;
  const softThresholdSq = (sensitivity * 1.55) * (sensitivity * 1.55);
  const shadowChromaTolSq = (sensitivity * 0.55) * (sensitivity * 0.55);

  const minBgDistSq = (pixelIndex: number): number => {
    const off = pixelIndex * 4;
    const r = data[off];
    const g = data[off + 1];
    const b = data[off + 2];
    let best = Infinity;
    for (let s = 0; s < bgSeeds.length; s++) {
      const [sr, sg, sb] = bgSeeds[s];
      const d = colorDistanceSq(r, g, b, sr, sg, sb);
      if (d < best) best = d;
    }
    return best;
  };

  const isBgLike = (pixelIndex: number, tolSq: number): boolean => {
    if (minBgDistSq(pixelIndex) <= tolSq) return true;
    // Soft shadow suppression: if pixel has nearly identical chromaticity to a bright background
    // and is moderately darker (typical cast shadow under product), treat as background
    const off = pixelIndex * 4;
    const r = data[off];
    const g = data[off + 1];
    const b = data[off + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const bgLum = 0.299 * avgBgR + 0.587 * avgBgG + 0.114 * avgBgB;
    if (bgLum > 165 && lum > bgLum * 0.58 && lum < bgLum) {
      if (chromaDistanceSq(r, g, b, avgBgR, avgBgG, avgBgB) <= shadowChromaTolSq) {
        return true;
      }
    }
    return false;
  };

  // 3. Border-connected flood fill (protects enclosed highlights, logos & text inside the product)
  const visited = new Uint8Array(totalPixels);
  const bgMask = new Uint8Array(totalPixels);
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
    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx + 1 < w ? curr + 1 : -1,
      cy > 0 ? curr - w : -1,
      cy + 1 < h ? curr + w : -1,
    ];
    for (let k = 0; k < 4; k++) {
      const n = neighbors[k];
      if (n < 0 || visited[n]) continue;
      visited[n] = 1;
      if (isBgLike(n, hardThresholdSq)) {
        bgMask[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  // 4. Safety check: ensure we didn't wipe out the product or fail to segment anything
  let bgPixels = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (bgMask[i]) bgPixels++;
  }
  const fgRatio = 1 - bgPixels / totalPixels;

  const isComplexBg = bgSeeds.length >= 8;
  if (fgRatio < 0.06 || fgRatio > 0.96) {
    const notice = fgRatio < 0.06
      ? 'Ảnh nền và chủ thể gần tương đồng; giảm độ nhạy hoặc giữ ảnh gốc để bảo toàn sản phẩm.'
      : 'Ảnh có hậu cảnh phức tạp hoặc không đồng nhất; hệ thống tự giữ nguyên ảnh gốc nhằm bảo toàn chi tiết sản phẩm.';
    const untouched: CutoutResult = {
      canvas: workCanvas,
      cutoutApplied: false,
      alreadyTransparent: false,
      complexBackground: true,
      coverageRatio: 1,
      notice,
    };
    cacheResult(cacheKey, untouched);
    return untouched;
  }

  // 5. Continuous alpha matte + color spill / defringe on boundary pixels
  const alphaMap = new Uint8ClampedArray(totalPixels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (bgMask[idx]) {
        alphaMap[idx] = 0;
        continue;
      }
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
      if (bgNeighbors > 0) {
        const distSq = minBgDistSq(idx);
        if (distSq <= softThresholdSq) {
          const t = Math.max(0, Math.min(1, (Math.sqrt(distSq) - sensitivity * 0.85) / (sensitivity * 0.7)));
          alphaMap[idx] = Math.round(t * 235);
        } else {
          alphaMap[idx] = bgNeighbors >= 5 ? 185 : 235;
        }
      } else {
        alphaMap[idx] = 255;
      }
    }
  }

  // Optional 1-pass box feather on boundary alpha for smooth anti-aliased edges
  const finalAlpha = featherRadius > 0 ? new Uint8ClampedArray(alphaMap) : alphaMap;
  if (featherRadius > 0) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const a = alphaMap[idx];
        if (a > 0 && a < 255) {
          const sum =
            alphaMap[idx - w - 1] + alphaMap[idx - w] + alphaMap[idx - w + 1] +
            alphaMap[idx - 1] + a * 2 + alphaMap[idx + 1] +
            alphaMap[idx + w - 1] + alphaMap[idx + w] + alphaMap[idx + w + 1];
          finalAlpha[idx] = Math.round(sum / 10);
        }
      }
    }
  }

  // Apply alpha + color spill suppression (defringe) on semi-transparent edge pixels
  for (let i = 0; i < totalPixels; i++) {
    const a = finalAlpha[i];
    const off = i * 4;
    if (a > 0 && a < 240 && defringeStrength > 0) {
      const alphaNorm = Math.max(0.18, a / 255);
      const blend = (1 - alphaNorm) * defringeStrength;
      data[off] = Math.max(0, Math.min(255, Math.round((data[off] - avgBgR * blend) / (1 - blend + 0.001))));
      data[off + 1] = Math.max(0, Math.min(255, Math.round((data[off + 1] - avgBgG * blend) / (1 - blend + 0.001))));
      data[off + 2] = Math.max(0, Math.min(255, Math.round((data[off + 2] - avgBgB * blend) / (1 - blend + 0.001))));
    }
    data[off + 3] = Math.min(data[off + 3], a);
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

  const complexNotice = isComplexBg
    ? 'Hậu cảnh ảnh có nhiều vùng màu khác nhau. Hãy kiểm tra xem trước và điều chỉnh độ nhạy nếu cần.'
    : undefined;

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
        complexBackground: isComplexBg,
        coverageRatio: fgRatio,
        ...(complexNotice ? { notice: complexNotice } : {}),
      };
      cacheResult(cacheKey, res);
      return res;
    }
  }

  const res: CutoutResult = {
    canvas: workCanvas,
    cutoutApplied: true,
    alreadyTransparent: false,
    complexBackground: isComplexBg,
    coverageRatio: fgRatio,
    ...(complexNotice ? { notice: complexNotice } : {}),
  };
  cacheResult(cacheKey, res);
  return res;
}
