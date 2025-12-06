import Foundation
import SwiftUI
import AuthenticationServices
import Supabase

/// Manages authentication state and Sign in with Apple flow
@MainActor
final class AuthManager: NSObject, ObservableObject {
    static let shared = AuthManager()

    @Published var isAuthenticated = false
    @Published var isLoading = true
    @Published var currentUser: User?
    @Published var profile: Profile?
    @Published var errorMessage: String?

    /// Convenience accessor for current user's UUID
    var userId: UUID? {
        currentUser?.id
    }

    private var authStateTask: Task<Void, Never>?

    private override init() {
        super.init()
        setupAuthStateListener()
    }

    deinit {
        authStateTask?.cancel()
    }

    // MARK: - Auth State

    private func setupAuthStateListener() {
        authStateTask = Task {
            // Check initial session
            await checkSession()

            // Listen for auth state changes
            for await (event, session) in SupabaseService.shared.auth.authStateChanges {
                guard !Task.isCancelled else { break }

                switch event {
                case .signedIn:
                    self.currentUser = session?.user
                    self.isAuthenticated = true
                    if let userId = session?.user.id {
                        await loadProfile(userId: userId)
                    }

                case .signedOut:
                    self.currentUser = nil
                    self.profile = nil
                    self.isAuthenticated = false

                case .tokenRefreshed:
                    self.currentUser = session?.user

                case .userUpdated:
                    self.currentUser = session?.user
                    if let userId = session?.user.id {
                        await loadProfile(userId: userId)
                    }

                default:
                    break
                }
            }
        }
    }

    private func checkSession() async {
        defer { isLoading = false }

        do {
            let session = try await SupabaseService.shared.auth.session
            currentUser = session.user
            isAuthenticated = true
            await loadProfile(userId: session.user.id)
        } catch {
            currentUser = nil
            isAuthenticated = false
        }
    }

    // MARK: - Profile

    private func loadProfile(userId: UUID) async {
        do {
            let response: Profile = try await SupabaseService.shared
                .from("profiles")
                .select()
                .eq("id", value: userId.uuidString)
                .single()
                .execute()
                .value

            self.profile = response
        } catch {
            print("[AuthManager] Failed to load profile: \(error)")
        }
    }

    /// Reload the current user's profile
    func reloadProfile() async {
        guard let userId = currentUser?.id else { return }
        await loadProfile(userId: userId)
    }

    // MARK: - Sign in with Apple

    /// Initiates Sign in with Apple flow
    func signInWithApple() {
        errorMessage = nil

        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email, .fullName]

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.performRequests()
    }

    /// Handle the Apple ID credential and sign in with Supabase
    private func handleAppleSignIn(credential: ASAuthorizationAppleIDCredential) async {
        guard let identityToken = credential.identityToken,
              let tokenString = String(data: identityToken, encoding: .utf8) else {
            errorMessage = "Failed to get identity token"
            return
        }

        do {
            try await SupabaseService.shared.auth.signInWithIdToken(
                credentials: .init(
                    provider: .apple,
                    idToken: tokenString
                )
            )
        } catch {
            errorMessage = error.localizedDescription
            print("[AuthManager] Supabase sign in failed: \(error)")
        }
    }

    // MARK: - Magic Link (Email)

    func sendMagicLink(email: String) async -> Bool {
        errorMessage = nil

        do {
            try await SupabaseService.shared.auth.signInWithOTP(
                email: email,
                redirectTo: URL(string: "\(Config.urlScheme)://auth/callback")
            )
            return true
        } catch {
            errorMessage = error.localizedDescription
            print("[AuthManager] Magic link failed: \(error)")
            return false
        }
    }

    func verifyEmailOTP(email: String, code: String) async -> Bool {
        errorMessage = nil

        do {
            try await SupabaseService.shared.auth.verifyOTP(
                email: email,
                token: code,
                type: .email
            )
            return true
        } catch {
            errorMessage = error.localizedDescription
            print("[AuthManager] Email OTP verify failed: \(error)")
            return false
        }
    }

    // MARK: - Sign Out

    func signOut() async {
        do {
            try await SupabaseService.shared.auth.signOut()
            currentUser = nil
            profile = nil
            isAuthenticated = false
        } catch {
            print("[AuthManager] Sign out failed: \(error)")
        }
    }
}

// MARK: - ASAuthorizationControllerDelegate

extension AuthManager: ASAuthorizationControllerDelegate {
    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            return
        }

        Task { @MainActor in
            await handleAppleSignIn(credential: credential)
        }
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        Task { @MainActor in
            if let authError = error as? ASAuthorizationError,
               authError.code == .canceled {
                // User canceled - not an error
                return
            }
            errorMessage = error.localizedDescription
            print("[AuthManager] Sign in with Apple error: \(error)")
        }
    }
}
