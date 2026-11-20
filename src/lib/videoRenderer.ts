import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { getProductCutout, type CutoutResult } from './backgroundRemoval';
import type { AspectRatio, MusicConfig, SceneBackdropStyle, SceneLightingPreset, SceneStageConfig, VideoScene } from '../types';

export type RenderResolution = '480p' | '720p' | '1080p';

export interface VoiceoverTrack {
  audioBuffer: AudioBuffer;
  startSec: number;
  maxDurationSec?: number;
  volume?: number;
  playbackRate?: number;
}

export function getSceneDurationSec(durationSec?: number): number {
  const n = Number(durationSec);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(30, Math.max(1, n));
}

export interface RenderResult {
  blob: Blob;
  format: 'mp4' | 'webm';
  mimeType: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  durationSec: number;
}

export interface DeviceSafetyReport {
  isMobile: boolean;
  deviceMemoryGb: number | null;
  webCodecsSupported: boolean;
  recommendedResolution: RenderResolution;
  warning: string | null;
}

/**
 * Fix Chromium MediaRecorder WebM duration = Infinity on <video> preview players.
 */
export function applyVideoDurationWorkaround(vid: HTMLVideoElement | null) {
  if (!vid) return;
  if (vid.duration === Infinity) {
    const onSeeked = () => {
      vid.removeEventListener('timeupdate', onSeeked);
      try {
        vid.currentTime = 0;
      } catch {
        // Ignore seek constraint errors on streaming media
      }
    };
    vid.addEventListener('timeupdate', onSeeked);
    try {
      vid.currentTime = 1e10;
    } catch {
      vid.removeEventListener('timeupdate', onSeeked);
    }
  }
}

export function getResolutionDimensions(aspectRatio: AspectRatio, resolution: RenderResolution): { width: number; height: number } {
  const shortSide = resolution === '480p' ? 480 : resolution === '720p' ? 720 : 1080;
  // Ensure even dimensions required by H.264 encoders
  const even = (n: number) => (n % 2 === 0 ? n : n + 1);
  if (aspectRatio === '9:16') {
    return { width: even(shortSide), height: even(Math.round((shortSide * 16) / 9)) };
  }
  if (aspectRatio === '16:9') {
    return { width: even(Math.round((shortSide * 16) / 9)), height: even(shortSide) };
  }
  if (aspectRatio === '4:5') {
    return { width: even(shortSide), height: even(Math.round((shortSide * 5) / 4)) };
  }
  return { width: even(shortSide), height: even(shortSide) };
}

export function checkDeviceRenderSafety(resolution: RenderResolution, durationSec: number): DeviceSafetyReport {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const deviceMemoryGb = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const webCodecsSupported = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

  let warning: string | null = null;
  let recommendedResolution: RenderResolution = resolution;

  if (isMobile && resolution === '1080p') {
    recommendedResolution = '720p';
    warning = 'Trên thiết bị di động, xuất Full HD 1080p có thể tiêu tốn nhiều RAM. Khuyến nghị chọn 480p hoặc 720p để ổn định.';
  } else if (deviceMemoryGb !== null && deviceMemoryGb <= 2 && resolution !== '480p') {
    recommendedResolution = '480p';
    warning = `Thiết bị có bộ nhớ hạn chế (${deviceMemoryGb}GB RAM). Khuyến nghị xuất 480p để tránh gián đoạn.`;
  } else if (durationSec > 60 && resolution === '1080p' && isMobile) {
    recommendedResolution = '720p';
    warning = 'Video dài trên 60 giây ở 1080p trên di động có thể chậm; hãy cân nhắc 720p.';
  }

  return { isMobile, deviceMemoryGb, webCodecsSupported, recommendedResolution, warning };
}

function loadSingleImage(src: string, useAnonymousCors: boolean): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    if (useAnonymousCors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadImageElement(url: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  const isInline = url.startsWith('data:') || url.startsWith('blob:');
  const loaded = await loadSingleImage(url, !isInline);
  if (loaded) return loaded;
  if (!isInline && /^https?:\/\//i.test(url)) {
    const sep = url.includes('?') ? '&' : '?';
    return loadSingleImage(`${url}${sep}_cors=1`, true);
  }
  return null;
}

async function loadVideoElement(url: string): Promise<HTMLVideoElement | null> {
  if (!url) return null;
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    const timeout = window.setTimeout(() => resolve(null), 15000);
    video.onloadeddata = () => {
      window.clearTimeout(timeout);
      resolve(video);
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      resolve(null);
    };
    video.src = url;
    video.load();
  });
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

interface IndustryVisualProfile {
  defaultBackdrop: Exclude<SceneBackdropStyle, 'auto-industry'>;
  bgTop: string;
  bgMid: string;
  bgBottom: string;
  accent: string;
  glow: string;
  pedestalTop: string;
  pedestalSide: string;
  lightMode: boolean;
  solidHex?: string;
}

function normalizeHexColor(raw: unknown, fallback = '#ffffff'): string {
  const str = typeof raw === 'string' ? raw.trim() : '';
  return /^#[0-9a-fA-F]{6}$/.test(str) ? str.toLowerCase() : fallback;
}

function isLightHexColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62;
}

function resolveIndustryProfile(industry: string | undefined, lightingEffect: VideoScene['lightingEffect'], stage?: SceneStageConfig): IndustryVisualProfile {
  const normalized = (industry || '').toLowerCase();
  let autoBackdrop: Exclude<SceneBackdropStyle, 'auto-industry'> = 'luxury-pedestal';
  let base: IndustryVisualProfile = {
    defaultBackdrop: 'luxury-pedestal',
    bgTop: '#0e1b33',
    bgMid: '#18305b',
    bgBottom: '#0b1426',
    accent: '#4a85f6',
    glow: 'rgba(74, 133, 246, 0.28)',
    pedestalTop: 'rgba(255, 255, 255, 0.22)',
    pedestalSide: 'rgba(13, 26, 51, 0.72)',
    lightMode: false,
  };

  if (/mỹ phẩm|skincare|làm đẹp|nước hoa|beauty|cosmetic/.test(normalized)) {
    autoBackdrop = 'botanical-fresh';
    base = {
      defaultBackdrop: 'botanical-fresh',
      bgTop: '#241a29',
      bgMid: '#3a2a3f',
      bgBottom: '#16111c',
      accent: '#f2b880',
      glow: 'rgba(242, 184, 128, 0.26)',
      pedestalTop: 'rgba(255, 243, 232, 0.26)',
      pedestalSide: 'rgba(34, 22, 38, 0.72)',
      lightMode: false,
    };
  } else if (/điện tử|công nghệ|tech|phụ kiện|gadget/.test(normalized)) {
    autoBackdrop = 'tech-grid';
    base = {
      defaultBackdrop: 'tech-grid',
      bgTop: '#070f20',
      bgMid: '#10254a',
      bgBottom: '#060c18',
      accent: '#38bdf8',
      glow: 'rgba(56, 189, 248, 0.28)',
      pedestalTop: 'rgba(125, 211, 252, 0.24)',
      pedestalSide: 'rgba(9, 20, 42, 0.84)',
      lightMode: false,
    };
  } else if (/thực phẩm|đồ uống|food|drink|sức khỏe|organic/.test(normalized)) {
    autoBackdrop = 'warm-lifestyle';
    base = {
      defaultBackdrop: 'warm-lifestyle',
      bgTop: '#1f261e',
      bgMid: '#323f2c',
      bgBottom: '#131912',
      accent: '#84cc16',
      glow: 'rgba(163, 230, 53, 0.22)',
      pedestalTop: 'rgba(245, 250, 230, 0.24)',
      pedestalSide: 'rgba(23, 31, 20, 0.76)',
      lightMode: false,
    };
  } else if (/thời trang|giày|túi|nội thất|fashion|furniture/.test(normalized)) {
    autoBackdrop = 'minimal-studio';
    base = {
      defaultBackdrop: 'minimal-studio',
      bgTop: '#191d26',
      bgMid: '#2a3140',
      bgBottom: '#12151c',
      accent: '#e2c290',
      glow: 'rgba(226, 194, 144, 0.22)',
      pedestalTop: 'rgba(255, 255, 255, 0.2)',
      pedestalSide: 'rgba(24, 28, 36, 0.78)',
      lightMode: false,
    };
  }

  // Override with explicit backdrop style or lighting preset / lightingEffect
  const backdrop = stage?.backdropStyle && stage.backdropStyle !== 'auto-industry' ? stage.backdropStyle : autoBackdrop;
  base.defaultBackdrop = backdrop;

  if (lightingEffect === 'clean') {
    base.bgTop = '#f4f7fc';
    base.bgMid = '#e4ecf8';
    base.bgBottom = '#d5e2f5';
    base.accent = '#2563eb';
    base.glow = 'rgba(37, 99, 235, 0.16)';
    base.pedestalTop = 'rgba(255, 255, 255, 0.92)';
    base.pedestalSide = 'rgba(195, 210, 232, 0.85)';
    base.lightMode = true;
  } else if (lightingEffect === 'warm-gold' || stage?.lightingPreset === 'golden-hour') {
    base.bgTop = '#1f1722';
    base.bgMid = '#382933';
    base.bgBottom = '#130e16';
    base.accent = '#f5c469';
    base.glow = 'rgba(245, 196, 105, 0.28)';
    base.lightMode = false;
  } else if (lightingEffect === 'neon-rim' || stage?.lightingPreset === 'cool-tech') {
    base.bgTop = '#071226';
    base.bgMid = '#0f2854';
    base.bgBottom = '#060c1a';
    base.accent = '#38bdf8';
    base.glow = 'rgba(56, 189, 248, 0.30)';
    base.lightMode = false;
  } else if (stage?.lightingPreset === 'editorial-contrast') {
    base.bgTop = '#0e1118';
    base.bgMid = '#1c2230';
    base.bgBottom = '#07090e';
    base.accent = '#f8fafc';
    base.glow = 'rgba(248, 250, 252, 0.18)';
    base.lightMode = false;
  }

  if (backdrop === 'solid-color') {
    const solidHex = normalizeHexColor(stage?.customBgColor, '#ffffff');
    const lightSolid = isLightHexColor(solidHex);
    base.solidHex = solidHex;
    base.bgTop = solidHex;
    base.bgMid = solidHex;
    base.bgBottom = solidHex;
    base.lightMode = lightSolid;
    base.accent = lightSolid ? '#2563eb' : '#60a5fa';
    base.glow = lightSolid ? 'rgba(37, 99, 235, 0.08)' : 'rgba(96, 165, 250, 0.16)';
    base.pedestalTop = lightSolid ? 'rgba(255, 255, 255, 0.94)' : 'rgba(255, 255, 255, 0.24)';
    base.pedestalSide = lightSolid ? 'rgba(186, 200, 224, 0.85)' : 'rgba(13, 26, 51, 0.72)';
  }

  return base;
}

function drawStudioBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  profile: IndustryVisualProfile,
  lightingPreset: SceneLightingPreset | undefined,
  t: number,
  stageCx: number,
  stageCy: number,
  stageRadius: number,
  drawPedestal: boolean
) {
  if (profile.defaultBackdrop === 'solid-color' && profile.solidHex) {
    ctx.fillStyle = profile.solidHex;
    ctx.fillRect(0, 0, w, h);
  } else {
    // Base studio cyclorama gradient
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, profile.bgTop);
    bg.addColorStop(0.55, profile.bgMid);
    bg.addColorStop(1, profile.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Key studio radial aura behind product stage
    const driftX = Math.sin(t * Math.PI * 2) * w * 0.025;
    const glow = ctx.createRadialGradient(stageCx + driftX, stageCy * 0.92, stageRadius * 0.08, stageCx, stageCy, stageRadius * 1.45);
    glow.addColorStop(0, profile.glow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }

  // Backdrop motif
  const motif = profile.defaultBackdrop;
  ctx.save();
  if (motif === 'solid-color') {
    // Pure solid studio backdrop without noisy grid or bokeh motifs
  } else if (motif === 'tech-grid') {
    ctx.strokeStyle = profile.lightMode ? 'rgba(37, 99, 235, 0.08)' : 'rgba(125, 211, 252, 0.10)';
    ctx.lineWidth = 1;
    const step = Math.max(26, Math.round(Math.min(w, h) * 0.065));
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else if (motif === 'botanical-fresh' || motif === 'warm-lifestyle') {
    // Soft out-of-focus studio bokeh circles
    const blobs = [
      { x: stageCx - stageRadius * 0.95, y: stageCy - stageRadius * 0.72, r: stageRadius * 0.36, a: 0.13 },
      { x: stageCx + stageRadius * 0.9, y: stageCy - stageRadius * 0.5, r: stageRadius * 0.28, a: 0.11 },
      { x: stageCx + stageRadius * 0.65, y: stageCy + stageRadius * 0.58, r: stageRadius * 0.24, a: 0.1 },
    ];
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const offset = Math.sin(t * Math.PI * 2 + i) * w * 0.015;
      const rad = ctx.createRadialGradient(b.x + offset, b.y, 0, b.x + offset, b.y, b.r);
      rad.addColorStop(0, profile.lightMode ? `rgba(37, 99, 235, ${b.a})` : `rgba(255, 235, 205, ${b.a})`);
      rad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rad;
      ctx.beginPath();
      ctx.arc(b.x + offset, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Minimal studio subtle concentric rim halo
    ctx.strokeStyle = profile.lightMode ? 'rgba(16, 29, 54, 0.07)' : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = Math.max(1.5, w * 0.0025);
    ctx.beginPath();
    ctx.arc(stageCx, stageCy, stageRadius * 0.92, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Rim lighting highlight sweep
  if (lightingPreset === 'golden-hour' || lightingPreset === 'cool-tech') {
    const rimGrad = ctx.createLinearGradient(0, 0, w, h * 0.65);
    rimGrad.addColorStop(0, lightingPreset === 'golden-hour' ? 'rgba(251,191,36,0.14)' : 'rgba(56,189,248,0.14)');
    rimGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rimGrad;
    ctx.fillRect(0, 0, w, h);
  }

  // 2.5D Display Pedestal for Cutout Studio Mode
  if (drawPedestal) {
    const pedW = stageRadius * 1.48;
    const pedH = Math.max(18, stageRadius * 0.22);
    const pedY = stageCy + stageRadius * 0.68;

    // Horizon shelf reflection
    const floorGrad = ctx.createLinearGradient(0, pedY - pedH * 0.4, 0, h);
    floorGrad.addColorStop(0, profile.lightMode ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.04)');
    floorGrad.addColorStop(1, profile.lightMode ? 'rgba(210,224,245,0.45)' : 'rgba(0,0,0,0.34)');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, pedY - pedH * 0.35, w, h - (pedY - pedH * 0.35));

    // Pedestal cylinder side
    ctx.fillStyle = profile.pedestalSide;
    ctx.beginPath();
    ctx.ellipse(stageCx, pedY + pedH * 0.85, pedW * 0.5, pedH * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(stageCx - pedW * 0.5, pedY, pedW, pedH * 0.85);

    // Pedestal top rim
    const topGrad = ctx.createLinearGradient(stageCx - pedW * 0.5, pedY, stageCx + pedW * 0.5, pedY);
    topGrad.addColorStop(0, profile.pedestalTop);
    topGrad.addColorStop(0.5, profile.lightMode ? '#ffffff' : 'rgba(255,255,255,0.36)');
    topGrad.addColorStop(1, profile.pedestalTop);
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.ellipse(stageCx, pedY, pedW * 0.5, pedH * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = profile.lightMode ? 'rgba(16,29,54,0.12)' : 'rgba(255,255,255,0.24)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: {
    scene: VideoScene;
    image: HTMLImageElement | HTMLVideoElement | null;
    sceneProgress: number;
    sceneIndex: number;
    totalScenes: number;
    productName: string;
    ctaText: string;
    industry?: string;
    showSubtitles?: boolean;
    cutoutCache?: Map<string, CutoutResult>;
  }
) {
  const {
    scene,
    image,
    sceneProgress,
    sceneIndex,
    totalScenes,
    productName,
    ctaText,
    industry,
    showSubtitles = true,
    cutoutCache,
  } = options;
  const rawT = Math.max(0, Math.min(1, sceneProgress));
  const stage = scene.stageConfig || {};
  const motionSpeed = Math.min(1.6, Math.max(0.5, Number(stage.motionSpeed) || 1));
  const t = Math.min(1, rawT * (0.85 + 0.15 * motionSpeed));

  const isLandscape = width / Math.max(1, height) > 1.28;
  const isCompactPortrait = height / Math.max(1, width) > 1.45;
  const minEdge = Math.min(width, height);
  const padX = Math.round(width * 0.055);
  const topY = Math.round(height * 0.048);

  const profile = resolveIndustryProfile(industry, scene.lightingEffect, stage);
  const isLightBg = profile.lightMode;
  const useCutoutStudio =
    stage.bgMode === 'cutout-studio' &&
    image instanceof HTMLImageElement &&
    !scene.renderedClip;

  // Text configuration (size, color, position, time window)
  const textCfg = stage.textConfig || {};
  const sceneDurSec = getSceneDurationSec(scene.durationSec);
  const sceneElapsedSec = rawT * sceneDurSec;
  const startSec = Number.isFinite(Number(textCfg.startSec)) ? Math.max(0, Number(textCfg.startSec)) : 0;
  const endSec = Number.isFinite(Number(textCfg.endSec)) && Number(textCfg.endSec) > 0 ? Number(textCfg.endSec) : sceneDurSec;
  const withinTextWindow = sceneElapsedSec >= startSec - 0.01 && sceneElapsedSec <= Math.max(startSec, endSec) + 0.01;
  const headlineScale = textCfg.size === 'sm' ? 0.82 : textCfg.size === 'lg' ? 1.22 : 1;
  const headlinePosition = textCfg.position || 'bottom';
  const headlineColor = /^#[0-9a-fA-F]{6}$/.test(textCfg.color || '') ? String(textCfg.color) : isLightBg ? '#101d36' : '#ffffff';

  // Product-first frame policy: ONLY render user-approved on-screen text when explicitly enabled.
  // Never auto-burn project title, scene title, narration subtitles, CTA, or management labels.
  const hasHeadline = !scene.renderedClip && scene.showOnScreenText === true && Boolean(scene.onScreenText?.trim()) && withinTextWindow;
  void showSubtitles;
  void ctaText;
  void productName;

  // Stage box coordinates: generous hero framing for the product
  let stageCx = width * 0.5;
  let stageCy = hasHeadline ? height * 0.44 : height * 0.5;
  let stageW = width * 0.84;
  let stageH = hasHeadline ? height * 0.62 : height * 0.74;

  if (scene.renderedClip) {
    stageCx = width * 0.5;
    stageCy = height * 0.5;
    stageW = width;
    stageH = height;
  } else if (isLandscape && hasHeadline) {
    // 16:9 Split Stage: product showcased cleanly on left, approved text on right
    stageCx = width * 0.32;
    stageCy = height * 0.5;
    stageW = width * 0.52;
    stageH = height * 0.78;
  } else if (isCompactPortrait) {
    // 9:16 Portrait: product occupies hero center-safe zone cleanly above optional approved text
    stageCx = width * 0.5;
    stageCy = height * (hasHeadline ? 0.43 : 0.48);
    stageW = width * 0.86;
    stageH = height * (hasHeadline ? 0.54 : 0.66);
  } else {
    // 1:1 and 4:5: balanced hero center stage
    stageCx = width * 0.5;
    stageCy = height * (hasHeadline ? 0.44 : 0.5);
    stageW = width * 0.82;
    stageH = height * (hasHeadline ? 0.56 : 0.68);
  }

  const stageRadius = Math.min(stageW, stageH) * 0.54;
  drawStudioBackdrop(ctx, width, height, profile, stage.lightingPreset, rawT, stageCx, stageCy, stageRadius, useCutoutStudio);

  // Camera 2.5D simulation transform
  let scale = scene.renderedClip ? 1 : 1.02;
  let offsetX = 0;
  let offsetY = 0;
  let rotation = 0;

  if (!scene.renderedClip) {
    const amp = 0.75 + motionSpeed * 0.35;
    if (scene.motionType === 'zoom-in') {
      scale = 1.0 + t * 0.13 * amp;
    } else if (scene.motionType === 'zoom-out') {
      scale = 1.14 - t * 0.12 * amp;
    } else if (scene.motionType === 'pan-left') {
      scale = 1.08;
      offsetX = (0.5 - t) * width * 0.055 * amp;
    } else if (scene.motionType === 'pan-right') {
      scale = 1.08;
      offsetX = (t - 0.5) * width * 0.055 * amp;
    } else if (scene.motionType === 'parallax') {
      scale = 1.05 + Math.sin(t * Math.PI) * 0.04;
      offsetY = Math.sin(t * Math.PI * 2) * height * 0.016 * amp;
      offsetX = (t - 0.5) * width * 0.03 * amp;
    } else if (scene.motionType === 'rotate-showcase') {
      scale = 1.03 + Math.sin(t * Math.PI) * 0.05;
      rotation = Math.sin(t * Math.PI * 2) * 0.024 * amp;
      offsetY = -Math.sin(t * Math.PI) * height * 0.012;
    }
  }

  // Transition entrance (never black-out approved clips so merged scenes flow smoothly)
  let alpha = 1;
  let transSlideX = 0;
  if (rawT < 0.09 && !scene.renderedClip) {
    const enter = rawT / 0.09;
    if (scene.transitionType === 'fade') alpha = 0.35 + enter * 0.65;
    if (scene.transitionType === 'slide') transSlideX = (1 - enter) * width * 0.07;
    if (scene.transitionType === 'zoom-cut') scale *= 0.96 + enter * 0.04;
  }

  const userScale = Math.min(1.45, Math.max(0.65, Number(stage.productScale) || 1));
  const userOffsetX = (Math.min(25, Math.max(-25, Number(stage.productOffsetX) || 0)) / 100) * stageW;
  const userOffsetY = (Math.min(25, Math.max(-25, Number(stage.productOffsetY) || 0)) / 100) * stageH;
  const shadowStrength = Math.min(1, Math.max(0, stage.shadowIntensity !== undefined ? Number(stage.shadowIntensity) : 0.65));

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(stageCx + offsetX + transSlideX + userOffsetX, stageCy + offsetY + userOffsetY);
  ctx.rotate(rotation);
  ctx.scale(scale * userScale, scale * userScale);

  if (scene.renderedClip && image instanceof HTMLVideoElement) {
    const vw = Math.max(1, image.videoWidth || width);
    const vh = Math.max(1, image.videoHeight || height);
    const fitScale = Math.min(width / vw, height / vh);
    const drawW = vw * fitScale;
    const drawH = vh * fitScale;
    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
  } else if (image) {
    let drawable: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement = image;
    let mediaWidth = image instanceof HTMLVideoElement ? image.videoWidth : image.naturalWidth;
    let mediaHeight = image instanceof HTMLVideoElement ? image.videoHeight : image.naturalHeight;
    let cutoutUsed = false;

    if (useCutoutStudio && image instanceof HTMLImageElement) {
      const sourceKey = scene.imageId || scene.imageUrl || `scene-${sceneIndex}`;
      const sens = stage.cutoutSensitivity ?? 28;
      const cacheKey = `${sourceKey}|s=${sens}`;
      let cutout = cutoutCache?.get(cacheKey);
      if (!cutout) {
        cutout = getProductCutout(image, sourceKey, { sensitivity: sens });
        cutoutCache?.set(cacheKey, cutout);
      }
      if (cutout.cutoutApplied) {
        drawable = cutout.canvas;
        mediaWidth = cutout.canvas.width;
        mediaHeight = cutout.canvas.height;
        cutoutUsed = true;
      }
    }

    const imgRatio = mediaWidth / Math.max(1, mediaHeight);
    const boxRatio = stageW / stageH;
    let drawW = stageW;
    let drawH = stageH;
    if (imgRatio > boxRatio) {
      drawH = stageW / imgRatio;
    } else {
      drawW = stageH * imgRatio;
    }

    if (cutoutUsed) {
      // Grounding contact shadow on pedestal
      if (shadowStrength > 0.02) {
        ctx.save();
        const shadowGrad = ctx.createRadialGradient(0, drawH * 0.49, 2, 0, drawH * 0.49, drawW * 0.48);
        shadowGrad.addColorStop(0, `rgba(4, 10, 24, ${0.52 * shadowStrength})`);
        shadowGrad.addColorStop(1, 'rgba(4, 10, 24, 0)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.ellipse(0, drawH * 0.49, drawW * 0.46, Math.max(8, drawH * 0.075), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.shadowColor = `rgba(6, 15, 34, ${0.42 * shadowStrength})`;
      ctx.shadowBlur = Math.round(minEdge * 0.045 * shadowStrength);
      ctx.shadowOffsetY = Math.round(minEdge * 0.018 * shadowStrength);
      ctx.drawImage(drawable, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    } else {
      // Clean rounded product card preserving authentic product packaging/details
      ctx.save();
      ctx.shadowColor = `rgba(6, 15, 34, ${0.44 * shadowStrength})`;
      ctx.shadowBlur = Math.round(minEdge * 0.05 * shadowStrength);
      ctx.shadowOffsetY = Math.round(minEdge * 0.018 * shadowStrength);
      const radius = Math.round(minEdge * 0.032);
      const rx = -drawW / 2;
      const ry = -drawH / 2;
      ctx.beginPath();
      ctx.roundRect(rx, ry, drawW, drawH, radius);
      ctx.clip();
      ctx.drawImage(drawable, rx, ry, drawW, drawH);
      // Subtle glossy studio border
      ctx.strokeStyle = isLightBg ? 'rgba(16, 29, 54, 0.12)' : 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = Math.max(1.5, minEdge * 0.003);
      ctx.strokeRect(rx, ry, drawW, drawH);
      ctx.restore();
    }
  } else {
    // Clean studio placeholder card if scene has no photo selected
    ctx.fillStyle = isLightBg ? '#ffffff' : 'rgba(255,255,255,0.08)';
    ctx.strokeStyle = isLightBg ? 'rgba(16,29,54,0.18)' : 'rgba(255,255,255,0.24)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-stageW / 2, -stageH / 2, stageW, stageH, Math.round(minEdge * 0.035));
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isLightBg ? '#17233c' : '#ffffff';
    ctx.font = `700 ${Math.max(16, Math.round(minEdge * 0.044))}px "Be Vietnam Pro", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fallbackLines = wrapTextLines(ctx, productName || 'AI Product Video', stageW * 0.8).slice(0, 2);
    fallbackLines.forEach((line, idx) => {
      ctx.fillText(line, 0, (idx - (fallbackLines.length - 1) / 2) * Math.round(minEdge * 0.058));
    });
  }
  ctx.restore();

  // Top product & transparency pill (only if not already baked in renderedClip)
  if (!scene.renderedClip) {
    ctx.save();
    // Keep AI simulation disclosure badge only when scene uses non-real AI-generated media
    if (scene.sourceType !== 'REAL_PRODUCT') {
      const badgeLabel = scene.sourceType === 'AI_GENERATED' ? 'Ảnh minh họa AI' : scene.sourceType === 'AI_VIDEO' ? 'Mô phỏng AI' : 'Video thực tế';
      const pillH = Math.max(24, Math.round(minEdge * 0.044));
      ctx.font = `600 ${Math.max(10, Math.round(minEdge * 0.02))}px "Be Vietnam Pro", sans-serif`;
      const bw = ctx.measureText(badgeLabel).width + minEdge * 0.04;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.92)';
      ctx.beginPath();
      ctx.roundRect(width - padX - bw, topY, bw, pillH, pillH / 2);
      ctx.fill();
      ctx.fillStyle = '#101d36';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(badgeLabel, width - padX - bw + minEdge * 0.02, topY + pillH / 2);
    }
    ctx.restore();
  }

  // Render ONLY user-approved on-screen product text when explicitly enabled
  ctx.save();
  if (!scene.renderedClip && hasHeadline) {
    if (isLandscape) {
      const colX = width * 0.6;
      const colW = width - colX - padX;
      const headlineSize = Math.max(16, Math.round(minEdge * 0.048 * headlineScale));
      ctx.font = `800 ${headlineSize}px "Be Vietnam Pro", sans-serif`;
      const lines = wrapTextLines(ctx, scene.onScreenText, colW).slice(0, 3);
      const blockH = lines.length * (headlineSize * 1.24);
      let hy = headlinePosition === 'top' ? height * 0.16 : headlinePosition === 'bottom' ? height - blockH - height * 0.14 : (height - blockH) / 2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (const line of lines) {
        ctx.fillStyle = headlineColor;
        ctx.shadowColor = isLightBg ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.48)';
        ctx.shadowBlur = 8;
        ctx.fillText(line, colX, hy);
        hy += headlineSize * 1.24;
      }
      ctx.shadowBlur = 0;
    } else {
      // Portrait / 4:5 / Square: keep inside TikTok/Reels safe vertical zone (avoid bottom 20% & top 14%)
      const headSize = Math.max(14, Math.round(minEdge * 0.044 * headlineScale));
      ctx.font = `800 ${headSize}px "Be Vietnam Pro", sans-serif`;
      const lines = wrapTextLines(ctx, scene.onScreenText, width - padX * 2.2).slice(0, 2);
      const blockH = lines.length * (headSize * 1.24);
      let y = height - Math.round(height * 0.21) - blockH;
      if (headlinePosition === 'top') {
        y = Math.round(height * 0.15);
      } else if (headlinePosition === 'center') {
        y = Math.round((height - blockH) * 0.5);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const scrimPadY = Math.round(minEdge * 0.016);
      ctx.fillStyle = isLightBg ? 'rgba(255,255,255,0.72)' : 'rgba(10,18,36,0.52)';
      ctx.beginPath();
      ctx.roundRect(padX, y - scrimPadY, width - padX * 2, blockH + scrimPadY * 2, Math.round(minEdge * 0.02));
      ctx.fill();
      for (const line of lines) {
        ctx.fillStyle = headlineColor;
        ctx.shadowColor = isLightBg ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.52)';
        ctx.shadowBlur = 10;
        ctx.fillText(line, width / 2, y);
        y += headSize * 1.24;
      }
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
  void sceneIndex;
  void totalScenes;

  ctx.restore();
}

async function synthesizeMusicTrack(
  totalDurationSec: number,
  music: MusicConfig,
  sampleRate = 44100,
  voiceovers: VoiceoverTrack[] = []
): Promise<AudioBuffer> {
  const frameCount = Math.max(1, Math.ceil(totalDurationSec * sampleRate));
  const offline = new OfflineAudioContext(2, frameCount, sampleRate);
  const activeVoiceWindows: Array<{ start: number; end: number }> = [];

  for (const clip of voiceovers) {
    if (!clip.audioBuffer || clip.startSec >= totalDurationSec) continue;
    const rate = Math.min(1.5, Math.max(0.7, clip.playbackRate ?? 1));
    const startAt = Math.max(0, clip.startSec);
    const availableWindow = clip.maxDurationSec && clip.maxDurationSec > 0
      ? Math.min(clip.maxDurationSec, totalDurationSec - startAt)
      : totalDurationSec - startAt;
    if (availableWindow <= 0.05) continue;
    const naturalDur = clip.audioBuffer.duration / rate;
    const playDur = Math.min(naturalDur, availableWindow);
    const targetVolume = Math.min(1.5, Math.max(0, clip.volume ?? 1));
    const source = offline.createBufferSource();
    source.buffer = clip.audioBuffer;
    source.playbackRate.value = rate;
    const gain = offline.createGain();
    gain.gain.setValueAtTime(targetVolume, startAt);
    if (naturalDur > availableWindow && playDur > 0.08) {
      gain.gain.setValueAtTime(targetVolume, Math.max(startAt, startAt + playDur - 0.05));
      gain.gain.linearRampToValueAtTime(0, startAt + playDur);
    }
    source.connect(gain);
    gain.connect(offline.destination);
    source.start(startAt);
    source.stop(startAt + playDur);
    activeVoiceWindows.push({ start: startAt, end: startAt + playDur });
  }

  if (!music.enabled || music.volume <= 0) return offline.startRendering();
  const baseMusicVol = Math.min(0.45, Math.max(0.05, music.volume));
  const master = offline.createGain();
  master.gain.setValueAtTime(baseMusicVol, 0);
  // Subtle audio ducking when AI voiceover is speaking
  for (const w of activeVoiceWindows) {
    master.gain.setTargetAtTime(baseMusicVol * 0.42, w.start, 0.08);
    master.gain.setTargetAtTime(baseMusicVol, w.end, 0.14);
  }
  master.connect(offline.destination);

  const chordsByMood: Record<string, number[][]> = {
    'upbeat-modern': [
      [261.63, 329.63, 392.0],
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66],
    ],
    'elegant-ambient': [
      [220.0, 261.63, 329.63],
      [196.0, 246.94, 293.66],
      [174.61, 220.0, 261.63],
      [164.81, 196.0, 246.94],
    ],
    'warm-acoustic': [
      [293.66, 369.99, 440.0],
      [246.94, 293.66, 369.99],
      [196.0, 246.94, 293.66],
      [220.0, 277.18, 329.63],
    ],
    'tech-pulse': [
      [130.81, 196.0, 261.63],
      [146.83, 220.0, 293.66],
      [164.81, 246.94, 329.63],
      [146.83, 220.0, 293.66],
    ],
  };

  const chords = chordsByMood[music.mood] || chordsByMood['upbeat-modern'];
  const stepSec = 2.0;
  for (let start = 0, idx = 0; start < totalDurationSec; start += stepSec, idx++) {
    const chord = chords[idx % chords.length];
    const end = Math.min(totalDurationSec, start + stepSec);
    for (const freq of chord) {
      const osc = offline.createOscillator();
      const env = offline.createGain();
      osc.type = music.mood === 'tech-pulse' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);
      env.gain.setValueAtTime(0.001, start);
      env.gain.exponentialRampToValueAtTime(0.14, start + 0.25);
      env.gain.exponentialRampToValueAtTime(0.001, end);
      osc.connect(env);
      env.connect(master);
      osc.start(start);
      osc.stop(end);
    }
  }

  return offline.startRendering();
}

export async function renderProjectVideo(options: {
  scenes: VideoScene[];
  aspectRatio: AspectRatio;
  resolution: RenderResolution;
  productName: string;
  ctaText: string;
  industry?: string;
  musicConfig: MusicConfig;
  voiceovers?: VoiceoverTrack[];
  signal?: AbortSignal;
  onProgress: (percent: number, stageText: string) => void;
}): Promise<RenderResult> {
  const { scenes, aspectRatio, resolution, productName, ctaText, industry, musicConfig, voiceovers = [], signal, onProgress } = options;
  if (scenes.length === 0) {
    throw new Error('Cần ít nhất 1 phân cảnh để dựng video.');
  }

  const { width, height } = getResolutionDimensions(aspectRatio, resolution);
  const fps = 30;
  const totalDurationSec = scenes.reduce((sum, s) => sum + getSceneDurationSec(s.durationSec), 0);

  onProgress(5, 'Đang tải hình ảnh sản phẩm...');
  const loadedImages = await Promise.all(scenes.map(s => s.aiVideoUrl ? loadVideoElement(s.aiVideoUrl) : loadImageElement(s.imageUrl)));
  if (scenes.some((scene, index) => scene.aiVideoUrl && !loadedImages[index])) {
    throw new Error('Không tải được một clip video của dự án. Hãy kiểm tra lại liên kết video hoặc tạo lại phân cảnh.');
  }
  const missingImageIndex = scenes.findIndex((scene, index) => Boolean(scene.imageUrl) && !scene.aiVideoUrl && !loadedImages[index]);
  if (missingImageIndex >= 0) {
    throw new Error(`Không tải được hình ảnh của Phân cảnh ${missingImageIndex + 1}. Vui lòng tải lại ảnh hoặc kiểm tra kết nối.`);
  }

  if (signal?.aborted) throw new Error('RENDER_CANCELLED');

  // Pre-warm browser background cutout canvases for studio cutout scenes before rendering loop
  const cutoutCache = new Map<string, CutoutResult>();
  const cutoutCount = scenes.filter((s, idx) => s.stageConfig?.bgMode === 'cutout-studio' && loadedImages[idx] instanceof HTMLImageElement).length;
  if (cutoutCount > 0) {
    onProgress(9, 'Đang tách nền & dựng sân khấu studio 2.5D cho sản phẩm...');
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      const media = loadedImages[i];
      if (s.stageConfig?.bgMode === 'cutout-studio' && media instanceof HTMLImageElement) {
        const sourceKey = s.imageId || s.imageUrl || `scene-${i}`;
        const sens = s.stageConfig?.cutoutSensitivity ?? 28;
        const cacheKey = `${sourceKey}|s=${sens}`;
        if (!cutoutCache.has(cacheKey)) {
          cutoutCache.set(cacheKey, getProductCutout(media, sourceKey, { sensitivity: sens }));
        }
      }
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D.');

  const hasAiVideoScenes = scenes.some(scene => Boolean(scene.aiVideoUrl));
  const webCodecsOk = !hasAiVideoScenes && typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

  if (webCodecsOk) {
    let videoEncoder: VideoEncoder | null = null;
    let audioEncoder: AudioEncoder | null = null;
    try {
      onProgress(12, 'Đang khởi tạo bộ mã hóa MP4 (H.264)...');
      const hasAudioEncoder = typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined';
      let audioSupported = false;
      if (hasAudioEncoder) {
        const support = await AudioEncoder.isConfigSupported({
          codec: 'mp4a.40.2',
          sampleRate: 44100,
          numberOfChannels: 2,
          bitrate: 128_000,
        });
        audioSupported = Boolean(support.supported);
      }

      if (!audioSupported && (voiceovers.length > 0 || musicConfig.enabled)) {
        throw new Error('Bộ mã hóa âm thanh AAC không được hỗ trợ; chuyển sang chế độ ghi hình tương thích.');
      }

      const targetBitrate = resolution === '1080p' ? 4_500_000 : resolution === '720p' ? 2_500_000 : 1_200_000;
      const codecCandidates = ['avc1.4d002a', 'avc1.42001f', 'avc1.42E01E'];
      let chosenCodec = '';
      for (const c of codecCandidates) {
        const cfg = await VideoEncoder.isConfigSupported({
          codec: c,
          width,
          height,
          bitrate: targetBitrate,
          framerate: fps,
        });
        if (cfg.supported) {
          chosenCodec = c;
          break;
        }
      }
      if (!chosenCodec) {
        throw new Error('Trình duyệt chưa hỗ trợ mã hóa H.264 WebCodecs; chuyển sang chế độ ghi hình tương thích.');
      }

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: {
          codec: 'avc',
          width,
          height,
        },
        audio: audioSupported
          ? {
              codec: 'aac',
              sampleRate: 44100,
              numberOfChannels: 2,
            }
          : undefined,
        fastStart: 'in-memory',
      });

      let encoderError: Error | null = null;
      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: err => {
          encoderError = err instanceof Error ? err : new Error(String(err));
        },
      });

      videoEncoder.configure({
        codec: chosenCodec,
        width,
        height,
        bitrate: targetBitrate,
        framerate: fps,
      });

      if (audioSupported) {
        onProgress(18, voiceovers.length ? 'Đang phối giọng đọc và nhạc nền...' : 'Đang tổng hợp âm thanh nền...');
        const audioBuffer = await synthesizeMusicTrack(totalDurationSec, musicConfig, 44100, voiceovers);
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: err => {
            encoderError = err instanceof Error ? err : new Error(String(err));
          },
        });
        audioEncoder.configure({
          codec: 'mp4a.40.2',
          sampleRate: 44100,
          numberOfChannels: 2,
          bitrate: 128_000,
        });

        const ch0 = audioBuffer.getChannelData(0);
        const ch1 = audioBuffer.getChannelData(1);
        const chunkFrames = 4410;
        for (let offset = 0; offset < audioBuffer.length; offset += chunkFrames) {
          if (encoderError) throw encoderError;
          if (signal?.aborted) throw new Error('RENDER_CANCELLED');
          const frames = Math.min(chunkFrames, audioBuffer.length - offset);
          const planar = new Float32Array(frames * 2);
          planar.set(ch0.subarray(offset, offset + frames), 0);
          planar.set(ch1.subarray(offset, offset + frames), frames);
          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: 44100,
            numberOfFrames: frames,
            numberOfChannels: 2,
            timestamp: Math.round((offset / 44100) * 1_000_000),
            data: planar,
          });
          audioEncoder.encode(audioData);
          audioData.close();
        }
        await audioEncoder.flush();
        if (encoderError) throw encoderError;
        audioEncoder.close();
        audioEncoder = null;
      }

      const totalFrames = Math.ceil(totalDurationSec * fps);
      let sceneIdx = 0;
      let sceneStartSec = 0;

      for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
        if (encoderError) throw encoderError;
        if (signal?.aborted) throw new Error('RENDER_CANCELLED');

        const timeSec = frameIdx / fps;
        while (sceneIdx < scenes.length - 1 && timeSec >= sceneStartSec + getSceneDurationSec(scenes[sceneIdx].durationSec)) {
          sceneStartSec += getSceneDurationSec(scenes[sceneIdx].durationSec);
          sceneIdx++;
        }
        const currentScene = scenes[sceneIdx];
        const currentDur = getSceneDurationSec(currentScene.durationSec);
        const sceneProgress = (timeSec - sceneStartSec) / currentDur;

        drawSceneFrame(ctx, width, height, {
          scene: currentScene,
          image: loadedImages[sceneIdx],
          sceneProgress,
          sceneIndex: sceneIdx,
          totalScenes: scenes.length,
          productName: currentScene.productName || productName,
          ctaText,
          industry,
          cutoutCache,
        });

        while (videoEncoder.encodeQueueSize > 8 && !encoderError && !signal?.aborted) {
          await new Promise(r => setTimeout(r, 8));
        }
        if (encoderError) throw encoderError;

        const timestampUs = Math.round((frameIdx / fps) * 1_000_000);
        const frame = new VideoFrame(canvas, { timestamp: timestampUs, duration: Math.round(1_000_000 / fps) });
        videoEncoder.encode(frame, { keyFrame: frameIdx % (fps * 2) === 0 });
        frame.close();

        if (frameIdx % 10 === 0) {
          const pct = Math.min(95, 20 + Math.round((frameIdx / totalFrames) * 75));
          onProgress(pct, `Đang dựng khung hình ${frameIdx + 1}/${totalFrames}...`);
          await new Promise(r => setTimeout(r, 0));
        }
      }

      if (encoderError) throw encoderError;
      onProgress(97, 'Đang đóng gói file MP4...');
      await videoEncoder.flush();
      if (encoderError) throw encoderError;
      videoEncoder.close();
      videoEncoder = null;
      muxer.finalize();

      const blob = new Blob([target.buffer], { type: 'video/mp4' });
      if (blob.size <= 0) {
        throw new Error('Tệp MP4 tạo ra bị rỗng; chuyển sang chế độ ghi hình tương thích.');
      }
      onProgress(100, 'Hoàn tất xuất MP4!');
      return {
        blob,
        format: 'mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: blob.size,
        width,
        height,
        durationSec: totalDurationSec,
      };
    } catch (err) {
      if (err instanceof Error && err.message === 'RENDER_CANCELLED') throw err;
      console.warn('WebCodecs MP4 encoder fallback to MediaRecorder:', err);
    } finally {
      try { if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close(); } catch { /* ignore */ }
      try { if (videoEncoder && videoEncoder.state !== 'closed') videoEncoder.close(); } catch { /* ignore */ }
    }
  }

  // Fallback to MediaRecorder when WebCodecs H.264 is unavailable or external video clips exist
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Trình duyệt hiện tại không hỗ trợ WebCodecs hoặc MediaRecorder để xuất video.');
  }

  onProgress(20, 'Đang chuyển sang chế độ ghi hình MediaRecorder...');
  // Render initial frame cleanly before captureStream starts so frame 0 is never blank
  drawSceneFrame(ctx, width, height, {
    scene: scenes[0],
    image: loadedImages[0],
    sceneProgress: 0,
    sceneIndex: 0,
    totalScenes: scenes.length,
    productName: scenes[0].productName || productName,
    ctaText,
    industry,
    cutoutCache,
  });

  const stream = canvas.captureStream(fps);
  let audioContext: AudioContext | null = null;
  try {
    if (voiceovers.length > 0 || musicConfig.enabled) {
      if (typeof AudioContext === 'undefined') {
        if (voiceovers.length > 0) throw new Error('Trình duyệt không hỗ trợ phối giọng đọc vào video.');
      } else {
        audioContext = new AudioContext();
        const mixedAudio = await synthesizeMusicTrack(totalDurationSec, musicConfig, 44100, voiceovers);
        const source = audioContext.createBufferSource();
        source.buffer = mixedAudio;
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
        await audioContext.resume();
        source.start();
      }
    }
    const hasAudioTrack = stream.getAudioTracks().length > 0;
    const candidates = hasAudioTrack
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm']
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm'];
    const supportedMime = candidates.find(type => {
      try {
        return MediaRecorder.isTypeSupported(type);
      } catch {
        return false;
      }
    }) || '';

    const recorder = supportedMime ? new MediaRecorder(stream, { mimeType: supportedMime }) : new MediaRecorder(stream);
    const actualMime = recorder.mimeType || supportedMime || 'video/webm';
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const stopped = new Promise<Blob>(resolve => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: actualMime }));
    });

    recorder.start(250);
    const startTime = performance.now();

    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (signal?.aborted) {
          if (recorder.state !== 'inactive') recorder.stop();
          reject(new Error('RENDER_CANCELLED'));
          return;
        }
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed >= totalDurationSec) {
          resolve();
          return;
        }
        let acc = 0;
        let idx = 0;
        for (let i = 0; i < scenes.length; i++) {
          const dur = getSceneDurationSec(scenes[i].durationSec);
          if (elapsed < acc + dur || i === scenes.length - 1) {
            idx = i;
            break;
          }
          acc += dur;
        }
        const activeMedia = loadedImages[idx];
        loadedImages.forEach(media => {
          if (media instanceof HTMLVideoElement && media !== activeMedia && !media.paused) media.pause();
        });
        if (activeMedia instanceof HTMLVideoElement) {
          const sceneElapsed = Math.max(0, elapsed - acc);
          if (Number.isFinite(activeMedia.duration) && activeMedia.duration > 0 && activeMedia.readyState >= 2) {
            const targetTime = sceneElapsed % activeMedia.duration;
            if (Math.abs(activeMedia.currentTime - targetTime) > 0.35) activeMedia.currentTime = targetTime;
          }
          if (activeMedia.paused) activeMedia.play().catch(() => {});
        }
        const currentDur = getSceneDurationSec(scenes[idx].durationSec);
        drawSceneFrame(ctx, width, height, {
          scene: scenes[idx],
          image: activeMedia,
          sceneProgress: (elapsed - acc) / currentDur,
          sceneIndex: idx,
          totalScenes: scenes.length,
          productName: scenes[idx].productName || productName,
          ctaText,
          industry,
          cutoutCache,
        });
        onProgress(Math.min(95, 20 + Math.round((elapsed / totalDurationSec) * 75)), 'Đang ghi video...');
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await stopped;
    if (!blob || blob.size <= 0) {
      throw new Error('Trình duyệt không ghi được dữ liệu video (0 byte). Vui lòng thử độ phân giải thấp hơn hoặc trình duyệt khác.');
    }
    const format = actualMime.includes('mp4') ? 'mp4' : 'webm';
    onProgress(100, 'Hoàn tất dựng video!');
    return {
      blob,
      format,
      mimeType: actualMime,
      fileSizeBytes: blob.size,
      width,
      height,
      durationSec: totalDurationSec,
    };
  } finally {
    stream.getTracks().forEach(track => { try { track.stop(); } catch { /* ignore */ } });
    if (audioContext) await audioContext.close().catch(() => {});
    loadedImages.forEach(media => {
      if (media instanceof HTMLVideoElement) {
        media.pause();
        media.removeAttribute('src');
        media.load();
      }
    });
  }
}
