PRAGMA foreign_keys = ON;

-- Independent, editable video-topic catalog. Existing templates/projects are preserved.
CREATE TABLE IF NOT EXISTS video_topics (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO video_topics(id, slug, name, sort_order) VALUES
  ('topic-advertisement', 'advertisement', 'Advertisement', 1),
  ('topic-product-review', 'product-review', 'Product Review', 2),
  ('topic-product-showcase', 'product-showcase', 'Product Showcase', 3),
  ('topic-tiktok-viral', 'tiktok-viral', 'TikTok Viral', 4),
  ('topic-unboxing', 'unboxing', 'Unboxing', 5),
  ('topic-lifestyle', 'lifestyle', 'Lifestyle', 6),
  ('topic-comparison', 'comparison', 'Comparison', 7),
  ('topic-how-to', 'how-to', 'How-to', 8),
  ('topic-before-after', 'before-after', 'Before & After', 9),
  ('topic-storytelling', 'storytelling', 'Storytelling', 10),
  ('topic-luxury-commercial', 'luxury-commercial', 'Luxury Commercial', 11),
  ('topic-educational', 'educational', 'Educational', 12);

CREATE INDEX IF NOT EXISTS idx_video_topics_active ON video_topics(is_active, sort_order);
