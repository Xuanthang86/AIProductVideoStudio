-- Enable serverless Gemini TTS and hosted MiniMax H3 Max video generation. Existing project/account data is preserved.
UPDATE ai_configs SET display_name='Gemini TTS tiếng Việt (không cần máy chủ)', provider='google-gemini', model_name='gemini-3.8-flash-lite-tts', is_paid=1,
 fallback_mode='browser-speech-or-silent', last_status='STANDBY', last_error=NULL,
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE module_key='kokoro_tts';
UPDATE ai_configs SET display_name='MiniMax H3 Max Video AI (fal.ai)', category='video-gen', provider='fal.ai-hosted',
 model_name='minimax/h3-max/image-to-video', is_enabled=1, is_paid=1,
 fallback_mode='canvas-motion', last_status='STANDBY', last_error=NULL,
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE module_key='wan_video';
ALTER TABLE video_scenes ADD COLUMN ai_video_url TEXT;
CREATE TABLE IF NOT EXISTS ai_video_jobs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
 scene_index INTEGER NOT NULL DEFAULT 0, provider_request_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'IN_QUEUE', video_url TEXT, imagekit_file_id TEXT,
 error_message TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_video_jobs_user ON ai_video_jobs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_video_jobs_project ON ai_video_jobs(project_id, created_at);
