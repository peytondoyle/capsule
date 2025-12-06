-- Capsule: Initial Schema
-- Photo sharing with decentralized storage
-- Uses dedicated 'capsule' schema to avoid conflicts with other apps

-- Create capsule schema
CREATE SCHEMA IF NOT EXISTS capsule;

-- 1. Profiles (extends Supabase auth.users)
CREATE TABLE capsule.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Albums
CREATE TABLE capsule.albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES capsule.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    cover_photo_id UUID, -- FK added after photos table
    privacy_mode TEXT NOT NULL DEFAULT 'invite_only'
        CHECK (privacy_mode IN ('invite_only', 'link_accessible', 'public_unlisted')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Album Members
CREATE TABLE capsule.album_members (
    album_id UUID NOT NULL REFERENCES capsule.albums(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES capsule.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'contributor'
        CHECK (role IN ('owner', 'co_manager', 'contributor', 'viewer')),
    notification_preference TEXT DEFAULT 'full'
        CHECK (notification_preference IN ('full', 'digest', 'none')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (album_id, user_id)
);

-- 4. Photos
CREATE TABLE capsule.photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES capsule.albums(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES capsule.profiles(id) ON DELETE CASCADE,
    original_uri TEXT NOT NULL,
    original_storage_type TEXT NOT NULL
        CHECK (original_storage_type IN ('icloud_drive', 'temp_bucket')),
    thumbnail_path TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'photo'
        CHECK (media_type IN ('photo', 'video')),
    file_size_bytes BIGINT,
    width INTEGER,
    height INTEGER,
    is_hidden_by_owner BOOLEAN DEFAULT FALSE,
    is_missing BOOLEAN DEFAULT FALSE,
    exif_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add cover_photo FK after photos table exists
ALTER TABLE capsule.albums
    ADD CONSTRAINT albums_cover_photo_fkey
    FOREIGN KEY (cover_photo_id) REFERENCES capsule.photos(id) ON DELETE SET NULL;

-- 5. Personal Metadata (per-user organization overlay)
CREATE TABLE capsule.personal_metadata (
    user_id UUID NOT NULL REFERENCES capsule.profiles(id) ON DELETE CASCADE,
    album_id UUID NOT NULL REFERENCES capsule.albums(id) ON DELETE CASCADE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, album_id)
);

-- 6. Subsets (internal, shareable, personal)
CREATE TABLE capsule.subsets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES capsule.albums(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES capsule.profiles(id) ON DELETE CASCADE,
    subset_type TEXT NOT NULL
        CHECK (subset_type IN ('internal', 'shareable', 'personal')),
    name TEXT NOT NULL,
    photo_ids UUID[] NOT NULL DEFAULT '{}',
    share_token TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Album Invites
CREATE TABLE capsule.album_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES capsule.albums(id) ON DELETE CASCADE,
    invite_token TEXT UNIQUE NOT NULL,
    default_role TEXT NOT NULL DEFAULT 'contributor'
        CHECK (default_role IN ('contributor', 'viewer')),
    requires_approval BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES capsule.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Join Requests
CREATE TABLE capsule.join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES capsule.albums(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES capsule.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES capsule.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    UNIQUE (album_id, user_id)
);

-- 9. Notifications
CREATE TABLE capsule.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES capsule.profiles(id) ON DELETE CASCADE,
    album_id UUID REFERENCES capsule.albums(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL
        CHECK (notification_type IN (
            'photo_uploaded', 'member_joined', 'join_request',
            'album_modified', 'subset_created', 'photo_hidden'
        )),
    payload JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_capsule_photos_album_id ON capsule.photos(album_id);
CREATE INDEX idx_capsule_photos_uploader_id ON capsule.photos(uploader_id);
CREATE INDEX idx_capsule_photos_created_at ON capsule.photos(created_at DESC);
CREATE INDEX idx_capsule_album_members_user_id ON capsule.album_members(user_id);
CREATE INDEX idx_capsule_notifications_user_id ON capsule.notifications(user_id);
CREATE INDEX idx_capsule_notifications_unread ON capsule.notifications(user_id) WHERE is_read = FALSE;
CREATE INDEX idx_capsule_join_requests_pending ON capsule.join_requests(album_id) WHERE status = 'pending';
CREATE INDEX idx_capsule_album_invites_token ON capsule.album_invites(invite_token);
CREATE INDEX idx_capsule_subsets_share_token ON capsule.subsets(share_token) WHERE share_token IS NOT NULL;

-- Updated_at trigger function (in capsule schema)
CREATE OR REPLACE FUNCTION capsule.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON capsule.profiles
    FOR EACH ROW EXECUTE FUNCTION capsule.update_updated_at_column();

CREATE TRIGGER albums_updated_at
    BEFORE UPDATE ON capsule.albums
    FOR EACH ROW EXECUTE FUNCTION capsule.update_updated_at_column();

CREATE TRIGGER personal_metadata_updated_at
    BEFORE UPDATE ON capsule.personal_metadata
    FOR EACH ROW EXECUTE FUNCTION capsule.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION capsule.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO capsule.profiles (id, display_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: This trigger needs to be on auth.users - handled separately
-- as it may conflict with other apps in this project

-- Auto-add owner as album member on album creation
CREATE OR REPLACE FUNCTION capsule.handle_album_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO capsule.album_members (album_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_album_created
    AFTER INSERT ON capsule.albums
    FOR EACH ROW EXECUTE FUNCTION capsule.handle_album_created();
