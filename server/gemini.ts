import { GoogleGenAI, Type } from '@google/genai';

export interface ProductAnalysisInput {
  name: string;
  brand: string;
  industry: string;
  description: string;
  highlights: string[];
  extraInfo: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface ProductAnalysisResult {
  mode: 'gemini' | 'structured-free';
  model: string;
  detectedCategory: string;
  visualSummary: string;
  confirmedFacts: string[];
  aiSuggestions: {
    colorsAndMaterials: string;
    keyDetails: string[];
    uspIdeas: string[];
    targetAudiences: string[];
    promoMessages: string[];
    recommendedVideoTypes: string[];
  };
  disclaimer: string;
}

export interface ScriptGenerationInput {
  productName: string;
  brand: string;
  industry: string;
  description: string;
  highlights: string[];
  videoType: string;
  targetAudience: string;
  style: string;
  durationSec: number;
  language: string;
  imageCount: number;
  modelName?: string;
}

export interface GeneratedScene {
  sortOrder: number;
  durationSec: number;
  narration: string;
  onScreenText: string;
  motionType: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'parallax' | 'rotate-showcase';
  transitionType: 'fade' | 'slide' | 'zoom-cut';
  lightingEffect: 'studio-glow' | 'warm-gold' | 'neon-rim' | 'clean';
  visualPrompt: string;
  musicMood: string;
}

export interface ScriptVariant {
  variantName: string;
  hookSummary: string;
  ctaText: string;
  scenes: GeneratedScene[];
}

export interface ScriptGenerationResult {
  mode: 'gemini' | 'structured-free';
  model: string;
  variants: ScriptVariant[];
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function analyzeProductWithGemini(input: ProductAnalysisInput): Promise<ProductAnalysisResult> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_NOT_CONFIGURED');
  }

  const promptText = [
    'Phân tích sản phẩm sau bằng tiếng Việt để chuẩn bị làm video sản phẩm.',
    `Tên sản phẩm: ${input.name}`,
    `Thương hiệu: ${input.brand || 'Chưa cung cấp'}`,
    `Ngành hàng: ${input.industry}`,
    `Mô tả từ người dùng: ${input.description || 'Chưa cung cấp'}`,
    `Đặc điểm nổi bật từ người dùng: ${input.highlights.length ? input.highlights.join('; ') : 'Chưa cung cấp'}`,
    `Thông tin bổ sung: ${input.extraInfo || 'Không có'}`,
    'YÊU CẦU BẮT BUỘC:',
    '1. Ưu tiên tuyệt đối thông tin do người dùng cung cấp trong confirmedFacts.',
    '2. KHÔNG tự suy diễn thông số kỹ thuật, chứng nhận chất lượng, công dụng y tế/pháp lý hoặc cam kết bảo hành nếu không có trong dữ liệu.',
    '3. Phân biệt rõ nội dung quan sát/gợi ý sáng tạo trong aiSuggestions.',
  ].join('\n');

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (input.imageBase64 && input.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: input.imageMimeType,
        data: input.imageBase64,
      },
    });
  }
  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: { parts },
    config: {
      systemInstruction:
        'Bạn là chuyên gia phân tích sản phẩm đa ngành hàng cho nền tảng tạo video thương mại. Trung thực, không bịa thông số hay chứng nhận không có thật.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detectedCategory: { type: Type.STRING },
          visualSummary: { type: Type.STRING },
          confirmedFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
          colorsAndMaterials: { type: Type.STRING },
          keyDetails: { type: Type.ARRAY, items: { type: Type.STRING } },
          uspIdeas: { type: Type.ARRAY, items: { type: Type.STRING } },
          targetAudiences: { type: Type.ARRAY, items: { type: Type.STRING } },
          promoMessages: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendedVideoTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          'detectedCategory',
          'visualSummary',
          'confirmedFacts',
          'colorsAndMaterials',
          'keyDetails',
          'uspIdeas',
          'targetAudiences',
          'promoMessages',
          'recommendedVideoTypes',
        ],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    detectedCategory: string;
    visualSummary: string;
    confirmedFacts: string[];
    colorsAndMaterials: string;
    keyDetails: string[];
    uspIdeas: string[];
    targetAudiences: string[];
    promoMessages: string[];
    recommendedVideoTypes: string[];
  };

  return {
    mode: 'gemini',
    model: 'gemini-3.8-flash',
    detectedCategory: parsed.detectedCategory || input.industry,
    visualSummary: parsed.visualSummary || '',
    confirmedFacts: parsed.confirmedFacts || [],
    aiSuggestions: {
      colorsAndMaterials: parsed.colorsAndMaterials || '',
      keyDetails: parsed.keyDetails || [],
      uspIdeas: parsed.uspIdeas || [],
      targetAudiences: parsed.targetAudiences || [],
      promoMessages: parsed.promoMessages || [],
      recommendedVideoTypes: parsed.recommendedVideoTypes || ['Advertisement', 'Product Showcase'],
    },
    disclaimer: 'Thông tin xác nhận lấy từ dữ liệu người dùng nhập; phần gợi ý sáng tạo do Gemini AI đề xuất và cần người dùng kiểm duyệt trước khi xuất bản.',
  };
}

export async function generateScriptsWithGemini(input: ScriptGenerationInput): Promise<ScriptGenerationResult> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_NOT_CONFIGURED');
  }

  const modelName = (input.modelName || 'gemini-3.8-flash').replace(/^models\//, '').trim() || 'gemini-3.8-flash';
  const sceneCount = input.durationSec <= 15 ? 3 : input.durationSec <= 30 ? 5 : input.durationSec <= 45 ? 6 : input.durationSec <= 60 ? 7 : 9;
  const promptText = [
    `Tạo 2 phương án kịch bản video sản phẩm (${input.language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}) với tổng thời lượng khoảng ${input.durationSec} giây, mỗi phương án gồm ${sceneCount} phân cảnh.`,
    `Loại video: ${input.videoType}`,
    `Ngành hàng: ${input.industry}`,
    `Tên sản phẩm: ${input.productName}`,
    `Thương hiệu: ${input.brand || 'Chưa cung cấp'}`,
    `Mô tả sản phẩm: ${input.description || 'Chưa cung cấp'}`,
    `Điểm nổi bật đã xác nhận: ${input.highlights.join('; ') || 'Dựa trên hình ảnh sản phẩm'}`,
    `Đối tượng khách hàng: ${input.targetAudience || 'Khách hàng phổ thông quan tâm sản phẩm'}`,
    `Phong cách: ${input.style}`,
    `Lưu ý: Không bịa thông số hay chứng nhận không có trong mô tả. Tổng durationSec các phân cảnh trong mỗi phương án phải bằng ${input.durationSec}.`,
    'motionType chỉ chọn trong: zoom-in, zoom-out, pan-left, pan-right, parallax, rotate-showcase.',
    'transitionType chỉ chọn trong: fade, slide, zoom-cut.',
    'lightingEffect chỉ chọn trong: studio-glow, warm-gold, neon-rim, clean.',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: modelName,
    contents: promptText,
    config: {
      systemInstruction:
        'Bạn là biên kịch video quảng cáo sản phẩm chuyên nghiệp. Tạo kịch bản súc tích, đúng thời lượng, lời thoại tự nhiên, trung thực với thông tin sản phẩm.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            variantName: { type: Type.STRING },
            hookSummary: { type: Type.STRING },
            ctaText: { type: Type.STRING },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sortOrder: { type: Type.INTEGER },
                  durationSec: { type: Type.NUMBER },
                  narration: { type: Type.STRING },
                  onScreenText: { type: Type.STRING },
                  motionType: { type: Type.STRING },
                  transitionType: { type: Type.STRING },
                  lightingEffect: { type: Type.STRING },
                  visualPrompt: { type: Type.STRING },
                  musicMood: { type: Type.STRING },
                },
                required: ['sortOrder', 'durationSec', 'narration', 'onScreenText', 'motionType', 'transitionType', 'lightingEffect', 'visualPrompt', 'musicMood'],
              },
            },
          },
          required: ['variantName', 'hookSummary', 'ctaText', 'scenes'],
        },
      },
    },
  });

  const rawText = (response.text ?? '[]').trim();
  const fenced = rawText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const parsed = JSON.parse(fenced ? fenced[1].trim() : rawText) as unknown;
  const rawList = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { variants?: unknown[] }).variants)
      ? (parsed as { variants: unknown[] }).variants
      : [];
  if (rawList.length === 0) {
    throw new Error('Gemini không trả về phương án kịch bản.');
  }
  const allowedMotion: GeneratedScene['motionType'][] = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'parallax', 'rotate-showcase'];
  const allowedTransition: GeneratedScene['transitionType'][] = ['fade', 'slide', 'zoom-cut'];
  const allowedLighting: GeneratedScene['lightingEffect'][] = ['studio-glow', 'warm-gold', 'neon-rim', 'clean'];
  const rawVariants: ScriptVariant[] = rawList.slice(0, 2).map((item, variantIdx) => {
    const v = (item && typeof item === 'object' ? item : {}) as Partial<ScriptVariant>;
    const sourceScenes = Array.isArray(v.scenes) ? v.scenes.slice(0, 12) : [];
    const count = sourceScenes.length;
    if (count === 0) throw new Error(`Phương án ${variantIdx + 1} không có phân cảnh.`);
    const safeTotal = Math.max(count, input.durationSec);
    const weights = sourceScenes.map(s => (Number.isFinite(Number(s?.durationSec)) && Number(s?.durationSec) > 0 ? Number(s?.durationSec) : 1));
    const weightTotal = weights.reduce((sum, val) => sum + val, 0) || count;
    let remaining = safeTotal;
    const scenes: GeneratedScene[] = sourceScenes.map((s, idx) => {
      const leftAfter = count - 1 - idx;
      let dur: number;
      if (idx === count - 1) {
        dur = Number(Math.max(1, remaining).toFixed(1));
      } else {
        const ideal = Number(((safeTotal * weights[idx]) / weightTotal).toFixed(1));
        const maxForThis = Number((remaining - leftAfter).toFixed(1));
        dur = Number(Math.max(1, Math.min(ideal, maxForThis)).toFixed(1));
        remaining = Number((remaining - dur).toFixed(1));
      }
      const motion = String(s?.motionType || '') as GeneratedScene['motionType'];
      const transition = String(s?.transitionType || '') as GeneratedScene['transitionType'];
      const lighting = String(s?.lightingEffect || '') as GeneratedScene['lightingEffect'];
      return {
        sortOrder: idx,
        durationSec: dur,
        narration: String(s?.narration || ''),
        onScreenText: String(s?.onScreenText || ''),
        motionType: allowedMotion.includes(motion) ? motion : 'zoom-in',
        transitionType: allowedTransition.includes(transition) ? transition : 'fade',
        lightingEffect: allowedLighting.includes(lighting) ? lighting : 'studio-glow',
        visualPrompt: String(s?.visualPrompt || ''),
        musicMood: String(s?.musicMood || 'upbeat-modern'),
      };
    });
    return {
      variantName: String(v.variantName || `Phương án ${variantIdx + 1}`),
      hookSummary: String(v.hookSummary || ''),
      ctaText: String(v.ctaText || 'Khám phá ngay'),
      scenes,
    };
  });
  return {
    mode: 'gemini',
    model: modelName,
    variants: rawVariants,
  };
}
