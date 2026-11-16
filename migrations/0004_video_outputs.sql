-- Add persistent ImageKit output references without touching existing project or job records.
ALTER TABLE video_projects ADD COLUMN output_file_url TEXT;
ALTER TABLE video_projects ADD COLUMN output_imagekit_file_id TEXT;
ALTER TABLE video_jobs ADD COLUMN output_file_url TEXT;
ALTER TABLE video_jobs ADD COLUMN output_imagekit_file_id TEXT;
