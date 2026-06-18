# Shared Album 2.0 - Implementation Plan

## Project Overview

A cross-platform photo-sharing system that stores metadata centrally but keeps original media in each user's personal cloud storage (iCloud Drive for v1). iOS/iPadOS/macOS are primary platforms with full features; web provides minimal viewer/upload capability.

## Architecture Decision

**Monorepo Structure** following the `plants-de-louton-monorepo` pattern:
```
shared-album/
├── apps/
│   ├── ios/                    # SwiftUI iOS/iPadOS/macOS app
│   └── web/                    # Next.js web client
├── supabase/
│   ├── migrations/             # Database migrations
│   ├── functions/              # Edge functions
│   └── config.toml
├── docs/
│   └── PRD.md
└── package.json                # Workspace scripts
```

**Why monorepo?**
- Shared database schema across platforms
- Single source of truth for migrations
- Coordinated deployments
- Your existing pattern from plants-de-louton

---

## Phase 1: Foundation & Database Schema

### 1.1 Project Setup
- [ ] Create monorepo structure
- [ ] Initialize Supabase project
- [ ] Set up iOS project with SPM (Swift Package Manager) following wishlist-ios pattern
- [ ] Set up Next.js web app with your standard stack (Tailwind, Radix UI, Zustand)

### 1.2 Database Schema (Supabase Migrations)

**Tables to create:**

```sql
-- 1. Users (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Albums
CREATE TABLE public.albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    cover_photo_id UUID, -- FK added after photos table
    privacy_mode TEXT NOT NULL DEFAULT 'invite_only'
        CHECK (privacy_mode IN ('invite_only', 'link_accessible', 'public_unlisted')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Album Members
CREATE TABLE public.album_members (
    album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'contributor'
        CHECK (role IN ('owner', 'co_manager', 'contributor', 'viewer')),
    notification_preference TEXT DEFAULT 'full'
        CHECK (notification_preference IN ('full', 'digest', 'none')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (album_id, user_id)
);

-- 4. Photos
CREATE TABLE public.photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    original_uri TEXT NOT NULL,           -- iCloud Drive reference or temp bucket URL
    original_storage_type TEXT NOT NULL   -- 'icloud_drive' or 'temp_bucket'
        CHECK (original_storage_type IN ('icloud_drive', 'temp_bucket')),
    thumbnail_path TEXT NOT NULL,         -- Supabase Storage path
    media_type TEXT NOT NULL DEFAULT 'photo'
        CHECK (media_type IN ('photo', 'video')),
    file_size_bytes BIGINT,
    width INTEGER,
    height INTEGER,
    is_hidden_by_owner BOOLEAN DEFAULT FALSE,
    is_missing BOOLEAN DEFAULT FALSE,     -- Set true if original becomes inaccessible
    exif_data JSONB,                       -- Future use
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK for cover_photo after photos table exists
ALTER TABLE public.albums
    ADD CONSTRAINT albums_cover_photo_fkey
    FOREIGN KEY (cover_photo_id) REFERENCES public.photos(id) ON DELETE SET NULL;

-- 5. Personal Metadata (per-user organization overlay)
CREATE TABLE public.personal_metadata (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- metadata structure: { ordering: [], hidden_photos: [], personal_subsets: [], personal_tags: [] }
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, album_id)
);

-- 6. Subsets (internal, shareable, personal)
CREATE TABLE public.subsets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL for global subsets
    subset_type TEXT NOT NULL
        CHECK (subset_type IN ('internal', 'shareable', 'personal')),
    name TEXT NOT NULL,
    photo_ids UUID[] NOT NULL DEFAULT '{}',
    share_token TEXT UNIQUE,              -- For shareable subsets
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Album Invites
CREATE TABLE public.album_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
    invite_token TEXT UNIQUE NOT NULL,
    default_role TEXT NOT NULL DEFAULT 'contributor'
        CHECK (default_role IN ('contributor', 'viewer')),
    requires_approval BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Join Requests (for invite-only albums)
CREATE TABLE public.join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    UNIQUE (album_id, user_id)
);

-- 9. Notifications
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    album_id UUID REFERENCES public.albums(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL
        CHECK (notification_type IN (
            'photo_uploaded', 'member_joined', 'join_request',
            'album_modified', 'subset_created', 'photo_hidden'
        )),
    payload JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_photos_album_id ON public.photos(album_id);
CREATE INDEX idx_photos_uploader_id ON public.photos(uploader_id);
CREATE INDEX idx_album_members_user_id ON public.album_members(user_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id) WHERE is_read = FALSE;
CREATE INDEX idx_join_requests_pending ON public.join_requests(album_id) WHERE status = 'pending';
```

### 1.3 Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update own
CREATE POLICY "Profiles are viewable by authenticated users"
    ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Albums: visible to members or if public/link-accessible
CREATE POLICY "Albums viewable by members"
    ON public.albums FOR SELECT TO authenticated
    USING (
        owner_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.album_members WHERE album_id = id AND user_id = auth.uid()) OR
        privacy_mode IN ('link_accessible', 'public_unlisted')
    );

-- Album members: viewable by other members
CREATE POLICY "Album members viewable by members"
    ON public.album_members FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.album_members am
            WHERE am.album_id = album_members.album_id AND am.user_id = auth.uid()
        )
    );

-- Photos: viewable by album members, hidden photos only by owner/co-managers
CREATE POLICY "Photos viewable by album members"
    ON public.photos FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.album_members am
            WHERE am.album_id = photos.album_id
            AND am.user_id = auth.uid()
            AND (
                NOT photos.is_hidden_by_owner OR
                am.role IN ('owner', 'co_manager')
            )
        )
    );

-- More policies needed for INSERT, UPDATE, DELETE...
-- (see detailed RLS in migration files)
```

### 1.4 Supabase Storage Buckets

```sql
-- Create storage bucket for thumbnails
INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true);

-- Create storage bucket for web uploads (temp storage)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('temp-uploads', 'temp-uploads', false, 104857600); -- 100MB limit

-- Storage policies
CREATE POLICY "Thumbnails are publicly viewable"
    ON storage.objects FOR SELECT USING (bucket_id = 'thumbnails');

CREATE POLICY "Authenticated users can upload thumbnails"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'thumbnails');
```

---

## Phase 2: iOS App Foundation

### 2.1 Project Structure (SPM-based, following wishlist-ios)

```
apps/ios/
├── SharedAlbum.xcodeproj
├── SharedAlbum/
│   ├── Package.swift
│   └── Sources/
│       ├── App/
│       │   └── SharedAlbumApp.swift
│       ├── Models/
│       │   ├── Album.swift
│       │   ├── Photo.swift
│       │   ├── AlbumMember.swift
│       │   ├── Subset.swift
│       │   └── Profile.swift
│       ├── Services/
│       │   ├── SupabaseClient.swift
│       │   ├── AuthManager.swift
│       │   ├── AlbumService.swift
│       │   ├── PhotoService.swift
│       │   ├── ThumbnailService.swift
│       │   ├── CloudStorageService.swift  # iCloud Drive abstraction
│       │   └── NotificationService.swift
│       ├── Views/
│       │   ├── Auth/
│       │   │   ├── SignInView.swift
│       │   │   └── SignInWithAppleButton.swift
│       │   ├── Albums/
│       │   │   ├── AlbumsListView.swift
│       │   │   ├── AlbumDetailView.swift
│       │   │   ├── CreateAlbumSheet.swift
│       │   │   └── AlbumSettingsView.swift
│       │   ├── Photos/
│       │   │   ├── PhotoGridView.swift
│       │   │   ├── PhotoDetailView.swift
│       │   │   └── PhotoPickerSheet.swift
│       │   ├── Members/
│       │   │   ├── MembersListView.swift
│       │   │   └── InviteMemberSheet.swift
│       │   └── Subsets/
│       │       ├── SubsetsListView.swift
│       │       └── SubsetDetailView.swift
│       ├── Components/
│       │   ├── ThumbnailImage.swift
│       │   ├── RoleBadge.swift
│       │   └── LoadingOverlay.swift
│       └── Utilities/
│           ├── ImageResizer.swift
│           └── Config.swift
└── SharedAlbumTests/
```

### 2.2 Core Dependencies (Package.swift)

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SharedAlbum",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.0.0"),
    ],
    targets: [
        .target(
            name: "SharedAlbum",
            dependencies: [
                .product(name: "Supabase", package: "supabase-swift"),
            ]
        ),
    ]
)
```

### 2.3 Key iOS Implementation Components

**CloudStorageService** - iCloud Drive Integration:
- Use `NSFileProviderManager` for file operations
- Store files in app's iCloud Drive container: `~/Library/Mobile Documents/iCloud~com~yourcompany~sharedalbum/`
- Generate unique file paths per upload
- Return persistent file reference URLs

**ThumbnailService**:
- Resize images client-side to max 800px dimension
- Compress to <200KB JPEG
- Upload to Supabase Storage

**PhotoService Upload Flow**:
1. User selects photos via PhotosPicker
2. Retrieve full-resolution assets
3. Upload original to iCloud Drive → get reference URL
4. Generate thumbnail locally
5. Upload thumbnail to Supabase Storage
6. Create photo record in database with both references

---

## Phase 3: Web Client

### 3.1 Project Setup (Next.js)

```
apps/web/
├── package.json
├── next.config.js
├── tailwind.config.js
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx               # Landing/home
│   │   ├── auth/
│   │   │   └── callback/route.ts  # OAuth callback
│   │   ├── album/
│   │   │   └── [id]/
│   │   │       └── page.tsx       # Album viewer
│   │   └── invite/
│   │       └── [token]/
│   │           └── page.tsx       # Invite handler
│   ├── components/
│   │   ├── ui/                    # Radix UI primitives
│   │   ├── PhotoGrid.tsx
│   │   ├── UploadButton.tsx
│   │   └── AuthButtons.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   └── server.ts
│   │   └── utils.ts
│   ├── stores/
│   │   └── albumStore.ts          # Zustand store
│   └── types/
│       └── database.ts            # Generated from Supabase
└── supabase/                      # Symlink to root supabase/
```

### 3.2 Web Features (v1 Scope)
- Google Sign-In + Email magic link
- View albums (invited or link-accessible)
- Upload photos (to temp Supabase Storage bucket)
- Download photos
- **No**: organization, subsets, personal metadata

---

## Phase 4: Authentication

### 4.1 Supabase Auth Configuration

**Providers to enable:**
- Apple (iOS/macOS)
- Google (Web/Android)
- Email (Magic link fallback)

**iOS Deep Link Setup:**
- URL scheme: `sharedalbum://`
- Universal links: `https://yourapp.com/.well-known/apple-app-site-association`

### 4.2 Profile Creation Trigger

```sql
-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## Phase 5: Core Features Implementation Order

### 5.1 iOS Implementation Order

1. **Auth Flow**
   - Sign in with Apple
   - Session persistence
   - Profile loading

2. **Album CRUD**
   - Create album
   - List user's albums
   - Album detail view
   - Edit album settings
   - Delete album

3. **Photo Upload**
   - PhotosPicker integration
   - iCloud Drive upload
   - Thumbnail generation
   - Metadata registration

4. **Photo Display**
   - Thumbnail grid with lazy loading
   - Full-resolution viewer
   - Download to Photos

5. **Membership**
   - Invite link generation
   - Join flow (deep link handling)
   - Member list view
   - Role management

6. **Organization**
   - Subsets (internal + shareable)
   - Personal metadata overlay
   - Photo hiding (owner)

7. **Notifications**
   - Push notification setup
   - In-app notification list
   - Preference management

### 5.2 Web Implementation Order

1. Auth (Google + Email)
2. Album viewer
3. Photo upload
4. Download

---

## Phase 6: iCloud Drive Integration Deep Dive

### 6.1 Entitlements Required

```xml
<!-- SharedAlbum.entitlements -->
<key>com.apple.developer.icloud-container-identifiers</key>
<array>
    <string>iCloud.com.yourcompany.sharedalbum</string>
</array>
<key>com.apple.developer.icloud-services</key>
<array>
    <string>CloudDocuments</string>
</array>
<key>com.apple.developer.ubiquity-container-identifiers</key>
<array>
    <string>iCloud.com.yourcompany.sharedalbum</string>
</array>
```

### 6.2 CloudStorageService Implementation Approach

```swift
// Conceptual implementation
actor CloudStorageService {
    private let containerURL: URL?

    init() {
        // Get iCloud container URL
        containerURL = FileManager.default.url(
            forUbiquityContainerIdentifier: "iCloud.com.yourcompany.sharedalbum"
        )?.appendingPathComponent("Documents")
    }

    func uploadPhoto(data: Data, filename: String) async throws -> String {
        guard let containerURL else {
            throw CloudStorageError.iCloudUnavailable
        }

        let fileURL = containerURL.appendingPathComponent(filename)
        try data.write(to: fileURL)

        // Return the relative path as the reference
        return filename
    }

    func getPhotoURL(reference: String) -> URL? {
        containerURL?.appendingPathComponent(reference)
    }
}
```

### 6.3 Handling iCloud Unavailability
- Check `FileManager.default.ubiquityIdentityToken` at launch
- Prompt user to sign into iCloud if nil
- Graceful degradation: show "iCloud required" message

---

## Phase 7: Thumbnail Strategy

### 7.1 Generation (iOS)
- Max dimension: 800px (maintaining aspect ratio)
- Format: JPEG at 70% quality
- Target size: <200KB
- Use `UIGraphicsImageRenderer` for efficient resizing

### 7.2 Storage Structure
```
thumbnails/
├── {album_id}/
│   ├── {photo_id}.jpg
│   └── ...
```

### 7.3 Caching (iOS)
- Use `NSCache` for in-memory cache
- Disk cache in `Caches` directory
- Implement `AsyncImage`-style loading component

---

## Phase 8: Security Implementation

### 8.1 Signed URLs for Originals
- iCloud Drive: URLs are inherently user-scoped
- Temp bucket (web uploads): Generate signed URLs with 1-hour expiration

### 8.2 API Security
- All mutations validated by RLS policies
- Role checks in application code as secondary validation
- Rate limiting via Supabase Edge Functions

---

## Phase 9: Testing Strategy

### 9.1 iOS Testing
- Unit tests for Services (mocking Supabase client)
- UI tests for critical flows (auth, upload, view)

### 9.2 Web Testing
- Vitest for component/hook tests
- Playwright for E2E (auth flow, album viewing)

---

## Phase 10: Deployment

### 10.1 Infrastructure
- **Database**: Supabase (managed Postgres)
- **Web**: Vercel (Next.js)
- **iOS**: App Store Connect

### 10.2 Environment Configuration
- Supabase project per environment (dev, staging, prod)
- iOS Config.plist with environment switching
- Vercel environment variables

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| iCloud Drive complexity | Start with manual file operations; escalate to NSFileProvider only if needed |
| Temp storage accumulation | Implement cleanup edge function with 6-month retention |
| Permission confusion | Clear UI badges, role explanations, confirmation dialogs |
| Personal vs global confusion | Visual distinction (color coding), explicit "Just for me" labels |

---

## Open Questions for User

1. **App Name & Bundle ID**: What should the official app name and bundle identifier be?

2. **Supabase Project**: Create new or use existing project?

3. **iCloud Container ID**: Need Apple Developer account confirmation for container setup

4. **Priority Order**: Start with iOS-only MVP, or web in parallel?

5. **Temporary Storage Policy**: 6-month retention for web uploads acceptable?

---

## Recommended Starting Point

**Week 1-2 Focus:**
1. Create monorepo structure
2. Initialize Supabase with schema migrations
3. Set up iOS project with auth working
4. Implement basic album CRUD

This establishes the foundation before tackling the more complex iCloud Drive integration.
