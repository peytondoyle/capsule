import SwiftUI
import AuthenticationServices

struct SignInView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var showEmailSignIn = false

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Logo and title
            VStack(spacing: 16) {
                Image(systemName: "photo.stack")
                    .font(.system(size: 80))
                    .foregroundStyle(.tint)

                Text("Capsule")
                    .font(.largeTitle.bold())

                Text("Share photos, keep memories")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Sign in options
            VStack(spacing: 16) {
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.email, .fullName]
                } onCompletion: { _ in
                    // Handled by AuthManager
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)
                .cornerRadius(10)

                Button {
                    showEmailSignIn = true
                } label: {
                    HStack {
                        Image(systemName: "envelope")
                        Text("Continue with Email")
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color(.systemGray5))
                    .foregroundStyle(.primary)
                    .cornerRadius(10)
                }

                if let error = authManager.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 32)

            Spacer()
                .frame(height: 50)
        }
        .sheet(isPresented: $showEmailSignIn) {
            EmailSignInView()
        }
        .onAppear {
            // Trigger Sign in with Apple when button is tapped
            // The button itself handles the flow
        }
    }
}

struct EmailSignInView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var code = ""
    @State private var isSendingCode = false
    @State private var isVerifying = false
    @State private var codeSent = false
    @State private var localError: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                if !codeSent {
                    // Email entry
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Enter your email")
                            .font(.headline)

                        TextField("email@example.com", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(10)

                        Text("We'll send you a code to sign in")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    Button {
                        Task {
                            await sendCode()
                        }
                    } label: {
                        if isSendingCode {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Send Code")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(email.isEmpty || isSendingCode)

                } else {
                    // Code entry
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Enter the code")
                            .font(.headline)

                        TextField("123456", text: $code)
                            .textContentType(.oneTimeCode)
                            .keyboardType(.numberPad)
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(10)

                        Text("Check your email for a 6-digit code")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    Button {
                        Task {
                            await verifyCode()
                        }
                    } label: {
                        if isVerifying {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Verify")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(code.count < 6 || isVerifying)

                    Button("Send new code") {
                        codeSent = false
                        code = ""
                    }
                    .font(.footnote)
                }

                if let error = localError ?? authManager.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }

                Spacer()
            }
            .padding()
            .navigationTitle("Sign in with Email")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func sendCode() async {
        isSendingCode = true
        localError = nil

        let success = await authManager.sendMagicLink(email: email)

        isSendingCode = false
        if success {
            codeSent = true
        }
    }

    private func verifyCode() async {
        isVerifying = true
        localError = nil

        let success = await authManager.verifyEmailOTP(email: email, code: code)

        isVerifying = false
        if success {
            dismiss()
        }
    }
}

#Preview {
    SignInView()
        .environmentObject(AuthManager.shared)
}
