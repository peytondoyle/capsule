import Foundation
import Supabase
import Auth
import Storage
import Functions

/// Supabase client singleton for database and auth operations
@MainActor
final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient

    private init() {
        let supabaseURL = URL(string: Config.supabaseURL)!
        let supabaseKey = Config.supabaseAnonKey

        // Configure JSON decoder for Supabase date format
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            // Try ISO8601 with fractional seconds first
            let isoFormatter = ISO8601DateFormatter()
            isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = isoFormatter.date(from: dateString) {
                return date
            }

            // Try without fractional seconds
            isoFormatter.formatOptions = [.withInternetDateTime]
            if let date = isoFormatter.date(from: dateString) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date: \(dateString)"
            )
        }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        client = SupabaseClient(
            supabaseURL: supabaseURL,
            supabaseKey: supabaseKey,
            options: .init(
                db: .init(encoder: encoder, decoder: decoder),
                auth: .init(
                    redirectToURL: URL(string: "\(Config.urlScheme)://auth/callback"),
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
    }

    // MARK: - Auth Convenience

    var auth: AuthClient {
        client.auth
    }

    var currentUser: User? {
        get async {
            try? await auth.session.user
        }
    }

    var currentSession: Session? {
        get async {
            try? await auth.session
        }
    }

    // MARK: - Database Convenience

    /// Query the capsule schema
    func from(_ table: String) -> PostgrestQueryBuilder {
        client.schema("capsule").from(table)
    }

    // MARK: - Storage Convenience

    var storage: SupabaseStorageClient {
        client.storage
    }

    // MARK: - Functions Convenience

    var functions: FunctionsClient {
        client.functions
    }
}
