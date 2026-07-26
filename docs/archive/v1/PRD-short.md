# Shared Album 2.0 (Capsule) — Product Requirements Document

## Product Summary

Capsule is a cross-platform photo-sharing and organization system designed to address structural limitations in existing shared-album implementations, specifically Apple Photos Shared Albums. The product enables full-resolution media sharing, multi-user collaboration, individual organizational layers, owner-controlled permissions, and a storage model that does not centralize photo hosting with the application operator. The system is built for iOS, iPadOS, and macOS native clients, with a simplified web client for Android and desktop web users. The application stores only metadata and thumbnails; all original media remains in each contributor's personal cloud storage (iCloud Drive for v1).

## Product Vision

Enable multi-device, multi-generation, cross-platform photo exchange without storage centralization, quality degradation, or organizational limitations. Provide a simple interface for non-technical users while maintaining robust metadata and permission systems for advanced use.

## Target Users

1. Primary album owners (iOS/macOS users) who want to create shared albums and organize content.
2. Contributors (iOS or Web/Android) who need to upload and download content with minimal complexity.
3. View-only participants who require frictionless access.
4. Multi-generation family groups requiring simplicity.
5. Event-based groups requiring temporary collaboration.

## Key Objectives

- Provide full-resolution sharing without compression.
- Minimize backend storage costs by decentralizing originals.
- Allow flexible, user-dependent organization without impacting global album order.
- Provide multiple permission levels.
- Maintain simplicity across all entry points.
- Ensure iOS and macOS are full-featured while Android/Web support minimal but functional participation.
- Establish infrastructure for future features (e.g., people tagging) without exposing them in v1.

## Core Principles

- Keep the app lightweight and intuitive.
- Do not assume technical proficiency.
- Centralize metadata, not media.
- Owners maintain control of the shared environment.
- Contributors maintain control of their original files.
- Web interface is limited to critical functionality only.

---

*Full PRD available in original planning document*
