#!/usr/bin/env bash
# Sinh phần native (android/, ios/) và vá sẵn cấu hình cần thiết cho app.
#
# Repo này chỉ chứa mã Dart — thư mục android/ và ios/ do `flutter create` sinh ra
# nên không commit. Chạy script này MỘT LẦN sau khi clone.
#
#   cd mobile && ./tool/setup_platforms.sh
#
# Yêu cầu: Flutter SDK >= 3.27, python3 (dùng để vá file cấu hình).

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if ! command -v flutter >/dev/null 2>&1; then
  echo "✖ Không tìm thấy Flutter SDK trong PATH." >&2
  exit 1
fi

echo "▸ Sao lưu mã nguồn trước khi flutter create..."
BACKUP="$(mktemp -d)"
cp -a lib pubspec.yaml "$BACKUP/"
[ -f analysis_options.yaml ] && cp -a analysis_options.yaml "$BACKUP/"

echo "▸ Sinh scaffold native (android + ios)..."
flutter create . \
  --project-name manage3d \
  --org click.quocan \
  --platforms=android,ios \
  --overwrite

echo "▸ Khôi phục mã nguồn..."
cp -a "$BACKUP/lib" "$ROOT/"
cp -a "$BACKUP/pubspec.yaml" "$ROOT/"
[ -f "$BACKUP/analysis_options.yaml" ] && cp -a "$BACKUP/analysis_options.yaml" "$ROOT/"
rm -rf "$BACKUP"

echo "▸ Vá cấu hình Android (minSdk 29 = Android 10) và quyền..."
python3 tool/patch_platforms.py

echo "▸ Tải dependencies..."
flutter pub get

echo
echo "✔ Xong. Chạy app:"
echo "    flutter run                 # thiết bị đang cắm"
echo "    flutter build apk --release # Android"
echo "    flutter build ipa           # iOS (cần macOS + Xcode)"
