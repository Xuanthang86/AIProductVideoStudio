import { useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Download,
  Film,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  WandSparkles,
} from 'lucide-react';
import { api, formatBytes } from '../lib/api';
import {
  checkDeviceRenderSafety,
  drawSceneFrame,
  getResolutionDimensions,
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

const DURATIONS = [15, 30, 45, 60, 90];
const RATIOS: AspectRatio[] = ['9:16', '16:9', '1:1', '4:5'];

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
  const [durationSec, setDurationSec] = useState(initialTemplate?.suggestedDuration || 30);
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

  const [scriptBusy, setScriptBusy] = useState(false);
  const [scriptNote, setScriptNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [ttsNotice, setTtsNotice] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Preview playback state
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImgCacheRef = useRef<Map<string, HTMLImageElement | null>>(new Map());
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [uploadingSceneIndex, setUploadingSceneIndex] = useState<number | null>(null);
  const [sceneAssistBusyIndex, setSceneAssistBusyIndex] = useState<number | null>(null);
  const [sceneInstructions, setSceneInstructions] = useState<Record<number, string>>({});
  const [sceneReviews, setSceneReviews] = useState<Record<string, SceneReview>>({});
  const [sceneRenderingIndex, setSceneRenderingIndex] = useState<number | null>(null);
  const [sceneRenderProgress, setSceneRenderProgress] = useState(0);
  const [deleteSceneIndex, setDeleteSceneIndex] = useState<number | null>(null);
  const [imageCacheRevision, setImageCacheRevision] = useState(0);
  const sceneImageInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // MP4 Render state
  const [resolution, setResolution] = useState<RenderResolution>('720p');
  const [rendering, setRendering] = useState(false);
  const [renderPercent, setRenderPercent] = useState(0);
  const [renderStage, setRenderStage] = useState('');
  const [renderedVideo, setRenderedVideo] = useState<{ url: string; result: RenderResult } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedProduct = useMemo(() => products.find(p => p.id === productId) || null, [products, productId]);
  const totalScenesDuration = useMemo(() => scenes.reduce((s, x) => s + x.durationSec, 0), [scenes]);
  const safety = useMemo(() => checkDeviceRenderSafety(resolution, totalScenesDuration || durationSec), [resolution, totalScenesDuration, durationSec]);
  const maxAllowedDuration = quota?.max_duration_sec || 60;

  useEffect(() => {
    api<{ products: Product[] }>('/api/products')
      .then(res => {
        setProducts(res.products);
        if (!initialProductId && !initialProjectId && res.products.length > 0 && !productId) {
          const first = res.products[0];
          setProductId(first.id);
          setIndustry(first.industry);
          setTitle(`Video ${first.name}`);
        }
      })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!initialProjectId) return;
    api<{ project: VideoProject; scenes: VideoScene[]; sceneReviews?: SceneReview[] }>(`/api/projects/${initialProjectId}`)
      .then(res => {
        setProjectId(res.project.id);
        setTitle(res.project.title);
        setProductId(res.project.productId || '');
        setTemplateId(res.project.templateId || '');
        setVideoType(res.project.videoType);
        setIndustry(res.project.industry);
        setTargetAudience(res.project.targetAudience);
        setStyle(res.project.style);
        setDurationSec(res.project.durationSec);
        setAspectRatio(res.project.aspectRatio);
        setLanguage(res.project.language);
        setCtaText(res.project.ctaText || 'Khám phá ngay');
        if (res.project.voiceConfig) setVoiceConfig(res.project.voiceConfig);
        if (res.project.musicConfig) setMusicConfig(res.project.musicConfig);
        setScenes(res.scenes);
        setSceneReviews(Object.fromEntries((res.sceneReviews || []).map(review => [review.sceneId, review])));
      })
      .catch(e => setError(e.message));
  }, [initialProjectId]);

  useEffect(() => {
    if (initialTemplate) {
      setTemplateId(initialTemplate.id);
      setVideoType(initialTemplate.videoType);
      setIndustry(initialTemplate.industry);
      setDurationSec(Math.min(maxAllowedDuration, initialTemplate.suggestedDuration));
      if (initialTemplate.supportedRatios.length > 0) {
        setAspectRatio(initialTemplate.supportedRatios[0] as AspectRatio);
      }
    }
  }, [initialTemplate, maxAllowedDuration]);

  useEffect(() => {
    if (initialVideoType && !initialTemplate) setVideoType(initialVideoType);
  }, [initialVideoType, initialTemplate]);

  // Preload images for canvas preview
  useEffect(() => {
    for (const s of scenes) {
      if (!s.imageUrl || loadedImgCacheRef.current.has(s.imageUrl)) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        loadedImgCacheRef.current.set(s.imageUrl, img);
        setImageCacheRevision(revision => revision + 1);
      };
      img.onerror = () => {
        loadedImgCacheRef.current.set(s.imageUrl, null);
        setImageCacheRevision(revision => revision + 1);
      };
      img.src = s.imageUrl;
    }
  }, [scenes]);

  // Draw preview frame whenever previewTime, scenes, aspectRatio, or ctaText changes
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
          narration: 'Tạo kịch bản hoặc thêm phân cảnh để xem trước video sản phẩm.',
          onScreenText: selectedProduct?.name || title,
          imageUrl: selectedProduct?.images[0]?.imageUrl || '',
          sourceType: 'REAL_PRODUCT',
          motionType: 'zoom-in',
          transitionType: 'fade',
          lightingEffect: 'studio-glow',
          visualPrompt: '',
          musicMood: 'upbeat',
        },
        image: selectedProduct?.images[0]?.imageUrl
          ? loadedImgCacheRef.current.get(selectedProduct.images[0].imageUrl) || null
          : null,
        sceneProgress: 0.5,
        sceneIndex: 0,
        totalScenes: 1,
        productName: selectedProduct?.name || title,
        ctaText,
      });
      return;
    }

    let acc = 0;
    let idx = 0;
    for (let i = 0; i < scenes.length; i++) {
      if (previewTime < acc + scenes[i].durationSec || i === scenes.length - 1) {
        idx = i;
        break;
      }
      acc += scenes[i].durationSec;
    }
    const activeScene = scenes[idx];
    const progress = (previewTime - acc) / Math.max(0.1, activeScene.durationSec);
    drawSceneFrame(ctx, dims.width, dims.height, {
      scene: activeScene,
      image: activeScene.imageUrl ? loadedImgCacheRef.current.get(activeScene.imageUrl) || null : null,
      sceneProgress: progress,
      sceneIndex: idx,
      totalScenes: scenes.length,
      productName: activeScene.productName || selectedProduct?.name || title,
      ctaText,
    });
  }, [previewTime, scenes, aspectRatio, ctaText, selectedProduct, title, imageCacheRevision]);

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

  const applyVariant = (variant: ScriptVariant, prod: Product | null) => {
    const imgs = prod?.images || [];
    const mapped: VideoScene[] = variant.scenes.map((s, i) => {
      const img = imgs.length > 0 ? imgs[i % imgs.length] : null;
      return {
        ...s,
        sortOrder: i,
        productId: prod?.id || productId || null,
        productName: prod?.name || title,
        imageId: img?.id || null,
        imageUrl: img?.imageUrl || '',
        sourceType: 'REAL_PRODUCT',
      };
    });
    setScenes(mapped);
    if (variant.ctaText) setCtaText(variant.ctaText);
    setPreviewTime(0);
  };

  const generateScripts = async () => {
    if (!productId) {
      setError('Vui lòng chọn hoặc tạo một sản phẩm trước khi tạo kịch bản.');
      return;
    }
    setScriptBusy(true);
    setError('');
    setMessage('');
    setScriptNote('Đang kiểm tra cấu hình và tạo kịch bản...');
    try {
      const res = await api<{ mode: string; model: string; variants: ScriptVariant[]; fallbackReason?: string }>('/api/ai/generate-script', 'POST', {
        productId,
        videoType,
        targetAudience,
        style,
        durationSec,
        language,
      });
      const generatedVariants = Array.isArray(res.variants)
        ? res.variants.filter(variant => Array.isArray(variant.scenes) && variant.scenes.length > 0)
        : [];
      if (generatedVariants.length === 0) throw new Error('Máy chủ chưa trả về kịch bản có phân cảnh. Vui lòng thử lại hoặc kiểm tra cấu hình Gemini trong Quản trị AI.');
      setVariants(generatedVariants);
      setActiveVariantIdx(0);
      applyVariant(generatedVariants[0], selectedProduct);
      setScriptNote(
        res.mode === 'gemini'
          ? `Đã tạo ${generatedVariants.length} phương án kịch bản bằng Gemini (${res.model}).`
          : `Đã tạo ${generatedVariants.length} phương án kịch bản dự phòng. ${res.fallbackReason || 'Bạn có thể tùy chỉnh từng phân cảnh.'}`
      );
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Dịch vụ tạo kịch bản không phản hồi.';
      const fallbackProduct = products.find(product => product.id === productId) || selectedProduct;
      if (fallbackProduct) {
        const sceneCount = durationSec <= 15 ? 3 : durationSec <= 30 ? 4 : durationSec <= 45 ? 5 : 6;
        const sceneDuration = Number((durationSec / sceneCount).toFixed(1));
        const points = fallbackProduct.highlights.length ? fallbackProduct.highlights : [fallbackProduct.description || fallbackProduct.name];
        const motions: MotionType[] = ['zoom-in', 'pan-left', 'parallax', 'zoom-out', 'pan-right', 'rotate-showcase'];
        const transitions: TransitionType[] = ['fade', 'slide', 'zoom-cut'];
        const lights: LightingEffect[] = ['studio-glow', 'warm-gold', 'clean', 'neon-rim'];
        const localVariants: ScriptVariant[] = [0, 1].map(variantIndex => ({
          variantName: variantIndex === 0 ? 'Kịch bản dự phòng: Giới thiệu trực diện' : 'Kịch bản dự phòng: Gợi mở nhu cầu',
          hookSummary: variantIndex === 0 ? 'Giới thiệu sản phẩm và các điểm nổi bật đã cung cấp.' : 'Mở đầu bằng nhu cầu khách hàng, sau đó giới thiệu thông tin sản phẩm.',
          ctaText: ctaText || 'Khám phá ngay',
          scenes: Array.from({ length: sceneCount }, (_, index) => {
            const point = points[index % points.length];
            const isFirst = index === 0;
            const isLast = index === sceneCount - 1;
            return {
              productId: fallbackProduct.id,
              productName: fallbackProduct.name,
              sortOrder: index,
              durationSec: isLast ? Number((durationSec - sceneDuration * (sceneCount - 1)).toFixed(1)) : sceneDuration,
              narration: isFirst
                ? (variantIndex === 0 ? 'Giới thiệu ' + fallbackProduct.name + (fallbackProduct.brand ? ' từ ' + fallbackProduct.brand : '') + '.' : 'Bạn đang tìm hiểu ' + fallbackProduct.name + '? Hãy cùng xem những điểm nổi bật.')
                : isLast ? 'Tìm hiểu thêm về ' + fallbackProduct.name + ' ngay hôm nay.' : 'Điểm nổi bật của sản phẩm: ' + point + '.',
              onScreenText: isFirst ? fallbackProduct.name : isLast ? (ctaText || 'Khám phá ngay') : String(point).slice(0, 64),
              imageId: fallbackProduct.images[index % Math.max(1, fallbackProduct.images.length)]?.id || null,
              motionType: motions[(index + variantIndex) % motions.length],
              transitionType: transitions[(index + variantIndex) % transitions.length],
              lightingEffect: lights[(index + variantIndex) % lights.length],
              visualPrompt: 'Giới thiệu ' + fallbackProduct.name + '; chỉ sử dụng thông tin do người dùng cung cấp: ' + point + '.',
              musicMood: musicConfig.mood,
            };
          }),
        }));
        setVariants(localVariants);
        setActiveVariantIdx(0);
        applyVariant(localVariants[0], fallbackProduct);
        setError('');
        setScriptNote('Dịch vụ AI chưa phản hồi. Đã tạo 02 kịch bản dự phòng để bạn tiếp tục chỉnh sửa. Nguyên nhân: ' + reason.slice(0, 180));
      } else {
        setScriptNote('');
        setError(reason);
      }
    } finally {
      setScriptBusy(false);
    }
  };

  const addEmptyScene = () => {
    const fallbackImg = selectedProduct?.images[0];
    setScenes(prev => [
      ...prev,
      {
        sortOrder: prev.length,
        productId: productId || null,
        productName: selectedProduct?.name || title,
        durationSec: 5,
        narration: 'Nội dung giới thiệu điểm nổi bật của sản phẩm.',
        onScreenText: selectedProduct?.name || 'Điểm nổi bật',
        imageId: fallbackImg?.id || null,
        imageUrl: fallbackImg?.imageUrl || '',
        sourceType: 'REAL_PRODUCT',
        motionType: 'zoom-in',
        transitionType: 'fade',
        lightingEffect: 'studio-glow',
        visualPrompt: '',
        musicMood: musicConfig.mood,
      },
    ]);
  };

  const updateScene = (index: number, patch: Partial<VideoScene>) => {
    setScenes(prev => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const uploadSceneImage = async (index: number, file?: File) => {
    if (!file) return;
    const sceneProductId = scenes[index]?.productId || productId;
    if (!sceneProductId) { setError('Vui lòng chọn sản phẩm cho phân cảnh trước khi tải ảnh.'); return; }
    const extension = file.name.toLowerCase().split('.').pop() || '';
    const mimeType = file.type.toLowerCase() || ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[extension] || '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) { setError('Ảnh phân cảnh chỉ hỗ trợ JPG, PNG hoặc WEBP.'); return; }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) { setError('Dung lượng ảnh mỗi phân cảnh phải lớn hơn 0 và tối đa 5MB.'); return; }
    setUploadingSceneIndex(index); setError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Không đọc được tệp ảnh.'));
        reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
        reader.readAsDataURL(file);
      });
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('Tệp tải lên không phải ảnh hợp lệ.'));
        image.src = dataUrl;
      });
      const response = await api<{ image: Product['images'][number] }>(`/api/products/${sceneProductId}/images`, 'POST', {
        fileName: file.name, mimeType, base64: dataUrl, ...dimensions,
      });
      updateScene(index, { productId: sceneProductId, productName: products.find(p => p.id === sceneProductId)?.name || '', imageId: response.image.id, imageUrl: response.image.imageUrl, sourceType: 'REAL_PRODUCT' });
      setProducts(prev => prev.map(product => product.id === sceneProductId ? { ...product, images: [...product.images, response.image] } : product));
      setMessage(`Đã tải ảnh riêng cho phân cảnh #${index + 1}.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Không thể tải ảnh phân cảnh.');
    } finally { setUploadingSceneIndex(null); }
  };

  const assistScene = async (index: number) => {
    const scene = scenes[index];
    const sceneProductId = scene?.productId || productId;
    if (!sceneProductId || !scene?.imageId) {
      setError('Vui lòng chọn sản phẩm và tải/chọn ảnh cho phân cảnh trước khi phân tích.');
      return;
    }
    setSceneAssistBusyIndex(index);
    setError('');
    setMessage('');
    try {
      const result = await api<{
        scene: Pick<VideoScene, 'narration' | 'onScreenText' | 'visualPrompt' | 'motionType' | 'transitionType' | 'lightingEffect'>;
        model: string;
      }>('/api/ai/scene-assist', 'POST', {
        productId: sceneProductId,
        imageId: scene.imageId,
        scene: {
          narration: scene.narration,
          onScreenText: scene.onScreenText,
          visualPrompt: scene.visualPrompt,
          durationSec: scene.durationSec,
          motionType: scene.motionType,
          transitionType: scene.transitionType,
          lightingEffect: scene.lightingEffect,
        },
        instruction: sceneInstructions[index] || '',
        language,
      });
      updateScene(index, result.scene);
      setMessage(`Đã ${sceneInstructions[index]?.trim() ? 'chỉnh sửa' : 'phân tích'} nội dung phân cảnh #${index + 1} bằng ${result.model}. Vui lòng kiểm duyệt trước khi xuất video.`);
    } catch (assistError) {
      setError(assistError instanceof Error ? assistError.message : 'Không thể phân tích/chỉnh sửa phân cảnh.');
    } finally {
      setSceneAssistBusyIndex(null);
    }
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
  };

  const regenerateOneScene = (index: number) => {
    const motions: MotionType[] = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'parallax', 'rotate-showcase'];
    const lights: LightingEffect[] = ['studio-glow', 'warm-gold', 'neon-rim', 'clean'];
    const transitions: TransitionType[] = ['fade', 'slide', 'zoom-cut'];
    const hl = selectedProduct?.highlights || [];
    const altText = hl.length > 0 ? hl[(index + 1) % hl.length] : selectedProduct?.description || selectedProduct?.name || 'Trải nghiệm sản phẩm';
    updateScene(index, {
      narration: `Góc nhìn mới cho ${selectedProduct?.name || 'sản phẩm'}: ${altText}.`,
      onScreenText: altText.slice(0, 60),
      motionType: motions[(index + 2) % motions.length],
      lightingEffect: lights[(index + 1) % lights.length],
      transitionType: transitions[(index + 1) % transitions.length],
    });
    setMessage(`Đã tạo lại gợi ý cho phân cảnh #${index + 1}.`);
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
        audio.play();
        setTtsNotice('Đang phát thử giọng đọc Gemini AI tiếng Việt.');
        return;
      }
      setTtsNotice(res.reason || 'Dịch vụ Gemini TTS chưa sẵn sàng.');
    } catch (e) {
      setTtsNotice(e instanceof Error ? e.message : 'Không kiểm tra được dịch vụ TTS.');
    }

    // Honest browser speech synthesis preview (for listening preview only)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(sample);
      utter.lang = language === 'en' ? 'en-US' : 'vi-VN';
      utter.rate = voiceConfig.speed;
      window.speechSynthesis.speak(utter);
    }
  };

  const saveProject = async (scenesOverride?: VideoScene[]): Promise<string> => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        productId: productId || null,
        templateId: templateId || null,
        title,
        videoType,
        industry,
        targetAudience,
        style,
        durationSec: Math.round(totalScenesDuration || durationSec),
        aspectRatio,
        language,
        ctaText,
        voiceConfig,
        musicConfig,
        scenes: scenesOverride || scenes,
      };
      if (projectId) {
        await api(`/api/projects/${projectId}`, 'PUT', payload);
        const refreshed = await api<{ scenes: VideoScene[]; sceneReviews?: SceneReview[] }>(`/api/projects/${projectId}`);
        setScenes(refreshed.scenes);
        setSceneReviews(Object.fromEntries((refreshed.sceneReviews || []).map(review => [review.sceneId, review])));
        setMessage('Đã lưu toàn bộ chỉnh sửa dự án.');
        return projectId;
      } else {
        const res = await api<{ id: string }>('/api/projects', 'POST', payload);
        setProjectId(res.id);
        const refreshed = await api<{ scenes: VideoScene[]; sceneReviews?: SceneReview[] }>(`/api/projects/${res.id}`);
        setScenes(refreshed.scenes);
        setSceneReviews(Object.fromEntries((refreshed.sceneReviews || []).map(review => [review.sceneId, review])));
        setMessage('Đã lưu dự án video mới.');
        return res.id;
      }
    } finally {
      setSaving(false);
    }
  };

  const getSceneSignature = (scene: VideoScene) => JSON.stringify({
    productId: scene.productId || productId || '',
    imageReference: scene.imageId || (scene.imageUrl || '').slice(0, 500),
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
  });

  const renderOneScene = async (index: number) => {
    const scene = scenes[index];
    if (!scene) return;
    if (!scene.imageUrl) {
      setError(`Vui lòng tải/chọn ảnh cho phân cảnh #${index + 1} trước khi dựng video riêng.`);
      return;
    }
    setError('');
    setMessage('');
    setSceneRenderingIndex(index);
    setSceneRenderProgress(1);
    try {
      const activeProjectId = await saveProject();
      const saved = await api<{ scenes: VideoScene[] }>(`/api/projects/${activeProjectId}`);
      const savedScene = saved.scenes[index];
      if (!savedScene?.id) throw new Error('Không lấy được mã phân cảnh sau khi lưu dự án. Vui lòng thử lưu lại.');
      const signature = getSceneSignature(savedScene);
      const voiceovers: VoiceoverTrack[] = [];
      if (voiceConfig.enabled && savedScene.narration.trim()) {
        if (typeof AudioContext === 'undefined') throw new Error('Trình duyệt không hỗ trợ giải mã âm thanh để tạo giọng đọc.');
        const tts = await api<{ available: boolean; reason?: string; audioBase64?: string }>('/api/ai/tts', 'POST', {
          text: savedScene.narration.trim(), voice: voiceConfig.voice, speed: voiceConfig.speed,
        });
        if (!tts.available || !tts.audioBase64) throw new Error(tts.reason || 'Dịch vụ giọng đọc chưa sẵn sàng.');
        const binary = atob(tts.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const audioContext = new AudioContext();
        try {
          const audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
          voiceovers.push({ audioBuffer, startSec: 0, volume: 1, playbackRate: voiceConfig.speed });
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
        ctaText: '',
        musicConfig,
        onProgress: pct => setSceneRenderProgress(pct),
      });
      const form = new FormData();
      form.append('file', result.blob, `scene-${index + 1}-${Date.now()}.${result.format}`);
      form.append('sceneSignature', signature);
      form.append('resolution', resolution);
      const response = await fetch(`/api/projects/${activeProjectId}/scenes/${savedScene.id}/output`, {
        method: 'POST', credentials: 'include', body: form,
      });
      const uploaded = await response.json().catch(() => ({})) as SceneReview & { error?: string };
      if (!response.ok) throw new Error(uploaded.error || 'Không thể lưu video phân cảnh lên kho lưu trữ.');
      setSceneReviews(prev => ({ ...prev, [savedScene.id as string]: uploaded }));
      setMessage(`Đã dựng và lưu video riêng cho phân cảnh #${index + 1}. Hãy xem lại rồi xác nhận phân cảnh.`);
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : 'Không thể dựng video phân cảnh.');
    } finally {
      setSceneRenderingIndex(null);
      setSceneRenderProgress(0);
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
        `/api/projects/${projectId}/scenes/${scene.id}/review`, 'PATCH', { status, sceneSignature: signature },
      );
      setSceneReviews(prev => ({ ...prev, [result.sceneId]: { ...prev[result.sceneId], sceneId: result.sceneId, status: result.status, sceneSignature: signature } as SceneReview }));
      setMessage(status === 'APPROVED' ? 'Đã xác nhận phân cảnh. Bạn có thể tiếp tục kiểm duyệt các cảnh còn lại.' : 'Đã bỏ xác nhận phân cảnh.');
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Không thể cập nhật trạng thái duyệt.');
    }
  };

  const handleRenderMp4 = async () => {
    const unapproved = scenes.findIndex(scene => {
      if (!scene.id) return true;
      const review = sceneReviews[scene.id];
      return !review || review.status !== 'APPROVED' || review.sceneSignature !== getSceneSignature(scene) || !review.outputFileUrl;
    });
    if (unapproved >= 0) {
      setError(`Chưa thể ghép video hoàn chỉnh: vui lòng dựng và xác nhận phân cảnh #${unapproved + 1} trước.`);
      return;
    }
    if (scenes.length === 0) {
      setError('Vui lòng tạo kịch bản hoặc thêm ít nhất 1 phân cảnh trước khi xuất video.');
      return;
    }
    setError('');
    setMessage('');
    setRendering(true);
    setRenderPercent(1);
    setRenderStage('Đang lưu dự án...');
    if (renderedVideo?.url) {
      URL.revokeObjectURL(renderedVideo.url);
      setRenderedVideo(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let activeProjectId = projectId;
    let activeJobId = '';

    try {
      activeProjectId = await saveProject();
      const jobRes = await api<{ jobId: string }>(`/api/projects/${activeProjectId}/jobs`, 'POST', {
        resolution,
        format: 'mp4',
      });
      activeJobId = jobRes.jobId;

      const voiceovers: VoiceoverTrack[] = [];
      if (voiceConfig.enabled) {
        if (typeof AudioContext === 'undefined') throw new Error('Trình duyệt không hỗ trợ giải mã âm thanh để ghép giọng đọc.');
        const audioContext = new AudioContext();
        let sceneStartSec = 0;
        try {
          for (let i = 0; i < scenes.length; i++) {
            if (controller.signal.aborted) throw new Error('RENDER_CANCELLED');
            const narration = scenes[i].narration.trim();
            if (narration) {
              setRenderStage(`Đang tạo giọng đọc cho cảnh ${i + 1}/${scenes.length}...`);
              setRenderPercent(Math.min(15, 3 + Math.round((i / Math.max(1, scenes.length)) * 12)));
              const tts = await api<{ available: boolean; reason?: string; audioBase64?: string; mimeType?: string }>('/api/ai/tts', 'POST', { text: narration, voice: voiceConfig.voice, speed: voiceConfig.speed });
              if (!tts.available || !tts.audioBase64) throw new Error(tts.reason || 'Kokoro TTS chưa sẵn sàng. Hãy tắt Giọng đọc hoặc cấu hình Kokoro TTS trước khi xuất video.');
              const binary = atob(tts.audioBase64);
              const bytes = new Uint8Array(binary.length);
              for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
              const audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
              voiceovers.push({ audioBuffer, startSec: sceneStartSec, volume: 1, playbackRate: voiceConfig.speed });
            }
            sceneStartSec += Math.max(1, scenes[i].durationSec);
          }
        } finally {
          await audioContext.close().catch(() => {});
        }
      }

      const approvedSceneClips = scenes.map(scene => ({
        ...scene,
        aiVideoUrl: scene.id ? sceneReviews[scene.id].outputFileUrl : '',
        renderedClip: true,
      }));
      const result = await renderProjectVideo({
        scenes: approvedSceneClips,
        voiceovers,
        aspectRatio,
        resolution,
        productName: selectedProduct?.name || title,
        ctaText,
        musicConfig,
        signal: controller.signal,
        onProgress: (pct, text) => {
          setRenderPercent(pct);
          setRenderStage(text);
        },
      });

      let persistentVideoUrl = '';
      try {
        setRenderStage('Đang lưu video lên ImageKit để có thể tải lại sau này...');
        const uploadForm = new FormData();
        uploadForm.append('file', result.blob, `${activeProjectId}-${Date.now()}.${result.format}`);
        const uploadResponse = await fetch(`/api/projects/${activeProjectId}/jobs/${activeJobId}/upload`, { method: 'POST', credentials: 'include', body: uploadForm });
        const uploadResult = await uploadResponse.json().catch(() => ({})) as { outputFileUrl?: string; error?: string };
        if (!uploadResponse.ok) throw new Error(uploadResult.error || 'Không thể lưu video lên ImageKit.');
        persistentVideoUrl = uploadResult.outputFileUrl || '';
      } catch (uploadError) {
        console.warn('Video rendered locally but ImageKit upload failed:', uploadError);
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
        `Xuất video ${result.format.toUpperCase()} (${result.width}×${result.height}, ${formatBytes(result.fileSizeBytes)}) thành công!${persistentVideoUrl ? ' Đã lưu trên ImageKit để tải lại.' : ' Video hiện được lưu trên thiết bị; chưa lưu được bản trực tuyến.'}`
      );
    } catch (e) {
      const isCancelled = e instanceof Error && e.message === 'RENDER_CANCELLED';
      const errMsg = isCancelled
        ? 'Người dùng đã hủy quá trình dựng video.'
        : e instanceof Error
          ? e.message
          : 'Dựng video thất bại.';
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
          <h1>Không gian tạo & chỉnh sửa video</h1>
          <p>Kết nối sản phẩm, kịch bản phân cảnh, chuyển động camera, nhạc nền và xuất video MP4 trực tiếp trên trình duyệt.</p>
        </div>
        <div className="btn-row">
          <button className="secondary-btn" onClick={onGoMyVideos}>
            Video của tôi
          </button>
          <button className="primary-btn" disabled={saving || rendering} onClick={() => saveProject().catch(e => setError(e.message))}>
            <Save size={15} /> {saving ? 'Đang lưu...' : 'Lưu dự án'}
          </button>
        </div>
      </div>

      {(error || message) && <div className={error ? 'banner-alert error' : 'banner-alert'}>{error || message}</div>}

      <div className="studio-grid">
        {/* LEFT: Configuration + Script + Scene Editor */}
        <div className="studio-editor-col">
          <section className="panel-card">
            <h3>1. Sản phẩm & Thông số video</h3>
            {products.length === 0 ? (
              <div className="empty-box compact">
                <p>Bạn chưa có sản phẩm nào. Hãy tạo sản phẩm và tải ảnh trước khi dựng video.</p>
                <button className="primary-btn" onClick={onGoProducts}>
                  Đi tới Quản lý sản phẩm
                </button>
              </div>
            ) : (
              <div className="form-grid-2">
                <label className="field-label">
                  Chọn sản phẩm *
                  <select
                    value={productId}
                    onChange={e => {
                      const nextId = e.target.value;
                      setProductId(nextId);
                      const prod = products.find(p => p.id === nextId);
                      if (prod) {
                        setIndustry(prod.industry);
                        setTitle(`Video ${prod.name}`);
                      }
                    }}
                  >
                    <option value="">-- Chọn sản phẩm --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.images.length} ảnh)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Tiêu đề dự án
                  <input value={title} onChange={e => setTitle(e.target.value)} />
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
                        setDurationSec(Math.min(maxAllowedDuration, tpl.suggestedDuration));
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
                <label className="field-label">
                  Thời lượng mục tiêu (tối đa {maxAllowedDuration}s)
                  <select value={durationSec} onChange={e => setDurationSec(Number(e.target.value))}>
                    {DURATIONS.filter(d => d <= maxAllowedDuration).map(d => (
                      <option key={d} value={d}>
                        {d} giây
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Ngôn ngữ
                  <select value={language} onChange={e => setLanguage(e.target.value as 'vi' | 'en')}>
                    <option value="vi">Tiếng Việt</option>
                    <option value="en">English</option>
                  </select>
                </label>
              </div>
            )}

            <div className="form-grid-2">
              <label className="field-label">
                Đối tượng khách hàng
                <input value={targetAudience} onChange={e => setTargetAudience(e.target.value)} />
              </label>
              <label className="field-label">
                Lời kêu gọi hành động (CTA cuối video)
                <input value={ctaText} onChange={e => setCtaText(e.target.value)} />
              </label>
            </div>
            <label className="field-label">
              Phong cách truyền thông
              <input value={style} onChange={e => setStyle(e.target.value)} />
            </label>
          </section>

          <section className="panel-card">
            <div className="panel-card-head wrap">
              <div>
                <h3>2. AI Kịch bản & Phân cảnh ({scenes.length} cảnh · {totalScenesDuration.toFixed(1)}s)</h3>
                <small className="muted-copy">Tạo nhiều phương án kịch bản, chỉnh sửa lời thoại, phụ đề, ảnh và chuyển động từng cảnh.</small>
              </div>
              <div className="btn-row">
                <button className="secondary-btn" onClick={addEmptyScene}>
                  <Plus size={14} /> Thêm cảnh
                </button>
                <button type="button" className="primary-btn" disabled={scriptBusy} aria-busy={scriptBusy} onClick={generateScripts}>
                  <Sparkles size={15} /> {scriptBusy ? 'Đang tạo kịch bản...' : 'AI Viết kịch bản'}
                </button>
              </div>
            </div>

            {scriptNote && <div className="info-strip">{scriptNote}</div>}

            {variants.length > 1 && (
              <div className="variant-tabs">
                {variants.map((v, i) => (
                  <button
                    key={i}
                    className={activeVariantIdx === i ? 'variant-tab active' : 'variant-tab'}
                    onClick={() => {
                      setActiveVariantIdx(i);
                      applyVariant(v, selectedProduct);
                    }}
                  >
                    <strong>{v.variantName}</strong>
                    <small>{v.hookSummary}</small>
                  </button>
                ))}
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
                <p>Chưa có phân cảnh nào. Nhấn "AI Viết kịch bản" hoặc "Thêm cảnh" để bắt đầu.</p>
              </div>
            ) : (
              <div className="scenes-list">
                {scenes.map((scene, idx) => (
                  <div key={idx} className="scene-card">
                    <div className="scene-card-head">
                      <strong>Phân cảnh #{idx + 1}</strong>
                      <div className="scene-head-actions">
                        <button title="Tạo lại phân cảnh này" onClick={() => regenerateOneScene(idx)}>
                          <RefreshCw size={13} />
                        </button>
                        <button title="Lên" disabled={idx === 0} onClick={() => moveScene(idx, -1)}>
                          <ArrowUp size={13} />
                        </button>
                        <button title="Xuống" disabled={idx === scenes.length - 1} onClick={() => moveScene(idx, 1)}>
                          <ArrowDown size={13} />
                        </button>
                        <button
                          title="Xóa cảnh"
                          onClick={() => setDeleteSceneIndex(idx)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="form-grid-2">
                      <label className="field-label">
                        Sản phẩm của phân cảnh
                        <select value={scene.productId || productId} onChange={e => {
                          const nextProduct = products.find(p => p.id === e.target.value);
                          updateScene(idx, { productId: e.target.value || null, productName: nextProduct?.name || '', imageId: null, imageUrl: '', sourceType: 'REAL_PRODUCT' });
                        }}>
                          <option value="">Chọn sản phẩm</option>
                          {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                        </select>
                        <small className="muted-copy">Mỗi phân cảnh có thể sử dụng một sản phẩm khác nhau.</small>
                      </label>
                      <label className="field-label">
                        Yêu cầu AI chỉnh sửa phân cảnh
                        <textarea rows={2} value={sceneInstructions[idx] || ''} onChange={e => setSceneInstructions(prev => ({ ...prev, [idx]: e.target.value }))} placeholder="Ví dụ: tập trung cận cảnh chất liệu, lời thoại ngắn gọn và sang trọng..." />
                        <button type="button" className="secondary-btn" disabled={sceneAssistBusyIndex !== null || !scene.imageId}
                          onClick={() => void assistScene(idx)}>
                          <Sparkles size={14} /> {sceneAssistBusyIndex === idx ? 'Đang phân tích ảnh...' : (sceneInstructions[idx]?.trim() ? 'Chỉnh sửa theo yêu cầu' : 'AI phân tích ảnh & viết nội dung')}
                        </button>
                        <small className="muted-copy">AI sử dụng ảnh của phân cảnh và thông tin sản phẩm; bạn cần kiểm duyệt kết quả trước khi dựng video.</small>
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
                        Thời lượng (giây)
                        <input
                          type="number"
                          min={2}
                          max={30}
                          step={0.5}
                          value={scene.durationSec || ''}
                          onChange={e => updateScene(idx, { durationSec: e.target.value === '' ? 0 : Math.min(30, Math.max(2, Number(e.target.value) || 0)) })}
                          onBlur={() => updateScene(idx, { durationSec: Math.min(30, Math.max(2, Number(scene.durationSec) || 2)) })}
                        />
                      </label>
                    </div>

                    {scene.aiVideoUrl && (
                      <div className="ai-video-result">
                        <video src={scene.aiVideoUrl} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 280, borderRadius: 12 }} />
                        <a className="secondary-btn" href={scene.aiVideoUrl} target="_blank" rel="noreferrer" download>Mở / tải video AI</a>
                        <p className="muted-copy">Clip AI sẽ được dùng làm hình ảnh chuyển động khi xuất video tổng thể.</p>
                      </div>
                    )}
                    <div className="btn-row">
                      <button className="primary-btn" disabled={sceneRenderingIndex !== null || !scene.imageUrl} onClick={() => void renderOneScene(idx)}>
                        {sceneRenderingIndex === idx ? <Loader2 size={14} className="spin" /> : <Film size={14} />}
                        {sceneRenderingIndex === idx ? `Đang dựng ${sceneRenderProgress}%` : 'Dựng video riêng cho phân cảnh'}
                      </button>
                      <button
                        className="secondary-btn"
                        disabled
                        title="Đã tắt API tạo video trả phí để bảo đảm chế độ miễn phí."
                      >
                        <WandSparkles size={14} /> Tạo video AI từ ảnh (đã tắt)
                      </button>
                    </div>
                    {scene.id && sceneReviews[scene.id] && (() => {
                      const review = sceneReviews[scene.id];
                      const current = review.sceneSignature === getSceneSignature(scene);
                      return (
                        <div className="scene-review-output">
                          <div className="scene-review-status">
                            <strong>{!current ? 'Bản dựng đã cũ – cần dựng lại' : review.status === 'APPROVED' ? 'Đã xác nhận phân cảnh' : 'Chờ kiểm duyệt'}</strong>
                            <span>{review.resolution} · {formatBytes(review.fileSizeBytes || 0)}</span>
                          </div>
                          {current && <video src={review.outputFileUrl} controls playsInline preload="metadata" />}
                          {current && <div className="btn-row">
                            <a className="secondary-btn" href={review.outputFileUrl} target="_blank" rel="noreferrer">Mở video phân cảnh</a>
                            {review.status === 'APPROVED'
                              ? <button className="secondary-btn" onClick={() => void approveScene(scene, 'PENDING')}>Bỏ xác nhận</button>
                              : <button className="primary-btn" onClick={() => void approveScene(scene, 'APPROVED')}>Xác nhận phân cảnh</button>}
                          </div>}
                        </div>
                      );
                    })()}
                    <small className="muted-copy">Chỉnh sửa nội dung sẽ làm mất hiệu lực xác nhận cũ và yêu cầu dựng/duyệt lại phân cảnh.</small>
                    <label className="field-label">
                      Lời thoại / Phụ đề
                      <textarea
                        rows={2}
                        value={scene.narration}
                        onChange={e => updateScene(idx, { narration: e.target.value })}
                      />
                    </label>

                    <div className="form-grid-4">
                      <div className="field-label scene-image-upload">
                        <span>Tải ảnh riêng cho cảnh</span>
                        <input
                          ref={element => { sceneImageInputRefs.current[idx] = element; }}
                          className="scene-image-file-input"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                          disabled={uploadingSceneIndex !== null || !(scene.productId || productId)}
                          onChange={e => {
                            const input = e.currentTarget;
                            const file = input.files?.[0];
                            input.value = '';
                            if (file) void uploadSceneImage(idx, file);
                          }}
                        />
                        <button type="button" className="scene-image-picker-btn" disabled={uploadingSceneIndex !== null || !(scene.productId || productId)} onClick={() => sceneImageInputRefs.current[idx]?.click()}>
                          Chọn tệp ảnh
                        </button>
                        <small className="muted-copy">{uploadingSceneIndex === idx ? 'Đang tải ảnh lên...' : 'JPG, PNG hoặc WEBP · tối đa 5MB. Ảnh sẽ hiển thị trong bản xem trước.'}</small>
                      </div>
                      <label className="field-label">
                        Hình ảnh cảnh
                        <select
                          value={scene.imageUrl}
                          onChange={e => {
                            const sceneProduct = products.find(product => product.id === (scene.productId || productId));
                            const img = sceneProduct?.images.find(im => im.imageUrl === e.target.value);
                            updateScene(idx, { imageUrl: e.target.value, imageId: img?.id || null });
                          }}
                        >
                          <option value="">Nền studio chữ</option>
                          {(products.find(product => product.id === (scene.productId || productId))?.images || []).map((im, imIdx) => (
                            <option key={im.id} value={im.imageUrl}>
                              Ảnh #{imIdx + 1}: {im.fileName.slice(0, 18)}
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
                        Chuyển động
                        <select
                          value={scene.motionType}
                          onChange={e => updateScene(idx, { motionType: e.target.value as MotionType })}
                        >
                          <option value="zoom-in">Zoom In</option>
                          <option value="zoom-out">Zoom Out</option>
                          <option value="pan-left">Pan Trái</option>
                          <option value="pan-right">Pan Phải</option>
                          <option value="parallax">Parallax</option>
                          <option value="rotate-showcase">Xoay nhẹ Showcase</option>
                        </select>
                      </label>
                      <label className="field-label">
                        Ánh sáng & Chuyển cảnh
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
                    </div>
                  </div>
                ))}
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
                    <button className="secondary-btn" onClick={testVoicePreview}>
                      <Volume2 size={14} /> Nghe thử giọng đọc
                    </button>
                    {ttsNotice && <p className="tts-notice">{ttsNotice}</p>}
                    <p className="tts-notice">Giọng đọc tiếng Việt được tạo bằng Gemini TTS qua Cloudflare Worker; không cần cài đặt hoặc vận hành máy chủ Kokoro riêng.</p>
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

        {/* RIGHT: Live Preview & MP4 Export */}
        <aside className="studio-preview-col">
          <div className="panel-card sticky-preview">
            <div className="panel-card-head">
              <strong>
                <Film size={16} /> Xem trước & Xuất MP4
              </strong>
              <span className="pill-badge">{aspectRatio}</span>
            </div>

            <div className={`canvas-stage ratio-${aspectRatio.replace(':', '-')}`}>
              <canvas ref={previewCanvasRef} />
            </div>

            <div className="preview-player-bar">
              <button
                className="secondary-btn"
                disabled={scenes.length === 0}
                onClick={() => setIsPlayingPreview(p => !p)}
              >
                {isPlayingPreview ? <Pause size={15} /> : <Play size={15} />}
                {isPlayingPreview ? 'Tạm dừng' : 'Phát thử'}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(1, totalScenesDuration)}
                step={0.1}
                value={previewTime}
                onChange={e => {
                  setIsPlayingPreview(false);
                  setPreviewTime(Number(e.target.value));
                }}
              />
              <small>
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

              <div className="muted-copy">Đã xác nhận {scenes.filter(scene => scene.id && sceneReviews[scene.id]?.status === 'APPROVED' && sceneReviews[scene.id]?.sceneSignature === getSceneSignature(scene)).length}/{scenes.length} phân cảnh. Chỉ có thể ghép video khi tất cả phân cảnh đã được dựng và xác nhận.</div>

              {safety.warning && (
                <div className="warning-strip compact">
                  <AlertTriangle size={14} />
                  <span>{safety.warning}</span>
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
                  <button className="secondary-btn danger-outline full-width" onClick={() => abortRef.current?.abort()}>
                    <Square size={14} /> Hủy dựng video
                  </button>
                </div>
              ) : (
                <button className="primary-btn full-width" disabled={scenes.length === 0} onClick={handleRenderMp4}>
                  <WandSparkles size={16} /> Xác nhận ghép các cảnh & Xuất video hoàn chỉnh
                </button>
              )}
            </div>

            {renderedVideo && (
              <div className="rendered-output-box">
                <div className="rendered-output-head">
                  <strong>Thành phẩm ({renderedVideo.result.format.toUpperCase()})</strong>
                  <span>
                    {renderedVideo.result.width}×{renderedVideo.result.height} · {formatBytes(renderedVideo.result.fileSizeBytes)}
                  </span>
                </div>
                <video controls playsInline src={renderedVideo.url} className="rendered-video-player" />
                <a
                  className="primary-btn full-width"
                  href={renderedVideo.url}
                  download={`${title.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'product-video'}.${renderedVideo.result.format}`}
                >
                  <Download size={16} /> Tải video .{renderedVideo.result.format.toUpperCase()}
                </a>
              </div>
            )}
          </div>
        </aside>
      </div>
      {deleteSceneIndex !== null && (
        <ConfirmDialog title="Xóa phân cảnh?"
          message={`Bạn có chắc chắn muốn xóa phân cảnh #${deleteSceneIndex + 1} khỏi dự án này không?`}
          confirmLabel="Xóa phân cảnh"
          onCancel={() => setDeleteSceneIndex(null)}
          onConfirm={() => {
            const index = deleteSceneIndex;
            setScenes(prev => prev.filter((_, sceneIndex) => sceneIndex !== index));
            setDeleteSceneIndex(null);
          }}
        />
      )}
    </div>
  );
}
