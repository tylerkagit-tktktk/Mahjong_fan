#!/bin/sh
set -eu

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}"
IOS_DIR="$REPO_ROOT/ios"
FIREBASE_PLIST="$IOS_DIR/GoogleService-Info.plist"
TEMP_PLIST="$IOS_DIR/.GoogleService-Info.plist.tmp"

cd "$REPO_ROOT"

if ! command -v npm >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "error: npm is missing and Homebrew is unavailable." >&2
    exit 1
  fi
  echo "==> Installing Node.js"
  brew install node
  export PATH="$(brew --prefix)/bin:$PATH"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm is still unavailable after installing Node.js." >&2
  exit 1
fi

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
# either an encoded value as a secret workflow environment variable.
if [ -n "${FIREBASE_IOS_PLIST_HEX:-}" ]; then
  trap 'rm -f "$TEMP_PLIST"' EXIT
  if ! command -v xxd >/dev/null 2>&1; then
    echo "error: xxd is required to decode FIREBASE_IOS_PLIST_HEX." >&2
    exit 1
  fi
  hex_value=$(printf '%s' "$FIREBASE_IOS_PLIST_HEX" | tr -d '[:space:]')
  case "$hex_value" in
    ''|*[!0123456789abcdefABCDEF]*)
      echo "error: FIREBASE_IOS_PLIST_HEX contains non-hex characters." >&2
      exit 1
      ;;
  esac
  hex_length=$(printf '%s' "$hex_value" | wc -c | tr -d ' ')
  if [ $((hex_length % 2)) -ne 0 ]; then
    echo "error: FIREBASE_IOS_PLIST_HEX has an odd number of characters." >&2
    exit 1
  fi
  printf '%s' "$hex_value" | xxd -r -p > "$TEMP_PLIST"
  /usr/bin/plutil -lint "$TEMP_PLIST"
  mv "$TEMP_PLIST" "$FIREBASE_PLIST"
elif [ -n "${FIREBASE_IOS_PLIST_BASE64:-}" ]; then
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
lockfile_pod_version=""
if [ -f "$IOS_DIR/Podfile.lock" ]; then
  lockfile_pod_version=$(awk '$1 == "COCOAPODS:" { print $2; exit }' "$IOS_DIR/Podfile.lock")
fi
installed_pod_version=$(pod --version 2>/dev/null || true)

if [ -n "$lockfile_pod_version" ] && [ "$installed_pod_version" != "$lockfile_pod_version" ]; then
  echo "warning: CocoaPods $installed_pod_version differs from Podfile.lock ($lockfile_pod_version); using the committed dependency lock without deployment mode."
  pod install --no-repo-update
else
  pod install --deployment --no-repo-update
fi
