// Unified browser-side Audio Engine for synchronized preview & MP4/WebM export.
// Zero paid APIs, 100% commercial-safe synthesized library + user audio upload + on-device video audio extraction.

export interface AudioLibraryTrack {
  id: string;
  name: string;
  category: string;
  style: string;
  mood: string;
  bpm: number;
  durationSec: number;
  description: string;
  source: string;
  license: string;
  allowedPlatforms: string[];
  notes: string[];
}

export type SfxPreset = 'none' | 'whoosh' | 'pop' | 'click' | 'sparkle' | 'impact';

export interface CustomAudioTrack {
  name: string;
  sourceType: 'audio-upload' | 'video-extract';
  mimeType: string;
  durationSec: number;
  buffer: AudioBuffer;
  objectUrl: string;
  trimStartSec: number;
  trimEndSec: number;
  volume: number; // 0..1
  fadeInSec: number;
  fadeOutSec: number;
  loop: boolean;
  muted: boolean;
  ducking: boolean;
}

export const AUDIO_LIBRARY_TRACKS: AudioLibraryTrack[] = [
  {
    id: 'upbeat-trend',
    name: 'Nhịp Sôi Động Trẻ Trung',
    category: 'Sôi động / Bắt trend',
    style: 'Pop / TikTok Trend',
    mood: 'upbeat',
    bpm: 122,
    durationSec: 30,
    description: 'Nhịp trống gọn, tươi sáng, phù hợp video giới thiệu nhanh trên TikTok & Reels.',
    source: 'AI Product Video Studio Synth',
    license: 'Miễn phí thương mại (tạo cục bộ trên trình duyệt)',
    allowedPlatforms: ['TikTok', 'Instagram Reels', 'Facebook Reels', 'YouTube Shorts'],
    notes: ['C4', 'E4', 'G4', 'A4', 'F4', 'A4', 'C5', 'G4'],
  },
  {
    id: 'edm-energy',
    name: 'Năng Lượng Điện Tử (EDM)',
    category: 'Điện tử / EDM',
    style: 'Modern Electronic',
    mood: 'energetic',
    bpm: 128,
    durationSec: 30,
    description: 'Âm bass chắc, tiết tấu mạnh cho sản phẩm thể thao, công nghệ, flash sale.',
    source: 'AI Product Video Studio Synth',
    license: 'Miễn phí thương mại (tạo cục bộ trên trình duyệt)',
    allowedPlatforms: ['TikTok', 'Instagram Reels', 'Facebook Reels', 'YouTube Shorts'],
    notes: ['A3', 'C4', 'E4', 'G4', 'F3', 'A3', 'C4', 'E4'],
  },
  {
    id: 'luxury-minimal',
    name: 'Sang Trọng Tối Giản (Luxury)',
    category: 'Sang trọng / Cao cấp',
    style: 'Luxury / Editorial',
    mood: 'luxury',
    bpm: 90,
    durationSec: 30,
    description: 'Hợp âm ấm áp, tinh tế cho mỹ phẩm cao cấp, đồng hồ, trang sức, thời trang.',
    source: 'AI Product Video Studio Synth',
    license: 'Miễn phí thương mại (tạo cục bộ trên trình duyệt)',
    allowedPlatforms: ['TikTok', 'Instagram Reels', 'Facebook Reels', 'YouTube Shorts'],
    notes: ['D4', 'F4', 'A4', 'C5', 'G3', 'B3', 'D4', 'F4'],
  },
  {
    id: 'tech-clean',
    name: 'Công Nghệ Hiện Đại',
    category: 'Công nghệ',
    style: 'Tech / Minimal',
    mood: 'tech',
    bpm: 114,
    durationSec: 30,
    description: 'Âm thanh sạch, chính xác, phù hợp sản phẩm điện tử, gia dụng thông minh.',
    source: 'AI Product Video Studio Synth',
    license: 'Miễn phí thương mại (tạo cục bộ trên trình duyệt)',
    allowedPlatforms: ['TikTok', 'Instagram Reels', 'Facebook Reels', 'YouTube Shorts'],
    notes: ['E4', 'G4', 'B4', 'D5', 'C4', 'E4', 'G4', 'B4'],
  },
  {
    id: 'chill-lofi',
    name: 'Nhẹ Nhàng Chill / Lofi',
    category: 'Chill / Lifestyle',
    style: 'Lofi / Acoustic',
    mood: 'chill',
    bpm: 84,
    durationSec: 30,
    description: 'Nhịp chậm êm dịu cho review, unboxing, đồ gia dụng và lifestyle.',
    source: 'AI Product Video Studio Synth',
    license: 'Miễn phí thương mại (tạo cục bộ trên trình duyệt)',
    allowedPlatforms: ['TikTok', 'Instagram Reels', 'Facebook Reels', 'YouTube Shorts'],
    notes: ['F4', 'A4', 'C5', 'E5', 'D4', 'F4', 'A4', 'C5'],
  },
  {
    id: 'beauty-glow',
    name: 'Mỹ Phẩm & Làm Đẹp',
    category: 'Mỹ phẩm / Thời trang',
    style: 'Beauty / Soft Pop',
    mood: 'elegant',
    bpm: 102,
    durationSec: 30,
    description: 'Giai điệu trong trẻo, nữ tính cho skincare, nước hoa và phụ kiện.',
    source: 'AI Product Video Studio Synth',
    license: 'Miễn phí thương mại (tạo cục bộ trên trình duyệt)',
    allowedPlatforms: ['TikTok', 'Instagram Reels', 'Facebook Reels', 'YouTube Shorts'],
    notes: ['G4', 'B4', 'D5', 'F#5', 'E4', 'G4', 'B4', 'D5'],
  },
];

export const EXTERNAL_MUSIC_LIBRARIES = [
  {
    name: 'TikTok Commercial Music Library',
    url: 'https://ads.tiktok.com/business/creativecenter/music/pc/en',
    note: 'Chỉ dùng cho video đăng trên TikTok theo điều khoản của TikTok.',
  },
  {
    name: 'Meta Sound Collection',
    url: 'https://www.facebook.com/sound/collection',
    note: 'Chỉ dùng cho video đăng trên Facebook & Instagram theo điều khoản của Meta.',
  },
];

const NOTE_FREQ: Record<string, number> = {
  F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, 'F#5': 739.99,
};

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export async function synthesizeLibraryTrackBuffer(trackId: string, durationSec: number): Promise<AudioBuffer> {
  const track = AUDIO_LIBRARY_TRACKS.find(t => t.id === trackId) || AUDIO_LIBRARY_TRACKS[0];
  const sampleRate = 44100;
  const totalSamples = Math.max(sampleRate, Math.round(durationSec * sampleRate));
  const offline = new OfflineAudioContext(2, totalSamples, sampleRate);

  const beatSec = 60 / track.bpm;
  const stepSec = beatSec / 2;
  const master = offline.createGain();
  master.gain.setValueAtTime(0.001, 0);
  master.gain.linearRampToValueAtTime(0.26, Math.min(0.4, durationSec * 0.1));
  master.gain.setValueAtTime(0.26, Math.max(0.4, durationSec - 0.6));
  master.gain.linearRampToValueAtTime(0.001, durationSec);
  master.connect(offline.destination);

  let step = 0;
  for (let t = 0; t < durationSec; t += stepSec) {
    const noteName = track.notes[step % track.notes.length];
    const freq = NOTE_FREQ[noteName] || 329.63;
    const osc = offline.createOscillator();
    const env = offline.createGain();
    osc.type = track.mood === 'luxury' || track.mood === 'chill' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.24, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, Math.min(durationSec, t + stepSec * 1.4));
    osc.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(Math.min(durationSec, t + stepSec * 1.45));

    // Soft kick on downbeat
    if (step % 4 === 0) {
      const kick = offline.createOscillator();
      const kEnv = offline.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(110, t);
      kick.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      kEnv.gain.setValueAtTime(0.32, t);
      kEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      kick.connect(kEnv);
      kEnv.connect(master);
      kick.start(t);
      kick.stop(t + 0.17);
    }
    step++;
  }

  return offline.startRendering();
}

export async function decodeMediaFileToAudioTrack(
  file: File,
  sourceType: 'audio-upload' | 'video-extract'
): Promise<CustomAudioTrack> {
  if (!file || file.size === 0) {
    throw new Error('Tệp được chọn bị rỗng.');
  }
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Trình duyệt hiện tại không hỗ trợ Web Audio API để giải mã âm thanh.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (!decoded || decoded.duration <= 0.05) {
      throw new Error('Không phát hiện track âm thanh hợp lệ trong tệp này.');
    }
    const wavBlob = audioBufferToWavBlob(decoded);
    const objectUrl = URL.createObjectURL(wavBlob);
    return {
      name: file.name,
      sourceType,
      mimeType: 'audio/wav',
      durationSec: decoded.duration,
      buffer: decoded,
      objectUrl,
      trimStartSec: 0,
      trimEndSec: Math.min(decoded.duration, 60),
      volume: 0.75,
      fadeInSec: 0.3,
      fadeOutSec: 0.5,
      loop: true,
      muted: false,
      ducking: true,
    };
  } catch (err) {
    if (sourceType === 'video-extract') {
      throw new Error(
        err instanceof Error && err.message.includes('track âm thanh')
          ? err.message
          : 'Trình duyệt không thể tách track âm thanh trực tiếp từ định dạng video này (hãy thử tệp MP4/AAC hoặc WAV/MP3).'
      );
    }
    throw new Error('Không thể giải mã tệp âm thanh. Vui lòng chọn tệp MP3, WAV, M4A, AAC hoặc OGG hợp lệ.');
  } finally {
    await ctx.close().catch(() => {});
  }
}

export class PreviewAudioController {
  private ctx: AudioContext | null = null;
  private activeNodes: AudioScheduledSourceNode[] = [];

  stop() {
    for (const node of this.activeNodes) {
      try {
        node.stop();
      } catch {
        // Ignore already stopped nodes
      }
      try {
        node.disconnect();
      } catch {
        // Ignore
      }
    }
    this.activeNodes = [];
    if (this.ctx) {
      const toClose = this.ctx;
      this.ctx = null;
      void toClose.close().catch(() => {});
    }
  }

  play(params: {
    startOffsetSec: number;
    totalDurationSec: number;
    musicBuffer: AudioBuffer | null;
    musicVolume: number;
    musicMuted: boolean;
    musicTrimStartSec?: number;
    musicTrimEndSec?: number;
    musicLoop?: boolean;
    voiceovers?: Array<{ audioBuffer: AudioBuffer; startSec: number; maxDurationSec?: number; volume?: number }>;
  }) {
    this.stop();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const remaining = Math.max(0, params.totalDurationSec - params.startOffsetSec);
    if (remaining <= 0.02) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;
    const now = ctx.currentTime;

    // 1. Background music synchronized to startOffsetSec
    if (params.musicBuffer && !params.musicMuted && params.musicVolume > 0.005) {
      const src = ctx.createBufferSource();
      src.buffer = params.musicBuffer;
      const trimStart = Math.max(0, Math.min(params.musicBuffer.duration - 0.1, params.musicTrimStartSec ?? 0));
      const trimEnd = Math.max(trimStart + 0.1, Math.min(params.musicBuffer.duration, params.musicTrimEndSec ?? params.musicBuffer.duration));
      const segDur = trimEnd - trimStart;
      src.loop = params.musicLoop !== false;
      src.loopStart = trimStart;
      src.loopEnd = trimEnd;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0, Math.min(1, params.musicVolume)), now);
      src.connect(gain);
      gain.connect(ctx.destination);

      const musicOffset = trimStart + (params.startOffsetSec % segDur);
      src.start(now, musicOffset, remaining);
      this.activeNodes.push(src);
    }

    // 2. Voiceovers synchronized to startOffsetSec
    for (const vo of params.voiceovers || []) {
      const voDur = Math.min(vo.audioBuffer.duration, vo.maxDurationSec || vo.audioBuffer.duration);
      const voEnd = vo.startSec + voDur;
      if (voEnd <= params.startOffsetSec + 0.02) continue;

      const src = ctx.createBufferSource();
      src.buffer = vo.audioBuffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vo.volume ?? 1, now);
      src.connect(gain);
      gain.connect(ctx.destination);

      if (params.startOffsetSec <= vo.startSec) {
        const delay = vo.startSec - params.startOffsetSec;
        src.start(now + delay, 0, Math.min(voDur, Math.max(0.05, remaining - delay)));
      } else {
        const skip = params.startOffsetSec - vo.startSec;
        src.start(now, skip, Math.max(0.05, voDur - skip));
      }
      this.activeNodes.push(src);
    }
  }
}
