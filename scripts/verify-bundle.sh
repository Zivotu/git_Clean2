#!/bin/bash
set -e
BUILD_ID=$1
BASE_URL=${2:-http://localhost:8788}

if [ -z "$BUILD_ID" ]; then
  echo "Usage: $0 <buildId> [baseUrl]"
  exit 1
fi

BUNDLE_URL="$BASE_URL/builds/$BUILD_ID/build/app.bundle.js"
echo "Fetching bundle from: $BUNDLE_URL"

CONTENT=$(curl -sS "$BUNDLE_URL")

HAS_BARE_REACT_IMPORT=false
if echo "$CONTENT" | grep -q 'from "react"'; then
  HAS_BARE_REACT_IMPORT=true
fi

HAS_JSX_DEV_RUNTIME=false
if echo "$CONTENT" | grep -q 'react/jsx-dev-runtime'; then
  HAS_JSX_DEV_RUNTIME=true
fi

HAS_ALIAS_AT_SIGN=false
if echo "$CONTENT" | grep -q 'from "@/'; then
  HAS_ALIAS_AT_SIGN=true
fi

echo "--- Verification Results ---"
echo "HasBareReactImport=$HAS_BARE_REACT_IMPORT"
echo "HasJsxDevRuntime=$HAS_JSX_DEV_RUNTIME"
echo "HasAliasAtSign=$HAS_ALIAS_AT_SIGN"

if [ "$HAS_BARE_REACT_IMPORT" = "true" ] || [ "$HAS_JSX_DEV_RUNTIME" = "true" ] || [ "$HAS_ALIAS_AT_SIGN" = "true" ]; then
  echo "Verification FAILED: Bundle is not self-contained."
  exit 1
else
  echo "Verification PASSED: Bundle is self-contained."
fi
