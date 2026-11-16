import { useEffect, useRef, useState } from 'react';
import AuthPanel from './AuthPanel';
import ProductsPage from './components/ProductsPage';
import TemplatesPage from './components/TemplatesPage';
import StudioPage from './components/StudioPage';
import MyVideosPage from './components/MyVideosPage';
import ProfilePage from './components/ProfilePage';
import AdminPage from './components/AdminPage';
import { api, roleLabel, setUnauthorizedHandler } from './lib/api';
import type { Industry, User, UserQuota, UserUsage, VideoTemplate, VideoTopic } from './types';
import {
  Aperture,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Film,
  FolderKanban,
  ImagePlus,
  LayoutTemplate,
  LogOut,
  Menu,
  MonitorPlay,
  Package,
  Play,
  Pause,
  ShieldCheck,
  User as UserIcon,
  WandSparkles,
  X,
} from 'lucide-react';

const landingFormats = [
  { name: 'Video quảng cáo', detail: 'Làm nổi bật lợi ích chính và thông điệp bán hàng', tag: 'Phổ biến' },
  { name: 'Review sản phẩm', detail: 'Trình bày điểm nổi bật và trải nghiệm thực tế', tag: 'Bán hàng' },
  { name: 'Showcase', detail: 'Tập trung đường nét, chất liệu và chi tiết sản phẩm', tag: 'Tối giản' },
  { name: 'TikTok / Reels', detail: 'Khung hình dọc 9:16, nhịp cắt gọn và bắt mắt', tag: 'Mạng xã hội' },
  { name: 'Hướng dẫn sử dụng', detail: 'Giải thích công năng sản phẩm theo từng bước', tag: 'Thông tin' },
  { name: 'Lifestyle', detail: 'Đặt sản phẩm vào bối cảnh sinh hoạt thường ngày', tag: 'Sáng tạo' },
];

const steps = [
  {
    title: 'Tải ảnh sản phẩm',
    desc: 'Lưu trữ tối đa 10 ảnh gốc và thông tin mô tả chi tiết cho từng sản phẩm.',
    icon: ImagePlus,
  },
  {
    title: 'Phân tích & viết kịch bản',
    desc: 'Tổng hợp điểm nổi bật, lời thoại, phụ đề và chia thành từng phân cảnh rõ ràng.',
    icon: WandSparkles,
  },
  {
    title: 'Chọn phong cách & âm thanh',
    desc: 'Tùy chỉnh chuyển động camera, ánh sáng, nhạc nền và giọng đọc phù hợp.',
    icon: Aperture,
  },
  {
    title: 'Xem trước & xuất MP4',
    desc: 'Kiểm tra từng phân cảnh và xuất file video MP4 tương thích đa nền tảng.',
    icon: MonitorPlay,
  },
];

function normalizePath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const valid = ['/', '/login', '/register', '/studio', '/my-videos', '/products', '/templates', '/profile', '/admin'];
  return valid.includes(clean) ? clean : '/';
}

const PROTECTED_ROUTES = ['/studio', '/my-videos', '/products', '/profile', '/admin'];

const AUTH_ACTIVITY_KEY = 'aivideo:last-activity';
const AUTH_BACKGROUND_KEY = 'aivideo:background-at';
const BACKGROUND_LOGOUT_MS = 10 * 60 * 1000;
const IDLE_LOGOUT_MS = 45 * 60 * 1000;

export default function App() {
  const [route, setRoute] = useState<string>(() => normalizePath(window.location.pathname));
  const [mobileMenu, setMobileMenu] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [selected, setSelected] = useState('Video quảng cáo');
  const [heroPreviewPlaying, setHeroPreviewPlaying] = useState(true);
  const [heroPreviewElapsed, setHeroPreviewElapsed] = useState(0);
  const heroPreviewElapsedRef = useRef(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'account'>('login');

  const [user, setUser] = useState<User | null>(null);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [usage, setUsage] = useState<UserUsage | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [templates, setTemplates] = useState<VideoTemplate[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [topics, setTopics] = useState<VideoTopic[]>([]);

  // Studio launch context
  const [studioProductId, setStudioProductId] = useState<string>('');
  const [studioTemplate, setStudioTemplate] = useState<VideoTemplate | null>(null);
  const [studioProjectId, setStudioProjectId] = useState<string>('');

  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!heroPreviewPlaying) return;

    const startedAt = Date.now() - heroPreviewElapsedRef.current * 1000;
    const timer = window.setInterval(() => {
      const elapsed = ((Date.now() - startedAt) / 1000) % 15;
      heroPreviewElapsedRef.current = elapsed;
      setHeroPreviewElapsed(elapsed);
    }, 100);

    return () => window.clearInterval(timer);
  }, [heroPreviewPlaying]);

  const previewElapsedLabel = `00:${String(Math.floor(heroPreviewElapsed)).padStart(2, '0')}`;

  const navigate = (path: string) => {
    const normalized = normalizePath(path);
    if (window.location.pathname !== normalized) {
      window.history.pushState({}, '', normalized);
    }
    setRoute(normalized);
    setMobileMenu(false);
    setAccountMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const refreshAuth = async () => {
    try {
      // If the app was closed or left in the background for 10+ minutes,
      // revoke the server session before restoring the account.
      let backgroundAt = 0;
      try {
        backgroundAt = Number(window.localStorage.getItem(AUTH_BACKGROUND_KEY) || 0);
      } catch {
        // Continue with server-side session validation if browser storage is unavailable.
      }
      if (backgroundAt && Date.now() - backgroundAt >= BACKGROUND_LOGOUT_MS) {
        try {
          await api('/api/auth/logout', 'POST', {});
        } catch {
          // The local session is still cleared even if the network is unavailable.
        }
        try {
          window.localStorage.removeItem(AUTH_BACKGROUND_KEY);
          window.localStorage.removeItem(AUTH_ACTIVITY_KEY);
        } catch {
          // Ignore unavailable browser storage.
        }
        setUser(null);
        setQuota(null);
        setUsage(null);
        return;
      }
      try {
        window.localStorage.removeItem(AUTH_BACKGROUND_KEY);
        window.localStorage.setItem(AUTH_ACTIVITY_KEY, String(Date.now()));
      } catch {
        // Session validation remains available without local storage.
      }
      const res = await api<{ user: User | null; quota?: UserQuota; usage?: UserUsage }>('/api/auth/me');
      setUser(res.user);
      setQuota(res.quota || null);
      setUsage(res.usage || null);
    } catch {
      setUser(null);
      setQuota(null);
      setUsage(null);
    } finally {
      setAuthChecked(true);
    }
  };

  const refreshCatalog = async () => {
    try {
      const [tRes, iRes] = await Promise.all([
        api<{ templates: VideoTemplate[] }>('/api/templates'),
        api<{ industries: Industry[] }>('/api/industries'),
      ]);
      setTemplates(tRes.templates || []);
      setIndustries(iRes.industries || []);
      try {
        const topicRes = await api<{ topics: VideoTopic[] }>('/api/topics');
        setTopics(topicRes.topics || []);
      } catch {
        // Keep the existing catalog usable until the topic migration is applied.
      }
    } catch {
      // Fallback safely
    }
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setQuota(null);
      setUsage(null);
      setAccountMenuOpen(false);
    });
    refreshAuth();
    refreshCatalog();
    const onPop = () => {
      setRoute(normalizePath(window.location.pathname));
      setAccountMenuOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      setUnauthorizedHandler(null);
    };
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountMenuOpen]);

  const handleAuthChange = (nextUser: User | null, nextQuota?: UserQuota | null, nextUsage?: UserUsage | null) => {
    setUser(nextUser);
    setQuota(nextQuota ?? null);
    setUsage(nextUsage ?? null);
    setAuthChecked(true);
    try {
      if (nextUser) {
        window.localStorage.setItem(AUTH_ACTIVITY_KEY, String(Date.now()));
        window.localStorage.removeItem(AUTH_BACKGROUND_KEY);
      } else {
        window.localStorage.removeItem(AUTH_ACTIVITY_KEY);
        window.localStorage.removeItem(AUTH_BACKGROUND_KEY);
      }
    } catch {
      // Browser storage is optional; authentication remains server-validated.
    }
    if (!nextUser) {
      setAccountMenuOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api('/api/auth/logout', 'POST', {});
    } catch {
      // Clear local state regardless
    }
    try {
      window.localStorage.removeItem(AUTH_ACTIVITY_KEY);
      window.localStorage.removeItem(AUTH_BACKGROUND_KEY);
    } catch {
      // Ignore unavailable browser storage.
    }
    setUser(null);
    setQuota(null);
    setUsage(null);
    setAccountMenuOpen(false);
    if (PROTECTED_ROUTES.includes(route)) {
      navigate('/');
    }
  };

  useEffect(() => {
    if (!user) return;

    let lastActivityWrite = 0;
    let lastActivityInMemory = Date.now();
    let logoutStarted = false;
    const markActivity = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      lastActivityInMemory = now;
      // Throttle storage writes while still recording genuine user interaction.
      if (now - lastActivityWrite < 3000) return;
      lastActivityWrite = now;
      try {
        window.localStorage.setItem(AUTH_ACTIVITY_KEY, String(now));
        window.localStorage.removeItem(AUTH_BACKGROUND_KEY);
      } catch {
        // Inactivity enforcement still runs in this tab if storage is unavailable.
      }
    };

    const markBackground = () => {
      try {
        window.localStorage.setItem(AUTH_BACKGROUND_KEY, String(Date.now()));
      } catch {
        // Ignore unavailable browser storage.
      }
    };

    const checkTimeouts = () => {
      if (logoutStarted) return;
      const now = Date.now();
      let backgroundAt = 0;
      let lastActivity = lastActivityInMemory;
      try {
        backgroundAt = Number(window.localStorage.getItem(AUTH_BACKGROUND_KEY) || 0);
        lastActivity = Number(window.localStorage.getItem(AUTH_ACTIVITY_KEY) || lastActivityInMemory);
      } catch {
        // Fall back to the current tab's in-memory activity timer.
      }
      if (backgroundAt && now - backgroundAt >= BACKGROUND_LOGOUT_MS) {
        logoutStarted = true;
        void handleLogout();
        return;
      }
      if (now - lastActivity >= IDLE_LOGOUT_MS) {
        logoutStarted = true;
        void handleLogout();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markBackground();
      } else {
        checkTimeouts();
        if (!logoutStarted) markActivity();
      }
    };
    const onPageHide = () => markBackground();
    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove',
    ];
    activityEvents.forEach(eventName => window.addEventListener(eventName, markActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    const timer = window.setInterval(checkTimeouts, 10000);

    // Start a fresh inactivity window after authentication is restored.
    markActivity();
    return () => {
      window.clearInterval(timer);
      activityEvents.forEach(eventName => window.removeEventListener(eventName, markActivity));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [user]);

  const navItems: Array<{ label: string; path: string; adminOnly?: boolean }> = [
    { label: 'Tổng quan', path: '/' },
    { label: 'Tạo video', path: '/studio' },
    { label: 'Sản phẩm', path: '/products' },
    { label: 'Video của tôi', path: '/my-videos' },
    { label: 'Mẫu video', path: '/templates' },
    ...(user && ['SUPER_ADMIN', 'ADMIN'].includes(user.role) ? [{ label: 'Quản trị', path: '/admin', adminOnly: true }] : []),
  ];

  const openStudio = (opts?: { productId?: string; template?: VideoTemplate | null; projectId?: string }) => {
    setStudioProductId(opts?.productId || '');
    setStudioTemplate(opts?.template || null);
    setStudioProjectId(opts?.projectId || '');
    navigate('/studio');
  };

  const handleHeroStart = () => {
    const matched = templates.find(t => t.name.toLowerCase().includes(selected.toLowerCase()));
    openStudio({ template: matched || null });
  };

  const isProtectedRoute = PROTECTED_ROUTES.includes(route);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={e => {
            e.preventDefault();
            navigate('/');
          }}
          aria-label="AI Product Video Studio"
        >
          <span className="brand-mark">
            <Aperture size={21} />
          </span>
          <span className="brand-name">AI Product Video Studio</span>
        </a>

        <button
          type="button"
          className="mobile-toggle"
          onClick={() => setMobileMenu(!mobileMenu)}
          aria-label={mobileMenu ? 'Đóng menu' : 'Mở menu'}
          aria-expanded={mobileMenu}
        >
          {mobileMenu ? <X size={22} /> : <Menu size={22} />}
        </button>

        <nav className={mobileMenu ? 'main-nav open' : 'main-nav'} aria-label="Điều hướng chính">
          {navItems.map(item => (
            <button
              type="button"
              key={item.path}
              className={route === item.path ? 'nav-link active' : 'nav-link'}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="top-actions">
          {user ? (
            <div className="account-menu-wrap" ref={accountMenuRef}>
              <button
                type="button"
                className="account-trigger"
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                onClick={() => setAccountMenuOpen(prev => !prev)}
              >
                <span className="account-trigger-avatar">{user.fullName.slice(0, 1).toUpperCase()}</span>
                <span className="account-trigger-meta">
                  <strong>{user.fullName}</strong>
                  <small>{roleLabel[user.role] || user.role}</small>
                </span>
                <ChevronDown size={16} className={accountMenuOpen ? 'chevron-rotated' : ''} />
              </button>

              {accountMenuOpen && (
                <div className="account-dropdown" role="menu" aria-label="Menu tài khoản">
                  <div className="account-dropdown-head">
                    <strong>{user.fullName}</strong>
                    <span>{user.email}</span>
                  </div>
                  <div className="account-dropdown-list">
                    <button type="button" role="menuitem" onClick={() => navigate('/profile')}>
                      <UserIcon size={16} /> Thông tin tài khoản
                    </button>
                    <button type="button" role="menuitem" onClick={() => navigate('/products')}>
                      <Package size={16} /> Sản phẩm của tôi
                    </button>
                    <button type="button" role="menuitem" onClick={() => navigate('/my-videos')}>
                      <FolderKanban size={16} /> Video của tôi
                    </button>
                  </div>

                  <div className="account-dropdown-foot">
                    <button type="button" role="menuitem" className="account-logout-item" onClick={handleLogout}>
                      <LogOut size={16} /> Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="guest-actions">
              <button
                type="button"
                className="login-btn"
                onClick={() => {
                  setAuthModalMode('login');
                  setAuthOpen(true);
                }}
              >
                Đăng nhập
              </button>
            </div>
          )}
        </div>
      </header>
      {mobileMenu && (
        <button type="button" className="mobile-menu-backdrop" aria-label="Đóng menu điều hướng" onClick={() => setMobileMenu(false)} />
      )}

      <main className="main-container">
        {route === '/' && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">NỀN TẢNG SÁNG TẠO VIDEO SẢN PHẨM</span>
                <h1>
                  Biến hình ảnh sản phẩm
                  <br />
                  <span>thành video hoàn chỉnh.</span>
                </h1>
                <p>
                  Từ bộ ảnh sản phẩm thực tế đến kịch bản phân cảnh, giọng đọc, phụ đề và file MP4 hoàn chỉnh — gọn nhẹ trong một quy trình thống nhất.
                </p>
                <div className="hero-buttons">
                  <button type="button" className="primary-btn" onClick={handleHeroStart}>
                    <WandSparkles size={17} /> Bắt đầu tạo video <ArrowRight size={17} />
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => navigate('/templates')}>
                    Khám phá mẫu video
                  </button>
                </div>
                <div className="hero-points">
                  <span>
                    <CheckCircle2 size={16} /> Xuất MP4 trực tiếp trên trình duyệt
                  </span>
                  <span>
                    <CheckCircle2 size={16} /> Phân quyền & bảo mật tài khoản chặt chẽ
                  </span>
                </div>
              </div>

              <div className="hero-visual">
                <div className="preview-card">
                  <div className="preview-top">
                    <span>STUDIO PREVIEW</span>
                    <span className="preview-spec">9:16 · 00:15</span>
                  </div>
                  <div
                    className={`product-stage ${heroPreviewPlaying ? 'is-playing' : 'is-paused'}`}
                    role="button"
                    tabIndex={0}
                    aria-label={heroPreviewPlaying ? 'Tạm dừng xem trước' : 'Phát xem trước'}
                    aria-pressed={heroPreviewPlaying}
                    onClick={() => setHeroPreviewPlaying(playing => !playing)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setHeroPreviewPlaying(playing => !playing);
                      }
                    }}
                  >
                    <div className="stage-orbit orbit-one" />
                    <div className="stage-orbit orbit-two" />
                    <div className="product-object">
                      <div className="bottle-cap" />
                      <div className="bottle-body">
                        <span>
                          PURE
                          <br />
                          <b>ESSENCE</b>
                        </span>
                      </div>
                    </div>
                    <div className="stage-caption">
                      <small>PRODUCT SHOWCASE</small>
                      <strong>
                        Rõ nét từng
                        <br />
                        khung hình.
                      </strong>
                    </div>
                  </div>
                  <div className="preview-controls">
                    <button
                      type="button"
                      className="preview-toggle"
                      aria-label={heroPreviewPlaying ? 'Tạm dừng video xem trước' : 'Phát video xem trước'}
                      aria-pressed={heroPreviewPlaying}
                      onClick={() => setHeroPreviewPlaying(playing => !playing)}
                    >
                      {heroPreviewPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                      {heroPreviewPlaying ? 'Đang phát' : 'Phát video'}
                    </button>
                    <div className="timeline">
                      <i />
                    </div>
                    <span aria-live="off">{previewElapsedLabel} / 00:15</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="workflow section-wrap">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">QUY TRÌNH 4 BƯỚC</span>
                  <h2>Từ sản phẩm đến video thành phẩm</h2>
                </div>
                <p>Thiết kế rõ ràng theo từng bước, thao tác thuận tiện trên máy tính, máy tính bảng và điện thoại.</p>
              </div>
              <div className="steps-grid">
                {steps.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <div className="step-card" key={step.title}>
                      <div className="step-card-top">
                        <span className="step-icon">
                          <Icon size={20} />
                        </span>
                        <span className="step-number">0{i + 1}</span>
                      </div>
                      <strong>{step.title}</strong>
                      <p>{step.desc}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="formats section-wrap" id="formats">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">ĐA NGÀNH HÀNG · ĐA ĐỊNH DẠNG</span>
                  <h2>Chọn phong cách phù hợp sản phẩm</h2>
                </div>
                <p>Áp dụng linh hoạt cho mỹ phẩm, thời trang, điện tử, gia dụng, nội thất và nhiều lĩnh vực khác.</p>
              </div>
              <div className="format-grid">
                {landingFormats.map((format, i) => {
                  const Icon = [Clapperboard, MonitorPlay, Aperture, Play, LayoutTemplate, Film][i];
                  return (
                    <button
                      type="button"
                      key={format.name}
                      className={`format-card ${selected === format.name ? 'is-selected' : ''}`}
                      aria-pressed={selected === format.name}
                      onClick={() => setSelected(format.name)}
                    >
                      <div className="format-card-top">
                        <span className="format-icon">
                          <Icon size={20} />
                        </span>
                        <span className="format-tag">{format.tag}</span>
                      </div>
                      <strong>{format.name}</strong>
                      <p>{format.detail}</p>
                      <span className="format-select">
                        {selected === format.name ? 'Đang chọn' : <>Chọn phong cách <ArrowRight size={15} /></>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="format-selection-summary" aria-live="polite" aria-atomic="true">
                <strong>Phong cách đang chọn: {selected}</strong>
                <p>{landingFormats.find(format => format.name === selected)?.detail}</p>
              </div>
            </section>

            <section className="studio-callout section-wrap" id="studio">
              <div className="callout-box">
                <div className="callout-icon">
                  <WandSparkles size={24} />
                </div>
                <div className="callout-copy">
                  <span className="eyebrow">VIDEO STUDIO</span>
                  <h2>Sẵn sàng dựng video cho sản phẩm của bạn?</h2>
                  <p>
                    Bắt đầu với phong cách <b>{selected}</b> hoặc chọn mẫu có sẵn trong thư viện.
                  </p>
                </div>
                <button type="button" className="primary-btn" onClick={handleHeroStart}>
                  Mở Video Studio <ArrowRight size={17} />
                </button>
              </div>
            </section>
          </>
        )}

        {(route === '/login' || route === '/register') && (
          <div className="workspace-page">
            <AuthPanel
              open={true}
              inline={true}
              currentUser={user}
              initialMode={route === '/register' ? 'register' : 'login'}
              onClose={() => navigate('/')}
              onAuthChange={(u, q, us) => {
                handleAuthChange(u, q, us);
                if (u) navigate('/studio');
              }}
              onNavigate={navigate}
            />
          </div>
        )}

        {route === '/templates' && (
          <TemplatesPage
            templates={templates}
            industries={industries}
            topics={topics}
            onUseTemplate={tpl => openStudio({ template: tpl })}
          />
        )}

        {isProtectedRoute && !authChecked && (
          <div className="workspace-page">
            <div className="panel-card">Đang kiểm tra phiên đăng nhập...</div>
          </div>
        )}

        {isProtectedRoute && authChecked && !user && (
          <div className="workspace-page">
            <div className="panel-card auth-gate-banner">
              <ShieldCheck size={24} />
              <div>
                <h2>Khu vực dành cho tài khoản đã được phê duyệt</h2>
                <p>Vui lòng đăng nhập bằng tài khoản đã được Admin hoặc Super Admin phê duyệt để sử dụng Studio, quản lý sản phẩm và xuất video.</p>
              </div>
            </div>
            <AuthPanel
              open={true}
              inline={true}
              currentUser={null}
              initialMode="login"
              onClose={() => {}}
              onAuthChange={handleAuthChange}
              onNavigate={navigate}
            />
          </div>
        )}

        {isProtectedRoute && authChecked && user && (
          <>
            {route === '/products' && (
              <ProductsPage
                industries={industries}
                quota={quota}
                onStartVideo={pid => openStudio({ productId: pid })}
              />
            )}
            {route === '/studio' && (
              <StudioPage
                industries={industries}
                topics={topics}
                templates={templates}
                quota={quota}
                initialProductId={studioProductId}
                initialTemplate={studioTemplate}
                initialProjectId={studioProjectId}
                onGoProducts={() => navigate('/products')}
                onGoMyVideos={() => navigate('/my-videos')}
              />
            )}
            {route === '/my-videos' && (
              <MyVideosPage
                onEditProject={projId => openStudio({ projectId: projId })}
                onNewVideo={() => openStudio()}
              />
            )}
            {route === '/profile' && (
              <ProfilePage
                user={user}
                quota={quota}
                usage={usage}
                onUserUpdated={updated => setUser(updated)}
                onLogout={handleLogout}
              />
            )}
            {route === '/admin' && (
              ['SUPER_ADMIN', 'ADMIN'].includes(user.role) ? (
                <AdminPage actor={user} topics={topics} onRefreshCatalog={refreshCatalog} />
              ) : (
                <div className="workspace-page">
                  <div className="panel-card banner-alert error">
                    Bạn không có quyền truy cập khu vực quản trị.
                  </div>
                </div>
              )
            )}
          </>
        )}
      </main>

      <AuthPanel
        open={authOpen}
        currentUser={user}
        initialMode={authModalMode}
        onClose={() => setAuthOpen(false)}
        onAuthChange={handleAuthChange}
        onNavigate={navigate}
      />

      <footer className="footer">
        <a
          className="brand footer-brand"
          href="/"
          onClick={e => {
            e.preventDefault();
            navigate('/');
          }}
        >
          <span className="brand-mark">
            <Aperture size={18} />
          </span>
          <span className="brand-name">AI Product Video Studio</span>
        </a>
        <span>Nền tảng sáng tạo video sản phẩm đa ngành hàng · aivideo.xuanthang.io.vn</span>
        <small>© {new Date().getFullYear()} AI Product Video Studio</small>
      </footer>
    </div>
  );
}
