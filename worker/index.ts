export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: unknown;
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

export interface AICaller {
  analyzeProduct?: (input: {
    name: string;
    brand: string;
    industry: string;
    description: string;
    highlights: string[];
    extraInfo: string;
    imageBase64?: string;
    imageMimeType?: string;
  }) => Promise<unknown>;
  generateScripts?: (input: {
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
  }) => Promise<unknown>;
}

export interface Env {
  DB: D1Database;
  BOOTSTRAP_ADMIN_KEY?: string;
  APP_ORIGIN?: string;
  SESSION_DAYS?: string;
  GEMINI_API_KEY?: string;
  IMAGEKIT_PUBLIC_KEY?: string;
  IMAGEKIT_PRIVATE_KEY?: string;
  IMAGEKIT_URL_ENDPOINT?: string;
  KOKORO_TTS_URL?: string;
  FAL_KEY?: string;
  COMFYUI_API_URL?: string;
  AI_CALLER?: AICaller;
}

interface UserRow {
  id: string;
  email: string;
  username: string | null;
  full_name: string;
  phone: string | null;
  purpose: string | null;
  password_hash: string;
  password_salt: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'USER';
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'DISABLED';
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  last_login_at: string | null;
}

interface UserQuotaRow {
  user_id: string;
  daily_video_limit: number;
  monthly_video_limit: number;
  max_duration_sec: number;
  max_images_per_product: number;
  can_use_ai_video: number;
  can_use_voice: number;
  can_use_advanced_models: number;
}

interface AIConfigRow {
  module_key: string;
  display_name: string;
  category: string;
  provider: string;
  model_name: string;
  is_enabled: number;
  is_paid: number;
  fallback_mode: string;
  daily_limit: number;
  monthly_limit: number;
  config_json: string;
  last_status: string;
  last_error: string | null;
  updated_at: string;
}

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
const fail = (message: string, status = 400) => json({ error: message }, status);
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const uuid = () => crypto.randomUUID();
const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const hex = (v: Uint8Array) => Array.from(v, x => x.toString(16).padStart(2, '0')).join('');
const fromHex = (s: string) => new Uint8Array((s.match(/.{2}/g) || []).map(x => parseInt(x, 16)));
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function digest(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return hex(new Uint8Array(hash));
}

async function passwordHash(password: string, salt: string, iterations = 100000) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(salt), iterations, hash: 'SHA-256' },
    key,
    256
  );
  return hex(new Uint8Array(bits));
}

async function verifyPassword(password: string, salt: string, expected: string) {
  if (!password || !salt || !expected) return false;
  const current = await passwordHash(password, salt, 100000);
  if (current === expected) return true;
  try {
    const legacy = await passwordHash(password, salt, 310000);
    return legacy === expected;
  } catch {
    return false;
  }
}

function cookie(request: Request, name: string) {
  const raw = request.headers.get('cookie') || '';
  const item = raw.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
}

function isHttpsRequest(request: Request) {
  return new URL(request.url).protocol === 'https:';
}

function isIframeRequest(request: Request) {
  return request.headers.get('sec-fetch-dest') === 'iframe';
}

function sessionToken(request: Request) {
  return cookie(request, '__Host-avs_session') || cookie(request, 'avs_session');
}

function cookieHeader(value: string, maxAge: number, isHttps: boolean, isIframe = false) {
  if (isHttps) {
    if (isIframe) {
      return `__Host-avs_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${maxAge}`;
    }
    return `__Host-avs_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  }
  return `avs_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(isHttps: boolean, isIframe = false) {
  if (isHttps) {
    if (isIframe) {
      return '__Host-avs_session=; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0';
    }
    return '__Host-avs_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  }
  return 'avs_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

function originAllowed(request: Request, env: Env) {
  const origin = request.headers.get('origin');
  if (!origin) return request.method === 'GET' || request.method === 'HEAD';
  const reqOrigin = new URL(request.url).origin;
  if (origin === reqOrigin) return true;
  if (env.APP_ORIGIN && origin === env.APP_ORIGIN) return true;
  return false;
}

async function body(request: Request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(400, 'Yêu cầu phải sử dụng JSON.');
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new HttpError(400, 'Dữ liệu JSON không hợp lệ.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Dữ liệu không hợp lệ.');
  return value as Record<string, unknown>;
}

function clientIp(request: Request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.full_name,
    phone: user.phone,
    purpose: user.purpose,
    role: user.role,
    status: user.status,
    createdAt: user.created_at,
    approvedAt: user.approved_at,
    lastLoginAt: user.last_login_at,
  };
}

async function getOrCreateQuota(env: Env, userId: string): Promise<UserQuotaRow> {
  const row = await env.DB.prepare('SELECT * FROM user_quotas WHERE user_id=?').bind(userId).first<UserQuotaRow>();
  if (row) return row;
  const defaults: UserQuotaRow = {
    user_id: userId,
    daily_video_limit: 5,
    monthly_video_limit: 60,
    max_duration_sec: 60,
    max_images_per_product: 10,
    can_use_ai_video: 0,
    can_use_voice: 1,
    can_use_advanced_models: 0,
  };
  await env.DB.prepare(
    'INSERT OR IGNORE INTO user_quotas(user_id,daily_video_limit,monthly_video_limit,max_duration_sec,max_images_per_product,can_use_ai_video,can_use_voice,can_use_advanced_models) VALUES(?,?,?,?,?,?,?,?)'
  )
    .bind(
      defaults.user_id,
      defaults.daily_video_limit,
      defaults.monthly_video_limit,
      defaults.max_duration_sec,
      defaults.max_images_per_product,
      defaults.can_use_ai_video,
      defaults.can_use_voice,
      defaults.can_use_advanced_models
    )
    .run();
  return defaults;
}

async function getUserVideoUsage(env: Env, userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  const daily = await env.DB.prepare("SELECT COUNT(*) AS count FROM video_projects WHERE user_id=? AND substr(created_at,1,10)=?")
    .bind(userId, today)
    .first<{ count: number }>();
  const monthly = await env.DB.prepare("SELECT COUNT(*) AS count FROM video_projects WHERE user_id=? AND substr(created_at,1,7)=?")
    .bind(userId, month)
    .first<{ count: number }>();
  return { dailyUsed: daily?.count || 0, monthlyUsed: monthly?.count || 0 };
}

async function currentUser(request: Request, env: Env): Promise<UserRow | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const hash = await digest(token);
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > ? LIMIT 1`
  )
    .bind(hash, new Date().toISOString())
    .first<UserRow>();
  if (!row || row.status !== 'APPROVED') return null;
  return row;
}

async function audit(env: Env, actor: string | null, target: string | null, action: string, details?: unknown) {
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,target_user_id,action,details) VALUES(?,?,?,?,?)')
    .bind(uuid(), actor, target, action, details ? JSON.stringify(details).slice(0, 2000) : null)
    .run();
}

function roleRank(role: string) {
  return ({ SUPER_ADMIN: 4, ADMIN: 3, EDITOR: 2, USER: 1 } as Record<string, number>)[role] || 0;
}

async function issueSession(env: Env, user: UserRow) {
  const token = hex(bytes(32));
  const days = Math.min(30, Math.max(1, Number(env.SESSION_DAYS || 30)));
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  await env.DB.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)')
    .bind(uuid(), user.id, await digest(token), expires)
    .run();
  await env.DB.prepare('UPDATE users SET last_login_at=?,updated_at=? WHERE id=?')
    .bind(new Date().toISOString(), new Date().toISOString(), user.id)
    .run();
  return { token, maxAge: days * 86400 };
}

async function checkRateLimit(env: Env, key: string, maxAttempts: number, windowMs: number): Promise<string | null> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const row = await env.DB.prepare('SELECT * FROM login_attempts WHERE attempt_key=?')
    .bind(key)
    .first<{ attempt_key: string; attempts: number; window_start: string; blocked_until: string | null }>();
  if (!row) return null;
  if (row.blocked_until && row.blocked_until > nowIso) {
    return 'Bạn đã thử quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.';
  }
  if (nowMs - Date.parse(row.window_start) > windowMs) {
    await env.DB.prepare('DELETE FROM login_attempts WHERE attempt_key=?').bind(key).run();
    return null;
  }
  if (row.attempts >= maxAttempts) {
    const blockedUntil = new Date(nowMs + windowMs).toISOString();
    await env.DB.prepare('UPDATE login_attempts SET blocked_until=? WHERE attempt_key=?').bind(blockedUntil, key).run();
    return 'Bạn đã thử quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.';
  }
  return null;
}

async function recordRateLimitAttempt(env: Env, key: string, windowMs: number) {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const row = await env.DB.prepare('SELECT * FROM login_attempts WHERE attempt_key=?')
    .bind(key)
    .first<{ attempts: number; window_start: string }>();
  if (!row || nowMs - Date.parse(row.window_start) > windowMs) {
    await env.DB.prepare('INSERT OR REPLACE INTO login_attempts(attempt_key,attempts,window_start,blocked_until) VALUES(?,1,?,NULL)')
      .bind(key, nowIso)
      .run();
  } else {
    await env.DB.prepare('UPDATE login_attempts SET attempts=attempts+1 WHERE attempt_key=?').bind(key).run();
  }
}

async function clearRateLimit(env: Env, key: string) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE attempt_key=?').bind(key).run();
}

async function logAiUsage(
  env: Env,
  userId: string | null,
  moduleKey: string,
  provider: string,
  modelName: string,
  action: string,
  status: string,
  tokensUsed = 0,
  estimatedCostUsd = 0,
  errorMessage: string | null = null
) {
  await env.DB.prepare(
    'INSERT INTO ai_usage_logs(id,user_id,module_key,provider,model_name,action,status,tokens_used,estimated_cost_usd,error_message) VALUES(?,?,?,?,?,?,?,?,?,?)'
  )
    .bind(uuid(), userId, moduleKey, provider, modelName, action, status, tokensUsed, estimatedCostUsd, errorMessage)
    .run();
}

async function aiModuleWithinLimits(env: Env, config: AIConfigRow): Promise<boolean> {
  const daily = await env.DB.prepare("SELECT COUNT(*) AS count FROM ai_usage_logs WHERE module_key=? AND status='SUCCESS' AND substr(created_at,1,10)=date('now')")
    .bind(config.module_key).first<{ count: number }>();
  const monthly = await env.DB.prepare("SELECT COUNT(*) AS count FROM ai_usage_logs WHERE module_key=? AND status='SUCCESS' AND substr(created_at,1,7)=strftime('%Y-%m','now')")
    .bind(config.module_key).first<{ count: number }>();
  return (daily?.count || 0) < Math.max(0, config.daily_limit) && (monthly?.count || 0) < Math.max(0, config.monthly_limit);
}

function buildStructuredFreeAnalysis(input: {
  name: string;
  brand: string;
  industry: string;
  description: string;
  highlights: string[];
  extraInfo: string;
  imageCount: number;
}) {
  const confirmedFacts: string[] = [];
  confirmedFacts.push(`Tên sản phẩm (người dùng nhập): ${input.name}`);
  if (input.brand) confirmedFacts.push(`Thương hiệu: ${input.brand}`);
  confirmedFacts.push(`Ngành hàng: ${input.industry}`);
  if (input.description) confirmedFacts.push(`Mô tả sản phẩm: ${input.description}`);
  for (const h of input.highlights) {
    if (h.trim()) confirmedFacts.push(`Đặc điểm nổi bật: ${h.trim()}`);
  }
  if (input.extraInfo) confirmedFacts.push(`Thông tin bổ sung: ${input.extraInfo}`);
  confirmedFacts.push(`Số hình ảnh sản phẩm thực tế đã tải lên: ${input.imageCount} ảnh`);

  const uspIdeas =
    input.highlights.length > 0
      ? input.highlights.map(h => `Nhấn mạnh: ${h}`)
      : [`Trình bày trực quan thiết kế và công năng của ${input.name}`];

  return {
    mode: 'structured-free' as const,
    model: 'rule-based-free',
    detectedCategory: input.industry,
    visualSummary: `Sản phẩm "${input.name}" thuộc ngành ${input.industry} với ${input.imageCount} hình ảnh gốc do người dùng cung cấp.`,
    confirmedFacts,
    aiSuggestions: {
      colorsAndMaterials: 'Dựa trên hình ảnh sản phẩm thực tế do người dùng tải lên (chưa kích hoạt phân tích thị giác Gemini).',
      keyDetails: input.highlights.length ? input.highlights : ['Cận cảnh tổng thể sản phẩm', 'Góc nhìn chi tiết chất liệu/kiểu dáng'],
      uspIdeas,
      targetAudiences: [`Khách hàng quan tâm nhóm ngành ${input.industry}`, 'Người mua sắm trực tuyến qua mạng xã hội'],
      promoMessages: [
        `${input.name}${input.brand ? ` từ ${input.brand}` : ''} — lựa chọn phù hợp cho nhu cầu hàng ngày.`,
        `Khám phá chi tiết ${input.name} qua hình ảnh thực tế.`,
      ],
      recommendedVideoTypes: ['Advertisement', 'Product Showcase', 'Product Review', 'TikTok Viral'],
    },
    disclaimer:
      'Đang sử dụng chế độ phân tích cấu trúc miễn phí (chưa kích hoạt hoặc chưa cấu hình Gemini API). Mọi dữ kiện được trích trực tiếp từ thông tin bạn đã nhập, không tự suy diễn thông số.',
  };
}

function buildStructuredFreeScripts(input: {
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
}) {
  const count = input.durationSec <= 15 ? 3 : input.durationSec <= 30 ? 4 : input.durationSec <= 45 ? 5 : input.durationSec <= 60 ? 6 : 7;
  const perScene = Number((input.durationSec / count).toFixed(1));
  const hl = input.highlights.length > 0 ? input.highlights : [input.description || input.productName];
  const isEn = input.language === 'en';
  const motions = ['zoom-in', 'pan-left', 'parallax', 'zoom-out', 'pan-right', 'rotate-showcase'] as const;
  const transitions = ['fade', 'slide', 'zoom-cut'] as const;
  const lights = ['studio-glow', 'warm-gold', 'clean', 'neon-rim'] as const;

  const makeScenes = (variantIdx: number) =>
    Array.from({ length: count }, (_, i) => {
      const point = hl[i % hl.length];
      let narration = '';
      let onScreenText = '';
      if (i === 0) {
        narration = isEn
          ? `Meet ${input.productName}${input.brand ? ` by ${input.brand}` : ''} — built for ${input.industry}.`
          : variantIdx === 0
            ? `Giới thiệu ${input.productName}${input.brand ? ` từ ${input.brand}` : ''} — giải pháp nổi bật cho nhóm ${input.industry}.`
            : `Bạn đang tìm kiếm ${input.productName}? Hãy cùng xem điểm ấn tượng ngay sau đây.`;
        onScreenText = input.productName;
      } else if (i === count - 1) {
        narration = isEn
          ? `Discover ${input.productName} today. Tap to learn more.`
          : `Trải nghiệm ${input.productName} ngay hôm nay. Liên hệ hoặc xem chi tiết sản phẩm!`;
        onScreenText = variantIdx === 0 ? 'Khám phá ngay' : 'Xem chi tiết sản phẩm';
      } else {
        narration = isEn
          ? `Highlight ${i}: ${point}.`
          : variantIdx === 0
            ? `Điểm nổi bật: ${point}.`
            : `Thiết kế và trải nghiệm thực tế: ${point}.`;
        onScreenText = point.slice(0, 64);
      }

      return {
        sortOrder: i,
        durationSec: i === count - 1 ? Number((input.durationSec - perScene * (count - 1)).toFixed(1)) : perScene,
        narration,
        onScreenText,
        motionType: motions[(i + variantIdx) % motions.length],
        transitionType: transitions[(i + variantIdx) % transitions.length],
        lightingEffect: lights[(i + variantIdx) % lights.length],
        visualPrompt: `Cảnh ${i + 1}: ${input.videoType} cho ${input.productName} (${input.style})`,
        musicMood: input.videoType === 'Luxury Commercial' ? 'elegant-ambient' : 'upbeat-modern',
      };
    });

  return {
    mode: 'structured-free' as const,
    model: 'rule-based-free',
    variants: [
      {
        variantName: isEn ? 'Direct Showcase' : 'Phương án 1: Trực diện sản phẩm',
        hookSummary: isEn ? 'Clean product-first intro' : 'Mở đầu trực diện tên sản phẩm và điểm nhấn chính',
        ctaText: isEn ? 'Learn More' : 'Tìm hiểu & Đặt hàng ngay',
        scenes: makeScenes(0),
      },
      {
        variantName: isEn ? 'Story & Benefit' : 'Phương án 2: Gợi mở nhu cầu',
        hookSummary: isEn ? 'Question-led audience hook' : 'Mở đầu bằng câu hỏi dẫn dắt khách hàng mục tiêu',
        ctaText: isEn ? 'Explore Today' : 'Xem chi tiết sản phẩm',
        scenes: makeScenes(1),
      },
    ],
  };
}

function normalizeSceneDurations(rawScenes: Array<Record<string, unknown>>, targetTotalSec: number) {
  const minPerScene = 2;
  const maxAllowedCount = Math.max(1, Math.min(12, Math.floor(Math.max(minPerScene, targetTotalSec) / minPerScene)));
  const sourceScenes = rawScenes.slice(0, maxAllowedCount);
  const count = sourceScenes.length;
  const safeTotal = Math.max(count * minPerScene, targetTotalSec);
  const weights = sourceScenes.map(scene => {
    const value = Number(scene.durationSec);
    return Number.isFinite(value) && value > 0 ? value : 1;
  });
  const weightTotal = weights.reduce((sum, value) => sum + value, 0) || count;
  const durations: number[] = [];
  let remaining = safeTotal;
  for (let i = 0; i < count; i++) {
    const scenesLeftAfterThis = count - 1 - i;
    if (i === count - 1) {
      durations.push(Number(Math.max(minPerScene, remaining).toFixed(1)));
    } else {
      const ideal = Number(((safeTotal * weights[i]) / weightTotal).toFixed(1));
      const maxAllowedForThis = Number((remaining - scenesLeftAfterThis * minPerScene).toFixed(1));
      const clamped = Math.max(minPerScene, Math.min(ideal, maxAllowedForThis));
      durations.push(Number(clamped.toFixed(1)));
      remaining = Number((remaining - clamped).toFixed(1));
    }
  }
  return { sourceScenes, durations };
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

async function generateScriptsWithGeminiApi(input: {
  productName: string; brand: string; industry: string; description: string; highlights: string[];
  videoType: string; targetAudience: string; style: string; durationSec: number; language: string;
}, apiKey: string, modelName = 'gemini-3.8-flash') {
  const sceneCount = input.durationSec <= 15 ? 3 : input.durationSec <= 30 ? 5 : input.durationSec <= 45 ? 6 : input.durationSec <= 60 ? 7 : 9;
  const prompt = [
    `Tạo 2 phương án kịch bản video sản phẩm bằng ${input.language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}, tổng thời lượng mỗi phương án đúng ${input.durationSec} giây, mỗi phương án gồm khoảng ${sceneCount} phân cảnh.`,
    `Loại video: ${input.videoType}`, `Ngành hàng: ${input.industry}`, `Tên sản phẩm: ${input.productName}`,
    `Thương hiệu: ${input.brand || 'Chưa cung cấp'}`, `Mô tả sản phẩm: ${input.description || 'Chưa cung cấp'}`,
    `Điểm nổi bật do người dùng cung cấp: ${input.highlights.join('; ') || 'Chưa cung cấp'}`,
    `Đối tượng khách hàng: ${input.targetAudience || 'Khách hàng quan tâm sản phẩm'}`, `Phong cách: ${input.style}`,
    'Không tự bịa thông số, chứng nhận, công dụng hoặc cam kết không có trong dữ liệu. Nội dung ngắn gọn, tự nhiên, có mở đầu thu hút, trình bày lợi ích và kết thúc bằng CTA.',
    'Tổng thời lượng các cảnh phải bằng chính xác thời lượng mục tiêu. narration là lời thoại, onScreenText là chữ ngắn hiển thị trên màn hình.',
    'motionType chỉ chọn: zoom-in, zoom-out, pan-left, pan-right, parallax, rotate-showcase.',
    'transitionType chỉ chọn: fade, slide, zoom-cut.', 'lightingEffect chỉ chọn: studio-glow, warm-gold, neon-rim, clean.',
    'Chỉ trả về JSON đúng cấu trúc được yêu cầu, không thêm markdown.',
  ].join('\n');
  const responseSchema = {
    type: 'ARRAY',
    items: { type: 'OBJECT', properties: {
      variantName: { type: 'STRING' }, hookSummary: { type: 'STRING' }, ctaText: { type: 'STRING' },
      scenes: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        sortOrder: { type: 'INTEGER' }, durationSec: { type: 'NUMBER' }, narration: { type: 'STRING' },
        onScreenText: { type: 'STRING' }, motionType: { type: 'STRING' }, transitionType: { type: 'STRING' },
        lightingEffect: { type: 'STRING' }, visualPrompt: { type: 'STRING' }, musicMood: { type: 'STRING' },
      }, required: ['sortOrder','durationSec','narration','onScreenText','motionType','transitionType','lightingEffect','visualPrompt','musicMood'] } },
    }, required: ['variantName','hookSummary','ctaText','scenes'] },
  };
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Bạn là biên kịch video quảng cáo sản phẩm chuyên nghiệp. Viết kịch bản trung thực, súc tích, có tính thương mại nhưng không phóng đại hoặc bịa đặt dữ kiện.' }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (fetchErr) {
    if (fetchErr instanceof Error && (fetchErr.name === 'AbortError' || fetchErr.name === 'TimeoutError')) {
      throw new Error('Hết thời gian chờ phản hồi từ Gemini API.');
    }
    throw new Error(fetchErr instanceof Error ? fetchErr.message : 'Không kết nối được tới Gemini API.');
  }
  const rawBody = await response.text();
  const payload = safeJsonParse<{
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  } | null>(rawBody, null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini API trả về HTTP ${response.status}.`);
  }
  const responseText = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim() || '';
  if (!responseText) throw new Error('Gemini không trả về nội dung kịch bản.');
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(stripJsonFences(responseText));
  } catch {
    throw new Error('Gemini trả về JSON kịch bản không đúng định dạng.');
  }
  const parsed = Array.isArray(parsedRaw)
    ? parsedRaw
    : parsedRaw && typeof parsedRaw === 'object' && Array.isArray((parsedRaw as { variants?: unknown[] }).variants)
      ? (parsedRaw as { variants: unknown[] }).variants
      : null;
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Cấu trúc kịch bản Gemini trả về không hợp lệ.');
  const allowedMotion = ['zoom-in','zoom-out','pan-left','pan-right','parallax','rotate-showcase'];
  const allowedTransition = ['fade','slide','zoom-cut'];
  const allowedLighting = ['studio-glow','warm-gold','neon-rim','clean'];
  const variants = parsed.slice(0,2).map((rawVariant, variantIndex) => {
    const variant = (rawVariant && typeof rawVariant === 'object' ? rawVariant : {}) as {
      variantName?: string; hookSummary?: string; ctaText?: string; scenes?: Array<Record<string, unknown>>;
    };
    if (!Array.isArray(variant.scenes) || variant.scenes.length === 0) throw new Error(`Phương án ${variantIndex + 1} không có phân cảnh.`);
    const { sourceScenes, durations } = normalizeSceneDurations(variant.scenes, input.durationSec);
    const scenes = sourceScenes.map((scene,index) => {
      const motion=String(scene.motionType||''), transition=String(scene.transitionType||''), lighting=String(scene.lightingEffect||'');
      return {
        sortOrder:index, durationSec: durations[index], narration:String(scene.narration||''), onScreenText:String(scene.onScreenText||''),
        motionType:allowedMotion.includes(motion)?motion:'zoom-in',
        transitionType:allowedTransition.includes(transition)?transition:'fade',
        lightingEffect:allowedLighting.includes(lighting)?lighting:'studio-glow',
        visualPrompt:String(scene.visualPrompt||''), musicMood:String(scene.musicMood||'upbeat-modern'),
      };
    });
    return { variantName:String(variant.variantName||`Phương án ${variantIndex+1}`), hookSummary:String(variant.hookSummary||''), ctaText:String(variant.ctaText||'Khám phá ngay'), scenes };
  });
  return { mode:'gemini' as const, model:modelName, variants };
}

async function uploadToImageKit(
  env: Env,
  fileName: string,
  base64Data: string,
  folder = '/ai-product-video-studio/products'
): Promise<{ url: string; fileId: string } | null> {
  if (!env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_URL_ENDPOINT) return null;
  const form = new FormData();
  form.append('file', base64Data);
  form.append('fileName', fileName);
  form.append('folder', folder);
  const auth = btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`);
  const resp = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST',
    headers: { authorization: `Basic ${auth}` },
    body: form,
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`ImageKit upload failed (${resp.status}): ${errText.slice(0, 200)}`);
  }
  const result = (await resp.json()) as { url: string; fileId: string };
  return { url: result.url, fileId: result.fileId };
}

async function uploadVideoToImageKit(env: Env, file: File): Promise<{ url: string; fileId: string }> {
  if (!env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_URL_ENDPOINT) throw new HttpError(503, 'ImageKit chưa được cấu hình để lưu trữ video lâu dài.');
  const form = new FormData();
  form.append('file', file, file.name || 'video.mp4');
  form.append('fileName', `${crypto.randomUUID()}-${(file.name || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '-')}`);
  form.append('folder', '/ai-product-video-studio/videos');
  const auth = btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`);
  const resp = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', headers: { authorization: `Basic ${auth}` }, body: form });
  if (!resp.ok) { const detail = await resp.text(); throw new HttpError(502, `ImageKit không thể lưu video (${resp.status}): ${detail.slice(0, 180)}`); }
  const result = await resp.json() as { url: string; fileId: string };
  if (!result.url || !result.fileId) throw new HttpError(502, 'ImageKit trả về thông tin tệp không hợp lệ.');
  return { url: result.url, fileId: result.fileId };
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!originAllowed(request, env)) return fail('Nguồn yêu cầu không được phép.', 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  try {
    if (path === '/api/health' && request.method === 'GET') {
      return json({
        ok: true,
        service: 'ai-product-video-studio-api',
        capabilities: {
          geminiConfigured: Boolean(env.GEMINI_API_KEY),
          falConfigured: Boolean(env.FAL_KEY),
          paidVideoGenerationEnabled: false,
          imagekitConfigured: Boolean(env.IMAGEKIT_PRIVATE_KEY && env.IMAGEKIT_URL_ENDPOINT),
          kokoroConfigured: Boolean(env.KOKORO_TTS_URL),
          comfyuiConfigured: Boolean(env.COMFYUI_API_URL),
        },
      });
    }

    // Public catalogs (templates & industries)
    if (path === '/api/industries' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM industries WHERE is_active=1 ORDER BY sort_order ASC, name ASC').all();
      return json({ industries: rows.results });
    }

    if (path === '/api/topics' && request.method === 'GET') {
      const rows = await env.DB.prepare(
        'SELECT id,slug,name,is_active,sort_order FROM video_topics WHERE is_active=1 ORDER BY sort_order ASC, name ASC'
      ).all();
      return json({ topics: rows.results });
    }

    if (path === '/api/templates' && request.method === 'GET') {
      const actor = await currentUser(request, env);
      const isAdmin = actor && roleRank(actor.role) >= roleRank('ADMIN');
      const sql = isAdmin
        ? 'SELECT * FROM templates ORDER BY sort_order ASC, created_at DESC'
        : 'SELECT * FROM templates WHERE is_active=1 ORDER BY sort_order ASC, created_at DESC';
      const rows = await env.DB.prepare(sql).all<Record<string, unknown>>();
      const templates = rows.results.map(r => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        videoType: r.video_type,
        industry: r.industry,
        description: r.description,
        styleNotes: r.style_notes,
        previewAccent: r.preview_accent,
        suggestedDuration: r.suggested_duration,
        supportedRatios: safeJsonParse<string[]>(String(r.supported_ratios_json || '[]'), ['9:16', '16:9', '1:1']),
        isActive: Boolean(r.is_active),
        sortOrder: r.sort_order,
      }));
      return json({ templates });
    }

    // Auth endpoints
    if (path === '/api/auth/register' && request.method === 'POST') {
      const ip = clientIp(request);
      const rateErr = await checkRateLimit(env, `reg:${ip}`, 10, 60 * 60 * 1000);
      if (rateErr) return fail(rateErr, 429);
      await recordRateLimitAttempt(env, `reg:${ip}`, 60 * 60 * 1000);

      const data = await body(request);
      const email = str(data.email).toLowerCase();
      const username = str(data.username).toLowerCase();
      const fullName = str(data.fullName);
      const phone = str(data.phone);
      const purpose = str(data.purpose);
      const password = str(data.password);

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) return fail('Email không hợp lệ.');
      if (username && (!/^[a-z0-9._-]{3,40}$/.test(username))) {
        return fail('Tên đăng nhập chỉ gồm chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới (3-40 ký tự).');
      }
      if (fullName.length < 2 || fullName.length > 120) return fail('Họ và tên phải từ 2 đến 120 ký tự.');
      if (password.length < 12 || password.length > 128) return fail('Mật khẩu phải có ít nhất 12 ký tự.');
      if (phone && phone.length > 30) return fail('Số điện thoại không hợp lệ.');
      if (purpose.length > 500) return fail('Mục đích sử dụng tối đa 500 ký tự.');

      const exists = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
      if (exists) return fail('Email này đã được đăng ký.', 409);

      if (username) {
        const usernameExists = await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first();
        if (usernameExists) return fail('Tên đăng nhập này đã được sử dụng.', 409);
      }

      const salt = hex(bytes(16));
      const id = uuid();
      await env.DB.prepare(
        'INSERT INTO users(id,email,username,full_name,phone,purpose,password_hash,password_salt,role,status) VALUES(?,?,?,?,?,?,?,?,?,?)'
      )
        .bind(id, email, username || null, fullName, phone || null, purpose || null, await passwordHash(password, salt), salt, 'USER', 'PENDING_APPROVAL')
        .run();

      await getOrCreateQuota(env, id);
      await audit(env, null, id, 'ACCOUNT_REGISTERED', { email, username: username || null });
      return json(
        { message: 'Đăng ký thành công. Tài khoản đang chờ quản trị viên phê duyệt.', status: 'PENDING_APPROVAL' },
        201
      );
    }

    if (path === '/api/auth/bootstrap' && request.method === 'POST') {
      if (!env.BOOTSTRAP_ADMIN_KEY || !request.headers.get('x-bootstrap-key') || request.headers.get('x-bootstrap-key') !== env.BOOTSTRAP_ADMIN_KEY) {
        return fail('Không có quyền khởi tạo.', 403);
      }
      const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role='SUPER_ADMIN'").first<{ count: number }>();
      if ((count?.count || 0) > 0) return fail('Super Admin đã được khởi tạo. Không thể khởi tạo lần nữa.', 409);
      const data = await body(request);
      const email = str(data.email).toLowerCase();
      const username = str(data.username || 'superadmin').toLowerCase();
      const fullName = str(data.fullName);
      const password = str(data.password);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || fullName.length < 2 || password.length < 12 || password.length > 128) {
        return fail('Thông tin khởi tạo không hợp lệ; mật khẩu tối thiểu 12 ký tự.');
      }
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
      if (existing) return fail('Email đã tồn tại. Hãy dùng email quản trị khác.', 409);
      const salt = hex(bytes(16));
      const id = uuid();
      await env.DB.prepare(
        "INSERT INTO users(id,email,username,full_name,password_hash,password_salt,role,status,approved_at) VALUES(?,?,?,?,?,?,'SUPER_ADMIN','APPROVED',?)"
      )
        .bind(id, email, username, fullName, await passwordHash(password, salt), salt, new Date().toISOString())
        .run();
      await env.DB.prepare(
        'INSERT OR REPLACE INTO user_quotas(user_id,daily_video_limit,monthly_video_limit,max_duration_sec,max_images_per_product,can_use_ai_video,can_use_voice,can_use_advanced_models) VALUES(?,100,2000,90,10,1,1,1)'
      )
        .bind(id)
        .run();
      await audit(env, id, id, 'SUPER_ADMIN_BOOTSTRAPPED');
      return json({ message: 'Đã khởi tạo Super Admin. Hãy xóa secret BOOTSTRAP_ADMIN_KEY khỏi môi trường sau bước này.' }, 201);
    }

    if (path === '/api/auth/login' && request.method === 'POST') {
      const data = await body(request);
      const identifier = (str(data.identifier) || str(data.email)).toLowerCase();
      const password = str(data.password);
      if (!identifier || !password) {
        return fail('Vui lòng nhập email hoặc tên đăng nhập và mật khẩu.', 400);
      }
      const ip = clientIp(request);
      const rateKey = `login:${ip}:${identifier}`;

      const blocked = await checkRateLimit(env, rateKey, 8, 15 * 60 * 1000);
      if (blocked) return fail(blocked, 429);

      const user = await env.DB.prepare('SELECT * FROM users WHERE email=? OR username=?')
        .bind(identifier, identifier)
        .first<UserRow>();

      if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
        await recordRateLimitAttempt(env, rateKey, 15 * 60 * 1000);
        await audit(env, null, user?.id || null, 'LOGIN_FAILED', { identifier });
        return fail('Email/tên đăng nhập hoặc mật khẩu không chính xác.', 401);
      }

      if (user.status !== 'APPROVED') {
        const msg =
          user.status === 'PENDING_APPROVAL'
            ? 'Tài khoản đang chờ quản trị viên phê duyệt.'
            : user.status === 'REJECTED'
              ? 'Tài khoản đã bị từ chối phê duyệt.'
              : user.status === 'SUSPENDED'
                ? 'Tài khoản đang bị tạm ngưng.'
                : 'Tài khoản hiện đang bị khóa.';
        return fail(msg, 403);
      }

      await clearRateLimit(env, rateKey);
      const session = await issueSession(env, user);
      const quota = await getOrCreateQuota(env, user.id);
      const usage = await getUserVideoUsage(env, user.id);
      await audit(env, user.id, user.id, 'LOGIN', { ip });
      return json(
        { user: publicUser(user), quota, usage },
        200,
        { 'set-cookie': cookieHeader(session.token, session.maxAge, isHttpsRequest(request), isIframeRequest(request)) }
      );
    }

    if (path === '/api/auth/logout' && request.method === 'POST') {
      const actor = await currentUser(request, env);
      const token = sessionToken(request);
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
      if (actor) await audit(env, actor.id, actor.id, 'LOGOUT');
      return json({ message: 'Đã đăng xuất.' }, 200, { 'set-cookie': clearCookie(isHttpsRequest(request), isIframeRequest(request)) });
    }

    if (path === '/api/auth/me' && request.method === 'GET') {
      const user = await currentUser(request, env);
      if (!user) {
        const hadToken = Boolean(sessionToken(request));
        return json(
          { user: null },
          200,
          hadToken ? { 'set-cookie': clearCookie(isHttpsRequest(request), isIframeRequest(request)) } : {}
        );
      }
      const quota = await getOrCreateQuota(env, user.id);
      const usage = await getUserVideoUsage(env, user.id);
      // Refresh the persistent session when the user opens or returns to the app.
      // This keeps the D1 expiry and browser cookie aligned without logging out on tab close or short inactivity.
      const token = sessionToken(request);
      const days = Math.min(30, Math.max(1, Number(env.SESSION_DAYS || 30)));
      const expires = new Date(Date.now() + days * 86400000).toISOString();
      await env.DB.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?')
        .bind(expires, await digest(token))
        .run();
      return json(
        { user: publicUser(user), quota, usage },
        200,
        { 'set-cookie': cookieHeader(token, days * 86400, isHttpsRequest(request), isIframeRequest(request)) }
      );
    }

    // Authenticated & Approved User Gate
    const actor = await currentUser(request, env);
    if (!actor) return fail('Vui lòng đăng nhập bằng tài khoản đã được phê duyệt.', 401);

    if (path === '/api/auth/profile' && request.method === 'PATCH') {
      const data = await body(request);
      const fullName = str(data.fullName);
      const phone = str(data.phone);
      const purpose = str(data.purpose);
      if (fullName.length < 2 || fullName.length > 120) return fail('Họ và tên phải từ 2 đến 120 ký tự.');
      if (phone.length > 30) return fail('Số điện thoại không hợp lệ.');
      if (purpose.length > 500) return fail('Mục đích sử dụng tối đa 500 ký tự.');
      await env.DB.prepare('UPDATE users SET full_name=?,phone=?,purpose=?,updated_at=? WHERE id=?')
        .bind(fullName, phone || null, purpose || null, new Date().toISOString(), actor.id)
        .run();
      const updated = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(actor.id).first<UserRow>();
      await audit(env, actor.id, actor.id, 'PROFILE_UPDATED');
      return json({ user: updated ? publicUser(updated) : publicUser(actor), message: 'Đã cập nhật thông tin tài khoản.' });
    }

    if (path === '/api/auth/change-password' && request.method === 'POST') {
      const data = await body(request);
      const current = str(data.currentPassword);
      const next = str(data.newPassword);
      if (!current) return fail('Vui lòng nhập mật khẩu hiện tại.');
      if (next.length < 12 || next.length > 128) return fail('Mật khẩu mới phải có ít nhất 12 ký tự.');
      if (data.confirmNewPassword !== undefined && str(data.confirmNewPassword) !== next) {
        return fail('Mật khẩu mới và xác nhận mật khẩu chưa khớp.');
      }
      const row = await env.DB.prepare('SELECT password_hash,password_salt FROM users WHERE id=?')
        .bind(actor.id)
        .first<{ password_hash: string; password_salt: string }>();
      if (!row || !(await verifyPassword(current, row.password_salt, row.password_hash))) {
        return fail('Mật khẩu hiện tại không chính xác.', 403);
      }
      const salt = hex(bytes(16));
      await env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?')
        .bind(await passwordHash(next, salt), salt, new Date().toISOString(), actor.id)
        .run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(actor.id).run();
      const fresh = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(actor.id).first<UserRow>();
      if (!fresh) return fail('Không thể tải lại tài khoản.', 500);
      const session = await issueSession(env, fresh);
      await audit(env, actor.id, actor.id, 'PASSWORD_CHANGED');
      return json(
        { message: 'Đổi mật khẩu thành công.' },
        200,
        { 'set-cookie': cookieHeader(session.token, session.maxAge, isHttpsRequest(request), isIframeRequest(request)) }
      );
    }

    // Upload standalone scene image (no product required; uses ImageKit when configured, or D1 fallback)
    if (path === '/api/media/scene-image' && request.method === 'POST') {
      const data = await body(request);
      const fileName = str(data.fileName) || 'scene-image.jpg';
      const rawMime = str(data.mimeType).toLowerCase();
      const fileExt = fileName.toLowerCase().split('.').pop() || '';
      const extToMime: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
      const mimeType = rawMime === 'image/jpg'
        ? 'image/jpeg'
        : ['image/jpeg', 'image/png', 'image/webp'].includes(rawMime)
          ? rawMime
          : (!rawMime || rawMime === 'application/octet-stream' || rawMime === 'image/*' ? (extToMime[fileExt] || '') : rawMime);
      const base64Raw = str(data.base64);
      const width = num(data.width, 0) || null;
      const height = num(data.height, 0) || null;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        return fail('Chỉ hỗ trợ ảnh định dạng JPG, JPEG, PNG hoặc WEBP.');
      }
      const cleanBase64 = base64Raw.includes(',') ? base64Raw.split(',')[1] : base64Raw;
      if (!cleanBase64) return fail('Dữ liệu ảnh không hợp lệ.');
      const approxBytes = Math.floor((cleanBase64.length * 3) / 4);
      if (approxBytes <= 0 || approxBytes > 5 * 1024 * 1024) {
        return fail('Dung lượng ảnh vượt quá giới hạn 5MB.');
      }

      const imgId = uuid();
      let storageProvider = 'd1-inline';
      let imageUrl = `/api/media/scene/${imgId}`;

      if (env.IMAGEKIT_PRIVATE_KEY && env.IMAGEKIT_URL_ENDPOINT) {
        try {
          const uploaded = await uploadToImageKit(
            env,
            `${imgId}-${fileName}`,
            `data:${mimeType};base64,${cleanBase64}`,
            '/ai-product-video-studio/scenes'
          );
          if (uploaded) {
            storageProvider = 'imagekit';
            imageUrl = uploaded.url;
          }
        } catch (err) {
          console.warn('ImageKit standalone scene upload fallback to internal storage:', err);
        }
      }

      if (storageProvider === 'd1-inline') {
        const now = new Date().toISOString();
        await env.DB.prepare('INSERT OR REPLACE INTO system_settings(key,value_json,updated_at) VALUES(?,?,?)')
          .bind(
            `scene_media:${imgId}`,
            JSON.stringify({ userId: actor.id, fileName, mimeType, dataBase64: cleanBase64, sizeBytes: approxBytes, width, height, createdAt: now }),
            now
          )
          .run();
      }

      return json(
        {
          image: {
            id: null,
            productId: null,
            fileName,
            mimeType,
            sizeBytes: approxBytes,
            width,
            height,
            storageProvider,
            imageUrl,
          },
        },
        201
      );
    }

    const sceneMediaMatch = path.match(/^\/api\/media\/scene\/([0-9a-f-]+)$/);
    if (sceneMediaMatch && request.method === 'GET') {
      const mediaId = sceneMediaMatch[1];
      const row = await env.DB.prepare('SELECT value_json FROM system_settings WHERE key=?')
        .bind(`scene_media:${mediaId}`)
        .first<{ value_json: string }>();
      const stored = safeJsonParse<{ userId?: string; mimeType?: string; dataBase64?: string } | null>(row?.value_json, null);
      if (!stored || !stored.dataBase64) return fail('Không tìm thấy hình ảnh phân cảnh.', 404);
      if (stored.userId !== actor.id && roleRank(actor.role) < roleRank('ADMIN')) {
        return fail('Bạn không có quyền truy cập hình ảnh này.', 403);
      }
      const binStr = atob(stored.dataBase64);
      const bytesArr = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytesArr[i] = binStr.charCodeAt(i);
      return new Response(bytesArr, {
        status: 200,
        headers: {
          'content-type': stored.mimeType || 'image/jpeg',
          'cache-control': 'private, max-age=3600',
        },
      });
    }

    // Serve stored product image (protected by ownership or admin)
    const mediaMatch = path.match(/^\/api\/media\/([0-9a-f-]+)$/);
    if (mediaMatch && request.method === 'GET') {
      const imageId = mediaMatch[1];
      const img = await env.DB.prepare('SELECT * FROM product_images WHERE id=?')
        .bind(imageId)
        .first<{ user_id: string; mime_type: string; data_base64: string | null; image_url: string }>();
      if (!img) return fail('Không tìm thấy hình ảnh.', 404);
      if (img.user_id !== actor.id && roleRank(actor.role) < roleRank('ADMIN')) {
        return fail('Bạn không có quyền truy cập hình ảnh này.', 403);
      }
      if (!img.data_base64) {
        return Response.redirect(img.image_url, 302);
      }
      const binStr = atob(img.data_base64);
      const bytesArr = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytesArr[i] = binStr.charCodeAt(i);
      return new Response(bytesArr, {
        status: 200,
        headers: {
          'content-type': img.mime_type,
          'cache-control': 'private, max-age=3600',
        },
      });
    }

    // Products API
    if (path === '/api/products' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM products WHERE user_id=? ORDER BY updated_at DESC')
        .bind(actor.id)
        .all<Record<string, unknown>>();
      const images = await env.DB.prepare(
        'SELECT id,product_id,file_name,mime_type,size_bytes,width,height,storage_provider,image_url,sort_order,is_primary,is_ai_generated,created_at FROM product_images WHERE user_id=? ORDER BY sort_order ASC, created_at ASC'
      )
        .bind(actor.id)
        .all<Record<string, unknown>>();
      const imgByProduct = new Map<string, unknown[]>();
      for (const im of images.results) {
        const pid = String(im.product_id);
        const list = imgByProduct.get(pid) || [];
        list.push({
          id: im.id,
          productId: im.product_id,
          fileName: im.file_name,
          mimeType: im.mime_type,
          sizeBytes: im.size_bytes,
          width: im.width,
          height: im.height,
          storageProvider: im.storage_provider,
          imageUrl: im.image_url,
          sortOrder: im.sort_order,
          isPrimary: Boolean(im.is_primary),
          isAiGenerated: Boolean(im.is_ai_generated),
          createdAt: im.created_at,
        });
        imgByProduct.set(pid, list);
      }
      return json({
        products: rows.results.map(p => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          industry: p.industry,
          description: p.description,
          highlights: safeJsonParse<string[]>(String(p.highlights_json || '[]'), []),
          extraInfo: p.extra_info,
          aiAnalysis: safeJsonParse<unknown>(p.ai_analysis_json as string | null, null),
          images: imgByProduct.get(String(p.id)) || [],
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        })),
      });
    }

    if (path === '/api/products' && request.method === 'POST') {
      const data = await body(request);
      const name = str(data.name);
      const brand = str(data.brand);
      const industry = str(data.industry) || 'Mỹ phẩm';
      const description = str(data.description);
      const extraInfo = str(data.extraInfo);
      const highlights = Array.isArray(data.highlights)
        ? data.highlights.map(x => str(x)).filter(Boolean).slice(0, 12)
        : [];
      if (name.length < 2 || name.length > 160) return fail('Tên sản phẩm phải từ 2 đến 160 ký tự.');
      const id = uuid();
      const now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO products(id,user_id,name,brand,industry,description,highlights_json,extra_info,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)'
      )
        .bind(id, actor.id, name, brand, industry, description, JSON.stringify(highlights), extraInfo, now, now)
        .run();
      return json(
        {
          product: {
            id,
            name,
            brand,
            industry,
            description,
            highlights,
            extraInfo,
            aiAnalysis: null,
            images: [],
            createdAt: now,
            updatedAt: now,
          },
        },
        201
      );
    }

    const productMatch = path.match(/^\/api\/products\/([0-9a-f-]+)$/);
    if (productMatch) {
      const productId = productMatch[1];
      const existing = await env.DB.prepare('SELECT * FROM products WHERE id=? AND user_id=?')
        .bind(productId, actor.id)
        .first<Record<string, unknown>>();
      if (!existing) return fail('Không tìm thấy sản phẩm.', 404);

      if (request.method === 'PUT') {
        const data = await body(request);
        const name = str(data.name) || String(existing.name);
        const brand = data.brand !== undefined ? str(data.brand) : String(existing.brand || '');
        const industry = str(data.industry) || String(existing.industry);
        const description = data.description !== undefined ? str(data.description) : String(existing.description || '');
        const extraInfo = data.extraInfo !== undefined ? str(data.extraInfo) : String(existing.extra_info || '');
        const highlights = Array.isArray(data.highlights)
          ? data.highlights.map(x => str(x)).filter(Boolean).slice(0, 12)
          : safeJsonParse<string[]>(String(existing.highlights_json || '[]'), []);
        if (name.length < 2 || name.length > 160) return fail('Tên sản phẩm phải từ 2 đến 160 ký tự.');
        const now = new Date().toISOString();
        await env.DB.prepare(
          'UPDATE products SET name=?,brand=?,industry=?,description=?,highlights_json=?,extra_info=?,updated_at=? WHERE id=? AND user_id=?'
        )
          .bind(name, brand, industry, description, JSON.stringify(highlights), extraInfo, now, productId, actor.id)
          .run();
        return json({ message: 'Đã cập nhật sản phẩm.' });
      }

      if (request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM products WHERE id=? AND user_id=?').bind(productId, actor.id).run();
        return json({ message: 'Đã xóa sản phẩm.' });
      }
    }

    const productImgMatch = path.match(/^\/api\/products\/([0-9a-f-]+)\/images$/);
    if (productImgMatch && request.method === 'POST') {
      const productId = productImgMatch[1];
      const product = await env.DB.prepare('SELECT id FROM products WHERE id=? AND user_id=?')
        .bind(productId, actor.id)
        .first();
      if (!product) return fail('Không tìm thấy sản phẩm.', 404);

      const quota = await getOrCreateQuota(env, actor.id);
      const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM product_images WHERE product_id=? AND is_ai_generated=0')
        .bind(productId)
        .first<{ count: number }>();
      if ((countRow?.count || 0) >= quota.max_images_per_product) {
        return fail(`Mỗi sản phẩm chỉ được tải tối đa ${quota.max_images_per_product} ảnh gốc.`);
      }

      const data = await body(request);
      const fileName = str(data.fileName) || 'product-image.jpg';
      const rawMime = str(data.mimeType).toLowerCase();
      const fileExt = fileName.toLowerCase().split('.').pop() || '';
      const extToMime: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
      const mimeType = rawMime === 'image/jpg'
        ? 'image/jpeg'
        : ['image/jpeg', 'image/png', 'image/webp'].includes(rawMime)
          ? rawMime
          : (!rawMime || rawMime === 'application/octet-stream' || rawMime === 'image/*' ? (extToMime[fileExt] || '') : rawMime);
      const base64Raw = str(data.base64);
      const width = num(data.width, 0) || null;
      const height = num(data.height, 0) || null;
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedMimes.includes(mimeType)) {
        return fail('Chỉ hỗ trợ ảnh định dạng JPG, JPEG, PNG hoặc WEBP.');
      }
      const cleanBase64 = base64Raw.includes(',') ? base64Raw.split(',')[1] : base64Raw;
      if (!cleanBase64) return fail('Dữ liệu ảnh không hợp lệ.');
      const approxBytes = Math.floor((cleanBase64.length * 3) / 4);
      if (approxBytes <= 0 || approxBytes > 5 * 1024 * 1024) {
        return fail('Dung lượng ảnh vượt quá giới hạn 5MB.');
      }

      const imgId = uuid();
      let storageProvider = 'd1-inline';
      let imageUrl = `/api/media/${imgId}`;
      let imagekitFileId: string | null = null;
      let storedBase64: string | null = cleanBase64;

      if (env.IMAGEKIT_PRIVATE_KEY && env.IMAGEKIT_URL_ENDPOINT) {
        try {
          const uploaded = await uploadToImageKit(env, `${imgId}-${fileName}`, `data:${mimeType};base64,${cleanBase64}`);
          if (uploaded) {
            storageProvider = 'imagekit';
            imageUrl = uploaded.url;
            imagekitFileId = uploaded.fileId;
            storedBase64 = null;
          }
        } catch (err) {
          console.warn('ImageKit fallback to internal storage:', err);
        }
      }

      const isPrimary = (countRow?.count || 0) === 0 ? 1 : 0;
      const sortOrder = countRow?.count || 0;
      await env.DB.prepare(
        'INSERT INTO product_images(id,product_id,user_id,file_name,mime_type,size_bytes,width,height,storage_provider,image_url,imagekit_file_id,data_base64,sort_order,is_primary,is_ai_generated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)'
      )
        .bind(
          imgId,
          productId,
          actor.id,
          fileName,
          mimeType,
          approxBytes,
          width,
          height,
          storageProvider,
          imageUrl,
          imagekitFileId,
          storedBase64,
          sortOrder,
          isPrimary
        )
        .run();

      await env.DB.prepare('UPDATE products SET updated_at=? WHERE id=?').bind(new Date().toISOString(), productId).run();

      return json(
        {
          image: {
            id: imgId,
            productId,
            fileName,
            mimeType,
            sizeBytes: approxBytes,
            width,
            height,
            storageProvider,
            imageUrl,
            sortOrder,
            isPrimary: Boolean(isPrimary),
            isAiGenerated: false,
          },
        },
        201
      );
    }

    const imgReorderMatch = path.match(/^\/api\/products\/([0-9a-f-]+)\/images\/reorder$/);
    if (imgReorderMatch && request.method === 'PATCH') {
      const productId = imgReorderMatch[1];
      const product = await env.DB.prepare('SELECT id FROM products WHERE id=? AND user_id=?')
        .bind(productId, actor.id)
        .first();
      if (!product) return fail('Không tìm thấy sản phẩm.', 404);
      const data = await body(request);
      const orderedIds = Array.isArray(data.orderedIds) ? data.orderedIds.map(x => str(x)).filter(Boolean) : [];
      const primaryId = str(data.primaryId);
      for (let i = 0; i < orderedIds.length; i++) {
        await env.DB.prepare('UPDATE product_images SET sort_order=? WHERE id=? AND product_id=? AND user_id=?')
          .bind(i, orderedIds[i], productId, actor.id)
          .run();
      }
      if (primaryId) {
        await env.DB.prepare('UPDATE product_images SET is_primary=0 WHERE product_id=? AND user_id=?')
          .bind(productId, actor.id)
          .run();
        await env.DB.prepare('UPDATE product_images SET is_primary=1 WHERE id=? AND product_id=? AND user_id=?')
          .bind(primaryId, productId, actor.id)
          .run();
      }
      return json({ message: 'Đã cập nhật thứ tự và ảnh đại diện.' });
    }

    const imgDeleteMatch = path.match(/^\/api\/products\/([0-9a-f-]+)\/images\/([0-9a-f-]+)$/);
    if (imgDeleteMatch && request.method === 'DELETE') {
      const [, productId, imageId] = imgDeleteMatch;
      const target = await env.DB.prepare('SELECT is_primary FROM product_images WHERE id=? AND product_id=? AND user_id=?')
        .bind(imageId, productId, actor.id)
        .first<{ is_primary: number }>();
      if (!target) return fail('Không tìm thấy hình ảnh.', 404);
      await env.DB.prepare('DELETE FROM product_images WHERE id=? AND product_id=? AND user_id=?')
        .bind(imageId, productId, actor.id)
        .run();
      if (target.is_primary) {
        const nextImg = await env.DB.prepare(
          'SELECT id FROM product_images WHERE product_id=? AND user_id=? ORDER BY sort_order ASC LIMIT 1'
        )
          .bind(productId, actor.id)
          .first<{ id: string }>();
        if (nextImg) {
          await env.DB.prepare('UPDATE product_images SET is_primary=1 WHERE id=?').bind(nextImg.id).run();
        }
      }
      return json({ message: 'Đã xóa hình ảnh.' });
    }

    // AI Capabilities & Services
    if (path === '/api/ai/capabilities' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM ai_configs ORDER BY module_key ASC').all<AIConfigRow>();
      const modules = rows.results.map(m => ({
        moduleKey: m.module_key,
        displayName: m.display_name,
        category: m.category,
        provider: m.provider,
        modelName: m.model_name,
        isEnabled: Boolean(m.is_enabled),
        isPaid: Boolean(m.is_paid),
        fallbackMode: m.fallback_mode,
        dailyLimit: m.daily_limit,
        monthlyLimit: m.monthly_limit,
        lastStatus: m.last_status,
        lastError: m.last_error,
        runtimeReady:
          m.module_key === 'browser_renderer'
            ? true
            : m.module_key.startsWith('gemini')
              ? Boolean(env.GEMINI_API_KEY)
              : m.module_key === 'kokoro_tts'
                ? Boolean(env.GEMINI_API_KEY)
                : m.module_key === 'wan_video'
                  ? false
                  : m.module_key === 'comfyui_image'
                  ? Boolean(env.COMFYUI_API_URL)
                  : false,
      }));
      return json({
        modules,
        storage: {
          provider: env.IMAGEKIT_PRIVATE_KEY && env.IMAGEKIT_URL_ENDPOINT ? 'imagekit' : 'd1-inline',
          imagekitConfigured: Boolean(env.IMAGEKIT_PRIVATE_KEY && env.IMAGEKIT_URL_ENDPOINT),
        },
      });
    }

    if (path === '/api/ai/analyze-product' && request.method === 'POST') {
      const data = await body(request);
      const productId = str(data.productId);
      const product = await env.DB.prepare('SELECT * FROM products WHERE id=? AND user_id=?')
        .bind(productId, actor.id)
        .first<Record<string, unknown>>();
      if (!product) return fail('Không tìm thấy sản phẩm.', 404);

      const images = await env.DB.prepare(
        'SELECT mime_type,data_base64,image_url,storage_provider FROM product_images WHERE product_id=? ORDER BY is_primary DESC, sort_order ASC'
      )
        .bind(productId)
        .all<{ mime_type: string; data_base64: string | null; image_url: string; storage_provider: string }>();

      const highlights = safeJsonParse<string[]>(String(product.highlights_json || '[]'), []);
      const modCfg = await env.DB.prepare("SELECT * FROM ai_configs WHERE module_key='gemini_analysis'").first<AIConfigRow>();
      const primaryImg = images.results[0];

      let imageBase64 = primaryImg?.data_base64 || undefined;
      let imageMimeType = primaryImg?.mime_type || undefined;
      // Fetch ImageKit-backed images only from the configured CDN origin.
      if (!imageBase64 && primaryImg?.image_url && env.IMAGEKIT_URL_ENDPOINT) {
        try {
          const imageUrl = new URL(String(primaryImg.image_url));
          if (imageUrl.origin !== new URL(env.IMAGEKIT_URL_ENDPOINT).origin) throw new Error('Image URL is outside the configured ImageKit origin.');
          const imageResponse = await fetch(imageUrl.toString(), { redirect: 'error' });
          if (!imageResponse.ok) throw new Error(`ImageKit image fetch failed (${imageResponse.status}).`);
          const mime = (imageResponse.headers.get('content-type') || imageMimeType || '').split(';')[0].toLowerCase();
          if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Unsupported image content type.');
          const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
          if (imageBytes.byteLength > 5 * 1024 * 1024) throw new Error('Image exceeds the 5MB analysis limit.');
          let binary = '';
          for (let offset = 0; offset < imageBytes.length; offset += 0x8000) binary += String.fromCharCode(...imageBytes.subarray(offset, Math.min(offset + 0x8000, imageBytes.length)));
          imageBase64 = btoa(binary);
          imageMimeType = mime;
        } catch (imageError) {
          console.warn('Gemini image retrieval skipped; using text-only product data:', imageError);
        }
      }
      const inputPayload = {
        name: String(product.name), brand: String(product.brand || ''), industry: String(product.industry),
        description: String(product.description || ''), highlights, extraInfo: String(product.extra_info || ''),
        imageBase64, imageMimeType,
      };

      let analysis: unknown;
      if (modCfg?.is_enabled && env.GEMINI_API_KEY && env.AI_CALLER?.analyzeProduct && await aiModuleWithinLimits(env, modCfg)) {
        try {
          analysis = await env.AI_CALLER.analyzeProduct(inputPayload);
          await logAiUsage(env, actor.id, 'gemini_analysis', 'google-genai', modCfg.model_name, 'analyze-product', 'SUCCESS', 650, 0);
          await env.DB.prepare("UPDATE ai_configs SET last_status='READY',last_error=NULL,updated_at=? WHERE module_key='gemini_analysis'")
            .bind(new Date().toISOString())
            .run();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Gemini API error';
          await logAiUsage(env, actor.id, 'gemini_analysis', 'google-genai', modCfg.model_name, 'analyze-product', 'FALLBACK', 0, 0, msg);
          await env.DB.prepare("UPDATE ai_configs SET last_status='ERROR',last_error=?,updated_at=? WHERE module_key='gemini_analysis'")
            .bind(msg.slice(0, 300), new Date().toISOString())
            .run();
          analysis = buildStructuredFreeAnalysis({ ...inputPayload, imageCount: images.results.length });
        }
      } else {
        await logAiUsage(env, actor.id, 'gemini_analysis', 'rule-based-free', 'structured-free', 'analyze-product', 'FALLBACK', 0, 0);
        analysis = buildStructuredFreeAnalysis({ ...inputPayload, imageCount: images.results.length });
      }

      await env.DB.prepare('UPDATE products SET ai_analysis_json=?,updated_at=? WHERE id=? AND user_id=?')
        .bind(JSON.stringify(analysis), new Date().toISOString(), productId, actor.id)
        .run();

      return json({ analysis });
    }

    if (path === '/api/ai/generate-script' && request.method === 'POST') {
      const data = await body(request);
      const productId = str(data.productId);
      const standaloneTitle = str(data.title);
      const standaloneIndustry = str(data.industry) || 'Mỹ phẩm';
      const standaloneDescription = str(data.description);
      const videoType = str(data.videoType) || 'Advertisement';
      const targetAudience = str(data.targetAudience) || '';
      const style = str(data.style) || 'Hiện đại, chuyên nghiệp';
      const durationSec = Math.min(90, Math.max(15, num(data.durationSec, 30)));
      const language = str(data.language) === 'en' ? 'en' : 'vi';

      if (!productId && !standaloneTitle) {
        return fail('Vui lòng chọn sản phẩm hoặc nhập tiêu đề dự án trước khi tạo kịch bản.', 400);
      }

      let product: Record<string, unknown> | null = null;
      let imageCount = 0;
      if (productId) {
        product = await env.DB.prepare('SELECT * FROM products WHERE id=? AND user_id=?')
          .bind(productId, actor.id)
          .first<Record<string, unknown>>();
        if (!product) return fail('Không tìm thấy sản phẩm.', 404);
        const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM product_images WHERE product_id=?')
          .bind(productId)
          .first<{ count: number }>();
        imageCount = countRow?.count || 0;
      }

      const quota = await getOrCreateQuota(env, actor.id);
      if (durationSec > quota.max_duration_sec) {
        return fail(`Thời lượng tối đa theo hạn mức tài khoản của bạn là ${quota.max_duration_sec} giây.`);
      }

      const highlights = product ? safeJsonParse<string[]>(String(product.highlights_json || '[]'), []) : [];
      const modCfg = await env.DB.prepare("SELECT * FROM ai_configs WHERE module_key='gemini_script'").first<AIConfigRow>();

      const inputPayload = {
        productName: product ? String(product.name) : standaloneTitle,
        brand: product ? String(product.brand || '') : '',
        industry: product ? String(product.industry) : standaloneIndustry,
        description: product ? String(product.description || '') : (standaloneDescription || `${videoType} - ${style}`),
        highlights,
        videoType,
        targetAudience,
        style,
        durationSec,
        language,
        imageCount,
      };

      let result: unknown;
      let useGemini = false;
      let fallbackReason = '';
      if (!modCfg) {
        fallbackReason = 'Chưa tìm thấy cấu hình mô-đun Gemini Viết kịch bản.';
      } else if (!modCfg.is_enabled) {
        fallbackReason = 'Mô-đun Gemini Viết kịch bản đang tắt trong phần Quản trị AI.';
      } else if (modCfg.is_paid) {
        fallbackReason = 'Mô-đun Gemini Viết kịch bản đang gắn cờ trả phí; hệ thống sử dụng kịch bản cấu trúc miễn phí.';
      } else if (!env.GEMINI_API_KEY) {
        fallbackReason = 'Máy chủ chưa được cấu hình GEMINI_API_KEY.';
      } else {
        try {
          useGemini = await aiModuleWithinLimits(env, modCfg);
          if (!useGemini) fallbackReason = 'Mô-đun Gemini đã đạt hạn mức sử dụng ngày hoặc tháng; hệ thống chuyển sang tạo kịch bản dự phòng.';
        } catch (limitError) {
          fallbackReason = limitError instanceof Error ? limitError.message : 'Không kiểm tra được hạn mức Gemini.';
          console.warn('Gemini usage-limit check unavailable; using safe free fallback:', limitError);
        }
      }

      if (useGemini && env.GEMINI_API_KEY) {
        const configuredModel = str(modCfg?.model_name) || 'gemini-3.8-flash';
        const modelName = configuredModel.startsWith('models/') ? configuredModel.slice('models/'.length) : configuredModel;
        try {
          const generated = env.AI_CALLER?.generateScripts
            ? await env.AI_CALLER.generateScripts({ ...inputPayload, modelName })
            : await generateScriptsWithGeminiApi(inputPayload, env.GEMINI_API_KEY, modelName);
          const generatedVariants = generated && typeof generated === 'object'
            ? (generated as { variants?: Array<{ scenes?: unknown[] }> }).variants
            : undefined;
          if (!Array.isArray(generatedVariants) || generatedVariants.length === 0 ||
              !generatedVariants.some(variant => Array.isArray(variant.scenes) && variant.scenes.length > 0)) {
            throw new Error('Gemini không trả về phương án kịch bản có phân cảnh hợp lệ.');
          }
          result = generated;
          await logAiUsage(env, actor.id, 'gemini_script', 'google-gemini', modelName, 'generate-script', 'SUCCESS', 900, 0)
            .catch(logError => console.warn('Could not record successful Gemini usage:', logError));
          await env.DB.prepare("UPDATE ai_configs SET last_status='READY',last_error=NULL,updated_at=? WHERE module_key='gemini_script'")
            .bind(new Date().toISOString()).run().catch(configError => console.warn('Could not update Gemini script status:', configError));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Gemini script error';
          fallbackReason = msg;
          console.error('Gemini script generation failed; using structured fallback:', msg);
          await logAiUsage(env, actor.id, 'gemini_script', 'google-gemini', modelName, 'generate-script', 'FALLBACK', 0, 0, msg)
            .catch(logError => console.warn('Could not record Gemini fallback:', logError));
          await env.DB.prepare("UPDATE ai_configs SET last_status='ERROR',last_error=?,updated_at=? WHERE module_key='gemini_script'")
            .bind(msg.slice(0,300),new Date().toISOString()).run().catch(configError => console.warn('Could not update Gemini error status:',configError));
          result = buildStructuredFreeScripts(inputPayload);
        }
      } else {
        await logAiUsage(env,actor.id,'gemini_script','rule-based-free','structured-free','generate-script','FALLBACK',0,0, fallbackReason)
          .catch(logError => console.warn('Could not record structured script usage:',logError));
        result = buildStructuredFreeScripts(inputPayload);
      }
      return json({
        ...(result as Record<string, unknown>),
        ...(fallbackReason ? { fallbackReason } : {}),
      });
    }

    if (path === '/api/ai/scene-assist' && request.method === 'POST') {
      const data = await body(request);
      const productId = str(data.productId);
      const imageId = str(data.imageId);
      const directImageUrl = str(data.imageUrl);
      const projectTitle = str(data.projectTitle);
      const requestedIndustry = str(data.industry);
      const instruction = str(data.instruction);
      const scene = data.scene && typeof data.scene === 'object' ? data.scene as Record<string, unknown> : {};
      if (!imageId && !directImageUrl) return fail('Thiếu ảnh phân cảnh để phân tích.');
      if (instruction.length > 1200) return fail('Yêu cầu chỉnh sửa tối đa 1.200 ký tự.');

      let product: Record<string, unknown> | null = null;
      if (productId) {
        product = await env.DB.prepare('SELECT name,brand,industry,description,highlights_json FROM products WHERE id=? AND user_id=?')
          .bind(productId, actor.id).first<Record<string, unknown>>();
        if (!product) return fail('Không tìm thấy sản phẩm.', 404);
      }

      let mimeType = '';
      let imageBase64 = '';
      let remoteImageUrl = '';

      if (productId && imageId) {
        const image = await env.DB.prepare('SELECT mime_type,data_base64,image_url FROM product_images WHERE id=? AND product_id=? AND user_id=?')
          .bind(imageId, productId, actor.id).first<{ mime_type: string; data_base64: string | null; image_url: string }>();
        if (!image) return fail('Không tìm thấy ảnh thuộc sản phẩm này.', 404);
        mimeType = String(image.mime_type || '').toLowerCase();
        imageBase64 = image.data_base64 || '';
        remoteImageUrl = image.image_url || '';
      } else if (directImageUrl) {
        const sceneMediaMatch = directImageUrl.match(/^\/api\/media\/scene\/([0-9a-f-]+)(?:\?.*)?$/);
        if (sceneMediaMatch) {
          const mediaRow = await env.DB.prepare('SELECT value_json FROM system_settings WHERE key=?')
            .bind(`scene_media:${sceneMediaMatch[1]}`)
            .first<{ value_json: string }>();
          const stored = safeJsonParse<{ userId?: string; mimeType?: string; dataBase64?: string } | null>(mediaRow?.value_json, null);
          if (!stored || !stored.dataBase64) return fail('Không tìm thấy ảnh phân cảnh.', 404);
          if (stored.userId !== actor.id && roleRank(actor.role) < roleRank('ADMIN')) {
            return fail('Bạn không có quyền sử dụng ảnh phân cảnh này.', 403);
          }
          mimeType = String(stored.mimeType || 'image/jpeg').toLowerCase();
          imageBase64 = stored.dataBase64;
        } else {
          remoteImageUrl = directImageUrl;
        }
      }

      if (!imageBase64 && remoteImageUrl) {
        const imageUrl = new URL(remoteImageUrl, request.url);
        const allowedHost = env.IMAGEKIT_URL_ENDPOINT ? new URL(env.IMAGEKIT_URL_ENDPOINT).hostname : '';
        if (!allowedHost || imageUrl.hostname !== allowedHost || imageUrl.protocol !== 'https:') {
          return fail('Không thể xác minh nguồn lưu trữ ảnh để phân tích an toàn.', 400);
        }
        const imageResponse = await fetch(imageUrl.toString());
        if (!imageResponse.ok) return fail('Không thể tải ảnh phân cảnh từ kho lưu trữ.', 502);
        const respContentType = (imageResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!mimeType && respContentType) mimeType = respContentType === 'image/jpg' ? 'image/jpeg' : respContentType;
        const imageBuffer = await imageResponse.arrayBuffer();
        if (imageBuffer.byteLength > 5 * 1024 * 1024) return fail('Ảnh phân cảnh vượt quá giới hạn 5MB.');
        const bytes = new Uint8Array(imageBuffer);
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        imageBase64 = btoa(binary);
      }

      if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        return fail('Định dạng ảnh phân cảnh không được hỗ trợ.');
      }
      if (!imageBase64) return fail('Ảnh phân cảnh chưa có dữ liệu để phân tích.');

      const config = await env.DB.prepare("SELECT * FROM ai_configs WHERE module_key='gemini_script'").first<AIConfigRow>();
      if (!config?.is_enabled) return fail('Mô-đun Gemini viết kịch bản đang được quản trị viên tắt.', 503);
      if (config.is_paid) return fail('Mô-đun Gemini hiện được cấu hình là dịch vụ trả phí. Đã chặn để tránh phát sinh chi phí.', 403);
      if (!env.GEMINI_API_KEY) return fail('Chưa cấu hình Gemini API Key cho chức năng phân tích ảnh phân cảnh.', 503);
      if (!(await aiModuleWithinLimits(env, config))) return fail('Mô-đun Gemini đã đạt hạn mức ngày/tháng.', 429);

      const subjectName = String(product?.name || projectTitle || 'Sản phẩm');
      const subjectBrand = String(product?.brand || 'Chưa cung cấp');
      const subjectIndustry = String(product?.industry || requestedIndustry || 'Mỹ phẩm');
      const subjectDesc = String(product?.description || projectTitle || 'Chưa cung cấp');
      const subjectHighlights = product ? safeJsonParse<string[]>(String(product.highlights_json || '[]'), []).join('; ') : '';

      const prompt = [
        'Bạn là đạo diễn nội dung video quảng cáo sản phẩm. Phân tích trực tiếp hình ảnh đính kèm và tạo hoặc chỉnh sửa đúng một phân cảnh.',
        'Chỉ mô tả những gì nhìn thấy trong ảnh; không tự suy diễn công dụng, thông số, chất liệu hoặc chứng nhận không thể xác minh.',
        `Sản phẩm / chủ đề: ${subjectName}; thương hiệu: ${subjectBrand}; ngành hàng: ${subjectIndustry}.`,
        `Mô tả đã xác nhận: ${subjectDesc}.`,
        `Điểm nổi bật do người dùng cung cấp: ${subjectHighlights || 'Dựa trên hình ảnh đính kèm'}.`,
        `Nội dung cảnh hiện tại: ${JSON.stringify({ narration: str(scene.narration), onScreenText: str(scene.onScreenText), visualPrompt: str(scene.visualPrompt), durationSec: num(scene.durationSec, 5) })}.`,
        instruction ? `Yêu cầu chỉnh sửa của người dùng: ${instruction}` : 'Hãy phân tích ảnh và đề xuất lời thoại, chữ ngắn trên màn hình và hướng hình ảnh phù hợp với ảnh.',
        `Ngôn ngữ đầu ra: ${str(data.language) === 'en' ? 'English' : 'Tiếng Việt'}.`,
        'Trả về JSON hợp lệ gồm narration, onScreenText, visualPrompt, motionType, transitionType, lightingEffect.',
        'motionType chỉ được là zoom-in, zoom-out, pan-left, pan-right, parallax, rotate-showcase.',
        'transitionType chỉ được là fade, slide, zoom-cut.',
        'lightingEffect chỉ được là studio-glow, warm-gold, neon-rim, clean.',
        'Lời thoại tự nhiên, phù hợp thời lượng cảnh; onScreenText ngắn gọn. Không thêm giải thích ngoài JSON.',
      ].join('\n');

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model_name)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.55 },
          }),
        });
        if (!response.ok) throw new Error(`Gemini API HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
        const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const responseText = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim() || '';
        const parsed = JSON.parse(responseText) as Record<string, unknown>;
        const motions = ['zoom-in','zoom-out','pan-left','pan-right','parallax','rotate-showcase'];
        const transitions = ['fade','slide','zoom-cut'];
        const lights = ['studio-glow','warm-gold','neon-rim','clean'];
        const resultScene = {
          narration: str(parsed.narration) || str(scene.narration),
          onScreenText: str(parsed.onScreenText) || str(scene.onScreenText),
          visualPrompt: str(parsed.visualPrompt) || str(scene.visualPrompt),
          motionType: motions.includes(str(parsed.motionType)) ? str(parsed.motionType) : str(scene.motionType) || 'zoom-in',
          transitionType: transitions.includes(str(parsed.transitionType)) ? str(parsed.transitionType) : str(scene.transitionType) || 'fade',
          lightingEffect: lights.includes(str(parsed.lightingEffect)) ? str(parsed.lightingEffect) : str(scene.lightingEffect) || 'studio-glow',
        };
        await logAiUsage(env, actor.id, 'gemini_script', 'google-genai', config.model_name, 'scene-assist', 'SUCCESS', imageBase64.length, 0);
        await env.DB.prepare("UPDATE ai_configs SET last_status='READY',last_error=NULL,updated_at=? WHERE module_key='gemini_script'")
          .bind(new Date().toISOString()).run();
        return json({ scene: resultScene, model: config.model_name, reviewedRequired: true });
      } catch (sceneError) {
        const message = sceneError instanceof Error ? sceneError.message : 'Gemini scene analysis failed';
        await logAiUsage(env, actor.id, 'gemini_script', 'google-genai', config.model_name, 'scene-assist', 'ERROR', 0, 0, message);
        await env.DB.prepare("UPDATE ai_configs SET last_status='ERROR',last_error=?,updated_at=? WHERE module_key='gemini_script'")
          .bind(message.slice(0, 300), new Date().toISOString()).run();
        return fail(`Không thể phân tích/chỉnh sửa phân cảnh: ${message.slice(0, 220)}`, 502);
      }
    }

    if (path === '/api/ai/tts' && request.method === 'POST') {
      const quota = await getOrCreateQuota(env, actor.id);
      if (!quota.can_use_voice) return fail('Tài khoản của bạn chưa được cấp quyền sử dụng AI Voice.', 403);
      const modCfg = await env.DB.prepare("SELECT * FROM ai_configs WHERE module_key='kokoro_tts'").first<AIConfigRow>();
      if (!modCfg?.is_enabled) return json({ available: false, reason: 'Mô-đun Gemini TTS tiếng Việt đang được quản trị viên tắt.', fallback: 'browser-speech-or-silent' });
      if (modCfg && !(await aiModuleWithinLimits(env, modCfg))) {
        await logAiUsage(env, actor.id, 'kokoro_tts', 'google-gemini', modCfg.model_name, 'tts', 'LIMIT_REACHED', 0, 0, 'AI module quota reached');
        return json({ available: false, reason: 'Mô-đun AI Voice đã đạt hạn mức sử dụng ngày/tháng do quản trị viên thiết lập.', fallback: 'browser-speech-or-silent' });
      }
      if (!env.GEMINI_API_KEY) {
        await logAiUsage(env, actor.id, 'kokoro_tts', 'google-gemini', 'gemini-3.8-flash-lite-tts', 'tts', 'UNAVAILABLE', 0, 0, 'GEMINI_API_KEY not configured');
        return json({ available: false, reason: 'Chưa cấu hình khóa Gemini API cho chức năng tạo giọng đọc.', fallback: 'browser-speech-or-silent' });
      }
      const data = await body(request);
      const text = str(data.text);
      const voice = str(data.voice) || 'vi-female-young';
      if (!text || text.length > 2000) return fail('Nội dung đọc phải từ 1 đến 2000 ký tự.');
      const voiceMap: Record<string, { voice: string; style: string }> = {
        'vi-female-young': { voice: 'Aoede', style: 'Natural, youthful Vietnamese female voice; clear, warm, friendly delivery.' },
        'vi-male-pro': { voice: 'Charon', style: 'Professional Vietnamese male voice; confident, clear, measured delivery.' },
        'vi-female-luxury': { voice: 'Kore', style: 'Elegant Vietnamese female voice; calm, refined, premium commercial delivery.' },
        'vi-ad-energetic': { voice: 'Puck', style: 'Energetic Vietnamese advertising voice; bright, lively, engaging delivery.' },
        'vi-review-natural': { voice: 'Aoede', style: 'Conversational Vietnamese review voice; natural, sincere, easy to listen to.' },
      };
      const selectedVoice = voiceMap[voice] || voiceMap['vi-female-young'];
      try {
        const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({
            model: 'gemini-3.8-flash-lite-tts',
            input: [{
              type: 'user_input',
              content: [{
                type: 'text',
                text,
                annotations: [{ type: 'speech_metadata', style: selectedVoice.style }],
              }],
            }],
            response_format: { type: 'audio' },
            generation_config: { speech_config: [{ voice: selectedVoice.voice }] },
          }),
        });
        if (!resp.ok) throw new Error(`Gemini TTS HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
        const payload = await resp.json() as {
          output_audio?: { data?: string; mime_type?: string };
          outputAudio?: { data?: string; mimeType?: string };
          interaction?: { output_audio?: { data?: string; mime_type?: string }; outputAudio?: { data?: string; mimeType?: string } };
          output?: Array<{ type?: string; data?: string; mime_type?: string; mimeType?: string }>;
        };
        const audioPart = (payload.output_audio || payload.outputAudio || payload.interaction?.output_audio || payload.interaction?.outputAudio) as { data?: string; mime_type?: string; mimeType?: string } | undefined;
        const outputAudio = audioPart?.data
          ? { data: audioPart.data, mimeType: audioPart.mime_type || audioPart.mimeType || 'audio/wav' }
          : payload.output?.find(part => part.type === 'audio' && part.data)
            ? { data: payload.output.find(part => part.type === 'audio' && part.data)!.data!, mimeType: payload.output.find(part => part.type === 'audio' && part.data)!.mime_type || payload.output.find(part => part.type === 'audio' && part.data)!.mimeType || 'audio/wav' }
            : null;
        if (!outputAudio?.data) throw new Error('Gemini TTS không trả về dữ liệu âm thanh.');
        await logAiUsage(env, actor.id, 'kokoro_tts', 'google-gemini', 'gemini-3.8-flash-lite-tts', 'tts', 'SUCCESS', text.length, 0);
        await env.DB.prepare("UPDATE ai_configs SET provider='google-gemini',model_name='gemini-3.8-flash-lite-tts',last_status='READY',last_error=NULL,updated_at=? WHERE module_key='kokoro_tts'")
          .bind(new Date().toISOString()).run();
        return json({ available: true, mimeType: outputAudio.mimeType, audioBase64: outputAudio.data, provider: 'Gemini TTS' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gemini TTS error';
        await logAiUsage(env, actor.id, 'kokoro_tts', 'google-gemini', 'gemini-3.8-flash-lite-tts', 'tts', 'ERROR', 0, 0, msg);
        await env.DB.prepare("UPDATE ai_configs SET last_status='ERROR',last_error=?,updated_at=? WHERE module_key='kokoro_tts'")
          .bind(msg.slice(0, 300), new Date().toISOString()).run();
        return json({ available: false, reason: `Gemini TTS chưa tạo được giọng đọc: ${msg}`, fallback: 'browser-speech-or-silent' });
      }
    }

    if (path === '/api/ai/video/submit' && request.method === 'POST') {
      // Free-only policy: this endpoint never submits a paid fal.ai generation.
      // Use the browser-based MP4 renderer below for zero-API-cost video output.
      return fail('Tạo video AI chuyển động bằng API fal.ai đã được tắt để tránh phát sinh phí. Bạn vẫn có thể dựng và xuất MP4 miễn phí bằng bộ dựng video trực tiếp trên trình duyệt.', 410);
    }

    const aiVideoStatusMatch = path.match(/^\/api\/ai\/video\/status\/([0-9a-f-]+)$/);
    if (aiVideoStatusMatch && request.method === 'GET') {
      const job = await env.DB.prepare('SELECT * FROM ai_video_jobs WHERE id=? AND user_id=?').bind(aiVideoStatusMatch[1], actor.id)
        .first<{ id: string; project_id: string; scene_index: number; provider_request_id: string; status: string; video_url: string | null; imagekit_file_id: string | null; error_message: string | null }>();
      if (!job) return fail('Không tìm thấy tác vụ video AI.', 404);
      if (job.status === 'COMPLETED' && job.video_url) return json({ status: 'COMPLETED', videoUrl: job.video_url, sceneIndex: job.scene_index });
      if (job.status === 'FAILED') return json({ status: 'FAILED', error: job.error_message || 'Tạo video AI thất bại.' });
      const endpoint = 'minimax/h3-max/image-to-video';
      const statusResponse = await fetch(`https://queue.fal.run/${endpoint}/requests/${job.provider_request_id}/status`, {
        headers: { authorization: `Key ${env.FAL_KEY}` },
      });
      if (!statusResponse.ok) return fail('Không kiểm tra được tiến độ từ nhà cung cấp video AI.', 502);
      const statusData = await statusResponse.json() as { status?: string; error?: string };
      if (statusData.status === 'FAILED') {
        const reason = statusData.error || 'Nhà cung cấp không thể tạo video.';
        await env.DB.prepare("UPDATE ai_video_jobs SET status='FAILED',error_message=?,updated_at=? WHERE id=?")
          .bind(reason.slice(0, 500), new Date().toISOString(), job.id).run();
        await logAiUsage(env, actor.id, 'wan_video', 'fal.ai', 'minimax-h3-max', 'image-to-video', 'ERROR', 0, 0, reason);
        return json({ status: 'FAILED', error: reason });
      }
      if (statusData.status !== 'COMPLETED') return json({ status: statusData.status || 'IN_PROGRESS' });
      const resultResponse = await fetch(`https://queue.fal.run/${endpoint}/requests/${job.provider_request_id}`, {
        headers: { authorization: `Key ${env.FAL_KEY}` },
      });
      if (!resultResponse.ok) return fail('Không lấy được kết quả video AI.', 502);
      const resultData = await resultResponse.json() as { video?: { url?: string } };
      if (!resultData.video?.url) return fail('Nhà cung cấp không trả về tệp video.', 502);
      let finalUrl = resultData.video.url;
      let fileId: string | null = null;
      try {
        const videoResponse = await fetch(finalUrl);
        if (videoResponse.ok) {
          const videoBlob = await videoResponse.blob();
          if (videoBlob.size > 0 && videoBlob.size <= 50 * 1024 * 1024) {
            const videoFile = new File([videoBlob], `ai-video-${job.id}.mp4`, { type: 'video/mp4' });
            const stored = await uploadVideoToImageKit(env, videoFile);
            finalUrl = stored.url; fileId = stored.fileId;
          }
        }
      } catch (storageError) {
        console.warn('Could not copy generated AI video to ImageKit; retaining provider URL:', storageError);
      }
      await env.DB.prepare("UPDATE ai_video_jobs SET status='COMPLETED',video_url=?,imagekit_file_id=?,updated_at=? WHERE id=?")
        .bind(finalUrl, fileId, new Date().toISOString(), job.id).run();
      await logAiUsage(env, actor.id, 'wan_video', 'fal.ai', 'minimax-h3-max', 'image-to-video', 'SUCCESS', 0, 0);
      return json({ status: 'COMPLETED', videoUrl: finalUrl, sceneIndex: job.scene_index, storedOnImageKit: Boolean(fileId) });
    }

    // Video Projects & Scenes
    if (path === '/api/projects' && request.method === 'GET') {
      const search = str(url.searchParams.get('q')).toLowerCase();
      const statusFilter = str(url.searchParams.get('status'));
      const rows = await env.DB.prepare(
        'SELECT vp.*, p.name AS product_name FROM video_projects vp LEFT JOIN products p ON p.id=vp.product_id WHERE vp.user_id=? ORDER BY vp.updated_at DESC'
      )
        .bind(actor.id)
        .all<Record<string, unknown>>();

      const filtered = rows.results.filter(r => {
        if (statusFilter && r.status !== statusFilter) return false;
        if (search) {
          const hay = `${r.title} ${r.industry} ${r.video_type} ${r.product_name || ''}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });

      return json({
        projects: filtered.map(r => ({
          id: r.id,
          productId: r.product_id,
          productName: r.product_name,
          templateId: r.template_id,
          title: r.title,
          videoType: r.video_type,
          industry: r.industry,
          targetAudience: r.target_audience,
          style: r.style,
          durationSec: r.duration_sec,
          aspectRatio: r.aspect_ratio,
          language: r.language,
          status: r.status,
          outputFormat: r.output_format,
          outputResolution: r.output_resolution,
          outputSizeBytes: r.output_size_bytes,
          outputFileUrl: r.output_file_url || null,
          errorMessage: r.error_message,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
    }

    if (path === '/api/projects' && request.method === 'POST') {
      const quota = await getOrCreateQuota(env, actor.id);
      const usage = await getUserVideoUsage(env, actor.id);
      if (usage.dailyUsed >= quota.daily_video_limit) {
        return fail(`Bạn đã đạt hạn mức tối đa ${quota.daily_video_limit} dự án video trong ngày hôm nay.`, 429);
      }
      if (usage.monthlyUsed >= quota.monthly_video_limit) {
        return fail(`Bạn đã đạt hạn mức tối đa ${quota.monthly_video_limit} dự án video trong tháng này.`, 429);
      }

      const data = await body(request);
      const title = str(data.title) || 'Dự án video mới';
      const productId = str(data.productId) || null;
      const templateId = str(data.templateId) || null;
      const videoType = str(data.videoType) || 'Advertisement';
      const industry = str(data.industry) || 'Mỹ phẩm';
      const targetAudience = str(data.targetAudience);
      const style = str(data.style) || 'Hiện đại, chuyên nghiệp';
      const scenes = Array.isArray(data.scenes) ? data.scenes : [];
      const computedDuration = scenes.length > 0
        ? Math.round(scenes.reduce((sum, raw) => {
            const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
            return sum + Math.min(30, Math.max(2, num(s.durationSec, 5)));
          }, 0))
        : Math.min(quota.max_duration_sec, Math.max(2, num(data.durationSec, 30)));
      if (scenes.length > 0 && computedDuration > quota.max_duration_sec) {
        return fail(`Tổng thời lượng các phân cảnh (${computedDuration}s) vượt quá hạn mức tối đa ${quota.max_duration_sec}s của tài khoản. Vui lòng rút ngắn bớt thời lượng hoặc giảm phân cảnh.`, 400);
      }
      const durationSec = Math.min(quota.max_duration_sec, Math.max(2, computedDuration));
      const aspectRatio = ['9:16', '16:9', '1:1', '4:5'].includes(str(data.aspectRatio)) ? str(data.aspectRatio) : '9:16';
      const language = str(data.language) === 'en' ? 'en' : 'vi';
      const ctaText = str(data.ctaText) || 'Khám phá ngay';
      const voiceConfig = data.voiceConfig && typeof data.voiceConfig === 'object' ? data.voiceConfig : { enabled: false, voice: 'vi-female-young', speed: 1 };
      const musicConfig = data.musicConfig && typeof data.musicConfig === 'object' ? data.musicConfig : { enabled: true, mood: 'upbeat-modern', volume: 0.25 };

      if (productId) {
        const prod = await env.DB.prepare('SELECT id FROM products WHERE id=? AND user_id=?').bind(productId, actor.id).first();
        if (!prod) return fail('Sản phẩm không hợp lệ.', 404);
      }

      const id = uuid();
      const now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO video_projects(id,user_id,product_id,template_id,title,video_type,industry,target_audience,style,duration_sec,aspect_ratio,language,status,voice_config_json,music_config_json,cta_text,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      )
        .bind(
          id,
          actor.id,
          productId,
          templateId,
          title,
          videoType,
          industry,
          targetAudience,
          style,
          durationSec,
          aspectRatio,
          language,
          'DRAFT',
          JSON.stringify(voiceConfig),
          JSON.stringify(musicConfig),
          ctaText,
          now,
          now
        )
        .run();

      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i] as Record<string, unknown>;
        await env.DB.prepare(
          'INSERT INTO video_scenes(id,project_id,product_id,sort_order,duration_sec,narration,on_screen_text,show_on_screen_text,image_id,image_url,ai_video_url,source_type,motion_type,transition_type,lighting_effect,visual_prompt,music_mood,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        )
          .bind(
            str(s.id) || uuid(),
            id,
            str(s.productId) || productId,
            i,
            Math.min(30, Math.max(2, num(s.durationSec, 5))),
            str(s.narration),
            str(s.onScreenText),
            s.showOnScreenText === false ? 0 : 1,
            str(s.imageId) || null,
            str(s.imageUrl),
            str(s.aiVideoUrl) || null,
            ['REAL_PRODUCT', 'AI_GENERATED', 'AI_VIDEO', 'USER_VIDEO'].includes(str(s.sourceType)) ? str(s.sourceType) : 'REAL_PRODUCT',
            str(s.motionType) || 'zoom-in',
            str(s.transitionType) || 'fade',
            str(s.lightingEffect) || 'studio-glow',
            str(s.visualPrompt),
            str(s.musicMood) || 'upbeat',
            now,
            now
          )
          .run();
      }

      return json({ id, message: 'Đã tạo dự án video.' }, 201);
    }

    const projectMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)$/);
    if (projectMatch) {
      const projectId = projectMatch[1];
      const project = await env.DB.prepare('SELECT * FROM video_projects WHERE id=? AND user_id=?')
        .bind(projectId, actor.id)
        .first<Record<string, unknown>>();
      if (!project) return fail('Không tìm thấy dự án video.', 404);

      if (request.method === 'GET') {
        const scenesRows = await env.DB.prepare('SELECT vs.*, p.name AS scene_product_name FROM video_scenes vs LEFT JOIN products p ON p.id=vs.product_id WHERE vs.project_id=? ORDER BY vs.sort_order ASC')
          .bind(projectId)
          .all<Record<string, unknown>>();
        const jobsRows = await env.DB.prepare('SELECT * FROM video_jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 10')
          .bind(projectId)
          .all<Record<string, unknown>>();

        const sceneReviewsRows = await env.DB.prepare('SELECT scene_id,status,output_file_url,file_size_bytes,format,resolution,scene_signature,updated_at FROM video_scene_reviews WHERE project_id=? AND user_id=?')
          .bind(projectId, actor.id)
          .all<Record<string, unknown>>();

        return json({
          project: {
            id: project.id,
            productId: project.product_id,
            templateId: project.template_id,
            title: project.title,
            videoType: project.video_type,
            industry: project.industry,
            targetAudience: project.target_audience,
            style: project.style,
            durationSec: project.duration_sec,
            aspectRatio: project.aspect_ratio,
            language: project.language,
            status: project.status,
            voiceConfig: safeJsonParse(String(project.voice_config_json || '{}'), {}),
            musicConfig: safeJsonParse(String(project.music_config_json || '{}'), {}),
            brandLogoUrl: project.brand_logo_url,
            ctaText: project.cta_text,
            outputFormat: project.output_format,
            outputResolution: project.output_resolution,
            outputSizeBytes: project.output_size_bytes,
            outputFileUrl: project.output_file_url || null,
            errorMessage: project.error_message,
            createdAt: project.created_at,
            updatedAt: project.updated_at,
          },
          scenes: scenesRows.results.map(s => ({
            id: s.id,
            projectId: s.project_id,
            productId: s.product_id || project.product_id || null,
            productName: s.scene_product_name || null,
            sortOrder: s.sort_order,
            durationSec: s.duration_sec,
            narration: s.narration,
            onScreenText: s.on_screen_text,
            showOnScreenText: s.show_on_screen_text === null || s.show_on_screen_text === undefined ? true : Boolean(s.show_on_screen_text),
            imageId: s.image_id,
            imageUrl: s.image_url,
            aiVideoUrl: s.ai_video_url || null,
            sourceType: s.source_type,
            motionType: s.motion_type,
            transitionType: s.transition_type,
            lightingEffect: s.lighting_effect,
            visualPrompt: s.visual_prompt,
            musicMood: s.music_mood,
          })),
          jobs: jobsRows.results,
          sceneReviews: sceneReviewsRows.results.map(review => ({
            sceneId: review.scene_id,
            status: review.status,
            outputFileUrl: review.output_file_url,
            fileSizeBytes: review.file_size_bytes,
            format: review.format,
            resolution: review.resolution,
            sceneSignature: review.scene_signature,
            updatedAt: review.updated_at,
          })),
        });
      }

      if (request.method === 'PUT') {
        const data = await body(request);
        const quota = await getOrCreateQuota(env, actor.id);
        const now = new Date().toISOString();
        const title = str(data.title) || String(project.title);
        const videoType = str(data.videoType) || String(project.video_type);
        const industry = str(data.industry) || String(project.industry);
        const targetAudience = data.targetAudience !== undefined ? str(data.targetAudience) : String(project.target_audience || '');
        const style = str(data.style) || String(project.style || '');
        const incomingScenes = Array.isArray(data.scenes) ? data.scenes : null;
        const computedDuration = incomingScenes && incomingScenes.length > 0
          ? Math.round(incomingScenes.reduce((sum, raw) => {
              const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
              return sum + Math.min(30, Math.max(2, num(s.durationSec, 5)));
            }, 0))
          : Math.min(quota.max_duration_sec, Math.max(2, num(data.durationSec, Number(project.duration_sec))));
        if (incomingScenes && incomingScenes.length > 0 && computedDuration > quota.max_duration_sec) {
          return fail(`Tổng thời lượng các phân cảnh (${computedDuration}s) vượt quá hạn mức tối đa ${quota.max_duration_sec}s của tài khoản. Vui lòng rút ngắn bớt thời lượng hoặc giảm phân cảnh.`, 400);
        }
        const durationSec = Math.min(quota.max_duration_sec, Math.max(2, computedDuration));
        const aspectRatio = ['9:16', '16:9', '1:1', '4:5'].includes(str(data.aspectRatio))
          ? str(data.aspectRatio)
          : String(project.aspect_ratio);
        const language = str(data.language) === 'en' ? 'en' : str(data.language) === 'vi' ? 'vi' : String(project.language);
        const ctaText = data.ctaText !== undefined ? str(data.ctaText) : String(project.cta_text || '');
        const brandLogoUrl = data.brandLogoUrl !== undefined ? str(data.brandLogoUrl) : String(project.brand_logo_url || '');
        const voiceConfig = data.voiceConfig !== undefined ? JSON.stringify(data.voiceConfig) : String(project.voice_config_json || '{}');
        const musicConfig = data.musicConfig !== undefined ? JSON.stringify(data.musicConfig) : String(project.music_config_json || '{}');
        const productId = data.productId !== undefined ? str(data.productId) || null : (project.product_id as string | null);
        if (productId) {
          const prod = await env.DB.prepare('SELECT id FROM products WHERE id=? AND user_id=?').bind(productId, actor.id).first();
          if (!prod) return fail('Sản phẩm không hợp lệ.', 404);
        }

        await env.DB.prepare(
          'UPDATE video_projects SET product_id=?,title=?,video_type=?,industry=?,target_audience=?,style=?,duration_sec=?,aspect_ratio=?,language=?,voice_config_json=?,music_config_json=?,brand_logo_url=?,cta_text=?,updated_at=? WHERE id=? AND user_id=?'
        )
          .bind(
            productId,
            title,
            videoType,
            industry,
            targetAudience,
            style,
            durationSec,
            aspectRatio,
            language,
            voiceConfig,
            musicConfig,
            brandLogoUrl,
            ctaText,
            now,
            projectId,
            actor.id
          )
          .run();

        if (incomingScenes) {
          await env.DB.prepare('DELETE FROM video_scenes WHERE project_id=?').bind(projectId).run();
          for (let i = 0; i < incomingScenes.length; i++) {
            const s = incomingScenes[i] as Record<string, unknown>;
            await env.DB.prepare(
              'INSERT INTO video_scenes(id,project_id,product_id,sort_order,duration_sec,narration,on_screen_text,show_on_screen_text,image_id,image_url,ai_video_url,source_type,motion_type,transition_type,lighting_effect,visual_prompt,music_mood,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
            )
              .bind(
                str(s.id) || uuid(),
                projectId,
                str(s.productId) || productId,
                i,
                Math.min(30, Math.max(2, num(s.durationSec, 5))),
                str(s.narration),
                str(s.onScreenText),
                s.showOnScreenText === false ? 0 : 1,
                str(s.imageId) || null,
                str(s.imageUrl),
                str(s.aiVideoUrl) || null,
                ['REAL_PRODUCT', 'AI_GENERATED', 'AI_VIDEO', 'USER_VIDEO'].includes(str(s.sourceType))
                  ? str(s.sourceType)
                  : 'REAL_PRODUCT',
                str(s.motionType) || 'zoom-in',
                str(s.transitionType) || 'fade',
                str(s.lightingEffect) || 'studio-glow',
                str(s.visualPrompt),
                str(s.musicMood) || 'upbeat',
                now,
                now
              )
              .run();
          }
        }
        await env.DB.prepare('DELETE FROM video_scene_reviews WHERE project_id=? AND scene_id NOT IN (SELECT id FROM video_scenes WHERE project_id=?)')
          .bind(projectId, projectId).run();
        return json({ message: 'Đã lưu dự án video.' });
      }

      if (request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM video_projects WHERE id=? AND user_id=?').bind(projectId, actor.id).run();
        return json({ message: 'Đã xóa dự án video.' });
      }
    }

    const sceneReviewUploadMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/scenes\/([0-9a-f-]+)\/output$/);
    if (sceneReviewUploadMatch && request.method === 'POST') {
      const [, projectId, sceneId] = sceneReviewUploadMatch;
      const ownedScene = await env.DB.prepare(
        'SELECT vs.id FROM video_scenes vs INNER JOIN video_projects vp ON vp.id=vs.project_id WHERE vs.id=? AND vs.project_id=? AND vp.user_id=?'
      ).bind(sceneId, projectId, actor.id).first();
      if (!ownedScene) return fail('Không tìm thấy phân cảnh thuộc dự án của bạn.', 404);
      const form = await request.formData();
      const file = form.get('file');
      const signature = str(form.get('sceneSignature'));
      const resolution = ['480p','720p','1080p'].includes(str(form.get('resolution'))) ? str(form.get('resolution')) : '720p';
      if (!(file instanceof File)) return fail('Không tìm thấy tệp video phân cảnh.');
      if (!['video/mp4','video/webm'].includes(file.type)) return fail('Chỉ hỗ trợ video MP4 hoặc WebM.');
      if (file.size <= 0 || file.size > 50 * 1024 * 1024) return fail('Video phân cảnh phải có dung lượng tối đa 50MB.');
      if (!signature || signature.length > 8000) return fail('Thiếu thông tin phiên bản nội dung phân cảnh.');
      const uploaded = await uploadVideoToImageKit(env, file);
      const now = new Date().toISOString();
      const format = file.type === 'video/mp4' ? 'mp4' : 'webm';
      await env.DB.prepare(
        "INSERT INTO video_scene_reviews(scene_id,project_id,user_id,status,output_file_url,output_imagekit_file_id,file_size_bytes,format,resolution,scene_signature,updated_at) VALUES(?,?,?,'PENDING',?,?,?,?,?,?,?) ON CONFLICT(scene_id) DO UPDATE SET project_id=excluded.project_id,user_id=excluded.user_id,status='PENDING',output_file_url=excluded.output_file_url,output_imagekit_file_id=excluded.output_imagekit_file_id,file_size_bytes=excluded.file_size_bytes,format=excluded.format,resolution=excluded.resolution,scene_signature=excluded.scene_signature,updated_at=excluded.updated_at"
      ).bind(sceneId, projectId, actor.id, uploaded.url, uploaded.fileId, file.size, format, resolution, signature, now).run();
      await audit(env, actor.id, null, 'VIDEO_SCENE_OUTPUT_STORED', { projectId, sceneId, fileSizeBytes: file.size });
      return json({ sceneId, status: 'PENDING', outputFileUrl: uploaded.url, fileSizeBytes: file.size, format, resolution, sceneSignature: signature });
    }

    const sceneReviewMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/scenes\/([0-9a-f-]+)\/review$/);
    if (sceneReviewMatch && request.method === 'PATCH') {
      const [, projectId, sceneId] = sceneReviewMatch;
      const data = await body(request);
      const status = str(data.status);
      const signature = str(data.sceneSignature);
      if (!['PENDING','APPROVED'].includes(status)) return fail('Trạng thái duyệt phân cảnh không hợp lệ.');
      const review = await env.DB.prepare(
        'SELECT r.scene_signature,r.output_file_url FROM video_scene_reviews r INNER JOIN video_projects p ON p.id=r.project_id WHERE r.scene_id=? AND r.project_id=? AND r.user_id=? AND p.user_id=?'
      ).bind(sceneId, projectId, actor.id, actor.id).first<{ scene_signature: string; output_file_url: string }>();
      if (!review) return fail('Phân cảnh chưa có video riêng để duyệt.', 404);
      if (review.scene_signature !== signature) return fail('Nội dung phân cảnh đã thay đổi. Vui lòng dựng lại video trước khi duyệt.', 409);
      if (status === 'APPROVED' && !review.output_file_url) return fail('Chưa có video phân cảnh hợp lệ để xác nhận.');
      await env.DB.prepare('UPDATE video_scene_reviews SET status=?,updated_at=? WHERE scene_id=? AND project_id=? AND user_id=?')
        .bind(status, new Date().toISOString(), sceneId, projectId, actor.id).run();
      return json({ sceneId, status, sceneSignature: signature });
    }

    const dupMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/duplicate$/);
    if (dupMatch && request.method === 'POST') {
      const sourceId = dupMatch[1];
      const src = await env.DB.prepare('SELECT * FROM video_projects WHERE id=? AND user_id=?')
        .bind(sourceId, actor.id)
        .first<Record<string, unknown>>();
      if (!src) return fail('Không tìm thấy dự án video.', 404);
      const newId = uuid();
      const now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO video_projects(id,user_id,product_id,template_id,title,video_type,industry,target_audience,style,duration_sec,aspect_ratio,language,status,voice_config_json,music_config_json,brand_logo_url,cta_text,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      )
        .bind(
          newId,
          actor.id,
          src.product_id,
          src.template_id,
          `${src.title} (Bản sao)`,
          src.video_type,
          src.industry,
          src.target_audience,
          src.style,
          src.duration_sec,
          src.aspect_ratio,
          src.language,
          'DRAFT',
          src.voice_config_json,
          src.music_config_json,
          src.brand_logo_url,
          src.cta_text,
          now,
          now
        )
        .run();
      const scenes = await env.DB.prepare('SELECT * FROM video_scenes WHERE project_id=? ORDER BY sort_order ASC')
        .bind(sourceId)
        .all<Record<string, unknown>>();
      for (const s of scenes.results) {
        await env.DB.prepare(
          'INSERT INTO video_scenes(id,project_id,product_id,sort_order,duration_sec,narration,on_screen_text,show_on_screen_text,image_id,image_url,ai_video_url,source_type,motion_type,transition_type,lighting_effect,visual_prompt,music_mood,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        )
          .bind(
            uuid(),
            newId,
            s.product_id || src.product_id,
            s.sort_order,
            s.duration_sec,
            s.narration,
            s.on_screen_text,
            s.show_on_screen_text === 0 ? 0 : 1,
            s.image_id,
            s.image_url,
            s.ai_video_url || null,
            s.source_type,
            s.motion_type,
            s.transition_type,
            s.lighting_effect,
            s.visual_prompt,
            s.music_mood,
            now,
            now
          )
          .run();
      }
      return json({ id: newId, message: 'Đã tạo bản sao dự án.' }, 201);
    }

    const jobCreateMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/jobs$/);
    if (jobCreateMatch && request.method === 'POST') {
      const projectId = jobCreateMatch[1];
      const project = await env.DB.prepare('SELECT id FROM video_projects WHERE id=? AND user_id=?')
        .bind(projectId, actor.id)
        .first();
      if (!project) return fail('Không tìm thấy dự án video.', 404);
      const data = await body(request);
      const resolution = ['480p', '720p', '1080p'].includes(str(data.resolution)) ? str(data.resolution) : '720p';
      const format = str(data.format) === 'webm' ? 'webm' : 'mp4';
      const jobId = uuid();
      const now = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO video_jobs(id,project_id,user_id,status,progress,resolution,format,started_at,created_at) VALUES(?,?,?,'PROCESSING',5,?,?,?,?)"
      )
        .bind(jobId, projectId, actor.id, resolution, format, now, now)
        .run();
      await env.DB.prepare("UPDATE video_projects SET status='PROCESSING',error_message=NULL,output_file_url=NULL,output_imagekit_file_id=NULL,updated_at=? WHERE id=?")
        .bind(now, projectId)
        .run();
      return json({ jobId }, 201);
    }

    const jobUpdateMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/jobs\/([0-9a-f-]+)$/);
    if (jobUpdateMatch && request.method === 'PATCH') {
      const [, projectId, jobId] = jobUpdateMatch;
      const job = await env.DB.prepare('SELECT id FROM video_jobs WHERE id=? AND project_id=? AND user_id=?')
        .bind(jobId, projectId, actor.id)
        .first();
      if (!job) return fail('Không tìm thấy tác vụ dựng video.', 404);
      const data = await body(request);
      const status = ['PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(str(data.status))
        ? str(data.status)
        : 'FAILED';
      const fileSizeBytes = num(data.fileSizeBytes, 0);
      const format = str(data.format) || 'mp4';
      const resolution = str(data.resolution) || '720p';
      const errorMessage = str(data.errorMessage) || null;
      const progress = Math.min(100, Math.max(0, num(data.progress, status === 'COMPLETED' ? 100 : 0)));
      const now = new Date().toISOString();

      // Strictly forbid marking COMPLETED if fileSizeBytes <= 0 (no real file produced!)
      if (status === 'COMPLETED' && fileSizeBytes <= 0) {
        return fail('Không thể đánh dấu hoàn thành khi chưa tạo được file video hợp lệ.', 400);
      }

      await env.DB.prepare(
        'UPDATE video_jobs SET status=?,progress=?,file_size_bytes=?,format=?,resolution=?,error_message=?,completed_at=? WHERE id=?'
      )
        .bind(
          status,
          progress,
          fileSizeBytes || null,
          format,
          resolution,
          errorMessage,
          ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status) ? now : null,
          jobId
        )
        .run();

      await env.DB.prepare(
        'UPDATE video_projects SET status=?,output_format=?,output_resolution=?,output_size_bytes=?,error_message=?,updated_at=? WHERE id=?'
      )
        .bind(
          status,
          status === 'COMPLETED' ? format : null,
          status === 'COMPLETED' ? resolution : null,
          status === 'COMPLETED' ? fileSizeBytes : null,
          errorMessage,
          now,
          projectId
        )
        .run();

      return json({ message: 'Đã cập nhật trạng thái dựng video.' });
    }

    const jobUploadMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)\/jobs\/([0-9a-f-]+)\/upload$/);
    if (jobUploadMatch && request.method === 'POST') {
      const [, projectId, jobId] = jobUploadMatch;
      const ownedJob = await env.DB.prepare('SELECT id FROM video_jobs WHERE id=? AND project_id=? AND user_id=?')
        .bind(jobId, projectId, actor.id).first();
      if (!ownedJob) return fail('Không tìm thấy tác vụ dựng video.', 404);
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return fail('Không tìm thấy tệp video cần lưu.');
      if (!['video/mp4', 'video/webm'].includes(file.type)) return fail('Chỉ hỗ trợ video MP4 hoặc WebM.');
      if (file.size <= 0 || file.size > 50 * 1024 * 1024) return fail('Video phải có dung lượng từ 1 byte đến tối đa 50MB.');
      const uploaded = await uploadVideoToImageKit(env, file);
      const now = new Date().toISOString();
      await env.DB.prepare('UPDATE video_jobs SET output_file_url=?,output_imagekit_file_id=?,file_size_bytes=? WHERE id=? AND project_id=? AND user_id=?')
        .bind(uploaded.url, uploaded.fileId, file.size, jobId, projectId, actor.id).run();
      await env.DB.prepare('UPDATE video_projects SET output_file_url=?,output_imagekit_file_id=?,updated_at=? WHERE id=? AND user_id=?')
        .bind(uploaded.url, uploaded.fileId, now, projectId, actor.id).run();
      await audit(env, actor.id, null, 'VIDEO_OUTPUT_STORED', { projectId, jobId, fileSizeBytes: file.size });
      return json({ stored: true, outputFileUrl: uploaded.url, fileSizeBytes: file.size });
    }

    // ==================== ADMIN & SUPER ADMIN ROUTES ====================
    if (path.startsWith('/api/admin/')) {
      if (roleRank(actor.role) < roleRank('ADMIN')) {
        return fail('Bạn không có quyền truy cập khu vực quản trị.', 403);
      }

      if (path === '/api/admin/dashboard' && request.method === 'GET') {
        const totalUsers = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first<{ c: number }>();
        const pendingUsers = await env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE status='PENDING_APPROVAL'").first<{ c: number }>();
        const activeUsers = await env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE status='APPROVED'").first<{ c: number }>();
        const lockedUsers = await env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE status IN ('DISABLED','SUSPENDED','REJECTED')").first<{ c: number }>();
        const totalProducts = await env.DB.prepare('SELECT COUNT(*) AS c FROM products').first<{ c: number }>();
        const totalVideos = await env.DB.prepare('SELECT COUNT(*) AS c FROM video_projects').first<{ c: number }>();
        const completedVideos = await env.DB.prepare("SELECT COUNT(*) AS c FROM video_projects WHERE status='COMPLETED'").first<{ c: number }>();
        const failedVideos = await env.DB.prepare("SELECT COUNT(*) AS c FROM video_projects WHERE status='FAILED'").first<{ c: number }>();

        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const month = new Date().toISOString().slice(0, 7);

        const dailyVideos = await env.DB.prepare('SELECT COUNT(*) AS c FROM video_projects WHERE substr(created_at,1,10)=?')
          .bind(today)
          .first<{ c: number }>();
        const weeklyVideos = await env.DB.prepare('SELECT COUNT(*) AS c FROM video_projects WHERE created_at >= ?')
          .bind(weekAgo)
          .first<{ c: number }>();
        const monthlyVideos = await env.DB.prepare('SELECT COUNT(*) AS c FROM video_projects WHERE substr(created_at,1,7)=?')
          .bind(month)
          .first<{ c: number }>();

        const aiUsage = await env.DB.prepare(
          'SELECT module_key, COUNT(*) AS calls, COALESCE(SUM(tokens_used),0) AS tokens, COALESCE(SUM(estimated_cost_usd),0) AS cost FROM ai_usage_logs GROUP BY module_key'
        ).all();

        return json({
          stats: {
            totalUsers: totalUsers?.c || 0,
            pendingUsers: pendingUsers?.c || 0,
            activeUsers: activeUsers?.c || 0,
            lockedUsers: lockedUsers?.c || 0,
            totalProducts: totalProducts?.c || 0,
            totalVideos: totalVideos?.c || 0,
            completedVideos: completedVideos?.c || 0,
            failedVideos: failedVideos?.c || 0,
            dailyVideos: dailyVideos?.c || 0,
            weeklyVideos: weeklyVideos?.c || 0,
            monthlyVideos: monthlyVideos?.c || 0,
          },
          aiUsage: aiUsage.results,
        });
      }

      if (path === '/api/admin/users' && request.method === 'POST') {
        const data = await body(request);
        const email = str(data.email).toLowerCase();
        const username = str(data.username).toLowerCase();
        const fullName = str(data.fullName);
        const phone = str(data.phone);
        const purpose = str(data.purpose);
        const password = str(data.password);
        const role = str(data.role || 'USER');
        const allowedRoles = actor.role === 'SUPER_ADMIN' ? ['ADMIN', 'EDITOR', 'USER'] : ['EDITOR', 'USER'];
        if (!allowedRoles.includes(role) || roleRank(role) >= roleRank(actor.role)) return fail('Bạn không có quyền tạo tài khoản với vai trò này.', 403);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) return fail('Email không hợp lệ.');
        if (username && !/^[a-z0-9._-]{3,40}$/.test(username)) return fail('Tên đăng nhập chỉ gồm chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới (3-40 ký tự).');
        if (fullName.length < 2 || fullName.length > 120) return fail('Họ và tên phải từ 2 đến 120 ký tự.');
        if (password.length < 12 || password.length > 128) return fail('Mật khẩu phải có từ 12 đến 128 ký tự.');
        if (phone.length > 30 || purpose.length > 500) return fail('Số điện thoại hoặc mục đích sử dụng vượt quá giới hạn.');
        const existingEmail = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
        if (existingEmail) return fail('Email này đã được sử dụng.', 409);
        if (username) {
          const existingUsername = await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first();
          if (existingUsername) return fail('Tên đăng nhập này đã được sử dụng.', 409);
        }
        const id = uuid();
        const salt = hex(bytes(16));
        const now = new Date().toISOString();
        await env.DB.prepare('INSERT INTO users(id,email,username,full_name,phone,purpose,password_hash,password_salt,role,status,approved_at,approved_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(id, email, username || null, fullName, phone || null, purpose || null, await passwordHash(password, salt), salt, role, 'APPROVED', now, actor.id)
          .run();
        await getOrCreateQuota(env, id);
        await audit(env, actor.id, id, 'ADMIN_USER_CREATED', { email, username: username || null, role });
        return json({ message: 'Đã tạo tài khoản và kích hoạt thành công.', status: 'APPROVED', role }, 201);
      }

      if (path === '/api/admin/users' && request.method === 'GET') {
        const result = await env.DB.prepare(
          `SELECT u.id,u.email,u.username,u.full_name,u.phone,u.purpose,u.role,u.status,u.created_at,u.approved_at,u.last_login_at,
                  q.daily_video_limit,q.monthly_video_limit,q.max_duration_sec,q.max_images_per_product,q.can_use_ai_video,q.can_use_voice,q.can_use_advanced_models
           FROM users u LEFT JOIN user_quotas q ON q.user_id=u.id ORDER BY u.created_at DESC`
        ).all<Record<string, unknown>>();
        return json({
          users: result.results.map(row => ({
            id: row.id,
            email: row.email,
            username: row.username,
            fullName: row.full_name,
            phone: row.phone,
            purpose: row.purpose,
            role: row.role,
            status: row.status,
            createdAt: row.created_at,
            approvedAt: row.approved_at,
            lastLoginAt: row.last_login_at,
            quota: {
              dailyVideoLimit: row.daily_video_limit ?? 5,
              monthlyVideoLimit: row.monthly_video_limit ?? 60,
              maxDurationSec: row.max_duration_sec ?? 60,
              maxImagesPerProduct: row.max_images_per_product ?? 10,
              canUseAiVideo: Boolean(row.can_use_ai_video),
              canUseVoice: row.can_use_voice === null || row.can_use_voice === undefined ? true : Boolean(row.can_use_voice),
              canUseAdvancedModels: Boolean(row.can_use_advanced_models),
            },
          })),
        });
      }

      const userActionMatch = path.match(
        /^\/api\/admin\/users\/([0-9a-f-]+)\/(approve|reject|suspend|disable|enable|role|quota|reset-password|delete)$/
      );
      if (userActionMatch && request.method === 'POST') {
        const [, targetId, action] = userActionMatch;
        const target = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(targetId).first<UserRow>();
        if (!target) return fail('Không tìm thấy tài khoản.', 404);
        if (target.role === 'SUPER_ADMIN') {
          return fail('Tài khoản Super Admin được bảo vệ tuyệt đối; không thể khóa, xóa, hạ cấp hoặc thay đổi trạng thái.', 403);
        }
        if (actor.id === target.id && ['disable', 'suspend', 'reject', 'delete', 'role', 'reset-password'].includes(action)) {
          return fail('Không thể thực hiện thao tác này trên chính tài khoản đang đăng nhập.', 403);
        }
        if (
          actor.role !== 'SUPER_ADMIN' &&
          (roleRank(target.role) >= roleRank(actor.role) || action === 'delete' || action === 'reset-password')
        ) {
          return fail('Bạn chỉ được quản lý tài khoản có quyền thấp hơn.', 403);
        }

        const data = await body(request);
        const now = new Date().toISOString();
        if (action === 'approve' || action === 'reject' || action === 'suspend' || action === 'disable' || action === 'enable') {
          const status = ({
            approve: 'APPROVED',
            reject: 'REJECTED',
            suspend: 'SUSPENDED',
            disable: 'DISABLED',
            enable: 'APPROVED',
          } as Record<string, string>)[action];
          await env.DB.prepare("UPDATE users SET status=?,approved_at=?,approved_by=?,updated_at=? WHERE id=? AND role<>'SUPER_ADMIN'")
            .bind(
              status,
              status === 'APPROVED' ? now : target.approved_at,
              status === 'APPROVED' ? actor.id : target.approved_by,
              now,
              targetId
            )
            .run();
          if (status !== 'APPROVED') await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(targetId).run();
        } else if (action === 'role') {
          const role = str(data.role);
          if (!['ADMIN', 'EDITOR', 'USER'].includes(role)) return fail('Vai trò không hợp lệ.');
          if (actor.role !== 'SUPER_ADMIN' && roleRank(role) >= roleRank(actor.role)) {
            return fail('Không thể cấp vai trò ngang hoặc cao hơn quyền của bạn.', 403);
          }
          await env.DB.prepare("UPDATE users SET role=?,updated_at=? WHERE id=? AND role<>'SUPER_ADMIN'")
            .bind(role, now, targetId)
            .run();
        } else if (action === 'quota') {
          await getOrCreateQuota(env, targetId);
          await env.DB.prepare(
            'UPDATE user_quotas SET daily_video_limit=?,monthly_video_limit=?,max_duration_sec=?,max_images_per_product=?,can_use_ai_video=?,can_use_voice=?,can_use_advanced_models=?,updated_at=? WHERE user_id=?'
          )
            .bind(
              Math.max(1, num(data.dailyVideoLimit, 5)),
              Math.max(1, num(data.monthlyVideoLimit, 60)),
              Math.min(90, Math.max(15, num(data.maxDurationSec, 60))),
              Math.min(10, Math.max(1, num(data.maxImagesPerProduct, 10))),
              data.canUseAiVideo ? 1 : 0,
              data.canUseVoice === false ? 0 : 1,
              data.canUseAdvancedModels ? 1 : 0,
              now,
              targetId
            )
            .run();
        } else if (action === 'reset-password') {
          const password = str(data.newPassword);
          if (password.length < 12 || password.length > 128) return fail('Mật khẩu mới phải có ít nhất 12 ký tự.');
          const salt = hex(bytes(16));
          await env.DB.prepare("UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=? AND role<>'SUPER_ADMIN'")
            .bind(await passwordHash(password, salt), salt, now, targetId)
            .run();
          await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(targetId).run();
        } else if (action === 'delete') {
          await env.DB.batch([
            env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(targetId),
            env.DB.prepare("DELETE FROM users WHERE id=? AND role<>'SUPER_ADMIN'").bind(targetId),
          ]);
        }

        await audit(
          env,
          actor.id,
          action === 'delete' ? null : targetId,
          'ADMIN_' + action.toUpperCase(),
          { targetEmail: target.email, ...(action === 'delete' ? { deletedUserId: targetId } : {}) }
        );
        return json({ message: 'Đã thực hiện thao tác quản trị.' });
      }

      if (path === '/api/admin/products' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          'SELECT p.*, u.email AS owner_email, u.full_name AS owner_name, (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id=p.id) AS image_count FROM products p JOIN users u ON u.id=p.user_id ORDER BY p.updated_at DESC LIMIT 200'
        ).all();
        return json({ products: rows.results });
      }

      if (path === '/api/admin/projects' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          'SELECT vp.*, u.email AS owner_email, u.full_name AS owner_name FROM video_projects vp JOIN users u ON u.id=vp.user_id ORDER BY vp.updated_at DESC LIMIT 200'
        ).all();
        return json({ projects: rows.results });
      }

      if (path === '/api/admin/templates' && request.method === 'POST') {
        const data = await body(request);
        const name = str(data.name);
        const videoType = str(data.videoType) || 'Advertisement';
        const industry = str(data.industry) || 'Mỹ phẩm';
        const description = str(data.description);
        if (!name || !description) return fail('Tên và mô tả mẫu video không được để trống.');
        const id = uuid();
        const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(0, 6)}`;
        await env.DB.prepare(
          'INSERT INTO templates(id,slug,name,video_type,industry,description,style_notes,preview_accent,suggested_duration,supported_ratios_json,is_active,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)'
        )
          .bind(
            id,
            slug,
            name,
            videoType,
            industry,
            description,
            str(data.styleNotes),
            str(data.previewAccent) || '#2864d9',
            Math.min(90, Math.max(15, num(data.suggestedDuration, 30))),
            JSON.stringify(Array.isArray(data.supportedRatios) ? data.supportedRatios : ['9:16', '16:9', '1:1']),
            actor.id
          )
          .run();
        await audit(env, actor.id, null, 'ADMIN_TEMPLATE_CREATED', { id, name });
        return json({ id, message: 'Đã thêm mẫu video mới.' }, 201);
      }

      const tplAdminMatch = path.match(/^\/api\/admin\/templates\/([a-zA-Z0-9-]+)$/);
      if (tplAdminMatch && request.method === 'PUT') {
        const id = tplAdminMatch[1];
        const data = await body(request);
        await env.DB.prepare(
          'UPDATE templates SET name=COALESCE(NULLIF(?, ""),name), video_type=COALESCE(NULLIF(?, ""),video_type), industry=COALESCE(NULLIF(?, ""),industry), description=COALESCE(NULLIF(?, ""),description), is_active=?, updated_at=? WHERE id=?'
        )
          .bind(
            str(data.name),
            str(data.videoType),
            str(data.industry),
            str(data.description),
            data.isActive === false ? 0 : 1,
            new Date().toISOString(),
            id
          )
          .run();
        await audit(env, actor.id, null, 'ADMIN_TEMPLATE_UPDATED', { id });
        return json({ message: 'Đã cập nhật mẫu video.' });
      }
      if (tplAdminMatch && request.method === 'DELETE') {
        const id = tplAdminMatch[1];
        await env.DB.prepare('DELETE FROM templates WHERE id=?').bind(id).run();
        await audit(env, actor.id, null, 'ADMIN_TEMPLATE_DELETED', { id });
        return json({ message: 'Đã xóa mẫu video.' });
      }

      if (path === '/api/admin/industries' && request.method === 'POST') {
        const data = await body(request);
        const name = str(data.name);
        if (!name) return fail('Tên ngành hàng không được trống.');
        const id = `ind-${uuid().slice(0, 8)}`;
        const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(-4)}`;
        await env.DB.prepare('INSERT INTO industries(id,slug,name,description,is_active,sort_order) VALUES(?,?,?,?,1,99)')
          .bind(id, slug, name, str(data.description))
          .run();
        await audit(env, actor.id, null, 'ADMIN_INDUSTRY_CREATED', { name });
        return json({ id, message: 'Đã thêm ngành hàng.' }, 201);
      }

      const industryUpdateMatch = path.match(/^\/api\/admin\/industries\/([a-zA-Z0-9-]+)$/);
      if (industryUpdateMatch && request.method === 'PUT') {
        const id = industryUpdateMatch[1];
        const data = await body(request);
        const name = str(data.name).replace(/\s+/g, ' ');
        if (!name || name.length > 100) return fail('Tên ngành hàng phải từ 1 đến 100 ký tự.');
        const current = await env.DB.prepare('SELECT id,name FROM industries WHERE id=?').bind(id).first<{ id: string; name: string }>();
        if (!current) return fail('Không tìm thấy ngành hàng.', 404);
        const duplicate = await env.DB.prepare('SELECT id FROM industries WHERE name=? COLLATE NOCASE AND id<>?').bind(name,id).first();
        if (duplicate) return fail('Tên ngành hàng này đã tồn tại.', 409);
        const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(-4)}`;
        const now = new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare('UPDATE industries SET name=?,slug=? WHERE id=?').bind(name,slug,id),
          env.DB.prepare('UPDATE products SET industry=?,updated_at=? WHERE industry=?').bind(name,now,current.name),
          env.DB.prepare('UPDATE templates SET industry=?,updated_at=? WHERE industry=?').bind(name,now,current.name),
          env.DB.prepare('UPDATE video_projects SET industry=?,updated_at=? WHERE industry=?').bind(name,now,current.name),
        ]);
        await audit(env,actor.id,null,'ADMIN_INDUSTRY_UPDATED',{id,previousName:current.name,name});
        return json({message:'Đã cập nhật ngành hàng và đồng bộ các dữ liệu liên quan.'});
      }

      if (path === '/api/admin/topics' && request.method === 'POST') {
        const data = await body(request);
        const name = str(data.name).replace(/\s+/g, ' ');
        if (!name || name.length > 80) return fail('Tên chủ đề phải từ 1 đến 80 ký tự.');
        const exists = await env.DB.prepare('SELECT id FROM video_topics WHERE name=? COLLATE NOCASE').bind(name).first();
        if (exists) return fail('Chủ đề này đã tồn tại.', 409);
        const id = `topic-${uuid()}`;
        const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(-6)}`;
        const order = await env.DB.prepare('SELECT COALESCE(MAX(sort_order),0)+1 AS next_order FROM video_topics')
          .first<{ next_order: number }>();
        await env.DB.prepare(
          'INSERT INTO video_topics(id,slug,name,is_active,sort_order) VALUES(?,?,?,1,?)'
        ).bind(id, slug, name, order?.next_order || 1).run();
        await audit(env, actor.id, null, 'ADMIN_VIDEO_TOPIC_CREATED', { id, name });
        return json({ id, message: 'Đã thêm chủ đề video.' }, 201);
      }

      const topicUpdateMatch = path.match(/^\/api\/admin\/topics\/([a-zA-Z0-9-]+)$/);
      if (topicUpdateMatch && request.method === 'PUT') {
        const id = topicUpdateMatch[1];
        const data = await body(request);
        const name = str(data.name).replace(/\s+/g, ' ');
        if (!name || name.length > 80) return fail('Tên chủ đề phải từ 1 đến 80 ký tự.');
        const current = await env.DB.prepare('SELECT id,name FROM video_topics WHERE id=?').bind(id).first<{ id:string; name:string }>();
        if (!current) return fail('Không tìm thấy chủ đề video.',404);
        const duplicate = await env.DB.prepare('SELECT id FROM video_topics WHERE name=? COLLATE NOCASE AND id<>?').bind(name,id).first();
        if (duplicate) return fail('Chủ đề video này đã tồn tại.',409);
        const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(-6)}`;
        const now = new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare('UPDATE video_topics SET name=?,slug=? WHERE id=?').bind(name,slug,id),
          env.DB.prepare('UPDATE templates SET video_type=?,updated_at=? WHERE video_type=?').bind(name,now,current.name),
          env.DB.prepare('UPDATE video_projects SET video_type=?,updated_at=? WHERE video_type=?').bind(name,now,current.name),
        ]);
        await audit(env,actor.id,null,'ADMIN_VIDEO_TOPIC_UPDATED',{id,previousName:current.name,name});
        return json({message:'Đã cập nhật chủ đề video và đồng bộ các mẫu/dự án liên quan.'});
      }

      if (path === '/api/admin/ai-configs' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT * FROM ai_configs ORDER BY module_key ASC').all();
        return json({ configs: rows.results });
      }

      const aiCfgMatch = path.match(/^\/api\/admin\/ai-configs\/([a-z0-9_]+)$/);
      if (aiCfgMatch && request.method === 'PUT') {
        if (actor.role !== 'SUPER_ADMIN') {
          return fail('Chỉ Super Admin mới được phép thay đổi cấu hình công cụ AI.', 403);
        }
        const moduleKey = aiCfgMatch[1];
        const data = await body(request);
        await env.DB.prepare(
          'UPDATE ai_configs SET is_enabled=?,is_paid=?,model_name=COALESCE(NULLIF(?, ""),model_name),fallback_mode=COALESCE(NULLIF(?, ""),fallback_mode),daily_limit=?,monthly_limit=?,updated_at=? WHERE module_key=?'
        )
          .bind(
            data.isEnabled ? 1 : 0,
            data.isPaid ? 1 : 0,
            str(data.modelName),
            str(data.fallbackMode),
            Math.max(0, num(data.dailyLimit, 300)),
            Math.max(0, num(data.monthlyLimit, 6000)),
            new Date().toISOString(),
            moduleKey
          )
          .run();
        await audit(env, actor.id, null, 'ADMIN_AI_CONFIG_UPDATED', { moduleKey, isEnabled: Boolean(data.isEnabled) });
        return json({ message: 'Đã cập nhật cấu hình AI.' });
      }

      if (path === '/api/admin/audit-logs' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          `SELECT a.*, actor.email AS actor_email, target.email AS target_email
           FROM audit_logs a
           LEFT JOIN users actor ON actor.id=a.actor_user_id
           LEFT JOIN users target ON target.id=a.target_user_id
           ORDER BY a.created_at DESC LIMIT 200`
        ).all();
        return json({ logs: rows.results });
      }

      if (path === '/api/admin/settings' && request.method === 'GET') {
        const row = await env.DB.prepare("SELECT value_json FROM system_settings WHERE key='site_config'").first<{ value_json: string }>();
        return json({ settings: safeJsonParse(row?.value_json, {}) });
      }

      if (path === '/api/admin/settings' && request.method === 'PUT') {
        if (actor.role !== 'SUPER_ADMIN') {
          return fail('Chỉ Super Admin mới được thay đổi cấu hình hệ thống.', 403);
        }
        const data = await body(request);
        await env.DB.prepare("INSERT OR REPLACE INTO system_settings(key,value_json,updated_at) VALUES('site_config',?,?)")
          .bind(JSON.stringify(data), new Date().toISOString())
          .run();
        await audit(env, actor.id, null, 'ADMIN_SETTINGS_UPDATED');
        return json({ message: 'Đã lưu cấu hình hệ thống.' });
      }

      if (path === '/api/admin/backup' && request.method === 'GET') {
        if (actor.role !== 'SUPER_ADMIN') {
          return fail('Chỉ Super Admin mới có quyền sao lưu toàn bộ dữ liệu.', 403);
        }
        const users = await env.DB.prepare(
          'SELECT id,email,username,full_name,phone,purpose,role,status,created_at,approved_at,last_login_at FROM users'
        ).all();
        const products = await env.DB.prepare('SELECT id,user_id,name,brand,industry,description,highlights_json,extra_info,created_at FROM products').all();
        const projects = await env.DB.prepare('SELECT * FROM video_projects').all();
        const scenes = await env.DB.prepare('SELECT * FROM video_scenes').all();
        const templates = await env.DB.prepare('SELECT * FROM templates').all();
        const aiConfigs = await env.DB.prepare('SELECT * FROM ai_configs').all();
        await audit(env, actor.id, null, 'ADMIN_BACKUP_EXPORTED');
        return json({
          exportedAt: new Date().toISOString(),
          version: '1.0',
          data: {
            users: users.results,
            products: products.results,
            projects: projects.results,
            scenes: scenes.results,
            templates: templates.results,
            aiConfigs: aiConfigs.results,
          },
        });
      }
    }

    return fail('Không tìm thấy API.', 404);
  } catch (error) {
    if (error instanceof HttpError) {
      return fail(error.message, error.status);
    }
    console.error('API error', error);
    return fail('Đã xảy ra lỗi máy chủ. Vui lòng thử lại hoặc kiểm tra nhật ký Worker.', 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    if (env.DB) {
      const asset = await (env as Env & { ASSETS?: { fetch: (request: Request) => Promise<Response> } }).ASSETS?.fetch(request);
      if (asset) return asset;
    }
    return new Response('AI Product Video Studio API is running.', { status: 200 });
  },
};
