import { useState } from 'react';
import AuthPanel from './AuthPanel';
import { Aperture, ArrowRight, BadgeCheck, Clapperboard, Film, ImagePlus, LayoutTemplate, Menu, MonitorPlay, Play, ShieldCheck, Sparkles, WandSparkles, X } from 'lucide-react';

const formats = [
  { name: 'Video quảng cáo', detail: 'Thu hút, làm nổi bật lợi ích sản phẩm', tag: 'Phổ biến' },
  { name: 'Review sản phẩm', detail: 'Trình bày điểm nổi bật và trải nghiệm', tag: 'Bán hàng' },
  { name: 'Showcase', detail: 'Tập trung hình ảnh và chi tiết sản phẩm', tag: 'Tối giản' },
  { name: 'TikTok / Reels', detail: 'Video dọc ngắn, nhịp nhanh', tag: 'Mạng xã hội' },
  { name: 'Hướng dẫn sử dụng', detail: 'Giải thích tính năng theo từng bước', tag: 'Thông tin' },
  { name: 'Lifestyle', detail: 'Đặt sản phẩm trong bối cảnh đời sống', tag: 'Sáng tạo' },
];

const steps = ['Tải ảnh sản phẩm', 'Tạo nội dung & kịch bản', 'Chọn giọng đọc và phong cách', 'Xem trước và xuất video'];

export default function App() {
  const [active, setActive] = useState('Tổng quan');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selected, setSelected] = useState('Video quảng cáo');
  const [notice, setNotice] = useState('');
  const [authOpen, setAuthOpen] = useState(false);

  const nav = ['Tổng quan', 'Tạo video', 'Video của tôi', 'Mẫu video'];
  const goCreate = () => {
    setActive('Tạo video');
    setNotice('Khu vực tạo video sẽ được kích hoạt sau khi hoàn thiện đăng nhập, phê duyệt tài khoản và các mô-đun xử lý.');
    document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={() => setActive('Tổng quan')} aria-label="AI Product Video Studio">
          <span className="brand-mark"><Aperture size={22} /></span>
          <span className="brand-copy"><strong>AI PRODUCT</strong><small>VIDEO STUDIO</small></span>
        </a>
        <button className="mobile-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Mở menu">{mobileMenu ? <X /> : <Menu />}</button>
        <nav className={mobileMenu ? 'main-nav open' : 'main-nav'}>
          {nav.map(item => <button key={item} className={active === item ? 'nav-link active' : 'nav-link'} onClick={() => { setActive(item); setMobileMenu(false); }}>{item}</button>)}
        </nav>
        <div className="top-actions"><span className="free-pill"><span /> FREE-FIRST</span><button className="login-btn" onClick={() => setAuthOpen(true)}>Đăng nhập</button></div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={15} /> SÁNG TẠO VIDEO SẢN PHẨM THÔNG MINH</div>
            <h1>Biến hình ảnh sản phẩm<br /><span>thành video ấn tượng.</span></h1>
            <p>Một không gian sáng tạo video đa định dạng, đa ngành hàng. Từ ảnh sản phẩm đến nội dung, giọng đọc và video hoàn chỉnh trong cùng một quy trình.</p>
            <div className="hero-buttons"><button className="primary-btn" onClick={goCreate}><WandSparkles size={17} /> Bắt đầu tạo video <ArrowRight size={17} /></button><button className="secondary-btn" onClick={() => document.getElementById('formats')?.scrollIntoView({ behavior: 'smooth' })}>Khám phá mẫu video</button></div>
            <div className="hero-points"><span><ShieldCheck size={16} /> Tài khoản được phê duyệt</span><span><BadgeCheck size={16} /> Ưu tiên công cụ miễn phí</span></div>
          </div>
          <div className="hero-visual">
            <div className="visual-glow" />
            <div className="preview-card">
              <div className="preview-top"><span><i /> STUDIO PREVIEW</span><span className="preview-live">PREVIEW</span></div>
              <div className="product-stage"><div className="stage-orbit orbit-one" /><div className="stage-orbit orbit-two" /><div className="product-object"><div className="bottle-cap" /><div className="bottle-body"><span>PURE<br /><b>ESSENCE</b></span></div></div><div className="stage-caption"><small>YOUR PRODUCT</small><strong>Make it<br />memorable.</strong></div></div>
              <div className="preview-controls"><span><Play size={13} fill="currentColor" /> 00:15</span><div className="timeline"><i /></div><span>9:16</span></div>
            </div>
            <div className="float-chip chip-ai"><Sparkles size={15} /> AI-assisted workflow</div>
            <div className="float-chip chip-format"><Film size={15} /> Multi-format export</div>
          </div>
        </section>

        <section className="workflow section-wrap">
          <div className="section-heading"><div><span className="eyebrow">QUY TRÌNH ĐƠN GIẢN</span><h2>Từ sản phẩm đến video</h2></div><p>Thiết kế theo từng bước rõ ràng, dễ sử dụng trên máy tính, máy tính bảng và điện thoại.</p></div>
          <div className="steps-grid">{steps.map((step, i) => <div className="step-card" key={step}><span className="step-number">0{i + 1}</span><div className="step-icon">{[<ImagePlus />, <WandSparkles />, <Aperture />, <MonitorPlay />][i]}</div><strong>{step}</strong><small>{['Thêm hình ảnh và thông tin cơ bản', 'Phát triển ý tưởng và lời thoại', 'Tùy chỉnh phong cách thể hiện', 'Kiểm tra thành phẩm trước khi tải xuống'][i]}</small></div>)}</div>
        </section>

        <section className="formats section-wrap" id="formats">
          <div className="section-heading"><div><span className="eyebrow">KHÔNG GIỚI HẠN NGÀNH HÀNG</span><h2>Một nền tảng, nhiều phong cách</h2></div><p>Lựa chọn hình thức phù hợp với mục tiêu truyền thông và đặc điểm sản phẩm.</p></div>
          <div className="format-grid">{formats.map((format, i) => <button key={format.name} className={selected === format.name ? 'format-card chosen' : 'format-card'} onClick={() => setSelected(format.name)}><div className="format-card-top"><span className="format-icon">{[<Clapperboard />, <MonitorPlay />, <Aperture />, <Play />, <LayoutTemplate />, <Film />][i]}</span><span className="format-tag">{format.tag}</span></div><strong>{format.name}</strong><small>{format.detail}</small><span className="format-select">{selected === format.name ? 'Đang chọn' : 'Chọn phong cách'} <ArrowRight size={14} /></span></button>)}</div>
        </section>

        <section className="studio-callout section-wrap" id="studio">
          <div className="callout-icon"><WandSparkles size={25} /></div><div><span className="eyebrow">AI PRODUCT VIDEO STUDIO</span><h2>{active === 'Tạo video' ? 'Không gian tạo video' : 'Sẵn sàng kể câu chuyện sản phẩm?'}</h2><p>Chọn phong cách <b>{selected}</b> và bắt đầu xây dựng video sản phẩm của bạn.</p></div><button className="primary-btn" onClick={() => setNotice('Studio sẽ mở khi các chức năng tài khoản và xử lý video được hoàn thiện.')}>Khám phá Studio <ArrowRight size={17} /></button>
        </section>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Đóng thông báo"><X size={16} /></button></div>}
      </main>
      <AuthPanel open={authOpen} onClose={() => setAuthOpen(false)} />
      <footer className="footer"><a className="brand footer-brand" href="#"><span className="brand-mark"><Aperture size={19} /></span><span className="brand-copy"><strong>AI PRODUCT</strong><small>VIDEO STUDIO</small></span></a><span>Nền tảng sáng tạo video sản phẩm đa ngành hàng.</span><small>© {new Date().getFullYear()} AI Product Video Studio</small></footer>
    </div>
  );
}
