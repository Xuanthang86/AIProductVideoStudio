import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { AspectRatio, MusicConfig, VideoScene } from '../types';

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
    video.crossOrigin = 'anonymous'; video.muted = true; video.loop = true;
    video.playsInline = true; video.preload = 'auto';
    video.onloadeddata = () => resolve(video); video.onerror = () => resolve(null);
    video.src = url; video.load();
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
    showSubtitles?: boolean;
  }
) {
  const { scene, image, sceneProgress, sceneIndex, totalScenes, productName, ctaText, showSubtitles = true } = options;
  const t = Math.max(0, Math.min(1, sceneProgress));

  // Background palette based on lightingEffect
  const bg = ctx.createLinearGradient(0, 0, width, height);
  if (scene.lightingEffect === 'warm-gold') {
    bg.addColorStop(0, '#1c1824');
    bg.addColorStop(0.55, '#2b2435');
    bg.addColorStop(1, '#121521');
  } else if (scene.lightingEffect === 'neon-rim') {
    bg.addColorStop(0, '#0b152c');
    bg.addColorStop(0.55, '#132955');
    bg.addColorStop(1, '#091124');
  } else if (scene.lightingEffect === 'clean') {
    bg.addColorStop(0, '#eef3fb');
    bg.addColorStop(1, '#dce7f8');
  } else {
    bg.addColorStop(0, '#0f1c36');
    bg.addColorStop(0.6, '#1a3260');
    bg.addColorStop(1, '#0d172c');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Subtle ambient radial glow
  const glow = ctx.createRadialGradient(width * 0.5, height * 0.42, width * 0.05, width * 0.5, height * 0.42, width * 0.65);
  glow.addColorStop(0, scene.lightingEffect === 'warm-gold' ? 'rgba(245,196,105,0.22)' : 'rgba(66,133,244,0.26)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Compute camera motion transform
  let scale = 1.04;
  let offsetX = 0;
  let offsetY = 0;
  let rotation = 0;
  if (scene.motionType === 'zoom-in') {
    scale = 1.0 + t * 0.14;
  } else if (scene.motionType === 'zoom-out') {
    scale = 1.15 - t * 0.13;
  } else if (scene.motionType === 'pan-left') {
    scale = 1.12;
    offsetX = (0.5 - t) * width * 0.08;
  } else if (scene.motionType === 'pan-right') {
    scale = 1.12;
    offsetX = (t - 0.5) * width * 0.08;
  } else if (scene.motionType === 'parallax') {
    scale = 1.1 + t * 0.06;
    offsetY = (0.5 - t) * height * 0.05;
  } else if (scene.motionType === 'rotate-showcase') {
    scale = 1.06 + Math.sin(t * Math.PI) * 0.06;
    rotation = (t - 0.5) * 0.05;
  }

  // Transition opacity & slide
  let alpha = 1;
  let transSlideX = 0;
  if (t < 0.12) {
    const enter = t / 0.12;
    if (scene.transitionType === 'fade') alpha = enter;
    if (scene.transitionType === 'slide') transSlideX = (1 - enter) * width * 0.08;
    if (scene.transitionType === 'zoom-cut') scale *= 0.96 + enter * 0.04;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(width / 2 + offsetX + transSlideX, scene.renderedClip ? height / 2 : height * 0.44 + offsetY);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);

  const stageW = width * 0.78;
  const stageH = height * 0.52;

  if (scene.renderedClip && image instanceof HTMLVideoElement) {
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
  } else if (image) {
    const mediaWidth = image instanceof HTMLVideoElement ? image.videoWidth : image.naturalWidth;
    const mediaHeight = image instanceof HTMLVideoElement ? image.videoHeight : image.naturalHeight;
    const imgRatio = mediaWidth / Math.max(1, mediaHeight);
    const boxRatio = stageW / stageH;
    let drawW = stageW;
    let drawH = stageH;
    if (imgRatio > boxRatio) {
      drawH = stageW / imgRatio;
    } else {
      drawW = stageH * imgRatio;
    }

    // Rounded product card shadow
    ctx.save();
    ctx.shadowColor = 'rgba(6, 15, 34, 0.42)';
    ctx.shadowBlur = Math.round(width * 0.04);
    ctx.shadowOffsetY = Math.round(height * 0.015);
    const radius = Math.round(width * 0.035);
    const rx = -drawW / 2;
    const ry = -drawH / 2;
    ctx.beginPath();
    ctx.roundRect(rx, ry, drawW, drawH, radius);
    ctx.clip();
    ctx.drawImage(image, rx, ry, drawW, drawH);
    ctx.restore();
  } else {
    // Clean studio placeholder card if scene has no photo selected
    ctx.fillStyle = scene.lightingEffect === 'clean' ? '#ffffff' : 'rgba(255,255,255,0.08)';
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-stageW / 2, -stageH / 2, stageW, stageH, Math.round(width * 0.03));
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = scene.lightingEffect === 'clean' ? '#17233c' : '#ffffff';
    ctx.font = `700 ${Math.round(width * 0.045)}px "Be Vietnam Pro", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(productName || 'AI Product Video', 0, 0);
  }
  ctx.restore();

  const isLightBg = scene.lightingEffect === 'clean';
  const padX = Math.round(width * 0.06);
  const topY = Math.round(height * 0.055);

  // Top product pill is already embedded in a previously approved scene clip.
  if (!scene.renderedClip) {
  ctx.save();
  ctx.font = `700 ${Math.max(13, Math.round(width * 0.026))}px "Be Vietnam Pro", sans-serif`;
  const pillText = productName.slice(0, 34);
  const pillW = Math.min(width - padX * 2, ctx.measureText(pillText).width + width * 0.06);
  const pillH = Math.max(28, Math.round(width * 0.058));
  ctx.fillStyle = isLightBg ? 'rgba(16, 29, 54, 0.88)' : 'rgba(255, 255, 255, 0.14)';
  ctx.beginPath();
  ctx.roundRect(padX, topY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(pillText, padX + width * 0.03, topY + pillH / 2);

  // AI simulation transparency badge if non-real media
  if (scene.sourceType !== 'REAL_PRODUCT') {
    const badgeLabel = scene.sourceType === 'AI_GENERATED' ? 'Ảnh minh họa AI' : scene.sourceType === 'AI_VIDEO' ? 'Mô phỏng AI' : 'Video thực tế';
    ctx.font = `600 ${Math.max(11, Math.round(width * 0.021))}px "Be Vietnam Pro", sans-serif`;
    const bw = ctx.measureText(badgeLabel).width + width * 0.045;
    ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
    ctx.beginPath();
    ctx.roundRect(width - padX - bw, topY, bw, pillH * 0.86, pillH / 2);
    ctx.fill();
    ctx.fillStyle = '#101d36';
    ctx.fillText(badgeLabel, width - padX - bw + width * 0.022, topY + (pillH * 0.86) / 2);
  }
  ctx.restore();
  }

  // Headline / On-screen text & Subtitles at lower third
  const bottomStart = height * 0.74;
  ctx.save();

  if (!scene.renderedClip && scene.showOnScreenText !== false && scene.onScreenText) {
    ctx.font = `800 ${Math.max(18, Math.round(width * 0.042))}px "Be Vietnam Pro", sans-serif`;
    const lines = wrapTextLines(ctx, scene.onScreenText, width - padX * 2).slice(0, 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let y = bottomStart;
    for (const line of lines) {
      ctx.fillStyle = isLightBg ? '#101d36' : '#ffffff';
      ctx.shadowColor = isLightBg ? 'transparent' : 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 10;
      ctx.fillText(line, width / 2, y);
      y += Math.round(width * 0.052);
    }
  }

  if (!scene.renderedClip && showSubtitles && scene.narration) {
    const subFontSize = Math.max(13, Math.round(width * 0.027));
    ctx.font = `500 ${subFontSize}px "Be Vietnam Pro", sans-serif`;
    const subLines = wrapTextLines(ctx, scene.narration, width - padX * 2.4).slice(0, 2);
    if (subLines.length > 0) {
      const boxH = subLines.length * (subFontSize * 1.38) + width * 0.03;
      const boxY = height * 0.855;
      ctx.fillStyle = 'rgba(10, 18, 36, 0.76)';
      ctx.beginPath();
      ctx.roundRect(padX, boxY, width - padX * 2, boxH, Math.round(width * 0.02));
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      let sy = boxY + width * 0.015;
      for (const line of subLines) {
        ctx.fillText(line, width / 2, sy);
        sy += subFontSize * 1.35;
      }
    }
  }

  // Final scene CTA pill
  if (sceneIndex === totalScenes - 1 && ctaText && t > 0.35) {
    const ctaFontSize = Math.max(14, Math.round(width * 0.029));
    ctx.font = `700 ${ctaFontSize}px "Be Vietnam Pro", sans-serif`;
    const cw = Math.min(width - padX * 2, ctx.measureText(ctaText).width + width * 0.09);
    const ch = Math.max(34, Math.round(width * 0.068));
    const cy = height * 0.65;
    ctx.fillStyle = '#2864d9';
    ctx.beginPath();
    ctx.roundRect((width - cw) / 2, cy, cw, ch, ch / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ctaText, width / 2, cy + ch / 2);
  }

  // Bottom timeline progress bar
  const totalBarW = width - padX * 2;
  const overallProgress = (sceneIndex + t) / Math.max(1, totalScenes);
  ctx.fillStyle = isLightBg ? 'rgba(16,29,54,0.16)' : 'rgba(255,255,255,0.22)';
  ctx.fillRect(padX, height - Math.round(height * 0.022), totalBarW, 4);
  ctx.fillStyle = '#3672e8';
  ctx.fillRect(padX, height - Math.round(height * 0.022), totalBarW * overallProgress, 4);

  ctx.restore();
}

async function synthesizeMusicTrack(
  totalDurationSec: number,
  music: MusicConfig,
  sampleRate = 44100,
  voiceovers: VoiceoverTrack[] = []
): Promise<AudioBuffer> {
  const frameCount = Math.ceil(totalDurationSec * sampleRate);
  const offline = new OfflineAudioContext(2, frameCount, sampleRate);
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
  }
  if (!music.enabled || music.volume <= 0) return offline.startRendering();
  const master = offline.createGain();
  master.gain.setValueAtTime(Math.min(0.45, Math.max(0.05, music.volume)), 0);
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
  musicConfig: MusicConfig;
  voiceovers?: VoiceoverTrack[];
  signal?: AbortSignal;
  onProgress: (percent: number, stageText: string) => void;
}): Promise<RenderResult> {
  const { scenes, aspectRatio, resolution, productName, ctaText, musicConfig, voiceovers = [], signal, onProgress } = options;
  if (scenes.length === 0) {
    throw new Error('Cần ít nhất 1 phân cảnh để dựng video.');
  }

  const { width, height } = getResolutionDimensions(aspectRatio, resolution);
  const fps = 30;
  const totalDurationSec = scenes.reduce((sum, s) => sum + getSceneDurationSec(s.durationSec), 0);

  onProgress(5, 'Đang tải hình ảnh sản phẩm...');
  const loadedImages = await Promise.all(scenes.map(s => s.aiVideoUrl ? loadVideoElement(s.aiVideoUrl) : loadImageElement(s.imageUrl)));
  if (scenes.some((scene, index) => scene.aiVideoUrl && !loadedImages[index])) {
    throw new Error('Không tải được một clip AI của dự án. Hãy kiểm tra lại liên kết video hoặc tạo lại phân cảnh.');
  }
  const missingImageIndex = scenes.findIndex((scene, index) => Boolean(scene.imageUrl) && !scene.aiVideoUrl && !loadedImages[index]);
  if (missingImageIndex >= 0) {
    throw new Error(`Không tải được hình ảnh của Phân cảnh ${missingImageIndex + 1}. Vui lòng tải lại ảnh hoặc kiểm tra kết nối.`);
  }

  if (signal?.aborted) throw new Error('RENDER_CANCELLED');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D.');

  // AI video clips use real-time MediaRecorder rendering to preserve motion.
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
        const chunkFrames = 4410; // 100ms chunks
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

  // Fallback to MediaRecorder when WebCodecs H.264 is unavailable
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Trình duyệt hiện tại không hỗ trợ WebCodecs hoặc MediaRecorder để xuất video.');
  }

  onProgress(20, 'Đang chuyển sang chế độ ghi hình MediaRecorder...');
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
            if (Math.abs(activeMedia.currentTime - targetTime) > 0.4) activeMedia.currentTime = targetTime;
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
        });
        onProgress(Math.min(95, 20 + Math.round((elapsed / totalDurationSec) * 75)), 'Đang ghi video...');
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await stopped;
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
