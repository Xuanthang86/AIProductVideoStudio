let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export async function api<T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  data?: unknown,
  options?: { timeoutMs?: number }
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 60000;
  const timer = timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : 0;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: data ? { 'content-type': 'application/json' } : undefined,
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Hết thời gian chờ phản hồi từ máy chủ. Vui lòng thử lại.');
    }
    throw new Error(err instanceof Error && err.message ? `Không kết nối được tới máy chủ: ${err.message}` : 'Không kết nối được tới máy chủ.');
  } finally {
    if (timer) window.clearTimeout(timer);
  }
  const result = await response.json().catch(() => ({ error: 'Phản hồi máy chủ không hợp lệ.' }));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/register')) {
      unauthorizedHandler?.();
    }
    throw new Error(result.error || 'Yêu cầu không thành công.');
  }
  return result as T;
}

export const roleLabel: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Quản trị viên',
  EDITOR: 'Biên tập viên',
  USER: 'Người dùng',
};

export const statusLabel: Record<string, string> = {
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  SUSPENDED: 'Tạm ngưng',
  DISABLED: 'Đã khóa',
};

export const projectStatusLabel: Record<string, string> = {
  DRAFT: 'Bản nháp',
  PENDING: 'Chờ xử lý',
  PROCESSING: 'Đang xử lý',
  COMPLETED: 'Hoàn thành',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
};

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function normalizeImageMimeType(file: File): string {
  const raw = (file.type || '').trim().toLowerCase();
  if (raw === 'image/jpg' || raw === 'image/jpeg') return 'image/jpeg';
  if (raw === 'image/png' || raw === 'image/webp') return raw;
  const ext = (file.name || '').toLowerCase().split('.').pop() || '';
  const extMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  if (!raw || raw === 'application/octet-stream' || raw === 'image/*') {
    return extMap[ext] || '';
  }
  return raw;
}

export function readImageFile(file: File): Promise<{ base64: string; mimeType: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const mimeType = normalizeImageMimeType(file);
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(mimeType)) {
      reject(new Error(`File "${file.name}" không đúng định dạng (chỉ hỗ trợ JPG, JPEG, PNG, WEBP).`));
      return;
    }
    if (file.size <= 0) {
      reject(new Error(`File "${file.name}" rỗng hoặc không đọc được.`));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error(`File "${file.name}" vượt quá dung lượng tối đa 5MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        resolve({ base64: dataUrl, mimeType, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => reject(new Error(`Không thể đọc kích thước ảnh "${file.name}".`));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error(`Không thể đọc file "${file.name}".`));
    reader.readAsDataURL(file);
  });
}
