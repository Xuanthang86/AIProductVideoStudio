import { useEffect, useState } from 'react';
import AuthPanel from './AuthPanel';
import ProductsPage from './components/ProductsPage';
import TemplatesPage from './components/TemplatesPage';
import StudioPage from './components/StudioPage';
import MyVideosPage from './components/MyVideosPage';
import ProfilePage from './components/ProfilePage';
import AdminPage from './components/AdminPage';
import { api } from './lib/api';
import type { Industry, User, UserQuota, UserUsage, VideoTemplate } from './types';
import {
  Aperture,
  ArrowRight,
  BadgeCheck,
  Clapperboard,
  Film,
  ImagePlus,
  LayoutTemplate,
  Menu,
  MonitorPlay,
  Play,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  WandSparkles,
  X,
} from 'lucide-react';

const landingFormats = [
  { name: 'Video quảng cáo', detail: 'Thu hút, làm nổi bật lợi ích sản phẩm', tag: 'Phổ biến' },
  { name: 'Review sản phẩm', detail: 'Trình bày điểm nổi bật và trải nghiệm', tag: 'Bán hàng' },
  { name: 'Showcase', detail: 'Tập trung hình ảnh và chi tiết sản phẩm', tag: 'Tối giản' },
  { name: 'TikTok / Reels', detail: 'Video dọc ngắn, nhịp nhanh', tag: 'Mạng xã hội' },
  { name: 'Hướng dẫn sử dụng', detail: 'Giải thích tính năng theo từng bước', tag: 'Thông tin' },
  { name: 'Lifestyle', detail: 'Đặt sản phẩm trong bối cảnh đời sống', tag: 'Sáng tạo' },
];

const steps = [
  'Tải ảnh sản phẩm',
  'Tạo nội dung & kịch bản',
  'Chọn giọng đọc và phong cách',
  'Xem trước và xuất video',
];

function normalizePath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const valid = ['/', '/login', '/register', '/studio', '/my-videos', '/products', '/templates', '/profile', '/admin'];
  return valid.includes(clean) ? clean : '/';
}

export default function App() {
  const [route, setRoute] = useState<string>(() => normalizePath(window.location.pathname));
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selected, setSelected] = useState('Video quảng cáo');
  const [authOpen, setAuthOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'account'>('login');

  const [user, setUser] = useState<User | null>(null);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [usage, setUsage] = useState<UserUsage | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [templates, setTemplates] = useState<VideoTemplate[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);

  // Studio launch context
  const [studioProductId, setStudioProductId] = useState<string>('');
  const [studioTemplate, setStudioTemplate] = useState<VideoTemplate | null>(null);
  const [studioProjectId, setStudioProjectId] = useState<string>('');

  const navigate = (path: string) => {
    const normalized = normalizePath(path);
    if (window.location.pathname !== normalized) {
      window.history.pushState({}, '', normalized);
    }
    setRoute(normalized);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const refreshAuth = async () => {
    try {
      const res = await api<{ user: User | null; quota?: UserQuota; usage?: UserUsage }>('/api/auth/me');
      setUser(res.user);
      setQuota(res.quota || null);
      setUsage(res.usage || null);
    } catch {
      setUser(null);
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
    } catch {
      // Fallback safely
    }
  };

  useEffect(() => {
    refreshAuth();
    refreshCatalog();
    const onPop = () => setRoute(normalizePath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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

  const isProtectedRoute = ['/studio', '/my-videos', '/products', '/profile', '/admin'].includes(route);

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
            <Aperture size={22} />
          </span>
          <span className="brand-copy">
            <strong>AI PRODUCT</strong>
            <small>VIDEO STUDIO</small>
          </span>
        </a>

        <button className="mobile-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Mở menu">
          {mobileMenu ? <X /> : <Menu />}
        </button>

        <nav className={mobileMenu ? 'main-nav open' : 'main-nav'}>
          {navItems.map(item => (
            <button
              key={item.path}
              className={route === item.path ? 'nav-link active' : 'nav-link'}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="top-actions">
          <span className="free-pill">
            <span /> FREE-FIRST
          </span>
          {user ? (
            <button
              className="login-btn user-chip-btn"
              onClick={() => navigate('/profile')}
              title="Thông tin tài khoản"
            >
              <UserIcon size={14} /> {user.fullName}
            </button>
          ) : (
            <button
              className="login-btn"
              onClick={() => {
                setAuthModalMode('login');
                setAuthOpen(true);
              }}
            >
              Đăng nhập
            </button>
          )}
        </div>
      </header>

      <main className="main-container">
        {route === '/' && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <Sparkles size={15} /> SÁNG TẠO VIDEO SẢN PHẨM THÔNG MINH
                </div>
                <h1>
                  Biến hình ảnh sản phẩm
                  <br />
                  <span>thành video ấn tượng.</span>
                </h1>
                <p>
                  Một không gian sáng tạo video đa định dạng, đa ngành hàng. Từ ảnh sản phẩm đến nội dung, giọng đọc và video MP4 hoàn chỉnh trong cùng một quy trình.
                </p>
                <div className="hero-buttons">
                  <button className="primary-btn" onClick={handleHeroStart}>
                    <WandSparkles size={17} /> Bắt đầu tạo video <ArrowRight size={17} />
                  </button>
                  <button className="secondary-btn" onClick={() => navigate('/templates')}>
                    Khám phá mẫu video
                  </button>
                </div>
                <div className="hero-points">
                  <span>
                    <ShieldCheck size={16} /> Tài khoản được phê duyệt
                  </span>
                  <span>
                    <BadgeCheck size={16} /> Ưu tiên công cụ miễn phí
                  </span>
                </div>
              </div>
              <div className="hero-visual">
                <div className="visual-glow" />
                <div className="preview-card">
                  <div className="preview-top">
                    <span>
                      <i /> STUDIO PREVIEW
                    </span>
                    <span className="preview-live">PREVIEW</span>
                  </div>
                  <div className="product-stage">
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
                      <small>YOUR PRODUCT</small>
                      <strong>
                        Make it
                        <br />
                        memorable.
                      </strong>
                    </div>
                  </div>
                  <div className="preview-controls">
                    <span>
                      <Play size={13} fill="currentColor" /> 00:15
                    </span>
                    <div className="timeline">
                      <i />
                    </div>
                    <span>9:16</span>
                  </div>
                </div>
                <div className="float-chip chip-ai">
                  <Sparkles size={15} /> AI-assisted workflow
                </div>
                <div className="float-chip chip-format">
                  <Film size={15} /> Multi-format export
                </div>
              </div>
            </section>

            <section className="workflow section-wrap">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">QUY TRÌNH ĐƠN GIẢN</span>
                  <h2>Từ sản phẩm đến video</h2>
                </div>
                <p>Thiết kế theo từng bước rõ ràng, dễ sử dụng trên máy tính, máy tính bảng và điện thoại.</p>
              </div>
              <div className="steps-grid">
                {steps.map((step, i) => (
                  <div className="step-card" key={step}>
                    <span className="step-number">0{i + 1}</span>
                    <div className="step-icon">{[<ImagePlus />, <WandSparkles />, <Aperture />, <MonitorPlay />][i]}</div>
                    <strong>{step}</strong>
                    <small>
                      {
                        [
                          'Thêm hình ảnh và thông tin cơ bản',
                          'Phát triển ý tưởng và lời thoại',
                          'Tùy chỉnh phong cách thể hiện',
                          'Kiểm tra thành phẩm và xuất MP4',
                        ][i]
                      }
                    </small>
                  </div>
                ))}
              </div>
            </section>

            <section className="formats section-wrap" id="formats">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">KHÔNG GIỚI HẠN NGÀNH HÀNG</span>
                  <h2>Một nền tảng, nhiều phong cách</h2>
                </div>
                <p>Lựa chọn hình thức phù hợp với mục tiêu truyền thông và đặc điểm sản phẩm.</p>
              </div>
              <div className="format-grid">
                {landingFormats.map((format, i) => (
                  <button
                    key={format.name}
                    className={selected === format.name ? 'format-card chosen' : 'format-card'}
                    onClick={() => setSelected(format.name)}
                  >
                    <div className="format-card-top">
                      <span className="format-icon">
                        {[<Clapperboard />, <MonitorPlay />, <Aperture />, <Play />, <LayoutTemplate />, <Film />][i]}
                      </span>
                      <span className="format-tag">{format.tag}</span>
                    </div>
                    <strong>{format.name}</strong>
                    <small>{format.detail}</small>
                    <span className="format-select">
                      {selected === format.name ? 'Đang chọn' : 'Chọn phong cách'} <ArrowRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="studio-callout section-wrap" id="studio">
              <div className="callout-icon">
                <WandSparkles size={25} />
              </div>
              <div>
                <span className="eyebrow">AI PRODUCT VIDEO STUDIO</span>
                <h2>Sẵn sàng kể câu chuyện sản phẩm?</h2>
                <p>
                  Chọn phong cách <b>{selected}</b> và bắt đầu xây dựng video sản phẩm của bạn.
                </p>
              </div>
              <button className="primary-btn" onClick={handleHeroStart}>
                Mở Video Studio <ArrowRight size={17} />
              </button>
            </section>
          </>
        )}

        {(route === '/login' || route === '/register') && (
          <div className="workspace-page">
            <AuthPanel
              open={true}
              inline={true}
              initialMode={route === '/register' ? 'register' : 'login'}
              onClose={() => navigate('/')}
              onAuthChange={(u, q, us) => {
                setUser(u);
                setQuota(q || null);
                setUsage(us || null);
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
              <ShieldCheck size={22} />
              <div>
                <h2>Khu vực dành cho tài khoản đã được phê duyệt</h2>
                <p>Vui lòng đăng nhập bằng tài khoản đã được Admin hoặc Super Admin phê duyệt để sử dụng Studio, quản lý sản phẩm và xuất video.</p>
              </div>
            </div>
            <AuthPanel
              open={true}
              inline={true}
              initialMode="login"
              onClose={() => {}}
              onAuthChange={(u, q, us) => {
                setUser(u);
                setQuota(q || null);
                setUsage(us || null);
              }}
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
              />
            )}
            {route === '/admin' && (
              ['SUPER_ADMIN', 'ADMIN'].includes(user.role) ? (
                <AdminPage actor={user} onRefreshCatalog={refreshCatalog} />
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
        initialMode={authModalMode}
        onClose={() => setAuthOpen(false)}
        onAuthChange={(u, q, us) => {
          setUser(u);
          setQuota(q || null);
          setUsage(us || null);
        }}
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
            <Aperture size={19} />
          </span>
          <span className="brand-copy">
            <strong>AI PRODUCT</strong>
            <small>VIDEO STUDIO</small>
          </span>
        </a>
        <span>Nền tảng sáng tạo video sản phẩm đa ngành hàng · aivideo.xuanthang.io.vn</span>
        <small>© {new Date().getFullYear()} AI Product Video Studio</small>
      </footer>
    </div>
  );
}
