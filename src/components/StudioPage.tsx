import { useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Download,
  Eye,
  Film,
  Layers,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  WandSparkles,
} from 'lucide-react';
import { api, formatBytes, normalizeImageMimeType } from '../lib/api';
import { getProductCutout } from '../lib/backgroundRemoval';
import {
  applyVideoDurationWorkaround,
  checkDeviceRenderSafety,
  drawSceneFrame,
  getResolutionDimensions,
  getSceneDurationSec,
  renderProjectVideo,
  type RenderResolution,
  type RenderResult,
  type VoiceoverTrack,
} from '../lib/videoRenderer';
import type {
  AspectRatio,
  Industry,
  LightingEffect,
  MotionType,
  MusicConfig,
  Product,
  SceneBackdropStyle,
  SceneLightingPreset,
  SceneRole,
  SceneStageConfig,
  ScriptVariant,
  TransitionType,
  UserQuota,
  VideoProject,
  VideoScene,
  VideoTemplate,
  VideoTopic,
  VoiceConfig,
} from '../types';

interface SceneReview {
  sceneId: string;
  status: 'PENDING' | 'APPROVED';
  outputFileUrl: string;
  fileSizeBytes: number;
  format: 'mp4' | 'webm';
  resolution: RenderResolution;
  sceneSignature: string;
  updatedAt?: string;
}

interface SceneDiffSnapshot {
  before: VideoScene;
  after: VideoScene;
  summary: string;
  model: string;
}

interface Props {
  industries: Industry[];
  topics: VideoTopic[];
  templates: VideoTemplate[];
  quota: UserQuota | null;
  initialProductId?: string;
  initialTemplate?: VideoTemplate | null;
  initialVideoType?: string;
  initialProjectId?: string;
  onGoProducts: () => void;
  onGoMyVideos: () => void;
}

const VIDEO_TYPES = [
  'Advertisement',
  'Product Review',
  'Product Showcase',
  'TikTok Viral',
  'Unboxing',
  'Lifestyle',
  'Comparison',
  'How-to',
  'Before & After',
  'Storytelling',
  'Luxury Commercial',
  'Educational',
];

const QUICK_DURATIONS = [15, 30, 45, 60];
const RATIOS: AspectRatio[] = ['9:16', '16:9', '1:1', '4:5'];

const SCENE_ROLE_LABELS: Record<SceneRole, string> = {
  intro: 'Mở đầu (Hook)',
  usp: 'Điểm nổi bật (USP)',
  detail: 'Cận cảnh chi tiết',
  lifestyle: 'Bối cảnh sử dụng',
  cta: 'Chốt đơn (CTA)',
  showcase: 'Trưng bày sản phẩm',
};

const BACKDROP_OPTIONS: Array<{ value: SceneBackdropStyle; label: string }> = [
  { value: 'auto-industry', label: 'Tự động theo ngành hàng' },
  { value: 'solid-color', label: 'Màu nền đơn sắc tùy chọn' },
  { value: 'luxury-pedestal', label: 'Bục trưng bày sang trọng' },
  { value: 'minimal-studio', label: 'Studio tối giản cao cấp' },
  { value: 'tech-grid', label: 'Lưới công nghệ tương lai' },
  { value: 'warm-lifestyle', label: 'Ánh sáng đời sống ấm áp' },
  { value: 'botanical-fresh', label: 'Bokeh thiên nhiên tươi sáng' },
];

const LIGHTING_PRESET_OPTIONS: Array<{ value: SceneLightingPreset; label: string }> = [
  { value: 'soft-studio', label: 'Soft Studio (Mềm đều)' },
  { value: 'golden-hour', label: 'Golden Hour (Nắng ấm)' },
  { value: 'editorial-contrast', label: 'Editorial (Tương phản cao)' },
  { value: 'cool-tech', label: 'Cool Tech (Sắc nét xanh)' },
];

function CutoutPreviewStrip({
  image,
  imageUrl,
  sensitivity,
  sourceKey,
}: {
  image: HTMLImageElement | null | undefined;
  imageUrl: string;
  sensitivity: number;
  sourceKey: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cutout = useMemo(() => {
    if (!image) return null;
    return getProductCutout(image, sourceKey, { sensitivity });
  }, [image, sourceKey, sensitivity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cutout) return;
    canvas.width = cutout.canvas.width;
    canvas.height = cutout.canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cutout.canvas, 0, 0);
  }, [cutout]);

  if (!imageUrl) {
    return (
      <div className="info-strip" style={{ marginTop: 4 }}>
        Hãy chọn hoặc tải ảnh cho phân cảnh này để xem trước tách nền.
      </div>
    );
  }

  return (
    <div className="cutout-preview-box">
      <div className="cutout-preview-grid">
        <div className="cutout-preview-tile">
          <small>Trước (Ảnh gốc)</small>
          <img
            src={imageUrl}
            alt="Ảnh gốc trước khi tách nền"
            crossOrigin={imageUrl.startsWith('data:') || imageUrl.startsWith('blob:') ? undefined : 'anonymous'}
          />
        </div>
        <div className="cutout-preview-tile is-checkerboard">
          <small>Sau (Tách nền trình duyệt)</small>
          {cutout ? (
            <canvas ref={canvasRef} />
          ) : (
            <span className="muted-copy">Đang xử lý ảnh...</span>
          )}
        </div>
      </div>
      {cutout && (
        <small className="muted-copy">
          Độ phủ chủ thể giữ lại: <b>{Math.round(cutout.coverageRatio * 100)}%</b> · Thuật toán biên Canvas 2D (không cần GPU server).
        </small>
      )}
      {cutout?.notice && (
        <div className="warning-strip compact" role="status">
          <AlertTriangle size={14} />
          <span>{cutout.notice}</span>
        </div>
      )}
    </div>
  );
}

export default function StudioPage({
  industries,
  topics,
  templates,
  quota,
  initialProductId,
  initialTemplate,
  initialVideoType,
  initialProjectId,
  onGoProducts,
  onGoMyVideos,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [projectId, setProjectId] = useState<string>(initialProjectId || '');
  const [title, setTitle] = useState('Video sản phẩm mới');
  const [productId, setProductId] = useState(initialProductId || '');
  const [templateId, setTemplateId] = useState(initialTemplate?.id || '');
  const [videoType, setVideoType] = useState(initialTemplate?.videoType || 'Advertisement');
  const [industry, setIndustry] = useState(initialTemplate?.industry || 'Mỹ phẩm');
  const [targetAudience, setTargetAudience] = useState('Khách hàng mua sắm trực tuyến');
  const [style, setStyle] = useState('Hiện đại, tinh tế, dễ tiếp cận');

  const maxAllowedDuration = quota?.max_duration_sec || 60;
  const maxCustomDuration = Math.max(4, Math.min(60, maxAllowedDuration));
  const [durationSec, setDurationSec] = useState(() =>
    Math.min(Math.max(4, initialTemplate?.suggestedDuration || 30), Math.max(4, Math.min(60, maxAllowedDuration)))
  );
  const [durationDraft, setDurationDraft] = useState(() =>
    String(Math.min(Math.max(4, initialTemplate?.suggestedDuration || 30), Math.max(4, Math.min(60, maxAllowedDuration))))
  );

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');
  const [ctaText, setCtaText] = useState('Khám phá ngay');

  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({
    enabled: false,
    voice: 'vi-female-young',
    speed: 1.0,
    previewMode: 'browser-speech',
  });
  const [musicConfig, setMusicConfig] = useState<MusicConfig>({
    enabled: true,
    mood: 'upbeat-modern',
    volume: 0.25,
  });

  const [variants, setVariants] = useState<ScriptVariant[]>([]);
  const [activeVariantIdx, setActiveVariantIdx] = useState(0);
  const [scenes, setScenes] = useState<VideoScene[]>([]);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [scriptConfirmed, setScriptConfirmed] = useState(false);

  const [productsLoading, setProductsLoading] = useState(true);
  const [analyzingProduct, setAnalyzingProduct] = useState(false);
  const [scriptBusy, setScriptBusy] = useState(false);
  const [scriptNote, setScriptNote] = useState('');
  const [scriptNoteType, setScriptNoteType] = useState<'info' | 'warning'>('info');
  const [scriptError, setScriptError] = useState('');
  const [saving, setSaving] = useState(false);
  const [ttsNotice, setTtsNotice] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [savedOutputUrl, setSavedOutputUrl] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);

  // Preview playback state
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImgCacheRef = useRef<Map<string, HTMLImageElement | null>>(new Map());
  const cutoutCacheRef = useRef<Map<string, ReturnType<typeof import('../lib/backgroundRemoval').getProductCutout>>>(new Map());
  const savePromiseRef = useRef<Promise<string> | null>(null);
  const projectIdRef = useRef<string>(initialProjectId || '');
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);

  // Scene-level editing, staging, AI diff, render & batch state
  const [uploadingSceneIndex, setUploadingSceneIndex] = useState<number | null>(null);
  const [sceneAssistBusyIndex, setSceneAssistBusyIndex] = useState<number | null>(null);
  const [sceneInstructions, setSceneInstructions] = useState<Record<number, string>>({});
  const [sceneDiffs, setSceneDiffs] = useState<Record<number, SceneDiffSnapshot>>({});
  const [previewSceneOverride, setPreviewSceneOverride] = useState<Record<number, 'before' | 'after'>>({});
  const [editedDurationIndices, setEditedDurationIndices] = useState<Set<number>>(new Set());
  const [sceneReviews, setSceneReviews] = useState<Record<string, SceneReview>>({});
  const [sceneRenderingIndex, setSceneRenderingIndex] = useState<number | null>(null);
  const [sceneRenderProgress, setSceneRenderProgress] = useState(0);
  const [sceneRenderErrors, setSceneRenderErrors] = useState<Record<number, string>>({});
  const [batchRendering, setBatchRendering] = useState(false);
  const [batchProgressText, setBatchProgressText] = useState('');
  const [deleteSceneIndex, setDeleteSceneIndex] = useState<number | null>(null);
  const [imageCacheRevision, setImageCacheRevision] = useState(0);

  // Final Composite Render state
  const [resolution, setResolution] = useState<RenderResolution>('720p');
  const [rendering, setRendering] = useState(false);
  const [renderPercent, setRenderPercent] = useState(0);
  const [renderStage, setRenderStage] = useState('');
  const [renderedVideo, setRenderedVideo] = useState<{ url: string; result: RenderResult } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedProduct = useMemo(() => products.find(p => p.id === productId) || null, [products, productId]);
  const totalScenesDuration = useMemo(() => scenes.reduce((s, x) => s + getSceneDurationSec(x.durationSec), 0), [scenes]);
  const safety = useMemo(() => checkDeviceRenderSafety(resolution, totalScenesDuration || durationSec), [resolution, totalScenesDuration, durationSec]);

  const getSceneSignature = (scene: VideoScene) => JSON.stringify({
    productId: scene.productId || productId || '',
    productName: scene.productName || '',
    imageReference: scene.imageId || (scene.imageUrl || '').slice(0, 500),
    sceneTitle: scene.sceneTitle || '',
    sceneRole: scene.sceneRole || 'showcase',
    narration: scene.narration || '',
    onScreenText: scene.onScreenText || '',
    showOnScreenText: scene.showOnScreenText !== false,
    durationSec: scene.durationSec,
    sourceType: scene.sourceType,
    aiVideoUrl: scene.aiVideoUrl || '',
    motionType: scene.motionType,
    transitionType: scene.transitionType,
    lightingEffect: scene.lightingEffect,
    visualPrompt: scene.visualPrompt || '',
    stageConfig: scene.stageConfig || {},
  });

  const sceneStats = useMemo(() => {
    let approved = 0;
    let readyPending = 0;
    let needsUpdate = 0;
    let failed = Object.keys(sceneRenderErrors).length;
    for (const s of scenes) {
      const review = s.id ? sceneReviews[s.id] : undefined;
      if (!review) continue;
      if (review.sceneSignature !== getSceneSignature(s)) {
        needsUpdate++;
      } else if (review.status === 'APPROVED') {
        approved++;
      } else {
        readyPending++;
      }
    }
    return { approved, readyPending, needsUpdate, failed };
  }, [scenes, sceneReviews, sceneRenderErrors, productId]);

  const allScenesApproved = scenes.length > 0 && sceneStats.approved === scenes.length;
  const canCompositeMerge = scriptConfirmed && allScenesApproved && !batchRendering && sceneRenderingIndex === null;

  const activeWorkflowStep = useMemo(() => {
    if (renderedVideo || savedOutputUrl) return 5;
    if (sceneStats.approved > 0 || sceneStats.readyPending > 0) return 4;
    if (scriptConfirmed) return 3;
    if (scenes.length > 0) return 2;
    return 1;
  }, [renderedVideo, savedOutputUrl, sceneStats, scriptConfirmed, scenes.length]);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    return () => {
      if (renderedVideo?.url) URL.revokeObjectURL(renderedVideo.url);
    };
  }, [renderedVideo]);

  useEffect(() => {
    const clamped = Math.min(maxCustomDuration, Math.max(4, durationSec));
    if (clamped !== durationSec) {
      setDurationSec(clamped);
      setDurationDraft(String(clamped));
    }
  }, [maxCustomDuration]);

  useEffect(() => {
    let active = true;
    setProductsLoading(true);
    api<{ products: Product[] }>('/api/products')
      .then(res => {
        if (!active) return;
        const list = res.products || [];
        setProducts(list);
        const requested = initialProductId ? list.find(p => p.id === initialProductId) : null;
        if (requested && !initialProjectId) {
          setProductId(requested.id);
          setIndustry(requested.industry);
          setTitle(`Video ${requested.name}`);
        } else if (!initialProjectId && list.length > 0 && !productId) {
          const first = list[0];
          setProductId(first.id);
          setIndustry(first.industry);
          setTitle(`Video ${first.name}`);
        }
      })
      .catch(e => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setProductsLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!initialProductId || initialProjectId || products.length === 0) return;
    const matched = products.find(p => p.id === initialProductId);
    if (matched) {
      setProductId(matched.id);
      setIndustry(matched.industry);
      setTitle(`Video ${matched.name}`);
    }
  }, [initialProductId, initialProjectId, products]);

  useEffect(() => {
    if (!initialProjectId) return;
    api<{ project: VideoProject; scenes: VideoScene[]; sceneReviews?: SceneReview[] }>(`/api/projects/${initialProjectId}`)
      .then(res => {
        projectIdRef.current = res.project.id;
        setProjectId(res.project.id);
        setTitle(res.project.title);
        setProductId(res.project.productId || '');
        setTemplateId(res.project.templateId || '');
        setVideoType(res.project.videoType);
        setIndustry(res.project.industry);
        setTargetAudience(res.project.targetAudience);
        setStyle(res.project.style);
        const clampedDur = Math.min(maxCustomDuration, Math.max(4, res.project.durationSec || 30));
        setDurationSec(clampedDur);
        setDurationDraft(String(clampedDur));
        setAspectRatio(res.project.aspectRatio);
        setLanguage(res.project.language);
        setCtaText(res.project.ctaText || 'Khám phá ngay');
        setSavedOutputUrl(res.project.outputFileUrl || null);
        if (res.project.voiceConfig) setVoiceConfig(res.project.voiceConfig);
        if (res.project.musicConfig) setMusicConfig(res.project.musicConfig);
        setScenes(res.scenes);
        setSceneReviews(Object.fromEntries((res.sceneReviews || []).map(review => [review.sceneId, review])));
        setScriptConfirmed((res.sceneReviews || []).length > 0 || Boolean(res.project.outputFileUrl));
      })
      .catch(e => setError(e.message));
  }, [initialProjectId]);

  useEffect(() => {
    if (initialTemplate) {
      setTemplateId(initialTemplate.id);
      setVideoType(initialTemplate.videoType);
      setIndustry(initialTemplate.industry);
      const nextDur = Math.min(maxCustomDuration, Math.max(4, initialTemplate.suggestedDuration));
      setDurationSec(nextDur);
      setDurationDraft(String(nextDur));
      if (initialTemplate.supportedRatios.length > 0) {
        setAspectRatio(initialTemplate.supportedRatios[0] as AspectRatio);
      }
    }
  }, [initialTemplate, maxCustomDuration]);

  useEffect(() => {
    if (initialVideoType && !initialTemplate) setVideoType(initialVideoType);
  }, [initialVideoType, initialTemplate]);

  // Preload images for canvas preview with CORS retry support
  useEffect(() => {
    const urls = new Set<string>();
    for (const s of scenes) {
      if (s.imageUrl) urls.add(s.imageUrl);
    }
    const primaryUrl = selectedProduct?.images[0]?.imageUrl;
    if (primaryUrl) urls.add(primaryUrl);

    for (const url of urls) {
      if (loadedImgCacheRef.current.has(url)) continue;
      loadedImgCacheRef.current.set(url, null);
      const isInline = url.startsWith('data:') || url.startsWith('blob:');
      const loadAttempt = (src: string, canRetry: boolean) => {
        const img = new Image();
        if (!isInline) img.crossOrigin = 'anonymous';
        img.onload = () => {
          loadedImgCacheRef.current.set(url, img);
          setImageCacheRevision(revision => revision + 1);
        };
        img.onerror = () => {
          if (canRetry && !isInline && /^https?:\/\//i.test(url)) {
            const sep = url.includes('?') ? '&' : '?';
            loadAttempt(`${url}${sep}_cors=1`, false);
            return;
          }
          loadedImgCacheRef.current.set(url, null);
          setImageCacheRevision(revision => revision + 1);
        };
        img.src = src;
      };
      loadAttempt(url, true);
    }
  }, [scenes, selectedProduct]);

  // Draw live preview frame whenever previewTime, scenes, aspectRatio, stageConfig, or ctaText changes
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const dims = getResolutionDimensions(aspectRatio, '480p');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (scenes.length === 0) {
      drawSceneFrame(ctx, dims.width, dims.height, {
        scene: {
          sortOrder: 0,
          durationSec: 5,
          narration: 'Tạo kịch bản hoặc thêm phân cảnh để xem trước video.',
          onScreenText: selectedProduct?.name || title,
          imageUrl: selectedProduct?.images[0]?.imageUrl || '',
          sourceType: 'REAL_PRODUCT',
          motionType: 'zoom-in',
          transitionType: 'fade',
          lightingEffect: 'studio-glow',
          visualPrompt: '',
          musicMood: 'upbeat',
          stageConfig: { bgMode: 'original' },
        },
        image: selectedProduct?.images[0]?.imageUrl
          ? loadedImgCacheRef.current.get(selectedProduct.images[0].imageUrl) || null
          : null,
        sceneProgress: 0.5,
        sceneIndex: 0,
        totalScenes: 1,
        productName: selectedProduct?.name || title,
        ctaText,
        industry,
        cutoutCache: cutoutCacheRef.current,
      });
      return;
    }

    let acc = 0;
    let idx = 0;
    for (let i = 0; i < scenes.length; i++) {
      const dur = getSceneDurationSec(scenes[i].durationSec);
      if (previewTime < acc + dur || i === scenes.length - 1) {
        idx = i;
        break;
      }
      acc += dur;
    }
    const activeSceneBase = scenes[idx];
    const activeScene =
      previewSceneOverride[idx] === 'before' && sceneDiffs[idx]?.before
        ? sceneDiffs[idx].before
        : activeSceneBase;
    const activeDur = getSceneDurationSec(activeScene.durationSec);
    const progress = (previewTime - acc) / activeDur;
    drawSceneFrame(ctx, dims.width, dims.height, {
      scene: activeScene,
      image: activeScene.imageUrl ? loadedImgCacheRef.current.get(activeScene.imageUrl) || null : null,
      sceneProgress: progress,
      sceneIndex: idx,
      totalScenes: scenes.length,
      productName: activeScene.productName || selectedProduct?.name || title,
      ctaText,
      industry,
      cutoutCache: cutoutCacheRef.current,
    });
  }, [previewTime, scenes, aspectRatio, ctaText, selectedProduct, title, industry, imageCacheRevision, previewSceneOverride, sceneDiffs]);

  // Playback timer
  useEffect(() => {
    if (!isPlayingPreview || scenes.length === 0) return;
    let raf = 0;
    let last = performance.now();
    const total = Math.max(1, totalScenesDuration);
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPreviewTime(prev => {
        const next = prev + dt;
        if (next >= total) {
          setIsPlayingPreview(false);
          return 0;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlayingPreview, scenes.length, totalScenesDuration]);

  const seekToScene = (index: number, listOverride?: VideoScene[]) => {
    const list = listOverride || scenes;
    const startSec = list.slice(0, index).reduce((sum, item) => sum + getSceneDurationSec(item.durationSec), 0);
    setIsPlayingPreview(false);
    setPreviewTime(startSec + 0.05);
  };

  const balanceScenesList = (
    sourceList: VideoScene[],
    targetTotal: number,
    lockedIndices: Set<number>
  ): { nextScenes: VideoScene[]; preservedCount: number } => {
    if (sourceList.length === 0) return { nextScenes: sourceList, preservedCount: 0 };
    const unlockedIndices = sourceList.map((_, i) => i).filter(i => !lockedIndices.has(i));
    const useLocks = unlockedIndices.length > 0 && lockedIndices.size > 0;
    const lockedTotal = useLocks
      ? sourceList.reduce((sum, s, i) => (lockedIndices.has(i) ? sum + getSceneDurationSec(s.durationSec) : sum), 0)
      : 0;
    const targetIndices = useLocks ? unlockedIndices : sourceList.map((_, i) => i);
    const remainingBudget = Math.max(targetIndices.length * 2, targetTotal - lockedTotal);
    const unlockedCurrentTotal =
      targetIndices.reduce((sum, i) => sum + getSceneDurationSec(sourceList[i].durationSec), 0) || targetIndices.length * 5;

    let rem = remainingBudget;
    const assigned = new Map<number, number>();
    targetIndices.forEach((sceneIdx, pos) => {
      const leftAfter = targetIndices.length - 1 - pos;
      if (leftAfter === 0) {
        assigned.set(sceneIdx, Math.max(2, Math.min(30, Number(rem.toFixed(1)))));
      } else {
        const shareRaw = (getSceneDurationSec(sourceList[sceneIdx].durationSec) / unlockedCurrentTotal) * remainingBudget;
        const maxAllowedForScene = Math.max(2, rem - leftAfter * 2);
        const share = Math.max(2, Math.min(30, maxAllowedForScene, Math.round(shareRaw * 2) / 2));
        assigned.set(sceneIdx, share);
        rem = Math.max(leftAfter * 2, Number((rem - share).toFixed(1)));
      }
    });

    const nextScenes = sourceList.map((s, idx) =>
      assigned.has(idx) ? { ...s, durationSec: assigned.get(idx) as number } : s
    );
    return { nextScenes, preservedCount: useLocks ? lockedIndices.size : 0 };
  };

  const applyCustomDuration = (rawValue: string | number, autoBalance = false) => {
    const parsed = Math.round(Number(rawValue));
    if (!Number.isFinite(parsed)) {
      setDurationDraft(String(durationSec));
      return;
    }
    const clamped = Math.min(maxCustomDuration, Math.max(4, parsed));
    setDurationSec(clamped);
    setDurationDraft(String(clamped));
    if (autoBalance && scenes.length > 0) {
      const { nextScenes, preservedCount } = balanceScenesList(scenes, clamped, editedDurationIndices);
      setScenes(nextScenes);
      setScriptConfirmed(false);
      setMessage(
        preservedCount > 0
          ? `Đã tự động điều chỉnh thời lượng về ${clamped}s (giữ nguyên ${preservedCount} cảnh bạn đã chỉnh tay).`
          : `Đã tự động cân bằng ${scenes.length} phân cảnh theo mục tiêu ${clamped} giây.`
      );
    }
  };

  const balanceScenesToTargetDuration = () => {
    if (scenes.length === 0) return;
    const target = Math.min(maxCustomDuration, Math.max(4, durationSec));
    const { nextScenes, preservedCount } = balanceScenesList(scenes, target, editedDurationIndices);
    setScenes(nextScenes);
    setScriptConfirmed(false);
    setMessage(
      preservedCount > 0
        ? `Đã phân bổ lại các cảnh chưa khóa theo ${target}s (vẫn giữ ${preservedCount} cảnh đã chỉnh tay).`
        : `Đã phân bổ lại thời lượng ${scenes.length} phân cảnh theo tổng ${target} giây.`
    );
  };

  const runQuickProductAnalysis = async () => {
    if (!selectedProduct) return;
    setAnalyzingProduct(true);
    setError('');
    setMessage('');
    try {
      const res = await api<{ analysis: Product['aiAnalysis']; fallbackReason?: string }>('/api/ai/analyze-product', 'POST', {
        productId: selectedProduct.id,
      });
      setProducts(prev => prev.map(p => (p.id === selectedProduct.id ? { ...p, aiAnalysis: res.analysis } : p)));
      if (res.analysis?.mode === 'gemini') {
        setMessage(`Đã phân tích sản phẩm “${selectedProduct.name}” bằng Gemini (${res.analysis.model}).`);
      } else {
        setScriptNoteType('warning');
        setScriptNote(res.fallbackReason || 'Đã phân tích sản phẩm bằng bộ quy tắc miễn phí (chưa kết nối Gemini API).');
        setMessage('Đã cập nhật phân tích sản phẩm (chế độ dự phòng miễn phí).');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể phân tích sản phẩm.');
    } finally {
      setAnalyzingProduct(false);
    }
  };

  const applyVariant = (variant: ScriptVariant, prod: Product | null, showSwitchToast = false) => {
    const imgs = prod?.images || [];
    const roles: SceneRole[] = ['intro', 'usp', 'detail', 'lifestyle', 'cta'];
    const mapped: VideoScene[] = variant.scenes.map((s, i) => {
      const prodImg = imgs.length > 0 ? imgs[i % imgs.length] : null;
      const existingStandaloneUrl = !prodImg && scenes[i]?.imageUrl ? scenes[i].imageUrl : '';
      const existingStandaloneImgId = !prodImg && scenes[i]?.imageUrl ? (scenes[i].imageId || null) : null;
      const role = s.sceneRole || (i === 0 ? 'intro' : i === variant.scenes.length - 1 ? 'cta' : roles[i % roles.length]);
      return {
        ...s,
        id: undefined,
        sortOrder: i,
        durationSec: getSceneDurationSec(s.durationSec),
        sceneTitle: s.sceneTitle || `Phân cảnh ${i + 1}`,
        sceneRole: role,
        productId: prod?.id || productId || null,
        productName: prod?.name || title.trim() || 'Video sản phẩm',
        imageId: prodImg?.id || existingStandaloneImgId,
        imageUrl: prodImg?.imageUrl || existingStandaloneUrl,
        sourceType: 'REAL_PRODUCT',
        stageConfig: s.stageConfig || {
          bgMode: 'original',
          cutoutSensitivity: 28,
          backdropStyle: 'auto-industry',
          customBgColor: '#ffffff',
          productScale: 1,
          productOffsetX: 0,
          productOffsetY: 0,
          shadowIntensity: 0.65,
          lightingPreset: 'soft-studio',
          motionSpeed: 1,
          textConfig: { size: 'md', position: 'bottom' },
        },
      };
    });
    setScenes(mapped);
    setActiveSceneIndex(0);
    setScriptConfirmed(false);
    setSceneReviews({});
    setSceneDiffs({});
    setSceneInstructions({});
    setSceneRenderErrors({});
    setPreviewSceneOverride({});
    setEditedDurationIndices(new Set());
    if (variant.ctaText) setCtaText(variant.ctaText);
    setIsPlayingPreview(false);
    setPreviewTime(0);
    if (showSwitchToast) {
      setMessage(`Đã chuyển sang ${variant.variantName} (${mapped.length} phân cảnh). Hãy xem lại nội dung trước khi xác nhận.`);
    }
  };

  const generateScripts = async () => {
    if (!productId && !title.trim()) {
      const msg = 'Vui lòng nhập tiêu đề dự án hoặc chọn một sản phẩm ở mục 1 trước khi tạo kịch bản.';
      setScriptError(msg);
      setError(msg);
      return;
    }
    const activeProduct = productId ? (products.find(p => p.id === productId) || selectedProduct) : null;
    setScriptBusy(true);
    setError('');
    setScriptError('');
    setMessage('');
    setScriptNoteType('info');
    setScriptNote('Đang phân tích thông số sản phẩm & tạo kịch bản từng phân cảnh...');
    try {
      const res = await api<{ mode: string; model: string; variants: ScriptVariant[]; fallbackReason?: string }>(
        '/api/ai/generate-script',
        'POST',
        {
          productId: productId || undefined,
          title: title.trim() || undefined,
          industry,
          videoType,
          targetAudience,
          style,
          durationSec,
          language,
        },
        { timeoutMs: 55000 }
      );
      const generatedVariants = Array.isArray(res.variants)
        ? res.variants.filter(variant => Array.isArray(variant.scenes) && variant.scenes.length > 0)
        : [];
      if (generatedVariants.length === 0) {
        throw new Error('Máy chủ chưa trả về kịch bản có phân cảnh hợp lệ. Vui lòng thử lại hoặc kiểm tra cấu hình Gemini trong Quản trị AI.');
      }
      setVariants(generatedVariants);
      setActiveVariantIdx(0);
      applyVariant(generatedVariants[0], activeProduct);
      if (res.mode === 'gemini') {
        setScriptNoteType('info');
        setScriptNote(`Đã tạo ${generatedVariants.length} phương án kịch bản bằng Gemini (${res.model}). Hãy kiểm tra và nhấn "Xác nhận kịch bản" khi hài lòng.`);
      } else {
        setScriptNoteType('warning');
        setScriptNote(
          `Đã tạo ${generatedVariants.length} phương án kịch bản cấu trúc miễn phí (dự phòng). ${res.fallbackReason || 'Bạn có thể tùy chỉnh từng phân cảnh trước khi xác nhận.'}`
        );
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Không thể tạo kịch bản từ máy chủ. Vui lòng thử lại.';
      setScriptNote('');
      setScriptError(reason);
      setError(reason);
    } finally {
      setScriptBusy(false);
    }
  };

  const addEmptyScene = () => {
    setActiveSceneIndex(scenes.length);
    const fallbackImg = selectedProduct?.images[0];
    setScenes(prev => {
      const next: VideoScene[] = [
        ...prev,
        {
          sortOrder: prev.length,
          productId: productId || null,
          productName: selectedProduct?.name || title.trim() || 'Điểm nổi bật',
          sceneTitle: `Phân cảnh ${prev.length + 1}`,
          sceneRole: prev.length === 0 ? 'intro' : 'showcase',
          durationSec: 5,
          narration: 'Nội dung giới thiệu điểm nổi bật của sản phẩm hoặc cảnh quay.',
          onScreenText: selectedProduct?.name || title.trim() || `Phân cảnh ${prev.length + 1}`,
          showOnScreenText: true,
          imageId: fallbackImg?.id || null,
          imageUrl: fallbackImg?.imageUrl || '',
          sourceType: 'REAL_PRODUCT',
          motionType: 'zoom-in',
          transitionType: 'fade',
          lightingEffect: 'studio-glow',
          visualPrompt: '',
          musicMood: musicConfig.mood,
          stageConfig: {
            bgMode: 'original',
            cutoutSensitivity: 28,
            backdropStyle: 'auto-industry',
            productScale: 1,
            productOffsetX: 0,
            productOffsetY: 0,
            shadowIntensity: 0.65,
            lightingPreset: 'soft-studio',
            motionSpeed: 1,
          },
        },
      ];
      return next;
    });
    setScriptConfirmed(false);
  };

  const updateScene = (index: number, patch: Partial<VideoScene>, invalidateApproval = true) => {
    setScenes(prev => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    if (invalidateApproval) {
      setScriptConfirmed(false);
    }
  };

  const updateSceneStage = (index: number, stagePatch: Partial<SceneStageConfig>) => {
    setScenes(prev =>
      prev.map((s, i) =>
        i === index
          ? {
              ...s,
              stageConfig: {
                ...(s.stageConfig || {}),
                ...stagePatch,
              },
            }
          : s
      )
    );
    seekToScene(index);
  };

  const uploadSceneImage = async (index: number, file?: File) => {
    if (!file) return;
    const sceneProductId = scenes[index]?.productId || productId || '';
    const mimeType = normalizeImageMimeType(file);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      setError('Ảnh phân cảnh chỉ hỗ trợ JPG, JPEG, PNG hoặc WEBP.');
      return;
    }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setError('Dung lượng ảnh mỗi phân cảnh phải lớn hơn 0 và tối đa 5MB.');
      return;
    }
    setUploadingSceneIndex(index);
    setError('');
    setMessage('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Không đọc được tệp ảnh.'));
        reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
        reader.readAsDataURL(file);
      });
      const { imageElement, width, height } = await new Promise<{ imageElement: HTMLImageElement; width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ imageElement: image, width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('Tệp tải lên không phải ảnh hợp lệ.'));
        image.src = dataUrl;
      });

      if (sceneProductId) {
        const response = await api<{ image: Product['images'][number] }>(`/api/products/${sceneProductId}/images`, 'POST', {
          fileName: file.name || `scene-${index + 1}.jpg`,
          mimeType,
          base64: dataUrl,
          width,
          height,
        });
        const sceneProductName = products.find(p => p.id === sceneProductId)?.name || title.trim() || '';
        loadedImgCacheRef.current.set(response.image.imageUrl, imageElement);
        updateScene(index, {
          productId: sceneProductId,
          productName: sceneProductName,
          imageId: response.image.id,
          imageUrl: response.image.imageUrl,
          sourceType: 'REAL_PRODUCT',
        });
        setProducts(prev => prev.map(product => (
          product.id === sceneProductId ? { ...product, images: [...product.images, response.image] } : product
        )));
      } else {
        const response = await api<{ image: { imageUrl: string; fileName: string; mimeType: string; sizeBytes: number } }>(
          '/api/media/scene-image',
          'POST',
          {
            fileName: file.name || `scene-${index + 1}.jpg`,
            mimeType,
            base64: dataUrl,
            width,
            height,
          }
        );
        loadedImgCacheRef.current.set(response.image.imageUrl, imageElement);
        updateScene(index, {
          productId: null,
          productName: scenes[index]?.productName || title.trim() || 'Video sản phẩm',
          imageId: null,
          imageUrl: response.image.imageUrl,
          sourceType: 'REAL_PRODUCT',
        });
      }

      seekToScene(index);
      setImageCacheRevision(revision => revision + 1);
      setMessage(`Đã tải ảnh riêng cho Phân cảnh ${index + 1}.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Không thể tải ảnh phân cảnh.');
    } finally {
      setUploadingSceneIndex(null);
    }
  };

  const assistScene = async (index: number) => {
    const scene = scenes[index];
    const sceneProductId = scene?.productId || productId;
    if (!scene?.imageId && !scene?.imageUrl) {
      setError('Vui lòng tải hoặc chọn ảnh cho phân cảnh trước khi phân tích.');
      return;
    }
    setSceneAssistBusyIndex(index);
    setError('');
    setMessage('');
    const beforeSnapshot: VideoScene = JSON.parse(JSON.stringify(scene));
    try {
      const result = await api<{
        scene: Partial<VideoScene>;
        changeSummary?: string;
        model: string;
        fallbackReason?: string;
      }>('/api/ai/scene-assist', 'POST', {
        productId: sceneProductId || undefined,
        imageId: scene.imageId || undefined,
        imageUrl: scene.imageUrl || undefined,
        projectTitle: title.trim() || undefined,
        industry,
        scene: {
          sceneTitle: scene.sceneTitle,
          narration: scene.narration,
          onScreenText: scene.onScreenText,
          showOnScreenText: scene.showOnScreenText !== false,
          visualPrompt: scene.visualPrompt,
          durationSec: scene.durationSec,
          motionType: scene.motionType,
          transitionType: scene.transitionType,
          lightingEffect: scene.lightingEffect,
          stageConfig: scene.stageConfig || {},
        },
        instruction: sceneInstructions[index] || '',
        language,
      });
      const mergedAfter: VideoScene = {
        ...beforeSnapshot,
        ...result.scene,
        stageConfig: {
          ...(beforeSnapshot.stageConfig || {}),
          ...(result.scene.stageConfig || {}),
        },
      };
      updateScene(index, mergedAfter);
      setSceneDiffs(prev => ({
        ...prev,
        [index]: {
          before: beforeSnapshot,
          after: mergedAfter,
          summary: result.changeSummary || 'Đã cập nhật nội dung và dàn dựng phân cảnh.',
          model: result.model,
        },
      }));
      setPreviewSceneOverride(prev => ({ ...prev, [index]: 'after' }));
      seekToScene(index, scenes.map((s, idx) => (idx === index ? mergedAfter : s)));
      setMessage(
        `Đã ${sceneInstructions[index]?.trim() ? 'chỉnh sửa' : 'phân tích'} Phân cảnh ${index + 1} (${result.model}).${result.fallbackReason ? ` Lưu ý: ${result.fallbackReason}` : ''}`
      );
    } catch (assistError) {
      setError(assistError instanceof Error ? assistError.message : 'Không thể phân tích/chỉnh sửa phân cảnh.');
    } finally {
      setSceneAssistBusyIndex(null);
    }
  };

  const undoSceneAssist = (index: number) => {
    const snap = sceneDiffs[index];
    if (!snap) return;
    updateScene(index, snap.before);
    setSceneDiffs(prev => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    setPreviewSceneOverride(prev => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    seekToScene(index, scenes.map((s, idx) => (idx === index ? snap.before : s)));
    setMessage(`Đã hoàn tác chỉnh sửa AI cho Phân cảnh ${index + 1}.`);
  };

  const acceptSceneAssist = (index: number) => {
    setSceneDiffs(prev => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    setPreviewSceneOverride(prev => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    setMessage(`Đã chấp nhận phiên bản chỉnh sửa cho Phân cảnh ${index + 1}. Hãy dựng lại phân cảnh để cập nhật clip.`);
  };

  const moveScene = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= scenes.length) return;
    setScenes(prev => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy.map((s, i) => ({ ...s, sortOrder: i }));
    });
    setSceneInstructions(prev => {
      const next = { ...prev };
      const temp = next[index] || '';
      const targetVal = next[target] || '';
      if (targetVal) next[index] = targetVal;
      else delete next[index];
      if (temp) next[target] = temp;
      else delete next[target];
      return next;
    });
    setSceneDiffs({});
    setScriptConfirmed(false);
  };

  const regenerateOneScene = (index: number) => {
    const motions: MotionType[] = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'parallax', 'rotate-showcase'];
    const lights: LightingEffect[] = ['studio-glow', 'warm-gold', 'neon-rim', 'clean'];
    const transitions: TransitionType[] = ['fade', 'slide', 'zoom-cut'];
    const hl = selectedProduct?.highlights || [];
    const altText = hl.length > 0 ? hl[(index + 1) % hl.length] : selectedProduct?.description || selectedProduct?.name || title.trim() || 'Trải nghiệm nổi bật';
    updateScene(index, {
      narration: `Góc nhìn mới cho ${selectedProduct?.name || title.trim() || 'sản phẩm'}: ${altText}.`,
      onScreenText: altText.slice(0, 60),
      motionType: motions[(index + 2) % motions.length],
      lightingEffect: lights[(index + 1) % lights.length],
      transitionType: transitions[(index + 1) % transitions.length],
    });
    setMessage(`Đã tạo lại gợi ý cho Phân cảnh ${index + 1}.`);
  };

  const testVoicePreview = async () => {
    setTtsNotice('');
    const sample = scenes[0]?.narration || `Xin chào, đây là giọng đọc thử cho ${selectedProduct?.name || title}.`;
    try {
      const res = await api<{ available: boolean; reason?: string; audioBase64?: string; mimeType?: string }>('/api/ai/tts', 'POST', {
        text: sample,
        voice: voiceConfig.voice,
        speed: voiceConfig.speed,
      });
      if (res.available && res.audioBase64) {
        const audio = new Audio(`data:${res.mimeType || 'audio/wav'};base64,${res.audioBase64}`);
        audio.playbackRate = voiceConfig.speed;
        void audio.play();
        setTtsNotice('Đang phát thử giọng đọc Gemini AI.');
        return;
      }
      setTtsNotice(res.reason || 'Dịch vụ Gemini TTS chưa sẵn sàng.');
    } catch (e) {
      setTtsNotice(e instanceof Error ? e.message : 'Không kiểm tra được dịch vụ TTS.');
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(sample);
      utter.lang = language === 'en' ? 'en-US' : 'vi-VN';
      utter.rate = voiceConfig.speed;
      window.speechSynthesis.speak(utter);
    }
  };

  const saveProject = async (scenesOverride?: VideoScene[]): Promise<string> => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const run = (async () => {
      setSaving(true);
      setError('');
      try {
        const activeScenes = (scenesOverride || scenes).map((s, i) => ({
          ...s,
          sortOrder: i,
          durationSec: Math.min(30, Math.max(2, Number(s.durationSec) || 5)),
        }));
        const computedSec = activeScenes.length > 0
          ? Math.round(activeScenes.reduce((sum, s) => sum + getSceneDurationSec(s.durationSec), 0))
          : durationSec;
        const payload = {
          productId: productId || null,
          templateId: templateId || null,
          title: title.trim() || 'Dự án video mới',
          videoType,
          industry,
          targetAudience,
          style,
          durationSec: computedSec,
          aspectRatio,
          language,
          ctaText,
          voiceConfig,
          musicConfig,
          scenes: activeScenes,
        };
        const currentId = projectIdRef.current || projectId;
        if (currentId) {
          await api(`/api/projects/${currentId}`, 'PUT', payload);
          const refreshed = await api<{ scenes: VideoScene[]; sceneReviews?: SceneReview[] }>(`/api/projects/${currentId}`);
          setScenes(refreshed.scenes);
          setSceneReviews(Object.fromEntries((refreshed.sceneReviews || []).map(review => [review.sceneId, review])));
          setMessage('Đã lưu toàn bộ chỉnh sửa dự án.');
          return currentId;
        } else {
          const res = await api<{ id: string }>('/api/projects', 'POST', payload);
          projectIdRef.current = res.id;
          setProjectId(res.id);
          const refreshed = await api<{ scenes: VideoScene[]; sceneReviews?: SceneReview[] }>(`/api/projects/${res.id}`);
          setScenes(refreshed.scenes);
          setSceneReviews(Object.fromEntries((refreshed.sceneReviews || []).map(review => [review.sceneId, review])));
          setMessage('Đã lưu dự án video mới.');
          return res.id;
        }
      } finally {
        setSaving(false);
        savePromiseRef.current = null;
      }
    })();
    savePromiseRef.current = run;
    return run;
  };

  const renderSingleSceneCore = async (index: number, activeProjectId: string, savedScene: VideoScene): Promise<SceneReview> => {
    if (!savedScene.id) throw new Error('Không lấy được mã phân cảnh sau khi lưu dự án.');
    if (!savedScene.imageUrl && !savedScene.narration.trim() && !savedScene.onScreenText.trim()) {
      throw new Error(`Phân cảnh ${index + 1} chưa có ảnh hoặc nội dung.`);
    }
    const signature = getSceneSignature(savedScene);
    const voiceovers: VoiceoverTrack[] = [];
    if (voiceConfig.enabled && savedScene.narration.trim()) {
      if (typeof AudioContext === 'undefined') throw new Error('Trình duyệt không hỗ trợ giải mã âm thanh để tạo giọng đọc.');
      const tts = await api<{ available: boolean; reason?: string; audioBase64?: string }>('/api/ai/tts', 'POST', {
        text: savedScene.narration.trim(),
        voice: voiceConfig.voice,
        speed: voiceConfig.speed,
      });
      if (!tts.available || !tts.audioBase64) throw new Error(tts.reason || 'Dịch vụ giọng đọc chưa sẵn sàng.');
      const binary = atob(tts.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const audioContext = new AudioContext();
      try {
        const audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
        voiceovers.push({
          audioBuffer,
          startSec: 0,
          maxDurationSec: getSceneDurationSec(savedScene.durationSec),
          volume: 1,
          playbackRate: voiceConfig.speed,
        });
      } finally {
        await audioContext.close().catch(() => {});
      }
    }

    const sceneProduct = products.find(p => p.id === (savedScene.productId || productId));
    const sceneProductName = savedScene.productName || sceneProduct?.name || title;
    const result = await renderProjectVideo({
      scenes: [{ ...savedScene, productName: sceneProductName }],
      voiceovers,
      aspectRatio,
      resolution,
      productName: sceneProductName,
      ctaText: index === scenes.length - 1 ? ctaText : '',
      industry,
      musicConfig,
      onProgress: pct => setSceneRenderProgress(pct),
    });

    const form = new FormData();
    form.append('file', result.blob, `scene-${index + 1}-${Date.now()}.${result.format}`);
    form.append('sceneSignature', signature);
    form.append('resolution', resolution);
    const response = await fetch(`/api/projects/${activeProjectId}/scenes/${savedScene.id}/output`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    const uploaded = await response.json().catch(() => ({})) as SceneReview & { error?: string };
    if (!response.ok) throw new Error(uploaded.error || 'Không thể lưu video phân cảnh lên kho lưu trữ.');
    return uploaded;
  };

  const renderOneScene = async (index: number) => {
    const scene = scenes[index];
    if (!scene) return;
    if (!scene.imageUrl && !scene.onScreenText.trim() && !scene.narration.trim()) {
      setError(`Vui lòng tải/chọn ảnh hoặc nhập nội dung cho Phân cảnh ${index + 1} trước khi dựng.`);
      return;
    }
    setError('');
    setMessage('');
    setSceneRenderErrors(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setSceneRenderingIndex(index);
    setSceneRenderProgress(1);
    try {
      const activeProjectId = await saveProject();
      const saved = await api<{ scenes: VideoScene[] }>(`/api/projects/${activeProjectId}`);
      const savedScene = saved.scenes[index];
      if (!savedScene?.id) throw new Error('Không lấy được mã phân cảnh sau khi lưu dự án. Vui lòng thử lưu lại.');
      const uploaded = await renderSingleSceneCore(index, activeProjectId, savedScene);
      setSceneReviews(prev => ({ ...prev, [savedScene.id as string]: uploaded }));
      setMessage(`Đã dựng và lưu video riêng cho Phân cảnh ${index + 1} (${uploaded.format.toUpperCase()}). Hãy xem lại rồi bấm "Xác nhận phân cảnh".`);
    } catch (renderError) {
      const msg = renderError instanceof Error ? renderError.message : 'Không thể dựng video phân cảnh.';
      setSceneRenderErrors(prev => ({ ...prev, [index]: msg }));
      setError(`Lỗi dựng Phân cảnh ${index + 1}: ${msg}`);
    } finally {
      setSceneRenderingIndex(null);
      setSceneRenderProgress(0);
    }
  };

  const renderBatchScenes = async (mode: 'all' | 'failed' | 'missing' = 'all') => {
    if (scenes.length === 0) return;
    setError('');
    setMessage('');
    setBatchRendering(true);
    try {
      const activeProjectId = await saveProject();
      const saved = await api<{ scenes: VideoScene[]; sceneReviews?: SceneReview[] }>(`/api/projects/${activeProjectId}`);
      const reviewMap = Object.fromEntries((saved.sceneReviews || []).map(r => [r.sceneId, r]));
      const targetIndices = saved.scenes
        .map((s, idx) => ({ s, idx }))
        .filter(({ s, idx }) => {
          if (mode === 'failed') return Boolean(sceneRenderErrors[idx]);
          if (mode === 'missing') {
            const rev = s.id ? reviewMap[s.id] : undefined;
            return !rev || rev.status !== 'APPROVED' || rev.sceneSignature !== getSceneSignature(s);
          }
          return true;
        })
        .map(({ idx }) => idx);

      if (targetIndices.length === 0) {
        setMessage('Tất cả phân cảnh đều đã dựng và khớp với kịch bản mới nhất.');
        return;
      }

      let successCount = 0;
      let failCount = 0;
      for (let i = 0; i < targetIndices.length; i++) {
        const idx = targetIndices[i];
        const savedScene = saved.scenes[idx];
        setSceneRenderingIndex(idx);
        setSceneRenderProgress(1);
        setBatchProgressText(`Đang dựng hàng loạt: Phân cảnh ${idx + 1} (${i + 1}/${targetIndices.length})...`);
        try {
          const uploaded = await renderSingleSceneCore(idx, activeProjectId, savedScene);
          setSceneReviews(prev => ({ ...prev, [savedScene.id as string]: uploaded }));
          setSceneRenderErrors(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
          successCount++;
        } catch (err) {
          failCount++;
          const msg = err instanceof Error ? err.message : 'Dựng cảnh thất bại.';
          setSceneRenderErrors(prev => ({ ...prev, [idx]: msg }));
        }
      }

      if (failCount === 0) {
        setMessage(`Đã dựng xong ${successCount} phân cảnh! Hãy xem lại và bấm "Xác nhận phân cảnh" trên từng cảnh rồi ghép video hoàn chỉnh.`);
      } else {
        setError(`Đã dựng xong ${successCount} cảnh, có ${failCount} cảnh lỗi. Bạn có thể bấm "Thử lại cảnh lỗi" mà không làm mất các cảnh đã xong.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể khởi chạy dựng hàng loạt.');
    } finally {
      setSceneRenderingIndex(null);
      setSceneRenderProgress(0);
      setBatchRendering(false);
      setBatchProgressText('');
    }
  };

  const approveScene = async (scene: VideoScene, status: 'PENDING' | 'APPROVED') => {
    if (!projectId || !scene.id) {
      setError('Vui lòng lưu dự án trước khi xác nhận phân cảnh.');
      return;
    }
    const signature = getSceneSignature(scene);
    try {
      const result = await api<{ sceneId: string; status: 'PENDING' | 'APPROVED'; sceneSignature: string }>(
        `/api/projects/${projectId}/scenes/${scene.id}/review`,
        'PATCH',
        { status, sceneSignature: signature }
      );
      setSceneReviews(prev => ({
        ...prev,
        [result.sceneId]: { ...prev[result.sceneId], sceneId: result.sceneId, status: result.status, sceneSignature: signature } as SceneReview,
      }));
      setMessage(status === 'APPROVED' ? 'Đã xác nhận phân cảnh.' : 'Đã chuyển phân cảnh về trạng thái chờ kiểm duyệt.');
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Không thể cập nhật trạng thái duyệt.');
    }
  };

  const downloadVideoFile = async (url: string, baseName: string) => {
    if (!url) return;
    setDownloadBusy(true);
    setError('');
    try {
      const parsedUrl = new URL(url, window.location.origin);
      if ((parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') && parsedUrl.origin !== window.location.origin) {
        window.open(parsedUrl.toString(), '_blank', 'noopener,noreferrer');
        return;
      }
      if (parsedUrl.pathname.startsWith('/api/media/project-video/')) {
        parsedUrl.searchParams.set('download', '1');
      }
      const response = await fetch(parsedUrl.toString(), { credentials: 'include' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `Không thể tải video (HTTP ${response.status}).`);
      }
      const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!mimeType.startsWith('video/')) {
        const responseText = await response.text().catch(() => '');
        throw new Error(responseText.includes('<html') || mimeType.includes('text/html')
          ? 'Máy chủ trả về trang HTML thay vì tệp video. Vui lòng tải lại dự án hoặc liên hệ quản trị hệ thống.'
          : `Định dạng máy chủ trả về không phải video (${mimeType || 'không xác định'}).`);
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('Tệp video tải về bị rỗng.');
      const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('webm') ? 'webm' : 'video';
      const safeBaseName = baseName.replace(/\\.(mp4|webm)$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'product-video';
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `${safeBaseName}.${extension}`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Không thể tải tệp video.');
    } finally {
      setDownloadBusy(false);
    }
  };

  const handleRenderMp4 = async () => {
    if (scenes.length === 0) {
      setError('Vui lòng tạo kịch bản hoặc thêm ít nhất 1 phân cảnh trước khi ghép video.');
      return;
    }
    if (!scriptConfirmed) {
      setError('Vui lòng nhấn "Xác nhận kịch bản" ở Mục 2 trước khi ghép video hoàn chỉnh.');
      return;
    }
    if (!allScenesApproved) {
      setError(
        `Chưa thể ghép video hoàn chỉnh: mới có ${sceneStats.approved}/${scenes.length} phân cảnh được dựng & xác nhận. Hãy dựng và bấm "Xác nhận phân cảnh" cho toàn bộ các cảnh còn lại.`
      );
      return;
    }

    const emptyIdx = scenes.findIndex(
      scene => !scene.imageUrl && !scene.aiVideoUrl && !scene.narration.trim() && !scene.onScreenText.trim()
    );
    if (emptyIdx >= 0) {
      setError(`Phân cảnh ${emptyIdx + 1} chưa có ảnh hoặc nội dung. Vui lòng tải ảnh hoặc nhập chữ/lời thoại cho phân cảnh này.`);
      return;
    }

    const normalizedTotalSec = Math.round(scenes.reduce((sum, s) => sum + getSceneDurationSec(s.durationSec), 0));
    if (normalizedTotalSec > maxAllowedDuration) {
      setError(`Tổng thời lượng các phân cảnh (${normalizedTotalSec}s) vượt quá giới hạn tối đa ${maxAllowedDuration}s của tài khoản. Vui lòng giảm bớt thời lượng hoặc số phân cảnh.`);
      return;
    }

    setError('');
    setMessage('');
    setRendering(true);
    setRenderPercent(1);
    setRenderStage('Đang lưu kịch bản & đồng bộ dự án...');
    if (renderedVideo?.url) {
      URL.revokeObjectURL(renderedVideo.url);
      setRenderedVideo(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let activeProjectId = projectIdRef.current || projectId;
    let activeJobId = '';

    try {
      activeProjectId = await saveProject();
      const jobRes = await api<{ jobId: string }>(`/api/projects/${activeProjectId}/jobs`, 'POST', {
        resolution,
        format: 'mp4',
      });
      activeJobId = jobRes.jobId;

      const latestSnapshot = await api<{ scenes: VideoScene[]; sceneReviews?: SceneReview[] }>(`/api/projects/${activeProjectId}`);
      const activeScenes = latestSnapshot.scenes.length > 0 ? latestSnapshot.scenes : scenes;

      const voiceovers: VoiceoverTrack[] = [];
      if (voiceConfig.enabled) {
        if (typeof AudioContext === 'undefined') throw new Error('Trình duyệt không hỗ trợ giải mã âm thanh để ghép giọng đọc.');
        const audioContext = new AudioContext();
        let sceneStartSec = 0;
        try {
          for (let i = 0; i < activeScenes.length; i++) {
            if (controller.signal.aborted) throw new Error('RENDER_CANCELLED');
            const sceneDur = getSceneDurationSec(activeScenes[i].durationSec);
            const narration = activeScenes[i].narration.trim();
            if (narration) {
              setRenderStage(`Đang tạo giọng đọc cho Phân cảnh ${i + 1}/${activeScenes.length}...`);
              setRenderPercent(Math.min(15, 3 + Math.round((i / Math.max(1, activeScenes.length)) * 12)));
              const tts = await api<{ available: boolean; reason?: string; audioBase64?: string; mimeType?: string }>('/api/ai/tts', 'POST', {
                text: narration,
                voice: voiceConfig.voice,
                speed: voiceConfig.speed,
              });
              if (!tts.available || !tts.audioBase64) {
                throw new Error(
                  `Giọng đọc AI chưa sẵn sàng (${tts.reason || 'chưa cấu hình Gemini TTS'}). Bạn có thể tắt Giọng đọc ở Mục 3 để ghép video với nhạc nền và phụ đề.`
                );
              }
              const binary = atob(tts.audioBase64);
              const bytes = new Uint8Array(binary.length);
              for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
              const audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
              voiceovers.push({
                audioBuffer,
                startSec: sceneStartSec,
                maxDurationSec: sceneDur,
                volume: 1,
                playbackRate: voiceConfig.speed,
              });
            }
            sceneStartSec += sceneDur;
          }
        } finally {
          await audioContext.close().catch(() => {});
        }
      }

      // Render deterministic high-resolution H.264/AAC composite cleanly across all scenes
      // (while preserving external USER_VIDEO / AI_VIDEO clips when present).
      const exportScenes = activeScenes.map(scene => {
        const hasExternalVideo = Boolean(scene.aiVideoUrl && (scene.sourceType === 'USER_VIDEO' || scene.sourceType === 'AI_VIDEO'));
        return {
          ...scene,
          renderedClip: hasExternalVideo,
          aiVideoUrl: hasExternalVideo ? scene.aiVideoUrl : null,
        };
      });

      const result = await renderProjectVideo({
        scenes: exportScenes,
        voiceovers,
        aspectRatio,
        resolution,
        productName: selectedProduct?.name || title.trim() || 'AI Product Video',
        ctaText,
        industry,
        musicConfig,
        signal: controller.signal,
        onProgress: (pct, text) => {
          setRenderPercent(pct);
          setRenderStage(text);
        },
      });

      let persistentVideoUrl = '';
      let storageProvider = '';
      let uploadWarning = '';
      try {
        setRenderStage('Đang lưu video thành phẩm lên hệ thống lưu trữ...');
        const uploadForm = new FormData();
        uploadForm.append('file', result.blob, `${activeProjectId}-${Date.now()}.${result.format}`);
        const uploadResponse = await fetch(`/api/projects/${activeProjectId}/jobs/${activeJobId}/upload`, {
          method: 'POST',
          credentials: 'include',
          body: uploadForm,
        });
        const uploadResult = await uploadResponse.json().catch(() => ({})) as { outputFileUrl?: string; storageProvider?: string; error?: string };
        if (!uploadResponse.ok) throw new Error(uploadResult.error || 'Không thể lưu video lên kho lưu trữ.');
        persistentVideoUrl = uploadResult.outputFileUrl || '';
        storageProvider = uploadResult.storageProvider || '';
        if (persistentVideoUrl) setSavedOutputUrl(persistentVideoUrl);
      } catch (uploadError) {
        uploadWarning = uploadError instanceof Error ? uploadError.message : 'Lưu trữ máy chủ thất bại.';
      }

      await api(`/api/projects/${activeProjectId}/jobs/${activeJobId}`, 'PATCH', {
        status: 'COMPLETED',
        progress: 100,
        fileSizeBytes: result.fileSizeBytes,
        format: result.format,
        resolution,
      });

      const blobUrl = URL.createObjectURL(result.blob);
      setRenderedVideo({ url: blobUrl, result });
      setMessage(
        `Ghép & xuất video ${result.format.toUpperCase()} (${result.width}×${result.height}, ${formatBytes(result.fileSizeBytes)}) thành công!` +
          (persistentVideoUrl
            ? ` Đã lưu bền vững (${storageProvider === 'imagekit' ? 'ImageKit' : 'nội bộ dự án'}) để phát và tải lại sau khi tải lại trang.`
            : uploadWarning
              ? ` Video tải xuống ngay trên trình duyệt (lưu ý máy chủ: ${uploadWarning}).`
              : '')
      );
    } catch (e) {
      const isCancelled = e instanceof Error && e.message === 'RENDER_CANCELLED';
      const errMsg = isCancelled
        ? 'Người dùng đã hủy quá trình dựng video.'
        : e instanceof Error
          ? e.message
          : 'Ghép video hoàn chỉnh thất bại.';
      if (activeProjectId && activeJobId) {
        await api(`/api/projects/${activeProjectId}/jobs/${activeJobId}`, 'PATCH', {
          status: isCancelled ? 'CANCELLED' : 'FAILED',
          progress: renderPercent,
          errorMessage: errMsg,
        }).catch(() => {});
      }
      setError(errMsg);
    } finally {
      setRendering(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <span className="eyebrow">AI VIDEO STUDIO</span>
          <h1>Không gian tạo & chỉnh sửa video sản phẩm</h1>
          <p>Quy trình 5 bước rõ ràng: thông số sản phẩm, AI viết kịch bản, xác nhận kịch bản, tách nền studio 2.5D từng cảnh và ghép video hoàn chỉnh.</p>
        </div>
        <div className="btn-row">
          <button type="button" className="secondary-btn" onClick={onGoMyVideos}>
            Video của tôi
          </button>
          <button type="button" className="primary-btn" disabled={saving || rendering || batchRendering} onClick={() => saveProject().catch(e => setError(e.message))}>
            <Save size={15} /> {saving ? 'Đang lưu...' : 'Lưu dự án'}
          </button>
        </div>
      </div>

      {/* Guided 5-stage progress stepper */}
      <nav className="studio-stepper" aria-label="Tiến trình sản xuất video">
        {[
          { num: 1, label: 'Sản phẩm & Thông số', done: Boolean(selectedProduct || title.trim()) && scenes.length > 0 },
          { num: 2, label: 'Phân tích & Kịch bản', done: scenes.length > 0 },
          { num: 3, label: 'Xác nhận kịch bản', done: scriptConfirmed },
          { num: 4, label: 'Studio & Dựng cảnh', done: scenes.length > 0 && sceneStats.approved === scenes.length },
          { num: 5, label: 'Ghép & Xuất hoàn chỉnh', done: Boolean(renderedVideo || savedOutputUrl) },
        ].map(step => (
          <div
            key={step.num}
            className={`studio-step-item ${activeWorkflowStep === step.num ? 'is-current' : ''} ${step.done ? 'is-done' : ''}`}
          >
            <span className="studio-step-num">{step.done ? <Check size={13} /> : step.num}</span>
            <span className="studio-step-label">{step.label}</span>
          </div>
        ))}
      </nav>

      {(error || message) && <div className={error ? 'banner-alert error' : 'banner-alert'}>{error || message}</div>}

      <div className="studio-grid">
        {/* LEFT: Configuration + Script + Scene Studio */}
        <div className="studio-editor-col">
          <section className="panel-card">
            <h3>1. Sản phẩm & Thông số video</h3>
            {productsLoading ? (
              <div className="info-strip" style={{ marginBottom: 12 }}>Đang đồng bộ danh sách sản phẩm...</div>
            ) : products.length === 0 ? (
              <div className="info-strip" style={{ marginBottom: 12 }}>
                <span>
                  Bạn đang ở chế độ tạo video linh hoạt: nhập tiêu đề và tải ảnh riêng cho từng phân cảnh ở Mục 2, hoặc{' '}
                  <button type="button" className="inline-link-btn" onClick={onGoProducts}>tạo sản phẩm trong Quản lý sản phẩm</button> để dùng lại kho ảnh & phân tích AI.
                </span>
              </div>
            ) : null}

            <div className="form-grid-2">
              <label className="field-label">
                Sản phẩm gắn kết (tùy chọn)
                <select
                  value={productId}
                  onChange={e => {
                    const prevProd = selectedProduct;
                    const nextId = e.target.value;
                    setProductId(nextId);
                    const prod = products.find(p => p.id === nextId);
                    if (prod) {
                      setIndustry(prod.industry);
                      if (!title.trim() || title === 'Video sản phẩm mới' || (prevProd && title === `Video ${prevProd.name}`)) {
                        setTitle(`Video ${prod.name}`);
                      }
                    }
                  }}
                >
                  <option value="">Video độc lập (tự cung cấp ảnh & nội dung theo phân cảnh)</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.images.length} ảnh)
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Tiêu đề dự án
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Bộ ảnh giới thiệu sản phẩm mới" />
              </label>
              <label className="field-label">
                Loại / Chủ đề video
                <select value={videoType} onChange={e => setVideoType(e.target.value)}>
                  {(topics.length ? topics.map(topic => topic.name) : VIDEO_TYPES).map(vt => (
                    <option key={vt} value={vt}>
                      {vt}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Ngành hàng
                <select value={industry} onChange={e => setIndustry(e.target.value)}>
                  {industries.map(ind => (
                    <option key={ind.id} value={ind.name}>
                      {ind.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Mẫu tham khảo
                <select
                  value={templateId}
                  onChange={e => {
                    const tpl = templates.find(t => t.id === e.target.value);
                    setTemplateId(e.target.value);
                    if (tpl) {
                      setVideoType(tpl.videoType);
                      applyCustomDuration(tpl.suggestedDuration);
                    }
                  }}
                >
                  <option value="">Tùy chỉnh tự do</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.industry})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Tỷ lệ khung hình
                <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value as AspectRatio)}>
                  {RATIOS.map(r => (
                    <option key={r} value={r}>
                      {r} {r === '9:16' ? '(TikTok / Reels)' : r === '16:9' ? '(YouTube / Web)' : r === '1:1' ? '(Vuông)' : '(Feed 4:5)'}
                    </option>
                  ))}
                </select>
              </label>

              {/* Custom numeric duration input (4s .. maxCustomDuration, default 30s) */}
              <div className="field-label">
                <span>Thời lượng mục tiêu (4s – {maxCustomDuration}s)</span>
                <div className="duration-input-row">
                  <input
                    type="number"
                    aria-label="Thời lượng mục tiêu (giây)"
                    min={4}
                    max={maxCustomDuration}
                    step={1}
                    value={durationDraft}
                    onChange={e => {
                      setDurationDraft(e.target.value);
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 4 && v <= maxCustomDuration) {
                        setDurationSec(Math.round(v));
                      }
                    }}
                    onBlur={() => applyCustomDuration(durationDraft, scenes.length > 0)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyCustomDuration(durationDraft, scenes.length > 0);
                      }
                    }}
                  />
                  <span className="duration-unit">giây</span>
                </div>
                <div className="duration-presets">
                  {QUICK_DURATIONS.filter(d => d <= maxCustomDuration).map(d => (
                    <button
                      key={d}
                      type="button"
                      className={durationSec === d ? 'duration-chip active' : 'duration-chip'}
                      onClick={() => applyCustomDuration(d, scenes.length > 0)}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              <label className="field-label">
                Ngôn ngữ
                <select value={language} onChange={e => setLanguage(e.target.value as 'vi' | 'en')}>
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>

            <div className="form-grid-2">
              <label className="field-label">
                Đối tượng khách hàng
                <input value={targetAudience} onChange={e => setTargetAudience(e.target.value)} />
              </label>
              <label className="field-label">
                Lời kêu gọi hành động (CTA cuối video)
                <input
                  value={ctaText}
                  onChange={e => {
                    setCtaText(e.target.value);
                    setScriptConfirmed(false);
                  }}
                />
              </label>
            </div>
            <label className="field-label">
              Phong cách truyền thông
              <input value={style} onChange={e => setStyle(e.target.value)} />
            </label>

            {/* Selected Product AI Insights & Image Roles Strip */}
            {selectedProduct && (
              <div className="product-studio-brief">
                <div className="product-studio-brief-head">
                  <div>
                    <strong>Tư liệu sản phẩm: {selectedProduct.name}</strong>
                    <small className="muted-copy">
                      {selectedProduct.images.length} ảnh gốc ·{' '}
                      {selectedProduct.aiAnalysis
                        ? `Phân tích (${selectedProduct.aiAnalysis.mode === 'gemini' ? selectedProduct.aiAnalysis.model : 'Cấu trúc miễn phí'})`
                        : 'Chưa phân tích AI'}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={analyzingProduct}
                    onClick={() => void runQuickProductAnalysis()}
                  >
                    {analyzingProduct ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                    {analyzingProduct ? 'Đang phân tích...' : selectedProduct.aiAnalysis ? 'Phân tích lại' : 'AI Phân tích sản phẩm'}
                  </button>
                </div>

                {selectedProduct.images.length > 0 && (
                  <div className="product-role-strip">
                    {selectedProduct.images.slice(0, 6).map((im, idx) => {
                      const roleList: SceneRole[] = ['intro', 'usp', 'detail', 'lifestyle', 'cta', 'showcase'];
                      const suggestedRole = selectedProduct.aiAnalysis?.aiSuggestions?.sceneRoles?.[idx] || SCENE_ROLE_LABELS[roleList[idx % roleList.length]];
                      return (
                        <div key={im.id} className="product-role-chip">
                          <img src={im.imageUrl} alt={im.fileName} />
                          <div>
                            <b>Ảnh {idx + 1}</b>
                            <small>{suggestedRole}</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedProduct.aiAnalysis && (
                  <div className="product-usp-strip">
                    <span><b>Tóm tắt:</b> {selectedProduct.aiAnalysis.visualSummary}</span>
                    {selectedProduct.aiAnalysis.aiSuggestions.uspIdeas.length > 0 && (
                      <span><b>USP gợi ý:</b> {selectedProduct.aiAnalysis.aiSuggestions.uspIdeas.slice(0, 3).join(' · ')}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="panel-card">
            <div className="panel-card-head wrap">
              <div>
                <h3>2. AI Kịch bản & Studio từng phân cảnh ({scenes.length} cảnh · {totalScenesDuration.toFixed(1)}s)</h3>
                <small className="muted-copy">
                  Chỉnh sửa kịch bản, xác nhận kịch bản trước khi dựng hàng loạt, hoặc tách nền & dựng từng cảnh độc lập.
                </small>
              </div>
              <div className="btn-row">
                <button type="button" className="secondary-btn" onClick={addEmptyScene}>
                  <Plus size={14} /> Thêm phân cảnh
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  disabled={scriptBusy || (!productId && !title.trim())}
                  aria-busy={scriptBusy}
                  onClick={generateScripts}
                >
                  {scriptBusy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                  {scriptBusy ? 'Đang tạo kịch bản...' : 'AI Viết kịch bản'}
                </button>
              </div>
            </div>

            {!productId && !title.trim() && (
              <div className="warning-strip">
                <AlertTriangle size={16} />
                <span>Vui lòng nhập tiêu đề dự án hoặc chọn một sản phẩm ở mục 1 để bật AI Viết kịch bản.</span>
              </div>
            )}

            {scriptError && <div className="banner-alert error" role="alert">{scriptError}</div>}
            {scriptNote && (
              <div className={scriptNoteType === 'warning' ? 'warning-strip' : 'info-strip'}>
                {scriptNoteType === 'warning' && <AlertTriangle size={16} />}
                <span>{scriptNote}</span>
              </div>
            )}

            {scenes.length > 0 && Math.abs(totalScenesDuration - durationSec) >= 1 && (
              <div className="warning-strip duration-sync-strip">
                <AlertTriangle size={16} />
                <div>
                  <span>
                    Tổng thời lượng các phân cảnh hiện là <b>{totalScenesDuration.toFixed(1)}s</b>, khác với mục tiêu <b>{durationSec}s</b>.
                  </span>
                </div>
                <button type="button" className="secondary-btn" onClick={balanceScenesToTargetDuration}>
                  Cân bằng về {durationSec}s
                </button>
              </div>
            )}

            {variants.length > 1 && (
              <div className="variant-tabs">
                {variants.map((v, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={activeVariantIdx === i}
                    className={activeVariantIdx === i ? 'variant-tab active' : 'variant-tab'}
                    onClick={() => {
                      setActiveVariantIdx(i);
                      applyVariant(v, selectedProduct, true);
                    }}
                  >
                    <strong>{v.variantName}</strong>
                    <small>{v.hookSummary}</small>
                  </button>
                ))}
              </div>
            )}

            {/* Script Confirmation & Batch Scene Render Gate */}
            {scenes.length > 0 && (
              <div className={`script-approval-bar ${scriptConfirmed ? 'is-confirmed' : 'is-pending'}`}>
                <div className="script-approval-info">
                  <strong>
                    {scriptConfirmed ? (
                      <>
                        <CheckCircle2 size={16} /> Đã xác nhận kịch bản ({scenes.length} phân cảnh · {totalScenesDuration.toFixed(1)}s)
                      </>
                    ) : (
                      <>
                        <Layers size={16} /> Trạng thái kịch bản: Chưa duyệt kịch bản
                      </>
                    )}
                  </strong>
                  <small>
                    {scriptConfirmed
                      ? 'Bạn có thể dựng video từng phân cảnh, dựng hàng loạt hoặc xác nhận toàn bộ phân cảnh trước khi ghép.'
                      : 'Kiểm tra lời thoại, chữ trên màn hình, vai trò ảnh và nhấn "Xác nhận kịch bản" khi sẵn sàng.'}
                  </small>
                </div>
                <div className="btn-row">
                  <button
                    type="button"
                    className={scriptConfirmed ? 'secondary-btn' : 'primary-btn'}
                    onClick={() => {
                      setScriptConfirmed(prev => !prev);
                      if (!scriptConfirmed) {
                        setMessage('Đã xác nhận kịch bản. Bạn có thể dựng toàn bộ phân cảnh hoặc từng phân cảnh.');
                      }
                    }}
                  >
                    <Check size={14} /> {scriptConfirmed ? 'Mở khóa chỉnh sửa kịch bản' : 'Xác nhận kịch bản'}
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={batchRendering || sceneRenderingIndex !== null || rendering}
                    onClick={() => void renderBatchScenes('all')}
                  >
                    {batchRendering ? <Loader2 size={14} className="spin" /> : <Film size={14} />}
                    {batchRendering ? 'Đang dựng hàng loạt...' : 'Dựng toàn bộ phân cảnh'}
                  </button>
                  {sceneStats.failed > 0 && (
                    <button
                      type="button"
                      className="secondary-btn danger-outline"
                      disabled={batchRendering || sceneRenderingIndex !== null}
                      onClick={() => void renderBatchScenes('failed')}
                    >
                      <RefreshCw size={14} /> Thử lại cảnh lỗi ({sceneStats.failed})
                    </button>
                  )}
                </div>
              </div>
            )}

            {batchProgressText && (
              <div className="info-strip" style={{ marginTop: 10 }}>
                <Loader2 size={14} className="spin" style={{ display: 'inline', marginRight: 6 }} />
                {batchProgressText}
              </div>
            )}

            {scenes.some(s => s.sourceType !== 'REAL_PRODUCT') && ['Unboxing', 'Before & After', 'Product Review'].includes(videoType) && (
              <div className="warning-strip">
                <AlertTriangle size={16} />
                <span>
                  Lưu ý minh bạch: Phân cảnh sử dụng media mô phỏng AI sẽ tự động hiển thị nhãn <b>"Mô phỏng AI"</b> trên video để người xem không hiểu nhầm là trải nghiệm thực tế.
                </span>
              </div>
            )}

            {scenes.length === 0 ? (
              <div className="empty-box compact">
                <p>Chưa có phân cảnh nào. Nhấn "AI Viết kịch bản" hoặc "Thêm phân cảnh" để bắt đầu.</p>
              </div>
            ) : (
              <div className="scenes-list">
                {scenes.map((scene, idx) => {
                  const sceneProductId = scene.productId || productId;
                  const sceneProduct = products.find(p => p.id === sceneProductId) || null;
                  const sceneProductImages = sceneProduct?.images || [];
                  const hasCustomStandaloneUrl = Boolean(scene.imageUrl) && !sceneProductImages.some(im => im.imageUrl === scene.imageUrl);
                  const stage = scene.stageConfig || {};
                  const isCutoutMode = stage.bgMode === 'cutout-studio';

                  const review = scene.id ? sceneReviews[scene.id] : undefined;
                  const signatureMatches = review ? review.sceneSignature === getSceneSignature(scene) : false;
                  const renderError = sceneRenderErrors[idx];
                  const isRenderingThis = sceneRenderingIndex === idx;

                  let sceneStatusLabel = 'Chưa dựng';
                  let sceneStatusClass = 'scene-status-pill is-idle';
                  if (isRenderingThis) {
                    sceneStatusLabel = `Đang dựng ${sceneRenderProgress}%`;
                    sceneStatusClass = 'scene-status-pill is-rendering';
                  } else if (renderError) {
                    sceneStatusLabel = 'Dựng thất bại';
                    sceneStatusClass = 'scene-status-pill is-error';
                  } else if (review && !signatureMatches) {
                    sceneStatusLabel = 'Cần chỉnh sửa / Dựng lại';
                    sceneStatusClass = 'scene-status-pill is-stale';
                  } else if (review && review.status === 'APPROVED') {
                    sceneStatusLabel = 'Đã xác nhận';
                    sceneStatusClass = 'scene-status-pill is-approved';
                  } else if (review) {
                    sceneStatusLabel = 'Chờ kiểm duyệt';
                    sceneStatusClass = 'scene-status-pill is-review';
                  }

                  const diff = sceneDiffs[idx];
                  const isExpandedScene = activeSceneIndex === idx;

                  return (
                    <div key={`v${activeVariantIdx}-${scene.id || idx}`} className={`scene-card${isExpandedScene ? ' is-expanded' : ''}`}>
                      <div className="scene-card-head wrap">
                        <button
                          type="button"
                          className="scene-card-toggle"
                          aria-expanded={isExpandedScene}
                          onClick={() => setActiveSceneIndex(isExpandedScene ? -1 : idx)}
                        >
                          <span className="scene-card-title-group">
                            <strong>Phân cảnh {idx + 1}</strong>
                            {scene.sceneTitle && <span className="scene-subtitle-tag">{scene.sceneTitle}</span>}
                            <span className={sceneStatusClass}>{sceneStatusLabel}</span>
                          </span>
                          <span className="scene-expand-indicator" aria-hidden="true">{isExpandedScene ? '−' : '+'}</span>
                        </button>
                        <div className="scene-head-actions">
                          <button type="button" title="Xem trước phân cảnh này" onClick={() => seekToScene(idx)}>
                            <Eye size={13} />
                          </button>
                          <button type="button" title="Tạo lại gợi ý phân cảnh" onClick={() => regenerateOneScene(idx)}>
                            <RefreshCw size={13} />
                          </button>
                          <button type="button" title="Lên" disabled={idx === 0} onClick={() => moveScene(idx, -1)}>
                            <ArrowUp size={13} />
                          </button>
                          <button type="button" title="Xuống" disabled={idx === scenes.length - 1} onClick={() => moveScene(idx, 1)}>
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            title="Xóa phân cảnh"
                            onClick={() => setDeleteSceneIndex(idx)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {isExpandedScene && (
                        <div className="scene-card-body">
                      <div className="form-grid-2">
                        <label className="field-label">
                          Sản phẩm của phân cảnh
                          <select
                            value={scene.productId || productId}
                            onChange={e => {
                              const nextId = e.target.value;
                              const nextProduct = products.find(p => p.id === nextId);
                              updateScene(idx, {
                                productId: nextId || null,
                                productName: nextProduct?.name || title.trim() || '',
                                imageId: nextProduct?.images[0]?.id || null,
                                imageUrl: nextProduct?.images[0]?.imageUrl || '',
                                sourceType: 'REAL_PRODUCT',
                              });
                            }}
                          >
                            <option value="">Độc lập (không gắn sản phẩm)</option>
                            {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                          </select>
                        </label>

                        <label className="field-label">
                          Vai trò phân cảnh
                          <select
                            value={scene.sceneRole || 'showcase'}
                            onChange={e => updateScene(idx, { sceneRole: e.target.value as SceneRole })}
                          >
                            {Object.entries(SCENE_ROLE_LABELS).map(([k, lbl]) => (
                              <option key={k} value={k}>{lbl}</option>
                            ))}
                          </select>
                        </label>

                        <label className="field-label">
                          Chữ hiển thị trên màn hình
                          <input value={scene.onScreenText} onChange={e => updateScene(idx, { onScreenText: e.target.value })} />
                          <span className="switch-inline">
                            <input type="checkbox" checked={scene.showOnScreenText !== false} onChange={e => updateScene(idx, { showOnScreenText: e.target.checked })} />
                            <span>{scene.showOnScreenText === false ? 'Đang ẩn chữ trên video' : 'Hiển thị chữ trên video'}</span>
                          </span>
                        </label>

                        <label className="field-label">
                          Thời lượng (giây){editedDurationIndices.has(idx) ? ' · Đã khóa tay' : ''}
                          <input
                            type="number"
                            aria-label={`Thời lượng Phân cảnh ${idx + 1}`}
                            min={2}
                            max={30}
                            step={0.5}
                            value={scene.durationSec || ''}
                            onChange={e => {
                              setEditedDurationIndices(prev => new Set(prev).add(idx));
                              updateScene(idx, { durationSec: e.target.value === '' ? 0 : Math.min(30, Math.max(2, Number(e.target.value) || 0)) });
                            }}
                            onBlur={() => updateScene(idx, { durationSec: Math.min(30, Math.max(2, Number(scene.durationSec) || 2)) })}
                          />
                        </label>
                      </div>

                      {scene.showOnScreenText !== false && (
                        <div className="scene-text-style-bar">
                          <label className="field-label">
                            Cỡ chữ
                            <select
                              aria-label={`Cỡ chữ Phân cảnh ${idx + 1}`}
                              value={stage.textConfig?.size || 'md'}
                              onChange={e =>
                                updateSceneStage(idx, {
                                  textConfig: { ...(stage.textConfig || {}), size: e.target.value as 'sm' | 'md' | 'lg' },
                                })
                              }
                            >
                              <option value="sm">Nhỏ</option>
                              <option value="md">Vừa</option>
                              <option value="lg">Lớn</option>
                            </select>
                          </label>
                          <label className="field-label">
                            Vị trí chữ
                            <select
                              aria-label={`Vị trí chữ Phân cảnh ${idx + 1}`}
                              value={stage.textConfig?.position || 'bottom'}
                              onChange={e =>
                                updateSceneStage(idx, {
                                  textConfig: { ...(stage.textConfig || {}), position: e.target.value as 'top' | 'center' | 'bottom' },
                                })
                              }
                            >
                              <option value="top">Phía trên</option>
                              <option value="center">Chính giữa</option>
                              <option value="bottom">Phía dưới</option>
                            </select>
                          </label>
                          <label className="field-label">
                            Màu chữ
                            <div className="color-picker-inline">
                              <input
                                type="color"
                                aria-label={`Màu chữ Phân cảnh ${idx + 1}`}
                                value={stage.textConfig?.color || '#ffffff'}
                                onChange={e =>
                                  updateSceneStage(idx, {
                                    textConfig: { ...(stage.textConfig || {}), color: e.target.value },
                                  })
                                }
                              />
                              <span>{stage.textConfig?.color || 'Tự động'}</span>
                            </div>
                          </label>
                          <div className="field-label">
                            <span>Hiện chữ từ – đến (s)</span>
                            <div className="text-timing-inputs">
                              <input
                                type="number"
                                aria-label={`Bắt đầu hiện chữ Phân cảnh ${idx + 1}`}
                                min={0}
                                max={Math.max(1, getSceneDurationSec(scene.durationSec))}
                                step={0.5}
                                value={stage.textConfig?.startSec ?? 0}
                                onChange={e =>
                                  updateSceneStage(idx, {
                                    textConfig: { ...(stage.textConfig || {}), startSec: Math.max(0, Number(e.target.value) || 0) },
                                  })
                                }
                              />
                              <span>–</span>
                              <input
                                type="number"
                                aria-label={`Kết thúc hiện chữ Phân cảnh ${idx + 1}`}
                                min={0.5}
                                max={Math.max(1, getSceneDurationSec(scene.durationSec))}
                                step={0.5}
                                value={stage.textConfig?.endSec ?? getSceneDurationSec(scene.durationSec)}
                                onChange={e =>
                                  updateSceneStage(idx, {
                                    textConfig: {
                                      ...(stage.textConfig || {}),
                                      endSec: Math.min(getSceneDurationSec(scene.durationSec), Math.max(0.5, Number(e.target.value) || getSceneDurationSec(scene.durationSec))),
                                    },
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <label className="field-label">
                        Lời thoại / Phụ đề
                        <textarea
                          rows={2}
                          value={scene.narration}
                          onChange={e => updateScene(idx, { narration: e.target.value })}
                        />
                      </label>

                      <div className="scene-media-grid">
                        <div className="field-label scene-image-upload">
                          <label htmlFor={`scene-image-input-${idx}`}>Tải ảnh riêng cho phân cảnh</label>
                          <input
                            id={`scene-image-input-${idx}`}
                            className="scene-image-file-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                            disabled={uploadingSceneIndex !== null}
                            onChange={e => {
                              const input = e.currentTarget;
                              const file = input.files?.[0];
                              if (file) {
                                void uploadSceneImage(idx, file).finally(() => {
                                  input.value = '';
                                });
                              } else {
                                input.value = '';
                              }
                            }}
                          />
                          {scene.imageUrl && (
                            <div className="scene-image-inline-preview">
                              <img
                                src={scene.imageUrl}
                                alt={`Ảnh phân cảnh ${idx + 1}`}
                                crossOrigin={scene.imageUrl.startsWith('data:') || scene.imageUrl.startsWith('blob:') ? undefined : 'anonymous'}
                                referrerPolicy="no-referrer"
                              />
                              <span>Ảnh đang gắn cho phân cảnh {idx + 1}</span>
                            </div>
                          )}
                          <small className="muted-copy">
                            {uploadingSceneIndex === idx
                              ? 'Đang tải ảnh lên máy chủ...'
                              : 'JPG, PNG, WEBP · tối đa 5MB.'}
                          </small>
                        </div>

                        <label className="field-label">
                          Hình ảnh phân cảnh
                          <select
                            value={scene.imageUrl}
                            onChange={e => {
                              const img = sceneProductImages.find(im => im.imageUrl === e.target.value);
                              updateScene(idx, { imageUrl: e.target.value, imageId: img?.id || null });
                            }}
                          >
                            <option value="">Nền studio chữ</option>
                            {hasCustomStandaloneUrl && (
                              <option value={scene.imageUrl}>Ảnh riêng Phân cảnh {idx + 1}</option>
                            )}
                            {sceneProductImages.map((im, imIdx) => (
                              <option key={im.id} value={im.imageUrl}>
                                Ảnh {imIdx + 1}: {im.fileName.slice(0, 18)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="field-label">
                          Nguồn hình ảnh
                          <select
                            value={scene.sourceType}
                            onChange={e => updateScene(idx, { sourceType: e.target.value as VideoScene['sourceType'] })}
                          >
                            <option value="REAL_PRODUCT">Ảnh sản phẩm thực tế</option>
                            <option value="AI_GENERATED">Ảnh minh họa AI</option>
                            <option value="AI_VIDEO">Video AI mô phỏng</option>
                            <option value="USER_VIDEO">Cảnh quay thực tế</option>
                          </select>
                        </label>

                        <label className="field-label">
                          Chuyển động & Ánh sáng
                          <select
                            value={scene.motionType}
                            onChange={e => updateScene(idx, { motionType: e.target.value as MotionType })}
                          >
                            <option value="zoom-in">Zoom In (Tiến gần)</option>
                            <option value="zoom-out">Zoom Out (Lùi toàn cảnh)</option>
                            <option value="pan-left">Pan Trái</option>
                            <option value="pan-right">Pan Phải</option>
                            <option value="parallax">Parallax 2.5D</option>
                            <option value="rotate-showcase">Xoay nhẹ Showcase</option>
                          </select>
                        </label>
                      </div>

                      {/* Studio 2.5D & Background Cutout Staging */}
                      <div className="scene-studio-panel">
                        <div className="scene-studio-head">
                          <strong>
                            <SlidersHorizontal size={14} /> Studio Tách nền & Dựng sân khấu 2.5D (Trình duyệt)
                          </strong>
                          <div className="stage-mode-toggle">
                            <button
                              type="button"
                              className={!isCutoutMode ? 'mode-pill active' : 'mode-pill'}
                              onClick={() => updateSceneStage(idx, { bgMode: 'original' })}
                            >
                              Giữ ảnh gốc
                            </button>
                            <button
                              type="button"
                              className={isCutoutMode ? 'mode-pill active' : 'mode-pill'}
                              onClick={() => updateSceneStage(idx, { bgMode: 'cutout-studio' })}
                            >
                              Tách nền & Bục 2.5D
                            </button>
                          </div>
                        </div>

                        <div className="form-grid-4">
                          <label className="field-label">
                            Bối cảnh sân khấu
                            <select
                              value={stage.backdropStyle || 'auto-industry'}
                              onChange={e => updateSceneStage(idx, { backdropStyle: e.target.value as SceneBackdropStyle })}
                            >
                              {BACKDROP_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </label>
                          {stage.backdropStyle === 'solid-color' && (
                            <label className="field-label">
                              Màu nền đơn sắc
                              <div className="color-picker-inline">
                                <input
                                  type="color"
                                  aria-label={`Chọn màu nền Phân cảnh ${idx + 1}`}
                                  value={stage.customBgColor || '#ffffff'}
                                  onChange={e => updateSceneStage(idx, { customBgColor: e.target.value })}
                                />
                                <button type="button" className="swatch-dot" style={{ background: '#ffffff' }} title="Trắng" onClick={() => updateSceneStage(idx, { customBgColor: '#ffffff' })} />
                                <button type="button" className="swatch-dot" style={{ background: '#0f172a' }} title="Tối" onClick={() => updateSceneStage(idx, { customBgColor: '#0f172a' })} />
                                <button type="button" className="swatch-dot" style={{ background: '#e0f2fe' }} title="Xanh dịu" onClick={() => updateSceneStage(idx, { customBgColor: '#e0f2fe' })} />
                              </div>
                            </label>
                          )}
                          <label className="field-label">
                            Ánh sáng sân khấu
                            <select
                              value={stage.lightingPreset || 'soft-studio'}
                              onChange={e => updateSceneStage(idx, { lightingPreset: e.target.value as SceneLightingPreset })}
                            >
                              {LIGHTING_PRESET_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="field-label">
                            Hiệu ứng & Chuyển cảnh
                            <select
                              value={`${scene.lightingEffect}|${scene.transitionType}`}
                              onChange={e => {
                                const [lightingEffect, transitionType] = e.target.value.split('|');
                                updateScene(idx, {
                                  lightingEffect: lightingEffect as LightingEffect,
                                  transitionType: transitionType as TransitionType,
                                });
                              }}
                            >
                              <option value="studio-glow|fade">Studio Glow · Mờ dần</option>
                              <option value="warm-gold|slide">Ánh vàng · Trượt</option>
                              <option value="neon-rim|zoom-cut">Neon Rim · Zoom Cut</option>
                              <option value="clean|fade">Nền sáng · Mờ dần</option>
                            </select>
                          </label>
                          <label className="field-label">
                            Kích thước sản phẩm ({Math.round((stage.productScale ?? 1) * 100)}%)
                            <input
                              type="range"
                              min={0.65}
                              max={1.4}
                              step={0.05}
                              value={stage.productScale ?? 1}
                              onChange={e => updateSceneStage(idx, { productScale: Number(e.target.value) })}
                            />
                          </label>
                        </div>

                        <div className="form-grid-4">
                          {isCutoutMode && (
                            <label className="field-label">
                              Độ nhạy tách nền ({stage.cutoutSensitivity ?? 28})
                              <input
                                type="range"
                                min={12}
                                max={55}
                                step={2}
                                value={stage.cutoutSensitivity ?? 28}
                                onChange={e => updateSceneStage(idx, { cutoutSensitivity: Number(e.target.value) })}
                              />
                            </label>
                          )}
                          <label className="field-label">
                            Bóng đổ ({Math.round((stage.shadowIntensity ?? 0.65) * 100)}%)
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={stage.shadowIntensity ?? 0.65}
                              onChange={e => updateSceneStage(idx, { shadowIntensity: Number(e.target.value) })}
                            />
                          </label>
                          <label className="field-label">
                            Tốc độ camera ({(stage.motionSpeed ?? 1).toFixed(1)}x)
                            <input
                              type="range"
                              min={0.5}
                              max={1.6}
                              step={0.1}
                              value={stage.motionSpeed ?? 1}
                              onChange={e => updateSceneStage(idx, { motionSpeed: Number(e.target.value) })}
                            />
                          </label>
                          <label className="field-label">
                            Dịch ngang / dọc ({stage.productOffsetX ?? 0}%, {stage.productOffsetY ?? 0}%)
                            <div className="offset-mini-sliders">
                              <input
                                type="range"
                                aria-label="Dịch ngang X"
                                min={-20}
                                max={20}
                                step={2}
                                value={stage.productOffsetX ?? 0}
                                onChange={e => updateSceneStage(idx, { productOffsetX: Number(e.target.value) })}
                              />
                              <input
                                type="range"
                                aria-label="Dịch dọc Y"
                                min={-20}
                                max={20}
                                step={2}
                                value={stage.productOffsetY ?? 0}
                                onChange={e => updateSceneStage(idx, { productOffsetY: Number(e.target.value) })}
                              />
                            </div>
                          </label>
                        </div>

                        {isCutoutMode && (
                          <CutoutPreviewStrip
                            image={scene.imageUrl ? loadedImgCacheRef.current.get(scene.imageUrl) : null}
                            imageUrl={scene.imageUrl}
                            sensitivity={stage.cutoutSensitivity ?? 28}
                            sourceKey={scene.imageId || scene.imageUrl || `scene-${idx}`}
                          />
                        )}

                        <small className="muted-copy">
                          * Tách nền và hiệu ứng 2.5D xử lý trực tiếp trên trình duyệt để bảo toàn 100% nhãn mác, logo và màu sắc thật của sản phẩm.
                        </small>
                      </div>

                      {/* AI NLP Revision + Before/After Diff */}
                      <div className="scene-ai-assist-box">
                        <label className="field-label" style={{ marginBottom: 8 }}>
                          Yêu cầu AI chỉnh sửa phân cảnh (ngôn ngữ tự nhiên)
                          <textarea
                            rows={2}
                            value={sceneInstructions[idx] || ''}
                            onChange={e => setSceneInstructions(prev => ({ ...prev, [idx]: e.target.value }))}
                            placeholder="Ví dụ: đổi nền trắng, đưa chữ lên trên, tăng kích thước sản phẩm, rút ngắn lời thoại..."
                          />
                        </label>
                        <div className="btn-row">
                          <button
                            type="button"
                            className="secondary-btn"
                            disabled={sceneAssistBusyIndex !== null || (!scene.imageId && !scene.imageUrl && !sceneInstructions[idx]?.trim())}
                            onClick={() => void assistScene(idx)}
                          >
                            {sceneAssistBusyIndex === idx ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                            {sceneAssistBusyIndex === idx
                              ? 'Đang phân tích & chỉnh sửa...'
                              : sceneInstructions[idx]?.trim()
                                ? 'Chỉnh sửa theo yêu cầu'
                                : 'AI phân tích ảnh & đề xuất'}
                          </button>

                          <button
                            type="button"
                            className="primary-btn"
                            disabled={sceneRenderingIndex !== null || batchRendering || (!scene.imageUrl && !scene.onScreenText.trim())}
                            onClick={() => void renderOneScene(idx)}
                          >
                            {isRenderingThis ? <Loader2 size={14} className="spin" /> : <Film size={14} />}
                            {isRenderingThis ? `Đang dựng ${sceneRenderProgress}%` : review ? 'Dựng lại phân cảnh này' : 'Dựng video phân cảnh này'}
                          </button>
                        </div>

                        {diff && (
                          <div className="scene-diff-card">
                            <div className="scene-diff-head">
                              <strong>So sánh Trước / Sau chỉnh sửa ({diff.model})</strong>
                              <div className="btn-row">
                                <button
                                  type="button"
                                  className={(previewSceneOverride[idx] || 'after') === 'before' ? 'duration-chip active' : 'duration-chip'}
                                  onClick={() => {
                                    setPreviewSceneOverride(prev => ({ ...prev, [idx]: 'before' }));
                                    seekToScene(idx);
                                  }}
                                >
                                  Xem bản trước
                                </button>
                                <button
                                  type="button"
                                  className={(previewSceneOverride[idx] || 'after') === 'after' ? 'duration-chip active' : 'duration-chip'}
                                  onClick={() => {
                                    setPreviewSceneOverride(prev => ({ ...prev, [idx]: 'after' }));
                                    seekToScene(idx);
                                  }}
                                >
                                  Xem bản sau
                                </button>
                                <button type="button" className="secondary-btn" onClick={() => undoSceneAssist(idx)}>
                                  <RotateCcw size={13} /> Hoàn tác
                                </button>
                                <button type="button" className="primary-btn" onClick={() => acceptSceneAssist(idx)}>
                                  <Check size={13} /> Chấp nhận phiên bản mới
                                </button>
                              </div>
                            </div>
                            <p className="muted-copy" style={{ marginBottom: 8 }}>{diff.summary}</p>
                            <div className="scene-diff-cols">
                              <div>
                                <small>Trước</small>
                                <p><b>Chữ:</b> {diff.before.onScreenText || '—'} ({diff.before.showOnScreenText === false ? 'Ẩn' : 'Hiện'})</p>
                                <p><b>Thoại:</b> {diff.before.narration || '—'}</p>
                                <p><b>Sân khấu:</b> {diff.before.stageConfig?.bgMode === 'cutout-studio' ? 'Tách nền 2.5D' : 'Ảnh gốc'} · {diff.before.motionType}</p>
                              </div>
                              <div>
                                <small>Sau khi AI chỉnh</small>
                                <p><b>Chữ:</b> {diff.after.onScreenText || '—'} ({diff.after.showOnScreenText === false ? 'Ẩn' : 'Hiện'})</p>
                                <p><b>Thoại:</b> {diff.after.narration || '—'}</p>
                                <p><b>Sân khấu:</b> {diff.after.stageConfig?.bgMode === 'cutout-studio' ? 'Tách nền 2.5D' : 'Ảnh gốc'} · {diff.after.motionType}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {renderError && (
                        <div className="banner-alert error" style={{ marginTop: 10, marginBottom: 0 }}>
                          {renderError}
                        </div>
                      )}

                      {review && (
                        <div className="scene-review-output">
                          <div className="scene-review-status">
                            <strong>
                              {!signatureMatches
                                ? 'Bản dựng đã cũ sau khi bạn chỉnh sửa – bấm "Dựng lại phân cảnh này"'
                                : review.status === 'APPROVED'
                                  ? 'Đã xác nhận phân cảnh'
                                  : 'Đã dựng xong – chờ kiểm duyệt'}
                            </strong>
                            <span>
                              {review.format?.toUpperCase() || 'MP4'} · {review.resolution} · {formatBytes(review.fileSizeBytes || 0)}
                            </span>
                          </div>
                          {review.outputFileUrl && (
                            <video
                              src={review.outputFileUrl}
                              controls
                              playsInline
                              preload="metadata"
                              onLoadedMetadata={e => applyVideoDurationWorkaround(e.currentTarget)}
                            />
                          )}
                          <div className="btn-row">
                            {review.outputFileUrl && (
                              <a
                                className="secondary-btn"
                                href={review.outputFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                download={`phan-canh-${idx + 1}.${review.format || 'mp4'}`}
                              >
                                <Download size={14} /> Tải cảnh ({(review.format || 'mp4').toUpperCase()})
                              </a>
                            )}
                            {signatureMatches && (
                              review.status === 'APPROVED' ? (
                                <button type="button" className="secondary-btn" onClick={() => void approveScene(scene, 'PENDING')}>
                                  Bỏ xác nhận
                                </button>
                              ) : (
                                <button type="button" className="primary-btn" onClick={() => void approveScene(scene, 'APPROVED')}>
                                  <Check size={14} /> Xác nhận phân cảnh
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      {scene.aiVideoUrl && (
                        <div className="ai-video-result">
                          <video
                            src={scene.aiVideoUrl}
                            controls
                            playsInline
                            preload="metadata"
                            onLoadedMetadata={e => applyVideoDurationWorkaround(e.currentTarget)}
                            style={{ width: '100%', maxHeight: 280, borderRadius: 12 }}
                          />
                          <a className="secondary-btn" href={scene.aiVideoUrl} target="_blank" rel="noreferrer" download>
                            Mở / tải video clip gắn kèm
                          </a>
                        </div>
                      )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel-card">
            <h3>3. AI Voice & Nhạc nền</h3>
            <div className="form-grid-2">
              <div className="sub-panel">
                <div className="sub-panel-head">
                  <strong>
                    <Volume2 size={15} /> Giọng đọc
                  </strong>
                  <label className="switch-inline">
                    <input
                      type="checkbox"
                      checked={voiceConfig.enabled}
                      onChange={e => setVoiceConfig(v => ({ ...v, enabled: e.target.checked }))}
                    />
                    <span>{voiceConfig.enabled ? 'Bật giọng đọc' : 'Không dùng giọng đọc'}</span>
                  </label>
                </div>

                {voiceConfig.enabled && (
                  <>
                    <label className="field-label">
                      Phong cách giọng
                      <select value={voiceConfig.voice} onChange={e => setVoiceConfig(v => ({ ...v, voice: e.target.value }))}>
                        <option value="vi-female-young">Nữ trẻ trung (Tiếng Việt)</option>
                        <option value="vi-male-pro">Nam chuyên nghiệp (Tiếng Việt)</option>
                        <option value="vi-female-luxury">Nữ sang trọng</option>
                        <option value="vi-ad-energetic">Quảng cáo sôi động</option>
                        <option value="vi-review-natural">Review tự nhiên</option>
                      </select>
                    </label>
                    <label className="field-label">
                      Tốc độ đọc: {voiceConfig.speed.toFixed(1)}x
                      <input
                        type="range"
                        min={0.7}
                        max={1.3}
                        step={0.1}
                        value={voiceConfig.speed}
                        onChange={e => setVoiceConfig(v => ({ ...v, speed: Number(e.target.value) }))}
                      />
                    </label>
                    <button type="button" className="secondary-btn" onClick={testVoicePreview}>
                      <Volume2 size={14} /> Nghe thử giọng đọc
                    </button>
                    {ttsNotice && <p className="tts-notice">{ttsNotice}</p>}
                    <p className="tts-notice">Giọng đọc tiếng Việt dùng Gemini TTS (`gemini-3.8-flash-lite-tts`) qua Worker; không cần cài máy chủ Kokoro riêng.</p>
                  </>
                )}
                {!voiceConfig.enabled && (
                  <p className="muted-copy">
                    <VolumeX size={14} /> Video sẽ dùng phụ đề + nhạc nền (không tạo lời đọc).
                  </p>
                )}
              </div>

              <div className="sub-panel">
                <div className="sub-panel-head">
                  <strong>
                    <Music size={15} /> Nhạc nền tổng hợp
                  </strong>
                  <label className="switch-inline">
                    <input
                      type="checkbox"
                      checked={musicConfig.enabled}
                      onChange={e => setMusicConfig(m => ({ ...m, enabled: e.target.checked }))}
                    />
                    <span>{musicConfig.enabled ? 'Có nhạc nền' : 'Tắt nhạc nền'}</span>
                  </label>
                </div>
                {musicConfig.enabled && (
                  <>
                    <label className="field-label">
                      Không khí âm nhạc
                      <select
                        value={musicConfig.mood}
                        onChange={e => setMusicConfig(m => ({ ...m, mood: e.target.value as MusicConfig['mood'] }))}
                      >
                        <option value="upbeat-modern">Năng động, hiện đại</option>
                        <option value="elegant-ambient">Sang trọng, thư thái</option>
                        <option value="warm-acoustic">Ấm áp, gần gũi</option>
                        <option value="tech-pulse">Công nghệ, nhịp nhanh</option>
                      </select>
                    </label>
                    <label className="field-label">
                      Âm lượng nhạc nền: {Math.round(musicConfig.volume * 100)}%
                      <input
                        type="range"
                        min={0.05}
                        max={0.45}
                        step={0.05}
                        value={musicConfig.volume}
                        onChange={e => setMusicConfig(m => ({ ...m, volume: Number(e.target.value) }))}
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT: Live Preview & Final Composite MP4 Export */}
        <aside className="studio-preview-col">
          <div className="panel-card sticky-preview">
            <div className="panel-card-head">
              <strong>
                <Film size={16} /> Xem trước & Ghép Video Hoàn Chỉnh
              </strong>
              <span className="pill-badge">{aspectRatio}</span>
            </div>

            <div className={`canvas-stage ratio-${aspectRatio.replace(':', '-')}`}>
              <canvas ref={previewCanvasRef} />
            </div>

            <div className="preview-player-bar">
              <button
                type="button"
                className="secondary-btn preview-play-btn"
                disabled={scenes.length === 0}
                onClick={() => setIsPlayingPreview(p => !p)}
              >
                {isPlayingPreview ? <Pause size={15} /> : <Play size={15} />}
                <span className="preview-play-label">{isPlayingPreview ? 'Tạm dừng' : 'Phát thử'}</span>
              </button>
              <input
                type="range"
                aria-label="Thanh tua xem trước video"
                min={0}
                max={Math.max(1, totalScenesDuration)}
                step={0.1}
                value={previewTime}
                onChange={e => {
                  setIsPlayingPreview(false);
                  setPreviewTime(Number(e.target.value));
                }}
              />
              <small className="preview-timer" aria-live="off">
                {previewTime.toFixed(1)}s / {totalScenesDuration.toFixed(1)}s
              </small>
            </div>

            <div className="export-controls">
              <label className="field-label">
                Chất lượng xuất
                <select value={resolution} onChange={e => setResolution(e.target.value as RenderResolution)}>
                  <option value="480p">480p (Nhẹ, nhanh cho di động)</option>
                  <option value="720p">720p HD (Khuyên dùng)</option>
                  <option value="1080p">1080p Full HD (Máy tính mạnh)</option>
                </select>
              </label>

              {scenes.length > 0 && (
                <div className="composite-summary-box">
                  <div>
                    <span>Phân cảnh</span>
                    <b>{scenes.length} cảnh · {totalScenesDuration.toFixed(1)}s</b>
                  </div>
                  <div>
                    <span>Kịch bản</span>
                    <b>{scriptConfirmed ? 'Đã duyệt' : 'Chưa duyệt'}</b>
                  </div>
                  <div>
                    <span>Dựng & duyệt cảnh</span>
                    <b>{sceneStats.approved}/{scenes.length} cảnh xác nhận</b>
                  </div>
                  <div>
                    <span>Âm thanh</span>
                    <b>{voiceConfig.enabled ? 'Giọng AI + ' : ''}{musicConfig.enabled ? 'Nhạc nền' : 'Tắt nhạc'}</b>
                  </div>
                </div>
              )}

              {safety.warning && (
                <div className="warning-strip compact">
                  <AlertTriangle size={14} />
                  <span>{safety.warning}</span>
                </div>
              )}

              {scenes.length > 0 && !canCompositeMerge && (
                <div className="warning-strip compact composite-gate-strip" role="status">
                  <AlertTriangle size={14} />
                  <div>
                    {!scriptConfirmed ? (
                      <span>Chưa mở khóa: Hãy nhấn <b>"Xác nhận kịch bản"</b> ở Mục 2 trước.</span>
                    ) : (
                      <span>
                        Cần dựng và bấm <b>"Xác nhận phân cảnh"</b> cho đủ {scenes.length} cảnh (hiện đạt {sceneStats.approved}/{scenes.length}).
                      </span>
                    )}
                    {scriptConfirmed && !allScenesApproved && (
                      <button
                        type="button"
                        className="inline-link-btn"
                        disabled={batchRendering || sceneRenderingIndex !== null}
                        onClick={() => void renderBatchScenes('missing')}
                      >
                        Dựng tất cả cảnh còn thiếu
                      </button>
                    )}
                  </div>
                </div>
              )}

              {rendering ? (
                <div className="render-progress-box">
                  <div className="render-progress-top">
                    <span>
                      <Loader2 size={14} className="spin" /> {renderStage}
                    </span>
                    <b>{renderPercent}%</b>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${renderPercent}%` }} />
                  </div>
                  <button type="button" className="secondary-btn danger-outline full-width" onClick={() => abortRef.current?.abort()}>
                    <Square size={14} /> Hủy dựng video
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="primary-btn full-width"
                  disabled={!canCompositeMerge}
                  title={!canCompositeMerge ? 'Cần xác nhận kịch bản và xác nhận toàn bộ phân cảnh trước khi ghép video hoàn chỉnh' : undefined}
                  onClick={handleRenderMp4}
                >
                  <WandSparkles size={16} /> GHÉP VIDEO HOÀN CHỈNH
                </button>
              )}
            </div>

            {renderedVideo && (
              <div className="rendered-output-box">
                <div className="rendered-output-head">
                  <strong>Thành phẩm ({renderedVideo.result.format.toUpperCase()})</strong>
                  <span>
                    {renderedVideo.result.width}×{renderedVideo.result.height} · {renderedVideo.result.durationSec.toFixed(1)}s · {formatBytes(renderedVideo.result.fileSizeBytes)}
                  </span>
                </div>
                <video
                  controls
                  playsInline
                  src={renderedVideo.url}
                  className="rendered-video-player"
                  onLoadedMetadata={e => applyVideoDurationWorkaround(e.currentTarget)}
                />
                <button
                  type="button"
                  className="primary-btn full-width"
                  disabled={downloadBusy}
                  onClick={() => void downloadVideoFile(renderedVideo.url, title || 'product-video')}
                >
                  <Download size={16} /> {downloadBusy ? 'Đang chuẩn bị tệp...' : `Tải video .${renderedVideo.result.format.toUpperCase()}`}
                </button>
              </div>
            )}

            {!renderedVideo && savedOutputUrl && (
              <div className="rendered-output-box">
                <div className="rendered-output-head">
                  <strong>Bản video hoàn chỉnh đã lưu</strong>
                </div>
                <video
                  controls
                  playsInline
                  src={savedOutputUrl}
                  className="rendered-video-player"
                  onLoadedMetadata={e => applyVideoDurationWorkaround(e.currentTarget)}
                />
                <button
                  type="button"
                  className="secondary-btn full-width"
                  disabled={downloadBusy}
                  onClick={() => void downloadVideoFile(savedOutputUrl, title || 'product-video')}
                >
                  <Download size={16} /> {downloadBusy ? 'Đang tải video...' : 'Tải bản đã lưu'}
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {deleteSceneIndex !== null && (
        <ConfirmDialog
          title="Xóa phân cảnh?"
          message={`Bạn có chắc chắn muốn xóa Phân cảnh ${deleteSceneIndex + 1} khỏi dự án này không?`}
          confirmLabel="Xóa phân cảnh"
          onCancel={() => setDeleteSceneIndex(null)}
          onConfirm={() => {
            const index = deleteSceneIndex;
            setScenes(prev => prev.filter((_, sceneIndex) => sceneIndex !== index).map((s, i) => ({ ...s, sortOrder: i })));
            setSceneInstructions(prev => {
              const next: Record<number, string> = {};
              Object.entries(prev).forEach(([key, val]) => {
                const k = Number(key);
                if (k < index) next[k] = val;
                else if (k > index) next[k - 1] = val;
              });
              return next;
            });
            setSceneDiffs({});
            setSceneRenderErrors({});
            setScriptConfirmed(false);
            setIsPlayingPreview(false);
            setPreviewTime(0);
            setDeleteSceneIndex(null);
          }}
        />
      )}
    </div>
  );
}
