ALTER TABLE video_scenes ADD COLUMN product_id TEXT REFERENCES products(id) ON DELETE SET NULL;

UPDATE video_scenes
SET product_id = (
  SELECT product_id FROM video_projects WHERE video_projects.id = video_scenes.project_id
)
WHERE product_id IS NULL;

CREATE TABLE IF NOT EXISTS video_scene_reviews (
  scene_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED')),
  output_file_url TEXT NOT NULL,
  output_imagekit_file_id TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  format TEXT NOT NULL DEFAULT 'mp4',
  resolution TEXT NOT NULL DEFAULT '720p',
  scene_signature TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_video_scene_reviews_project
  ON video_scene_reviews(project_id, user_id, updated_at);
