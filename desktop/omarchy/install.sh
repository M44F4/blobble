#!/bin/sh
# Puts Blobble's bar widget in Omarchy's plugin folder. The shell reloads it by itself.
# Then add "Blobble" to the bar like any widget: it is in the plugin list.
# Run again after an update to copy the new widget over.
set -e
here=$(cd "$(dirname "$0")" && pwd)
dest="${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/plugins"
mkdir -p "$dest"
rm -rf "$dest/m44f4.blobble"
cp -r "$here/m44f4.blobble" "$dest/m44f4.blobble"
echo "Installed m44f4.blobble in $dest"
command -v blobble >/dev/null || echo "Note: the widget runs 'blobble': put the app on your PATH (the .deb/.rpm/AppImage does)."
