import SwiftUI
import FirebaseCore
import GoogleSignIn

@main
struct FridgeNativeApp: App {
    @State private var store: AppStore

    init() {
        FirebaseApp.configure()
        _store = State(initialValue: AppStore())
    }

    var body: some Scene {
        WindowGroup {
            AppShellView()
                .environment(store)
                .preferredColorScheme(.dark)
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}

