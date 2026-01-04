# Mobile Deployment (PWA + Capacitor)

This repo ships as a static Vite/React app. The fastest path to iOS/Android is a PWA plus a Capacitor native wrapper.

## Prerequisites
- Node 20+
- Xcode (for iOS builds)
- Android Studio (for Android builds)
- Apple Developer account (App Store)
- Google Play Console account (Play Store)

## 1) PWA Build
The PWA assets are already included:
- `public/manifest.webmanifest`
- `public/sw.js`
- `public/icons/app-icon.svg`

When you run `npm run build`, the service worker and manifest are copied into `dist/` automatically.

## 2) Capacitor Setup
Capacitor config is in `capacitor.config.ts`.

Install deps:
```bash
npm install
```

Build the web bundle:
```bash
npm run build
```

Initialize native platforms (one-time):
```bash
npx cap add ios
npx cap add android
```

Sync web build into native shells:
```bash
npm run cap:sync
```

## 3) iOS
Open the native project:
```bash
npm run cap:open:ios
```

In Xcode:
- Set signing team + bundle ID.
- Update app name and icon if desired.
- Product > Archive.
- Upload to App Store Connect.

## 4) Android
Open the native project:
```bash
npm run cap:open:android
```

In Android Studio:
- Update applicationId in `app/build.gradle` if needed.
- Build > Generate Signed Bundle/APK.
- Upload AAB to Play Console.

## 5) Runtime Data
The app uses the same hosted data as the web build. Data updates are handled by the GitHub Pages pipeline and do not require a native rebuild unless app code changes.

## 6) Icons and Splash
For production App Store / Play Store submissions, replace `public/icons/app-icon.svg` with proper PNG assets and generate native icons/splashes in Xcode/Android Studio.
