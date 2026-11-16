export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'USER';
export type UserStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'DISABLED';

export interface User {
  id: string;
  email: string;
  username?: string | null;
  fullName: string;
  phone?: string | null;
  purpose?: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt?: string;
  approvedAt?: string | null;
  lastLoginAt?: string | null;
}

export interface UserQuota {
  user_id?: string;
  daily_video_limit: number;
  monthly_video_limit: number;
  max_duration_sec: number;
  max_images_per_product: number;
  can_use_ai_video: number;
  can_use_voice: number;
  can_use_advanced_models: number;
}

export interface UserUsage {
  dailyUsed: number;
  monthlyUsed: number;
}

export interface Industry {
  id: string;
  slug: string;
  name: string;
  description: string;
  is_active: number;
  sort_order: number;
}

export interface VideoTopic {
  id: string;
  slug: string;
  name: string;
  is_active: number;
  sort_order: number;
}

export interface VideoTemplate {
  id: string;
  slug: string;
  name: string;
  videoType: string;
  industry: string;
  description: string;
  styleNotes: string;
  previewAccent: string;
  suggestedDuration: number;
  supportedRatios: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface ProductImage {
  id: string;
  productId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  storageProvider: string;
  imageUrl: string;
  sortOrder: number;
  isPrimary: boolean;
  isAiGenerated: boolean;
  createdAt?: string;
}

export interface ProductAnalysis {
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

export interface Product {
  id: string;
  name: string;
  brand: string;
  industry: string;
  description: string;
  highlights: string[];
  extraInfo: string;
  aiAnalysis: ProductAnalysis | null;
  images: ProductImage[];
  createdAt: string;
  updatedAt: string;
}

export type SceneSourceType = 'REAL_PRODUCT' | 'AI_GENERATED' | 'AI_VIDEO' | 'USER_VIDEO';
export type MotionType = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'parallax' | 'rotate-showcase';
export type TransitionType = 'fade' | 'slide' | 'zoom-cut';
export type LightingEffect = 'studio-glow' | 'warm-gold' | 'neon-rim' | 'clean';
export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';
export type ProjectStatus = 'DRAFT' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface VideoScene {
  id?: string;
  projectId?: string;
  productId?: string | null;
  productName?: string;
  sortOrder: number;
  durationSec: number;
  narration: string;
  onScreenText: string;
  showOnScreenText?: boolean;
  imageId?: string | null;
  imageUrl: string;
  aiVideoUrl?: string | null;
  sourceType: SceneSourceType;
  motionType: MotionType;
  transitionType: TransitionType;
  lightingEffect: LightingEffect;
  visualPrompt: string;
  musicMood: string;
}

export interface ScriptVariant {
  variantName: string;
  hookSummary: string;
  ctaText: string;
  scenes: Array<Omit<VideoScene, 'imageUrl' | 'sourceType'>>;
}

export interface VoiceConfig {
  enabled: boolean;
  voice: string;
  speed: number;
  previewMode: 'kokoro' | 'browser-speech' | 'silent';
}

export interface MusicConfig {
  enabled: boolean;
  mood: 'upbeat-modern' | 'elegant-ambient' | 'warm-acoustic' | 'tech-pulse';
  volume: number;
}

export interface VideoProject {
  id: string;
  productId: string | null;
  productName?: string | null;
  templateId: string | null;
  title: string;
  videoType: string;
  industry: string;
  targetAudience: string;
  style: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  language: 'vi' | 'en';
  status: ProjectStatus;
  voiceConfig?: VoiceConfig;
  musicConfig?: MusicConfig;
  brandLogoUrl?: string;
  ctaText?: string;
  outputFormat?: string | null;
  outputResolution?: string | null;
  outputSizeBytes?: number | null;
  outputFileUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AICapabilityModule {
  moduleKey: string;
  displayName: string;
  category: string;
  provider: string;
  modelName: string;
  isEnabled: boolean;
  isPaid: boolean;
  fallbackMode: string;
  dailyLimit: number;
  monthlyLimit: number;
  lastStatus: string;
  lastError: string | null;
  runtimeReady: boolean;
}
