#!/bin/sh
# Launcher script that runs the correct platform-specific binary

set -e

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/../dist"

# Detect platform and architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    PLATFORM="darwin"
    ;;
  Linux)
    PLATFORM="linux"
    ;;
  *)
    echo "taito-cli: Unsupported operating system: $OS" >&2
    echo "Supported platforms: macOS, Linux, Windows" >&2
    echo "You can build from source: https://github.com/danieldunderfelt/taito-cli" >&2
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64)
    ARCH="x64"
    ;;
  arm64|aarch64)
    ARCH="arm64"
    ;;
  *)
    echo "taito-cli: Unsupported architecture: $ARCH" >&2
    echo "Supported architectures: x64, arm64" >&2
    exit 1
    ;;
esac

BINARY_NAME="taito-${PLATFORM}-${ARCH}"
BINARY_PATH="$DIST_DIR/$BINARY_NAME"

if [ ! -f "$BINARY_PATH" ]; then
  echo "taito-cli: Binary not found: $BINARY_PATH" >&2
  echo "Try reinstalling: npm install -g taito-cli" >&2
  exit 1
fi

# Execute the binary with all arguments passed through
exec "$BINARY_PATH" "$@"
