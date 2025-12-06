-- Capsule: Storage Buckets
-- Uses prefixed bucket names to avoid conflicts

-- Create thumbnails bucket for Capsule (public access for viewing)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'capsule-thumbnails',
    'capsule-thumbnails',
    true,
    524288, -- 512KB max
    ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Create temp-uploads bucket for web uploads (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'capsule-temp-uploads',
    'capsule-temp-uploads',
    false,
    104857600, -- 100MB max
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime']
) ON CONFLICT (id) DO NOTHING;

-- Storage Policies for capsule-thumbnails bucket
CREATE POLICY "capsule_thumbnails_select"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'capsule-thumbnails');

CREATE POLICY "capsule_thumbnails_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'capsule-thumbnails'
        AND (storage.foldername(name))[1] IS NOT NULL
    );

CREATE POLICY "capsule_thumbnails_update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'capsule-thumbnails' AND owner_id::text = auth.uid()::text);

CREATE POLICY "capsule_thumbnails_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'capsule-thumbnails' AND owner_id::text = auth.uid()::text);

-- Storage Policies for capsule-temp-uploads bucket
CREATE POLICY "capsule_temp_uploads_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'capsule-temp-uploads');

CREATE POLICY "capsule_temp_uploads_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'capsule-temp-uploads' AND owner_id::text = auth.uid()::text);

CREATE POLICY "capsule_temp_uploads_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'capsule-temp-uploads' AND owner_id::text = auth.uid()::text);
