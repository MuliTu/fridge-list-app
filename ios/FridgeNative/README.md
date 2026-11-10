# Fridge Native for iPhone

This is a real SwiftUI iOS application. It does not embed the web application and it does not use a `WKWebView`.

## Run

1. Provision an iOS app in the existing Firebase project and download its
   `GoogleService-Info.plist`.
2. Place the plist at `FridgeNative/GoogleService-Info.plist`. It is ignored by
   Git and must never be committed.
3. Open `FridgeNative.xcodeproj` in Xcode.
4. Choose an iPhone simulator and run the `FridgeNative` scheme.

The current build is an early integrated native client, not a production-ready
release. It includes shopping-list, kitchen-inventory, recipe, receipt and
settings surfaces. The UI uses native navigation, sheets, photo picking,
Dynamic Type, RTL layout, reduced-motion support, haptics and interruptible
SwiftUI springs.

## Firebase integration boundary

No Firebase iOS credentials are stored in the repository. The client already
uses Firebase Authentication and Realtime Database for authenticated state,
and sends the user's Firebase ID token to the existing server-authorized API
routes for commands. The API base URL currently targets the production Vercel
deployment.

Treat this target as high risk until its authentication, database-rule behavior
and command routes have been exercised against a dedicated Firebase test app.
Do not place service-account credentials in the app bundle and do not weaken
database rules for the native client.

