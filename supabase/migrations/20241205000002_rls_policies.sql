-- Capsule: Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE capsule.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE capsule.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE capsule.album_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE capsule.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE capsule.personal_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE capsule.subsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE capsule.album_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE capsule.join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE capsule.notifications ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user is album member with specific roles
CREATE OR REPLACE FUNCTION capsule.is_album_member(p_album_id UUID, p_user_id UUID, p_roles TEXT[] DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_roles IS NULL THEN
        RETURN EXISTS (
            SELECT 1 FROM capsule.album_members
            WHERE album_id = p_album_id AND user_id = p_user_id
        );
    ELSE
        RETURN EXISTS (
            SELECT 1 FROM capsule.album_members
            WHERE album_id = p_album_id AND user_id = p_user_id AND role = ANY(p_roles)
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Get user's role in album
CREATE OR REPLACE FUNCTION capsule.get_album_role(p_album_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
    SELECT role FROM capsule.album_members WHERE album_id = p_album_id AND user_id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- =====================
-- PROFILES POLICIES
-- =====================

CREATE POLICY "capsule_profiles_select"
    ON capsule.profiles FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "capsule_profiles_insert"
    ON capsule.profiles FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

CREATE POLICY "capsule_profiles_update"
    ON capsule.profiles FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- =====================
-- ALBUMS POLICIES
-- =====================

CREATE POLICY "capsule_albums_select"
    ON capsule.albums FOR SELECT TO authenticated
    USING (
        owner_id = auth.uid() OR
        capsule.is_album_member(id, auth.uid()) OR
        privacy_mode IN ('link_accessible', 'public_unlisted')
    );

CREATE POLICY "capsule_albums_insert"
    ON capsule.albums FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "capsule_albums_update"
    ON capsule.albums FOR UPDATE TO authenticated
    USING (capsule.is_album_member(id, auth.uid(), ARRAY['owner', 'co_manager']))
    WITH CHECK (capsule.is_album_member(id, auth.uid(), ARRAY['owner', 'co_manager']));

CREATE POLICY "capsule_albums_delete"
    ON capsule.albums FOR DELETE TO authenticated
    USING (owner_id = auth.uid());

-- =====================
-- ALBUM MEMBERS POLICIES
-- =====================

CREATE POLICY "capsule_album_members_select"
    ON capsule.album_members FOR SELECT TO authenticated
    USING (capsule.is_album_member(album_id, auth.uid()));

CREATE POLICY "capsule_album_members_insert"
    ON capsule.album_members FOR INSERT TO authenticated
    WITH CHECK (
        capsule.is_album_member(album_id, auth.uid(), ARRAY['owner', 'co_manager'])
        AND role != 'owner'
    );

CREATE POLICY "capsule_album_members_update"
    ON capsule.album_members FOR UPDATE TO authenticated
    USING (
        capsule.is_album_member(album_id, auth.uid(), ARRAY['owner', 'co_manager'])
        AND (
            (capsule.get_album_role(album_id, auth.uid()) = 'owner' AND user_id != auth.uid())
            OR
            (capsule.get_album_role(album_id, auth.uid()) = 'co_manager'
             AND capsule.get_album_role(album_id, user_id) NOT IN ('owner', 'co_manager'))
        )
    );

CREATE POLICY "capsule_album_members_delete"
    ON capsule.album_members FOR DELETE TO authenticated
    USING (
        user_id = auth.uid()
        OR (
            capsule.is_album_member(album_id, auth.uid(), ARRAY['owner', 'co_manager'])
            AND capsule.get_album_role(album_id, user_id) NOT IN ('owner')
        )
    );

-- =====================
-- PHOTOS POLICIES
-- =====================

CREATE POLICY "capsule_photos_select"
    ON capsule.photos FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM capsule.album_members am
            WHERE am.album_id = photos.album_id
            AND am.user_id = auth.uid()
            AND (
                NOT photos.is_hidden_by_owner
                OR am.role IN ('owner', 'co_manager')
            )
        )
    );

CREATE POLICY "capsule_photos_insert"
    ON capsule.photos FOR INSERT TO authenticated
    WITH CHECK (
        capsule.is_album_member(album_id, auth.uid(), ARRAY['owner', 'co_manager', 'contributor'])
        AND uploader_id = auth.uid()
    );

CREATE POLICY "capsule_photos_update"
    ON capsule.photos FOR UPDATE TO authenticated
    USING (
        uploader_id = auth.uid()
        OR capsule.is_album_member(album_id, auth.uid(), ARRAY['owner'])
    );

CREATE POLICY "capsule_photos_delete"
    ON capsule.photos FOR DELETE TO authenticated
    USING (uploader_id = auth.uid());

-- =====================
-- PERSONAL METADATA POLICIES
-- =====================

CREATE POLICY "capsule_personal_metadata_select"
    ON capsule.personal_metadata FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "capsule_personal_metadata_insert"
    ON capsule.personal_metadata FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND capsule.is_album_member(album_id, auth.uid())
    );

CREATE POLICY "capsule_personal_metadata_update"
    ON capsule.personal_metadata FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "capsule_personal_metadata_delete"
    ON capsule.personal_metadata FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- =====================
-- SUBSETS POLICIES
-- =====================

CREATE POLICY "capsule_subsets_select"
    ON capsule.subsets FOR SELECT TO authenticated
    USING (
        capsule.is_album_member(album_id, auth.uid())
        AND (
            subset_type != 'personal'
            OR owner_id = auth.uid()
        )
    );

CREATE POLICY "capsule_subsets_insert"
    ON capsule.subsets FOR INSERT TO authenticated
    WITH CHECK (
        (subset_type IN ('internal', 'shareable')
         AND capsule.is_album_member(album_id, auth.uid(), ARRAY['owner', 'co_manager']))
        OR
        (subset_type = 'personal'
         AND owner_id = auth.uid()
         AND capsule.is_album_member(album_id, auth.uid()))
    );

CREATE POLICY "capsule_subsets_update"
    ON capsule.subsets FOR UPDATE TO authenticated
    USING (
        (subset_type IN ('internal', 'shareable')
         AND capsule.is_album_member(album_id, auth.uid(), ARRAY['owner', 'co_manager']))
        OR
        (subset_type = 'personal' AND owner_id = auth.uid())
    );

CREATE POLICY "capsule_subsets_delete"
    ON capsule.subsets FOR DELETE TO authenticated
    USING (
        capsule.is_album_member(album_id, auth.uid(), ARRAY['owner'])
        OR (subset_type = 'personal' AND owner_id = auth.uid())
    );

-- =====================
-- ALBUM INVITES POLICIES
-- =====================

CREATE POLICY "capsule_album_invites_select"
    ON capsule.album_invites FOR SELECT TO authenticated
    USING (capsule.is_album_member(album_id, auth.uid()));

CREATE POLICY "capsule_album_invites_insert"
    ON capsule.album_invites FOR INSERT TO authenticated
    WITH CHECK (
        capsule.is_album_member(album_id, auth.uid(), ARRAY['owner', 'co_manager'])
        AND created_by = auth.uid()
    );

CREATE POLICY "capsule_album_invites_delete"
    ON capsule.album_invites FOR DELETE TO authenticated
    USING (capsule.is_album_member(album_id, auth.uid(), ARRAY['owner', 'co_manager']));

-- =====================
-- JOIN REQUESTS POLICIES
-- =====================

CREATE POLICY "capsule_join_requests_select"
    ON capsule.join_requests FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR capsule.is_album_member(album_id, auth.uid(), ARRAY['owner', 'co_manager'])
    );

CREATE POLICY "capsule_join_requests_insert"
    ON capsule.join_requests FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "capsule_join_requests_update"
    ON capsule.join_requests FOR UPDATE TO authenticated
    USING (capsule.is_album_member(album_id, auth.uid(), ARRAY['owner', 'co_manager']))
    WITH CHECK (capsule.is_album_member(album_id, auth.uid(), ARRAY['owner', 'co_manager']));

-- =====================
-- NOTIFICATIONS POLICIES
-- =====================

CREATE POLICY "capsule_notifications_select"
    ON capsule.notifications FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "capsule_notifications_insert"
    ON capsule.notifications FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "capsule_notifications_update"
    ON capsule.notifications FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "capsule_notifications_delete"
    ON capsule.notifications FOR DELETE TO authenticated
    USING (user_id = auth.uid());
