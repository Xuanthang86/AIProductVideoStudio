PRAGMA foreign_keys = ON;

-- Safe additive columns on existing users table (non-destructive)
ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN purpose TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON users(username) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_quotas (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_video_limit INTEGER NOT NULL DEFAULT 5,
  monthly_video_limit INTEGER NOT NULL DEFAULT 60,
  max_duration_sec INTEGER NOT NULL DEFAULT 60,
  max_images_per_product INTEGER NOT NULL DEFAULT 10,
  can_use_ai_video INTEGER NOT NULL DEFAULT 0,
  can_use_voice INTEGER NOT NULL DEFAULT 1,
  can_use_advanced_models INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  blocked_until TEXT
);

CREATE TABLE IF NOT EXISTS industries (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  video_type TEXT NOT NULL,
  industry TEXT NOT NULL,
  description TEXT NOT NULL,
  style_notes TEXT NOT NULL DEFAULT '',
  preview_accent TEXT NOT NULL DEFAULT '#2864d9',
  suggested_duration INTEGER NOT NULL DEFAULT 30,
  supported_ratios_json TEXT NOT NULL DEFAULT '["9:16","16:9","1:1","4:5"]',
  default_scenes_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_templates_active ON templates(is_active, sort_order);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  highlights_json TEXT NOT NULL DEFAULT '[]',
  extra_info TEXT NOT NULL DEFAULT '',
  ai_analysis_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id, updated_at);

CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  storage_provider TEXT NOT NULL DEFAULT 'd1-inline',
  image_url TEXT NOT NULL,
  imagekit_file_id TEXT,
  data_base64 TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_ai_generated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id, sort_order);

CREATE TABLE IF NOT EXISTS video_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  video_type TEXT NOT NULL,
  industry TEXT NOT NULL,
  target_audience TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL DEFAULT 'Hiện đại, chuyên nghiệp',
  duration_sec INTEGER NOT NULL DEFAULT 30,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  language TEXT NOT NULL DEFAULT 'vi',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED')),
  script_variants_json TEXT,
  voice_config_json TEXT NOT NULL DEFAULT '{}',
  music_config_json TEXT NOT NULL DEFAULT '{}',
  brand_logo_url TEXT NOT NULL DEFAULT '',
  cta_text TEXT NOT NULL DEFAULT '',
  output_format TEXT,
  output_resolution TEXT,
  output_size_bytes INTEGER,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON video_projects(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_projects_status ON video_projects(status, created_at);

CREATE TABLE IF NOT EXISTS video_scenes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  duration_sec REAL NOT NULL DEFAULT 5,
  narration TEXT NOT NULL DEFAULT '',
  on_screen_text TEXT NOT NULL DEFAULT '',
  image_id TEXT REFERENCES product_images(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'REAL_PRODUCT' CHECK (source_type IN ('REAL_PRODUCT','AI_GENERATED','AI_VIDEO','USER_VIDEO')),
  motion_type TEXT NOT NULL DEFAULT 'zoom-in',
  transition_type TEXT NOT NULL DEFAULT 'fade',
  lighting_effect TEXT NOT NULL DEFAULT 'studio-glow',
  visual_prompt TEXT NOT NULL DEFAULT '',
  music_mood TEXT NOT NULL DEFAULT 'upbeat',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_scenes_project ON video_scenes(project_id, sort_order);

CREATE TABLE IF NOT EXISTS ai_configs (
  module_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  is_paid INTEGER NOT NULL DEFAULT 0,
  fallback_mode TEXT NOT NULL DEFAULT 'structured-free',
  daily_limit INTEGER NOT NULL DEFAULT 500,
  monthly_limit INTEGER NOT NULL DEFAULT 10000,
  config_json TEXT NOT NULL DEFAULT '{}',
  last_status TEXT NOT NULL DEFAULT 'STANDBY',
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  module_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_name TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_module ON ai_usage_logs(module_key, created_at);

CREATE TABLE IF NOT EXISTS video_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED')),
  progress INTEGER NOT NULL DEFAULT 0,
  resolution TEXT NOT NULL DEFAULT '720p',
  format TEXT NOT NULL DEFAULT 'mp4',
  file_size_bytes INTEGER,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_video_jobs_project ON video_jobs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_video_jobs_user ON video_jobs(user_id, created_at);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Seed multi-industry catalog (13 industries)
INSERT OR IGNORE INTO industries(id, slug, name, description, sort_order) VALUES
  ('ind-fashion', 'thoi-trang', 'Thời trang', 'Quần áo, trang phục thiết kế, phụ kiện mặc', 1),
  ('ind-shoes-bags', 'giay-dep-tui-xach', 'Giày dép, túi xách', 'Giày thể thao, giày da, balo, túi xách', 2),
  ('ind-cosmetics', 'my-pham', 'Mỹ phẩm', 'Chăm sóc da, trang điểm, nước hoa', 3),
  ('ind-electronics', 'dien-tu', 'Điện tử', 'Thiết bị công nghệ, âm thanh, phụ kiện số', 4),
  ('ind-home', 'do-gia-dung', 'Đồ gia dụng', 'Thiết bị nhà bếp, chăm sóc nhà cửa', 5),
  ('ind-furniture', 'noi-that', 'Nội thất', 'Bàn ghế, đèn trang trí, đồ gỗ nội thất', 6),
  ('ind-food', 'thuc-pham-do-uong', 'Thực phẩm, đồ uống', 'Đồ ăn đóng gói, cà phê, trà, nước giải khát', 7),
  ('ind-toys', 'do-choi', 'Đồ chơi', 'Đồ chơi giáo dục, mô hình, giải trí', 8),
  ('ind-jewelry', 'trang-suc-dong-ho', 'Trang sức, đồng hồ', 'Nhẫn, dây chuyền, đồng hồ đeo tay', 9),
  ('ind-gifts', 'hoa-tuoi-qua-tang', 'Hoa tươi, quà tặng', 'Bó hoa, hộp quà, quà lưu niệm', 10),
  ('ind-industrial', 'thiet-bi-cong-nghiep', 'Thiết bị công nghiệp', 'Máy móc, dụng cụ kỹ thuật, linh kiện', 11),
  ('ind-realestate', 'bat-dong-san', 'Bất động sản', 'Căn hộ, nhà phố, dự án nghỉ dưỡng', 12),
  ('ind-travel', 'du-lich-dich-vu', 'Du lịch và dịch vụ', 'Tour du lịch, khách sạn, dịch vụ trải nghiệm', 13);

-- Seed 12 core video format templates
INSERT OR IGNORE INTO templates(id, slug, name, video_type, industry, description, style_notes, preview_accent, suggested_duration, supported_ratios_json, sort_order) VALUES
  ('tpl-ad', 'video-quang-cao', 'Video quảng cáo', 'Advertisement', 'Mỹ phẩm', 'Nhịp nhanh, nhấn mạnh lợi ích cốt lõi và lời kêu gọi hành động rõ ràng.', 'Mở đầu ấn tượng trong 3 giây đầu, ánh sáng studio nổi bật.', '#2864d9', 30, '["9:16","16:9","1:1","4:5"]', 1),
  ('tpl-review', 'review-san-pham', 'Review sản phẩm', 'Product Review', 'Điện tử', 'Trình bày điểm nổi bật và trải nghiệm khách quan từ hình ảnh sản phẩm.', 'Chữ rõ ràng, phân tách thông tin xác nhận và gợi ý.', '#1d6f8a', 45, '["9:16","16:9","1:1"]', 2),
  ('tpl-showcase', 'product-showcase', 'Product Showcase', 'Product Showcase', 'Trang sức, đồng hồ', 'Tập trung đường nét, chất liệu và chi tiết sản phẩm qua zoom/parallax.', 'Tối giản, chuyển cảnh mượt, ánh sáng sang trọng.', '#334e85', 30, '["9:16","16:9","1:1","4:5"]', 3),
  ('tpl-tiktok', 'tiktok-viral', 'TikTok Viral', 'TikTok Viral', 'Thời trang', 'Video dọc ngắn, nhịp chuyển cảnh nhanh, phụ đề lớn dễ đọc trên di động.', 'Tối ưu 9:16, hook mạnh ở giây 0-2.', '#2563eb', 15, '["9:16","4:5"]', 4),
  ('tpl-unboxing', 'unboxing', 'Unboxing', 'Unboxing', 'Giày dép, túi xách', 'Giới thiệu cảm giác mở hộp và chi tiết sản phẩm theo từng lớp hình ảnh.', 'Lưu ý ghi chú rõ nếu có cảnh minh họa.', '#2a6f68', 30, '["9:16","1:1","4:5"]', 5),
  ('tpl-lifestyle', 'lifestyle', 'Lifestyle', 'Lifestyle', 'Nội thất', 'Đặt sản phẩm vào không gian sống ấm áp, gần gũi với nhu cầu hàng ngày.', 'Ánh sáng tự nhiên, nhịp chậm thư thái.', '#3b6cb7', 30, '["9:16","16:9","4:5"]', 6),
  ('tpl-comparison', 'comparison', 'Comparison', 'Comparison', 'Đồ gia dụng', 'So sánh trực quan tính năng hoặc thông số do người dùng cung cấp.', 'Bố cục rõ ràng, dễ theo dõi từng tiêu chí.', '#1f5a99', 45, '["16:9","9:16","1:1"]', 7),
  ('tpl-howto', 'how-to', 'How-to / Hướng dẫn', 'How-to', 'Thiết bị công nghiệp', 'Giải thích cách sử dụng và bảo quản theo từng bước trực quan.', 'Đánh số bước rõ ràng trên màn hình.', '#264d73', 60, '["16:9","9:16","1:1"]', 8),
  ('tpl-before-after', 'before-after', 'Before & After', 'Before & After', 'Mỹ phẩm', 'Trình bày tình trạng trước và sau dựa trên dữ liệu thực tế người dùng cung cấp.', 'Luôn hiển thị nhãn minh bạch nguồn ảnh.', '#2d68c4', 30, '["9:16","1:1","4:5"]', 9),
  ('tpl-storytelling', 'storytelling', 'Storytelling', 'Storytelling', 'Hoa tươi, quà tặng', 'Kể câu chuyện cảm xúc gắn với giá trị món quà hoặc thương hiệu.', 'Nhịp êm dịu, dẫn dắt theo mạch truyện.', '#4169e1', 60, '["9:16","16:9","4:5"]', 10),
  ('tpl-luxury', 'luxury-commercial', 'Luxury Commercial', 'Luxury Commercial', 'Bất động sản', 'Tôn vinh sự đẳng cấp với chuyển động chậm và hiệu ứng ánh sáng vàng ấm.', 'Phông chữ tinh tế, khoảng trống rộng.', '#1a2d4f', 45, '["16:9","9:16","1:1"]', 11),
  ('tpl-educational', 'educational', 'Educational', 'Educational', 'Thực phẩm, đồ uống', 'Chia sẻ kiến thức dinh dưỡng, nguồn gốc nguyên liệu và mẹo sử dụng.', 'Thông tin cô đọng, dễ ghi nhớ.', '#297a6b', 60, '["9:16","16:9","1:1"]', 12);

-- Seed AI module registry (free-first, optional/toggleable)
INSERT OR IGNORE INTO ai_configs(module_key, display_name, category, provider, model_name, is_enabled, is_paid, fallback_mode, daily_limit, monthly_limit, last_status) VALUES
  ('gemini_analysis', 'Gemini Phân tích sản phẩm', 'vision-text', 'google-genai', 'gemini-4-hydrogen', 1, 0, 'structured-free', 300, 6000, 'STANDBY'),
  ('gemini_script', 'Gemini Viết kịch bản', 'text', 'google-genai', 'gemini-4-hydrogen', 1, 0, 'structured-free', 300, 6000, 'STANDBY'),
  ('kokoro_tts', 'Kokoro Vietnamese TTS', 'voice', 'kokoro-selfhosted', 'kokoro-vi-v1', 1, 0, 'browser-speech-or-silent', 200, 4000, 'STANDBY'),
  ('comfyui_image', 'ComfyUI Tạo ảnh minh họa', 'image', 'comfyui-open-source', 'sdxl-base-open', 0, 0, 'product-images-only', 100, 1500, 'DISABLED'),
  ('wan_video', 'Wan 2.2 / LTX-Video', 'video-gen', 'open-source-gpu', 'wan-2.2-free', 0, 0, 'canvas-motion', 30, 300, 'DISABLED'),
  ('browser_renderer', 'Trình dựng MP4 trên trình duyệt', 'render', 'webcodecs-mp4-muxer', 'h264-aac-canvas', 1, 0, 'mediarecorder-webm', 1000, 20000, 'READY');

INSERT OR IGNORE INTO system_settings(key, value_json) VALUES
  ('site_config', '{"siteName":"AI Product Video Studio","domain":"aivideo.xuanthang.io.vn","requireAdminApproval":true,"defaultDailyVideoLimit":5,"defaultMonthlyVideoLimit":60,"maxImagesPerProduct":10,"maxImageSizeMb":5}');
