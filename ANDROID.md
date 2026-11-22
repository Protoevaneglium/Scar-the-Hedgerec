# Android v0.0.3

[Download the signed APK](https://github.com/Protoevaneglium/Scar-the-Hedgerec/releases/download/v0.0.3/scar-the-hedgerec-v0.0.3.apk).

The cyan-and-green Android launcher icon uses Scar’s game sprite and the title “Scar the Hedgrec”. The full thumbnail is also available in `public/assets/scar_thumbnail.png`; generation prompts are recorded in `ARTWORK.json`.

The APK includes all six campaign acts, the intro, music, voices and sprite sheets. It runs offline on Android 8.0/API 26 or newer and uses the device's Android System WebView. Touch controls support simultaneous movement and jumping. The existing Xbox/standard Gamepad API controls are retained.

The current act and checkpoint are saved automatically. After a reload, renderer retry or app recreation, pressing Start continues from that safe checkpoint. Score, lives and shield are retained; rings, act time and temporary power-ups restart. Completed acts remain completed even if the app restarts during the sign or results tally. Existing v0.0.1 visited acts migrate on update.

Switching away pauses the game and audio. Returning shows Resume; held inputs cannot skip that screen. Android Back closes Rosie's conversation, then pauses gameplay; pressing Back while paused offers Exit. The host preserves local progress and provides Retry if the WebView renderer stops.

## Build and test

Install Node.js, JDK 21 or newer, Android SDK platform 35 and build-tools 36.0.0. Set `JAVA_HOME` and `ANDROID_HOME`; on Windows the build script also recognizes Android Studio's bundled JDK and the SDK in `Documents/SDK`. The pinned Gradle wrapper validates its distribution checksum.

```sh
npm run build:android
npm run verify:apk
```

The first signed build creates `output/android-signing/scar-release.jks` and its local credentials. Keep this directory for future updates; Android requires the same signing key. It is ignored by Git and is never included in the APK or GitHub download. An existing signing setup can instead supply `SCAR_KEYSTORE_PATH`, `SCAR_KEYSTORE_PASSWORD`, `SCAR_KEY_ALIAS` and `SCAR_KEY_PASSWORD`.

The signed APK is `android/app/build/outputs/apk/release/app-release.apk`. Media files remain uncompressed inside it so local range requests and seeking work. `apk-source.json` records every bundled file and its SHA-256; `verify:apk` compares the actual APK entries with the tested source bytes.

Build and run device tests against an isolated emulator:

```sh
npm run build:android -- assembleRelease assembleReleaseAndroidTest lintRelease
npm run test:android -- emulator-5580
```

The test runner targets the named emulator only. It tests the signed release build, dispatches native MotionEvents through its actual WebView, compares media ranges byte for byte, and writes results to `output/qa/android-device.json`. Physical devices, OS-level touch routing and Bluetooth controller hardware require separate checks. Web/core adversarial checks run with `npm run verify:baseline -- --stress`. APK signatures are additionally checked with the SDK's `apksigner verify --verbose --print-certs` before publication. GitHub Actions separately compiles the Android shell and runs lint without receiving the private release key.

GitHub Actions also runs these device checks on a Linux Android 15 emulator and retains the QA reports and screenshots. CI generates a disposable signing key for its own test build; the downloadable APK uses the private local release key.

The native host follows Android's [local WebView content guidance](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content), uses an HTTPS asset origin, and has no Internet, storage, microphone or location permission. External navigation is blocked. Release metadata lives in `release.json`.
