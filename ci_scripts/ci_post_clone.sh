#!/bin/sh
set -eu

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
IOS_DIR="$REPO_ROOT/ios"
FIREBASE_PLIST="$IOS_DIR/GoogleService-Info.plist"
TEMP_PLIST="$IOS_DIR/.GoogleService-Info.plist.tmp"

cd "$REPO_ROOT"

echo "==> Installing JavaScript dependencies"
npm ci --no-audit --no-fund

if ! command -v pod >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "error: CocoaPods is missing and Homebrew is unavailable." >&2
    exit 1
  fi
  echo "==> Installing CocoaPods"
  brew install cocoapods
fi

# Firebase config stays out of the public repository. Xcode Cloud must provide
# its base64 value as a secret workflow environment variable.
if [ -n "${FIREBASE_IOS_PLIST_BASE64:-}" ]; then
  trap 'rm -f "$TEMP_PLIST"' EXIT
  if ! printf '%s' "$FIREBASE_IOS_PLIST_BASE64" | base64 -D > "$TEMP_PLIST" 2>/dev/null; then
    printf '%s' "$FIREBASE_IOS_PLIST_BASE64" | base64 -d > "$TEMP_PLIST"
  fi
  /usr/bin/plutil -lint "$TEMP_PLIST"
  mv "$TEMP_PLIST" "$FIREBASE_PLIST"
elif [ ! -f "$FIREBASE_PLIST" ]; then
  echo "error: Missing ios/GoogleService-Info.plist." >&2
  echo "Set the secret workflow variable FIREBASE_IOS_PLIST_BASE64 in Xcode Cloud." >&2
  exit 1
fi

echo "==> Installing iOS dependencies"
cd "$IOS_DIR"
pod install --deployment
