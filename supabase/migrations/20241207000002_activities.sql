-- Capsule: Activities Table
-- Tracks all activity events for the activity feed feature

-- 1. Activities table
CREATE TABLE capsule.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES capsule.albums(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES capsule.profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'photos_added',
        'member_joined',
        'member_left',
        'photo_liked',
        'photo_unliked',
        'comment_added',
        'album_created',
        'album_updated'
    )),
    target_id UUID, -- photo_id, member_id, comment_id depending on event_type
    metadata JSONB DEFAULT '{}'::jsonb, -- { count: 3, photo_ids: [...], preview_url: "...", etc. }
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_activities_album_id ON capsule.activities(album_id);
CREATE INDEX idx_activities_actor_id ON capsule.activities(actor_id);
CREATE INDEX idx_activities_created_at ON capsule.activities(created_at DESC);
CREATE INDEX idx_activities_album_created ON capsule.activities(album_id, created_at DESC);

-- 2. RLS Policies
ALTER TABLE capsule.activities ENABLE ROW LEVEL SECURITY;

-- Users can view activities for albums they're members of
CREATE POLICY "Users can view activities for their albums"
ON capsule.activities FOR SELECT USING (
    album_id IN (
        SELECT album_id FROM capsule.album_members WHERE user_id = auth.uid()
    )
);

-- Users can insert activities (system will validate via triggers)
CREATE POLICY "Users can create activities for their albums"
ON capsule.activities FOR INSERT WITH CHECK (
    album_id IN (
        SELECT album_id FROM capsule.album_members WHERE user_id = auth.uid()
    )
);

-- 3. Trigger to log photo uploads as activities
CREATE OR REPLACE FUNCTION capsule.log_photo_upload_activity()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO capsule.activities (album_id, actor_id, event_type, target_id, metadata)
    VALUES (
        NEW.album_id,
        NEW.uploader_id,
        'photos_added',
        NEW.id,
        jsonb_build_object(
            'count', 1,
            'photo_ids', jsonb_build_array(NEW.id),
            'thumbnail_path', NEW.thumbnail_path
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_photo_uploaded
    AFTER INSERT ON capsule.photos
    FOR EACH ROW EXECUTE FUNCTION capsule.log_photo_upload_activity();

-- 4. Trigger to log member joins as activities
CREATE OR REPLACE FUNCTION capsule.log_member_joined_activity()
RETURNS TRIGGER AS $$
DECLARE
    member_name TEXT;
BEGIN
    -- Get the display name of the new member
    SELECT display_name INTO member_name
    FROM capsule.profiles
    WHERE id = NEW.user_id;

    INSERT INTO capsule.activities (album_id, actor_id, event_type, target_id, metadata)
    VALUES (
        NEW.album_id,
        NEW.user_id,
        'member_joined',
        NEW.user_id,
        jsonb_build_object(
            'member_name', COALESCE(member_name, 'Someone'),
            'role', NEW.role
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_member_joined
    AFTER INSERT ON capsule.album_members
    FOR EACH ROW
    WHEN (NEW.role != 'owner') -- Don't log owner creation
    EXECUTE FUNCTION capsule.log_member_joined_activity();

-- 5. Trigger to log likes as activities
CREATE OR REPLACE FUNCTION capsule.log_like_activity()
RETURNS TRIGGER AS $$
DECLARE
    photo_album_id UUID;
    photo_thumbnail TEXT;
BEGIN
    -- Get the album_id and thumbnail from the photo
    SELECT album_id, thumbnail_path INTO photo_album_id, photo_thumbnail
    FROM capsule.photos
    WHERE id = NEW.photo_id;

    INSERT INTO capsule.activities (album_id, actor_id, event_type, target_id, metadata)
    VALUES (
        photo_album_id,
        NEW.user_id,
        'photo_liked',
        NEW.photo_id,
        jsonb_build_object(
            'thumbnail_path', photo_thumbnail
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_photo_liked
    AFTER INSERT ON capsule.likes
    FOR EACH ROW EXECUTE FUNCTION capsule.log_like_activity();

-- 6. Trigger to log comments as activities
CREATE OR REPLACE FUNCTION capsule.log_comment_activity()
RETURNS TRIGGER AS $$
DECLARE
    photo_album_id UUID;
    photo_thumbnail TEXT;
BEGIN
    -- Get the album_id and thumbnail from the photo
    SELECT album_id, thumbnail_path INTO photo_album_id, photo_thumbnail
    FROM capsule.photos
    WHERE id = NEW.photo_id;

    INSERT INTO capsule.activities (album_id, actor_id, event_type, target_id, metadata)
    VALUES (
        photo_album_id,
        NEW.user_id,
        'comment_added',
        NEW.id,
        jsonb_build_object(
            'photo_id', NEW.photo_id,
            'comment_preview', LEFT(NEW.content, 100),
            'thumbnail_path', photo_thumbnail
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_comment_added
    AFTER INSERT ON capsule.comments
    FOR EACH ROW EXECUTE FUNCTION capsule.log_comment_activity();

-- 7. View for aggregated activity feed (optional - can be used for optimization)
-- This groups similar activities within a short time window
CREATE OR REPLACE VIEW capsule.activity_feed AS
SELECT
    a.id,
    a.album_id,
    a.actor_id,
    a.event_type,
    a.target_id,
    a.metadata,
    a.created_at,
    p.display_name AS actor_name,
    p.avatar_url AS actor_avatar,
    al.title AS album_title
FROM capsule.activities a
JOIN capsule.profiles p ON a.actor_id = p.id
JOIN capsule.albums al ON a.album_id = al.id
ORDER BY a.created_at DESC;
