# Building Folio for Android

Android is not built by `pnpm app:build` — it needs its own toolchain and its
own command. Nothing in the app has to change; the setup below is one-time.

## 1. Install the toolchain

```bash
# JDK 17 — Gradle 8 does not run on newer JDKs
brew install openjdk@17
sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk \
             /Library/Java/JavaVirtualMachines/openjdk-17.jdk

# Android SDK command-line tools and the NDK
brew install --cask android-commandlinetools
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "ndk;27.1.12297006"
```

On Linux, install the same three pieces from your distribution or from
[developer.android.com](https://developer.android.com/studio#command-line-tools-only).

## 2. Point the environment at them

Add to `~/.zshrc` (or `~/.bashrc`):

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.1.12297006"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

`ANDROID_HOME` differs by installer — Homebrew's cask puts the SDK under
`/opt/homebrew/share/android-commandlinetools`. Use whichever directory actually
contains `platform-tools`.

## 3. Add the Rust targets

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi \
                  i686-linux-android x86_64-linux-android
```

## 4. Generate the Android project

From the repository root, once:

```bash
pnpm android:init
```

This writes `src-tauri/gen/android/`. It is generated output and is gitignored;
re-run the command on a fresh clone.

## 5. Run and build

```bash
pnpm android:dev              # on a connected device or running emulator
pnpm android:build            # release APK + AAB
pnpm android:build --apk      # APK only
```

Artifacts land in
`src-tauri/gen/android/app/build/outputs/`.

## Things that differ on Android

**CBR comics are unavailable.** The RAR decoder is a C++ library that does not
cross-compile cleanly against the NDK, so it is compiled out of Android builds
automatically — no extra flags. CBZ, CBT, EPUB, PDF and MOBI all work. Convert
CBR to CBZ if you need it on a phone.

**Importing books** uses the system file picker. Folio copies each book into its
own app-data directory, so a file picked from Downloads keeps working after the
original is deleted.

**The sync folder** must be a directory the app can read and write. A folder
inside the app's own storage that a sync client (Syncthing, for instance)
mirrors is the arrangement that works most reliably; cloud providers that expose
files only through a document provider may not be readable as a plain path.

## Signing a release

`tauri android build` expects a keystore described in
`src-tauri/gen/android/keystore.properties`:

```properties
storeFile=/absolute/path/to/upload-keystore.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

Create one with:

```bash
keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA \
        -keysize 2048 -validity 10000 -alias upload
```

Keep the keystore and its passwords out of the repository — Play Store updates
are impossible without the original key.
