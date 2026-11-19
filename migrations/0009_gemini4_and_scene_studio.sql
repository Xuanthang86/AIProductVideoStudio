-- Upgrade default Gemini models to active Free Tier model aliases and add scene 2.5D stage configuration.
-- Preserves all existing user accounts, products, projects, and scenes.

ALTER TABLE video_scenes ADD COLUMN stage_config_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE video_scenes ADD COLUMN scene_role TEXT NOT NULL DEFAULT 'showcase';

UPDATE ai_configs
SET provider='google-genai',
    model_name='gemini-4-hydrogen',
    is_paid=0,
    is_enabled=1,
    fallback_mode='structured-free',
    last_status='STANDBY',
    last_error=NULL,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE module_key IN ('gemini_analysis','gemini_script');

UPDATE ai_configs
SET display_name='Gemini Flash-Lite TTS tiếng Việt (Free Tier)',
    provider='google-gemini',
    model_name='gemini-3.8-flash-lite-tts',
    is_paid=0,
    is_enabled=1,
    fallback_mode='browser-speech-or-silent',
    last_status='STANDBY',
    last_error=NULL,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE module_key='kokoro_tts';
