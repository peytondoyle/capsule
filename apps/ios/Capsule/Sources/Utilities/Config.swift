import Foundation

/// App configuration for Capsule
/// In production, consider using a Config.plist or environment variables
enum Config {
    // Supabase credentials (peyton-prod)
    static let supabaseURL = "https://kjdoiozqefbjkbsimvbs.supabase.co"
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZG9pb3pxZWZiamtic2ltdmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxODY4NTgsImV4cCI6MjA3NTc2Mjg1OH0.5Rb3TUVGFWKvd5eLuJYCKS6WiQUIEezVJA-9hPMENT4"

    // iCloud container identifier
    static let iCloudContainerID = "iCloud.com.peytondoyle.capsule"

    // App URL scheme for deep links
    static let urlScheme = "capsule"

    // Web app URL (for invite links)
    static let webAppURL = "https://capsule.app" // TODO: Update when deployed
}
