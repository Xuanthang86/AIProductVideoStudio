export interface VideoDownloadOptions {
  url: string;
  baseName: string;
  /** Optional project ID so external ImageKit URLs can be downloaded via authenticated same-origin proxy */
  projectId?: string;
  /** Optional scene ID for scene-level videos */
  sceneId?: string;
}

export interface VideoDownloadResult {
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  method: 'download' | 'share' | 'open';
  notice?: string;
}

function sanitizeBaseName(baseName: string): string {
  const cleaned = baseName
    .trim()
    .replace(/\.(mp4|webm|mov|m4v)$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'video-san-pham';
}

function extensionFromMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('quicktime')) return 'mov';
  if (normalized.includes('ogg')) return 'ogv';
  return 'mp4';
}

function isIosOrTouchMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  return isIos || isAndroid;
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isWebkit = /WebKit/i.test(ua);
  const isNotCriOS = !/CriOS|FxiOS|EdgiOS/i.test(ua);
  return isIos && isWebkit && isNotCriOS;
}

function resolveDownloadUrl(options: VideoDownloadOptions, safeBaseName: string): string {
  const { url, projectId, sceneId } = options;
  if (url.startsWith('blob:')) return url;

  const parsed = new URL(url, window.location.origin);
  const isSameOrigin = parsed.origin === window.location.origin;

  // If external URL (e.g. ImageKit) and we have a projectId, route through authenticated server proxy
  // so Content-Disposition: attachment, ownership check, and MIME verification are guaranteed.
  if (!isSameOrigin && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
    if (projectId) {
      const proxyUrl = new URL(`/api/media/project-video/${encodeURIComponent(projectId)}`, window.location.origin);
      proxyUrl.searchParams.set('download', '1');
      proxyUrl.searchParams.set('filename', safeBaseName);
      return proxyUrl.toString();
    }
    if (sceneId) {
      const proxyUrl = new URL(`/api/media/scene-video/${encodeURIComponent(sceneId)}`, window.location.origin);
      proxyUrl.searchParams.set('download', '1');
      proxyUrl.searchParams.set('filename', safeBaseName);
      return proxyUrl.toString();
    }
  }

  if (
    isSameOrigin &&
    (parsed.pathname.startsWith('/api/media/project-video/') || parsed.pathname.startsWith('/api/media/scene-video/'))
  ) {
    parsed.searchParams.set('download', '1');
    parsed.searchParams.set('filename', safeBaseName);
    return parsed.toString();
  }

  return parsed.toString();
}

export async function downloadVideoAsset(options: VideoDownloadOptions): Promise<VideoDownloadResult> {
  if (!options.url) {
    throw new Error('Không tìm thấy đường dẫn video để tải xuống.');
  }

  const safeBaseName = sanitizeBaseName(options.baseName);
  const targetUrl = resolveDownloadUrl(options, safeBaseName);
  const isBlobUrl = targetUrl.startsWith('blob:');

  const response = await fetch(targetUrl, isBlobUrl ? undefined : { credentials: 'include' });
  if (!response.ok) {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || `Không thể tải video (HTTP ${response.status}).`);
    }
    throw new Error(`Không thể tải video (HTTP ${response.status}).`);
  }

  const headerMime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (headerMime && !headerMime.startsWith('video/') && headerMime !== 'application/octet-stream') {
    const previewText = await response.text().catch(() => '');
    if (headerMime.includes('text/html') || previewText.trim().toLowerCase().startsWith('<!doctype') || previewText.includes('<html')) {
      throw new Error('Máy chủ trả về trang HTML thay vì tệp video. Vui lòng đăng nhập lại hoặc tải lại trang.');
    }
    if (headerMime.includes('application/json')) {
      try {
        const parsed = JSON.parse(previewText) as { error?: string };
        if (parsed.error) throw new Error(parsed.error);
      } catch (e) {
        if (e instanceof Error && e.message) throw e;
      }
    }
    throw new Error(`Định dạng máy chủ trả về không phải video (${headerMime}).`);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error('Tệp video tải về bị rỗng (0 byte).');
  }

  const effectiveMime = (blob.type && blob.type.startsWith('video/') ? blob.type : headerMime).split(';')[0].trim().toLowerCase();
  if (!effectiveMime.startsWith('video/')) {
    throw new Error(`Không xác định được định dạng video hợp lệ (${effectiveMime || 'trống'}).`);
  }

  const extension = extensionFromMime(effectiveMime);
  const fileName = `${safeBaseName}.${extension}`;

  // Mobile compatibility: prefer native Web Share API with File on iOS/Android when supported
  if (isIosOrTouchMobile() && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], fileName, { type: effectiveMime });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
        });
        return {
          fileName,
          sizeBytes: blob.size,
          mimeType: effectiveMime,
          method: 'share',
          notice: `Đã mở bảng chia sẻ/lưu tệp ${fileName}. Chọn "Lưu video" hoặc "Lưu vào Tệp" để lưu về máy.`,
        };
      }
    } catch (shareErr) {
      // If user explicitly cancelled the share sheet, do not show an error
      if (shareErr instanceof Error && shareErr.name === 'AbortError') {
        return {
          fileName,
          sizeBytes: blob.size,
          mimeType: effectiveMime,
          method: 'share',
          notice: 'Đã hủy thao tác chia sẻ video.',
        };
      }
      // Otherwise fall through to anchor download
    }
  }

  // Standard anchor download using Blob Object URL
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);

  const supportsDownloadAttr = 'download' in HTMLAnchorElement.prototype;
  if (supportsDownloadAttr && !isIosSafari()) {
    anchor.click();
    anchor.remove();
    // Keep Object URL alive long enough for mobile/desktop download managers
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return {
      fileName,
      sizeBytes: blob.size,
      mimeType: effectiveMime,
      method: 'download',
      notice: `Đang tải xuống ${fileName}.`,
    };
  }

  // iOS Safari fallback when Web Share with files is unavailable:
  // If we have an authenticated same-origin download URL (not blob:), navigate to it directly
  // so Safari triggers its native download manager with Content-Disposition: attachment.
  anchor.remove();
  if (!isBlobUrl) {
    URL.revokeObjectURL(objectUrl);
    window.location.assign(targetUrl);
    return {
      fileName,
      sizeBytes: blob.size,
      mimeType: effectiveMime,
      method: 'open',
      notice: `Đã mở trình tải xuống của Safari cho ${fileName}.`,
    };
  }

  // Blob URL fallback on older iOS Safari
  window.location.assign(objectUrl);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
  return {
    fileName,
    sizeBytes: blob.size,
    mimeType: effectiveMime,
    method: 'open',
    notice: `Đã mở video ${fileName}. Nhấn biểu tượng Chia sẻ trên Safari để lưu về máy.`,
  };
}
