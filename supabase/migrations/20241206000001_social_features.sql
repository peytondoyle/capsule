-- Capsule: Social Features (Favorites, Likes, Comments)

-- Private Favorites (only visible to the user who favorited)
CREATE TABLE capsule.favorites (
    user_id UUID NOT NULL REFERENCES capsule.profiles(id) ON DELETE CASCADE,
    photo_id UUID NOT NULL REFERENCES capsule.photos(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, photo_id)
);

-- Public Likes (visible to all album members)
CREATE TABLE capsule.likes (
    user_id UUID NOT NULL REFERENCES capsule.profiles(id) ON DELETE CASCADE,
    photo_id UUID NOT NULL REFERENCES capsule.photos(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, photo_id)
);

-- Public Comments (visible to all album members)
CREATE TABLE capsule.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id UUID NOT NULL REFERENCES capsule.photos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES capsule.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_favorites_user ON capsule.favorites(user_id);
CREATE INDEX idx_favorites_photo ON capsule.favorites(photo_id);
CREATE INDEX idx_likes_photo ON capsule.likes(photo_id);
CREATE INDEX idx_comments_photo ON capsule.comments(photo_id);
CREATE INDEX idx_comments_created ON capsule.comments(photo_id, created_at);

-- Updated_at trigger for comments
CREATE TRIGGER comments_updated_at
    BEFORE UPDATE ON capsule.comments
    FOR EACH ROW EXECUTE FUNCTION capsule.update_updated_at_column();

-- Enable RLS
ALTER TABLE capsule.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE capsule.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE capsule.comments ENABLE ROW LEVEL SECURITY;

-- Favorites: Only user can see/manage their own
CREATE POLICY "Users can manage own favorites"
    ON capsule.favorites FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Likes: Album members can see all, users can manage own
CREATE POLICY "Album members can view likes"
    ON capsule.likes FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM capsule.photos p
        JOIN capsule.album_members am ON am.album_id = p.album_id
        WHERE p.id = photo_id AND am.user_id = auth.uid()
    ));

CREATE POLICY "Users can manage own likes"
    ON capsule.likes FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own likes"
    ON capsule.likes FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- Comments: Album members can see all, users can manage own
CREATE POLICY "Album members can view comments"
    ON capsule.comments FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM capsule.photos p
        JOIN capsule.album_members am ON am.album_id = p.album_id
        WHERE p.id = photo_id AND am.user_id = auth.uid()
    ));

CREATE POLICY "Users can create comments"
    ON capsule.comments FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own comments"
    ON capsule.comments FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete own comments"
    ON capsule.comments FOR DELETE TO authenticated
    USING (user_id = auth.uid());
