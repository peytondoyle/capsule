import Foundation
import SwiftUI
import UIKit
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
                print("[AuthManager] Auth state changed: \(event)")

                switch event {
                case .signedIn:
                    print("[AuthManager] User signed in: \(session?.user.id.uuidString ?? "nil")")
                    self.currentUser = session?.user
                    self.isAuthenticated = true
                    if let userId = session?.user.id {
                        await loadProfile(userId: userId)
                    }
                    print("[AuthManager] isAuthenticated = \(self.isAuthenticated)")

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
        print("[AuthManager] Starting Sign in with Apple...")

        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email, .fullName]

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
        print("[AuthManager] ASAuthorizationController requests started")
    }

    /// Handle the Apple ID credential and sign in with Supabase
    func handleAppleCredential(_ credential: ASAuthorizationAppleIDCredential) async {
        guard let identityToken = credential.identityToken,
              let tokenString = String(data: identityToken, encoding: .utf8) else {
            errorMessage = "Failed to get identity token"
            return
        }

        do {
            print("[AuthManager] Signing in with Apple ID token...")
            let session = try await SupabaseService.shared.auth.signInWithIdToken(
                credentials: .init(
                    provider: .apple,
                    idToken: tokenString
                )
            )
            print("[AuthManager] Sign in successful! User ID: \(session.user.id)")
            print("[AuthManager] User email: \(session.user.email ?? "none")")
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

// MARK: - ASAuthorizationControllerPresentationContextProviding

extension AuthManager: ASAuthorizationControllerPresentationContextProviding {
    @MainActor
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // Get the first window scene's key window
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first else {
            fatalError("No window found")
        }
        return window
    }
}

// MARK: - ASAuthorizationControllerDelegate

extension AuthManager: ASAuthorizationControllerDelegate {
    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        print("[AuthManager] Apple authorization completed")
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            print("[AuthManager] Failed to get Apple credential")
            return
        }
        print("[AuthManager] Got Apple credential, user: \(credential.user)")

        Task { @MainActor in
            await handleAppleCredential(credential)
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
