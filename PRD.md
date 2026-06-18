# Capsule - Product Requirements Document

## Overview

Capsule is a collaborative photo sharing app that allows groups to collect, organize, and interact with shared memories. Unlike traditional photo sharing where one person owns the album, Capsule enables true collaboration where multiple contributors can upload photos to shared albums while maintaining ownership of their original files in iCloud Drive.

---

## Core Concepts

### Albums
A shared space for collecting photos around an event, trip, or theme. Albums have:
- **Owner**: The creator who has full admin rights
- **Members**: People invited to view and/or contribute
- **Privacy modes**: Invite-only, link-sharing, or public

### Photos & Videos
Media uploaded to albums. Key characteristics:
- **Original files** stay in the uploader's iCloud Drive
- **Thumbnails** are stored in Supabase for fast loading
- **Metadata** tracks dimensions, file size, upload date

### Collections & My Picks
Ways to organize photos within an album:
- **Collections**: Shared groupings visible to all members (e.g., "Ceremony", "Reception")
- **My Picks**: Private groupings only visible to you (e.g., "Favorites", "To Print")

### Social Features
- **Likes** (public): Heart icon, visible to all album members
- **Favorites** (private): Star icon, only you see your favorites
- **Comments** (public): Text comments on photos

---

## User Flows

### 1. Album Discovery & Navigation

```
┌─────────────────────────────────────┐
│ ← Albums                    + ⚙️    │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────┐ ┌─────────────┐   │
│  │             │ │             │   │
│  │   Cover     │ │   Cover     │   │
│  │   Photo     │ │   Photo     │   │
│  │             │ │             │   │
│  ├─────────────┤ ├─────────────┤   │
│  │ Summer 2024 │ │ Wedding     │   │
│  │ 127 photos  │ │ 89 photos   │   │
│  └─────────────┘ └─────────────┘   │
│                                     │
│  ┌─────────────┐ ┌─────────────┐   │
│  │             │ │             │   │
│  │   Cover     │ │   Cover     │   │
│  │   Photo     │ │   Photo     │   │
│  │             │ │             │   │
│  ├─────────────┤ ├─────────────┤   │
│  │ Road Trip   │ │ Baby Photos │   │
│  │ 45 photos   │ │ 203 photos  │   │
│  └─────────────┘ └─────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

**Implementation Notes:**
- 2-column grid layout
- Cover photo with rounded corners (12pt radius)
- Album title in bold, photo count in secondary text
- Pull-to-refresh to sync new albums
- Tap + to create new album

---

### 2. Album Detail View

```
┌─────────────────────────────────────┐
│ ←  Summer 2024              📷 ⚙️   │
├─────────────────────────────────────┤
│                                     │
│  ┌──────┐ ┌────────────┐ ┌───────┐ │
│  │ All  │ │ Collections│ │My Picks│ │
│  └──────┘ └────────────┘ └───────┘ │
│   ●                                 │
│                                     │
│  Collections ─────────────────── + │
│  ┌────────┐ ┌────────┐ ┌────────┐  │
│  │┌──┬──┐ │ │┌──┬──┐ │ │┌──┬──┐ │  │
│  ││  │  │ │ ││  │  │ │ ││  │  │ │  │
│  │├──┼──┤ │ │├──┼──┤ │ │├──┼──┤ │  │
│  ││  │  │ │ ││  │  │ │ ││  │  │ │  │
│  │└──┴──┘ │ │└──┴──┘ │ │└──┴──┘ │  │
│  │Ceremony│ │Recept. │ │🔒 Faves│  │
│  │  24    │ │  31    │ │  12    │  │
│  └────────┘ └────────┘ └────────┘  │
│                                     │
│  ┌───┬───┬───┐                     │
│  │   │   │   │                     │
│  ├───┼───┼───┤                     │
│  │   │   │   │                     │
│  ├───┼───┼───┤                     │
│  │   │   │   │                     │
│  ├───┼───┼───┤                     │
│  │   │   │   │                     │
│  └───┴───┴───┘                     │
│                                     │
└─────────────────────────────────────┘
```

**Pill Navigation:**
- Horizontal scroll of capsule-shaped buttons
- Active pill: Primary color fill, white text
- Inactive pill: Gray background, primary text
- Tabs: "All", "Collections", "My Picks"

**Collections Header (in "All" view):**
- Horizontal scroll row at top
- Mini cards (100x100) with 2x2 thumbnail grid
- Lock icon on personal picks
- Tap to open collection detail
- Plus button to create new

**Photo Grid:**
- 3-column layout, 2pt spacing
- Square thumbnails, edge-to-edge
- Video badge (play icon) on videos
- Double-tap to like (heart animation)
- Long-press for context menu
- Long-press (0.5s) enters selection mode

---

### 3. Photo Interactions

#### Double-Tap to Like
```
┌─────────────────────────────────────┐
│                                     │
│          ┌───────────┐              │
│          │           │              │
│          │   Photo   │              │
│          │           │              │
│          │     ♥     │ ← Animated   │
│          │   (big)   │   heart      │
│          │           │              │
│          └───────────┘              │
│                                     │
└─────────────────────────────────────┘
```

**Animation Sequence:**
1. Heart appears at center (scale 0.5 → 1.0)
2. Spring animation (response: 0.3, damping: 0.6)
3. Hold for 0.8 seconds
4. Fade out (duration: 0.2)
5. Haptic feedback (medium impact)

#### Context Menu (Long Press)
```
┌─────────────────────────────────────┐
│                                     │
│    ┌─────────────────────────┐      │
│    │ ♥  Like                 │      │
│    │ ☆  Favorite             │      │
│    │────────────────────────│      │
│    │ ↓  Save to Photos       │      │
│    │ ↗  Share                │      │
│    └─────────────────────────┘      │
│                                     │
│          [Photo Preview]            │
│                                     │
└─────────────────────────────────────┘
```

**Menu Items:**
- Like/Unlike (toggles based on state)
- Favorite/Unfavorite (toggles)
- Save to Photos (downloads to camera roll)
- Share (iOS share sheet)

---

### 4. Photo Detail View

```
┌─────────────────────────────────────┐
│ Done        Photo           •••    │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │                             │   │
│  │                             │   │
│  │         Full Photo          │   │
│  │                             │   │
│  │                             │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  ♥ 12    ☆    💬 3                 │
│                                     │
│  📐 1920 × 1080                    │
│  📄 2.4 MB                         │
│  📅 Dec 7, 2024 at 2:30 PM        │
│                                     │
└─────────────────────────────────────┘
```

**Action Bar:**
- Heart: Like count, filled red if liked
- Star: Yellow filled if favorited (private)
- Comment bubble: Comment count, tap to expand drawer

**Overflow Menu (•••):**
- Save to Photos
- Share
- Delete (destructive)

---

### 5. Comments Drawer

```
┌─────────────────────────────────────┐
│ Done        Photo           •••    │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │       Photo (smaller)       │   │
│  └─────────────────────────────┘   │
│                                     │
│  ♥ 12    ☆    💬 3 (filled)        │
│                                     │
│ ┌───────────────────────────────┐  │
│ │ ═══════                     ✕ │  │
│ │ Comments                      │  │
│ │───────────────────────────────│  │
│ │ ○ Sarah • 2h ago              │  │
│ │   Love this shot!             │  │
│ │                               │  │
│ │ ○ Mike • 1d ago          🗑  │  │
│ │   Great memories              │  │
│ │                               │  │
│ │ ○ You • 3d ago           🗑  │  │
│ │   Can't believe how fun...    │  │
│ │───────────────────────────────│  │
│ │ [Add a comment...    ]    ➤  │  │
│ └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Drawer Behavior:**
- Slides up from bottom with spring animation
- Photo shrinks to 40% height to make room
- Handle bar at top for visual affordance
- X button to close (or tap comment icon)
- Max height: 35% of screen

**Comment Row:**
- Avatar circle with first letter of name
- Username in bold + relative timestamp
- Comment text below
- Trash icon on own comments only

**Input Field:**
- Rounded border text field
- Send button (paperplane icon)
- Disabled when empty

---

### 6. Selection Mode

```
┌─────────────────────────────────────┐
│ Cancel    3 Selected    All ↓ 🗑   │
├─────────────────────────────────────┤
│                                     │
│  ┌───┬───┬───┐                     │
│  │ ✓ │   │ ✓ │                     │
│  ├───┼───┼───┤                     │
│  │   │ ✓ │   │                     │
│  ├───┼───┼───┤                     │
│  │   │   │   │                     │
│  └───┴───┴───┘                     │
│                                     │
└─────────────────────────────────────┘
```

**Entering Selection Mode:**
- Long-press (0.5s) on any photo
- Or via view mode menu → "Select"

**Selection UI:**
- Checkmark circle overlay (top-right)
- Selected: filled checkmark, dark overlay
- Unselected: empty circle

**Toolbar Actions:**
- Select All / Deselect All
- Download (↓) - bulk save to camera roll
- Delete (🗑) - with confirmation

**Progress Overlay:**
```
┌─────────────────────────────────────┐
│                                     │
│         ┌─────────────────┐         │
│         │   ◐             │         │
│         │ Downloading     │         │
│         │   3/12...       │         │
│         └─────────────────┘         │
│                                     │
└─────────────────────────────────────┘
```

---

### 7. View Modes

#### Grid View (Default)
```
┌───┬───┬───┐
│   │   │   │
├───┼───┼───┤
│   │   │   │
├───┼───┼───┤
│   │   │   │
└───┴───┴───┘
```
- 3 columns, 2pt spacing
- Square crops, edge-to-edge

#### Flow View (Pinterest-style)
```
┌─────┬─────┐
│     │     │
│     ├─────┤
├─────┤     │
│     │     │
│     ├─────┤
├─────┤     │
│     │     │
└─────┴─────┘
```
- 2 columns, masonry layout
- Preserves aspect ratios (0.7 - 1.5)
- 8pt corner radius

#### Carousel View
```
┌─────────────────────────────────────┐
│                                     │
│    ┌─────────────────────────┐     │
│    │                         │     │
│    │                         │     │
│    │      Current Photo      │     │
│    │                         │     │
│    │                         │     │
│    └─────────────────────────┘     │
│           Dec 7, 2024              │
│             • • ○ • •              │
└─────────────────────────────────────┘
```
- Full-width cards with shadow
- Horizontal paging
- Date below photo
- Page indicator dots

#### Mosaic View
```
┌─────────────┬─────┐
│             │     │
│   Large     ├─────┤
│             │     │
├──────┬──────┴─────┤
│      │            │
└──────┴────────────┘
```
- Featured photo (2/3 width)
- Supporting photos in grid
- Repeating 5-photo pattern

**View Mode Selector:**
- Menu from grid icon (top-left toolbar)
- Options: Grid, Flow, Carousel, Mosaic

---

### 8. Date Filtering

```
┌─────────────────────────────────────┐
│              Filter by Date    Done │
├─────────────────────────────────────┤
│                                     │
│ Year                                │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
│ │ All │ │2024 │ │2023 │ │2022 │   │
│ └─────┘ └─────┘ └─────┘ └─────┘   │
│           ●                         │
│                                     │
│ Month                               │
│ ┌─────┐ ┌─────┐ ┌─────┐           │
│ │ All │ │ Jan │ │ Feb │           │
│ ├─────┤ ├─────┤ ├─────┤           │
│ │ Mar │ │ Apr │ │ May │           │
│ ├─────┤ ├─────┤ ├─────┤           │
│ │ Jun │ │ Jul │ │ Aug │           │
│ ├─────┤ ├─────┤ ├─────┤           │
│ │ Sep │ │ Oct │ │ Nov │           │
│ ├─────┤                            │
│ │ Dec │                            │
│ └─────┘                            │
│                                     │
│ 45 photos match              Clear │
└─────────────────────────────────────┘
```

**Filter Bar (when active):**
```
┌─────────────────────────────────────┐
│ December 2024    45 photos      ✕  │
└─────────────────────────────────────┘
```

---

### 9. Collections Tab

```
┌─────────────────────────────────────┐
│ ←  Summer 2024              📷 ⚙️   │
├─────────────────────────────────────┤
│                                     │
│  ┌──────┐ ┌────────────┐ ┌───────┐ │
│  │ All  │ │ Collections│ │My Picks│ │
│  └──────┘ └────────────┘ └───────┘ │
│             ●                       │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ┌───┬───┬───┬───┐           │   │
│  │ │   │   │   │   │           │   │
│  │ └───┴───┴───┴───┘           │   │
│  │ Ceremony                    │   │
│  │ 24 photos               ›   │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ┌───┬───┬───┬───┐           │   │
│  │ │   │   │   │   │           │   │
│  │ └───┴───┴───┴───┘           │   │
│  │ Reception                   │   │
│  │ 31 photos               ›   │   │
│  └─────────────────────────────┘   │
│                                     │
│            [Create Collection]      │
│                                     │
└─────────────────────────────────────┘
```

**Collection Card:**
- 4-photo thumbnail strip (full width)
- Collection name (headline)
- Photo count (caption)
- Chevron indicator
- 16pt corner radius

**Empty State:**
```
┌─────────────────────────────────────┐
│                                     │
│              📚                     │
│       No Collections                │
│                                     │
│  Create collections to organize     │
│     photos for everyone             │
│                                     │
│      [Create Collection]            │
│                                     │
└─────────────────────────────────────┘
```

---

### 10. My Picks Tab

```
┌─────────────────────────────────────┐
│ ←  Summer 2024              📷 ⚙️   │
├─────────────────────────────────────┤
│                                     │
│  ┌──────┐ ┌────────────┐ ┌───────┐ │
│  │ All  │ │ Collections│ │My Picks│ │
│  └──────┘ └────────────┘ └───────┘ │
│                           ●         │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ┌───┬───┬───┬───┐           │   │
│  │ │   │   │   │   │           │   │
│  │ └───┴───┴───┴───┘           │   │
│  │ 🔒 Favorites                │   │
│  │ 12 photos               ›   │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ┌───┬───┬───┬───┐           │   │
│  │ │   │   │   │   │           │   │
│  │ └───┴───┴───┴───┘           │   │
│  │ 🔒 To Print                 │   │
│  │ 8 photos                ›   │   │
│  └─────────────────────────────┘   │
│                                     │
│             [Create Picks]          │
│                                     │
└─────────────────────────────────────┘
```

**Differences from Collections:**
- Lock icon indicates private
- Orange accent color for lock
- "Picks" terminology
- Only visible to current user

---

### 11. Create Collection/Picks Sheet

```
┌─────────────────────────────────────┐
│ Cancel    New Collection     Create │
├─────────────────────────────────────┤
│                                     │
│ Name                                │
│ ┌─────────────────────────────────┐│
│ │ e.g., Ceremony, Reception       ││
│ └─────────────────────────────────┘│
│ All album members can see this     │
│                                     │
│ Select Photos (5)                   │
│ ┌───┬───┬───┬───┬───┐             │
│ │ ✓ │   │ ✓ │   │ ✓ │             │
│ ├───┼───┼───┼───┼───┤             │
│ │   │ ✓ │   │ ✓ │   │             │
│ ├───┼───┼───┼───┼───┤             │
│ │   │   │   │   │   │             │
│ └───┴───┴───┴───┴───┘             │
│                                     │
└─────────────────────────────────────┘
```

**For My Picks:**
- Title: "New Picks"
- Placeholder: "e.g., Favorites, To Print"
- Footer: "Only you can see your picks" (orange)

---

### 12. Album Settings

```
┌─────────────────────────────────────┐
│ Cancel    Album Settings       Save │
├─────────────────────────────────────┤
│                                     │
│ COVER PHOTO                         │
│ ┌─────────────────────────────────┐│
│ │ [img]  Change Cover          › ││
│ │        24 photos available      ││
│ └─────────────────────────────────┘│
│                                     │
│ DETAILS                             │
│ ┌─────────────────────────────────┐│
│ │ Album Title                     ││
│ │ Summer 2024                     ││
│ ├─────────────────────────────────┤│
│ │ Description (optional)          ││
│ │ Our amazing trip to...          ││
│ └─────────────────────────────────┘│
│                                     │
│ PRIVACY                             │
│ ┌─────────────────────────────────┐│
│ │ Who can access         Invite › ││
│ └─────────────────────────────────┘│
│ Only people you invite can access  │
│                                     │
│ SHARING                             │
│ ┌─────────────────────────────────┐│
│ │ 👤+ Invite Members              ││
│ ├─────────────────────────────────┤│
│ │ 👥  View Members             ›  ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🗑  Delete Album                ││
│ └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

---

### 13. Video Support

**Video Badge in Grid:**
```
┌───────────┐
│           │
│           │
│           │
│ ▶         │
└───────────┘
```
- Play icon in bottom-left corner
- White with shadow for visibility

**Video in Detail View:**
```
┌─────────────────────────────────────┐
│                                     │
│  ┌─────────────────────────────┐   │
│  │                             │   │
│  │       Video Player          │   │
│  │                             │   │
│  │     advancement bar          │   │
│  │  ▶ ═══════○──────── 🔊      │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

**Loading State:**
```
┌─────────────────────────────────────┐
│  ┌─────────────────────────────┐   │
│  │                             │   │
│  │      [Thumbnail]            │   │
│  │                             │   │
│  │    ┌─────────────────┐      │   │
│  │    │ Loading video...│      │   │
│  │    └─────────────────┘      │   │
│  │                             │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## Technical Architecture

### Storage Model
```
┌─────────────────────────────────────────────────────────┐
│                      User's Device                       │
│  ┌───────────────┐                                      │
│  │ iCloud Drive  │ ← Original photos/videos             │
│  │ /Capsule/     │   (full resolution)                  │
│  └───────────────┘                                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼ reference stored
┌─────────────────────────────────────────────────────────┐
│                      Supabase                            │
│  ┌───────────────┐    ┌───────────────┐                │
│  │   Database    │    │    Storage    │                │
│  │  - albums     │    │  thumbnails/  │                │
│  │  - photos     │    │    800x800    │                │
│  │  - members    │    │    JPEG       │                │
│  │  - likes      │    │               │                │
│  │  - comments   │    │               │                │
│  └───────────────┘    └───────────────┘                │
└─────────────────────────────────────────────────────────┘
```

### Key Decisions

1. **Originals in iCloud**: Users keep ownership; app doesn't need to store full-res files
2. **Thumbnails in Supabase**: Fast CDN delivery, consistent quality
3. **RLS Policies**: Fine-grained access control at database level
4. **Optimistic Updates**: Like/favorite changes feel instant

---

## Database Schema

### Core Tables
- `profiles` - User data (display name, avatar)
- `albums` - Album metadata
- `album_members` - Membership + roles
- `photos` - Photo/video records
- `subsets` - Collections and picks

### Social Tables
- `likes` - Public likes (user → photo)
- `favorites` - Private favorites (user → photo)
- `comments` - Photo comments

### Supporting Tables
- `invites` - Pending invitations
- `notifications` - Activity feed items

---

## iOS Implementation Status

### Completed Features
- [x] Album CRUD
- [x] Photo/video upload
- [x] Multiple view modes (grid, flow, carousel, mosaic)
- [x] Selection mode with bulk actions
- [x] Date filtering
- [x] Collections and My Picks
- [x] Likes, favorites, comments
- [x] Double-tap to like
- [x] Context menus
- [x] Collapsible comments drawer
- [x] Deep link handling
- [x] Video playback
- [x] Download to camera roll

### Pending Features
- [ ] Push notifications
- [ ] Activity feed UI
- [ ] Profile editing
- [ ] Search within albums
- [ ] Face detection / auto-tagging
- [ ] Map view for geotagged photos

---

## Design Tokens

### Colors
- Primary: System default (adapts to light/dark)
- Like: Red (systemRed)
- Favorite: Yellow (systemYellow)
- Private/Lock: Orange
- Background: systemBackground
- Secondary Background: secondarySystemBackground
- Tertiary: systemGray5

### Typography
- Headlines: SF Pro Bold
- Body: SF Pro Regular
- Captions: SF Pro Regular, secondary color

### Spacing
- Grid spacing: 2pt
- Card padding: 16pt
- Corner radius (cards): 16pt
- Corner radius (buttons): Capsule (full)
- Corner radius (thumbnails): 8pt

### Animations
- Spring (standard): response 0.3, damping 0.8
- Spring (bouncy): response 0.3, damping 0.6
- Fade: duration 0.2

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | Dec 2024 | Initial album and photo support |
| 0.2 | Dec 2024 | Social features (likes, comments) |
| 0.3 | Dec 2024 | Collections, view modes, date filtering |
| 0.4 | Dec 2024 | Video support, UX improvements |
| 0.5 | Dec 2024 | Pills navigation, collapsible drawer |
