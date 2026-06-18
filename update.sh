#!/bin/bash
MSG="${1:-Quick update}"
: "${EXPO_TOKEN:?EXPO_TOKEN must be set}"
EXPO_TOKEN="$EXPO_TOKEN" npx eas-cli update --channel preview --message "$MSG"
