import SwiftUI

@main
struct CapsuleApp: App {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var albumService = AlbumService.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .environmentObject(albumService)
        }
    }
}

struct ContentView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        Group {
            if authManager.isLoading {
                LoadingView()
            } else if authManager.isAuthenticated {
                MainTabView()
            } else {
                SignInView()
            }
        }
    }
}

struct LoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading...")
                .foregroundStyle(.secondary)
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            AlbumsListView()
                .tabItem {
                    Label("Albums", systemImage: "photo.on.rectangle.angled")
                }

            NotificationsPlaceholderView()
                .tabItem {
                    Label("Activity", systemImage: "bell")
                }

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.circle")
                }
        }
    }
}

struct NotificationsPlaceholderView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Coming Soon",
                systemImage: "bell",
                description: Text("Activity notifications will appear here")
            )
            .navigationTitle("Activity")
        }
    }
}

struct ProfileView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 16) {
                        Circle()
                            .fill(Color.accentColor.opacity(0.2))
                            .frame(width: 60, height: 60)
                            .overlay {
                                Text(authManager.profile?.displayName?.prefix(1).uppercased() ?? "?")
                                    .font(.title2.bold())
                                    .foregroundStyle(.tint)
                            }

                        VStack(alignment: .leading, spacing: 4) {
                            Text(authManager.profile?.displayName ?? "Unknown")
                                .font(.headline)
                            Text(authManager.currentUser?.email ?? "")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 8)
                }

                Section {
                    Button(role: .destructive) {
                        Task {
                            await authManager.signOut()
                        }
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Profile")
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AuthManager.shared)
        .environmentObject(AlbumService.shared)
}
