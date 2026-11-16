-- Align existing AI module metadata with the free-tier providers and free-only policy.
-- This migration only updates configuration rows; it does not alter or delete user data.

UPDATE ai_configs
SET provider='google-genai',
    model_name='gemini-3.8-flash',
    is_paid=0,
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

UPDATE ai_configs
SET display_name='Tạo video AI sinh chuyển động (đã tắt để tránh phí)',
    provider='fal.ai-hosted',
    model_name='minimax/h3-max/image-to-video',
    is_enabled=0,
    is_paid=1,
    fallback_mode='browser-renderer',
    last_status='DISABLED',
    last_error=NULL,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE module_key='wan_video';
