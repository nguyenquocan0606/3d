#!/usr/bin/env python3
"""Vá cấu hình native sau khi `flutter create` sinh ra android/ và ios/.

Những thứ script này bảo đảm:
  Android
    - minSdk = 29 (Android 10 trở lên, theo yêu cầu dự án)
    - quyền CAMERA (mobile_scanner) + INTERNET
    - cho phép HTTP thường (cleartext) vì máy chủ trong LAN chạy http://
  iOS
    - NSCameraUsageDescription (bắt buộc, thiếu là App Store từ chối)
    - NSAppTransportSecurity cho phép gọi http:// tới máy chủ LAN
    - NSLocalNetworkUsageDescription (iOS 14+ hỏi quyền khi truy cập LAN)
    - Deployment target iOS 13 (mobile_scanner yêu cầu >= 12)

Chạy lại nhiều lần được (idempotent).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MIN_SDK = 29
IOS_TARGET = "13.0"


def fail(message: str) -> None:
    print(f"  ✖ {message}", file=sys.stderr)


def ok(message: str) -> None:
    print(f"  ✓ {message}")


# ── Android ──────────────────────────────────────────────────────────────────

def patch_android_gradle() -> None:
    """Đặt minSdk = 29 trong build.gradle(.kts) của module app."""
    candidates = [
        ROOT / "android/app/build.gradle.kts",
        ROOT / "android/app/build.gradle",
    ]
    gradle = next((p for p in candidates if p.exists()), None)
    if gradle is None:
        fail("Không tìm thấy android/app/build.gradle(.kts)")
        return

    text = gradle.read_text(encoding="utf-8")
    original = text

    # Flutter mặc định sinh `minSdk = flutter.minSdkVersion` (kts)
    # hoặc `minSdkVersion flutter.minSdkVersion` (groovy).
    text = re.sub(r"minSdk\s*=\s*[^\n]+", f"minSdk = {MIN_SDK}", text)
    text = re.sub(r"minSdkVersion\s+[^\n]+", f"minSdkVersion {MIN_SDK}", text)

    if text != original:
        gradle.write_text(text, encoding="utf-8")
        ok(f"{gradle.relative_to(ROOT)}: minSdk = {MIN_SDK}")
    else:
        ok(f"{gradle.relative_to(ROOT)}: minSdk đã đúng")


def patch_android_manifest() -> None:
    manifest = ROOT / "android/app/src/main/AndroidManifest.xml"
    if not manifest.exists():
        fail("Không tìm thấy AndroidManifest.xml")
        return

    text = manifest.read_text(encoding="utf-8")
    original = text

    permissions = [
        '<uses-permission android:name="android.permission.INTERNET"/>',
        '<uses-permission android:name="android.permission.CAMERA"/>',
        '<uses-feature android:name="android.hardware.camera" android:required="false"/>',
    ]
    missing = [p for p in permissions if p.split('name="')[1].split('"')[0] not in text]
    if missing:
        text = text.replace(
            "<application",
            "\n".join(f"    {p}" for p in missing) + "\n\n    <application",
            1,
        )

    # Máy chủ LAN chạy http:// nên Android 9+ chặn nếu không bật cleartext.
    if "usesCleartextTraffic" not in text:
        text = text.replace("<application", '<application\n        android:usesCleartextTraffic="true"', 1)

    if text != original:
        manifest.write_text(text, encoding="utf-8")
        ok("AndroidManifest.xml: thêm quyền camera/internet + cleartext")
    else:
        ok("AndroidManifest.xml: đã đủ cấu hình")


# ── iOS ──────────────────────────────────────────────────────────────────────

IOS_KEYS = """	<key>NSCameraUsageDescription</key>
	<string>App dùng camera để quét mã QR/barcode của cuộn nhựa, kho, tem đơn hàng và hàng hóa.</string>
	<key>NSLocalNetworkUsageDescription</key>
	<string>App kết nối tới máy chủ 3D Manage và trạm cân trong mạng nội bộ của xưởng.</string>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsLocalNetworking</key>
		<true/>
		<key>NSAllowsArbitraryLoads</key>
		<true/>
	</dict>
"""


def patch_ios_plist() -> None:
    plist = ROOT / "ios/Runner/Info.plist"
    if not plist.exists():
        fail("Không tìm thấy ios/Runner/Info.plist (bỏ qua nếu không build iOS)")
        return

    text = plist.read_text(encoding="utf-8")
    if "NSCameraUsageDescription" in text:
        ok("Info.plist: đã có sẵn các key cần thiết")
        return

    # Chèn ngay trước </dict> cuối cùng của plist.
    index = text.rstrip().rfind("</dict>")
    if index == -1:
        fail("Info.plist có cấu trúc lạ, không chèn được")
        return

    text = text[:index] + IOS_KEYS + text[index:]
    plist.write_text(text, encoding="utf-8")
    ok("Info.plist: thêm quyền camera + local network + ATS")


def patch_ios_podfile() -> None:
    podfile = ROOT / "ios/Podfile"
    if not podfile.exists():
        fail("Không tìm thấy ios/Podfile (bỏ qua nếu không build iOS)")
        return

    text = podfile.read_text(encoding="utf-8")
    original = text

    if re.search(r"^\s*#\s*platform :ios", text, flags=re.M):
        text = re.sub(
            r"^\s*#\s*platform :ios.*$",
            f"platform :ios, '{IOS_TARGET}'",
            text,
            count=1,
            flags=re.M,
        )
    else:
        text = re.sub(
            r"^platform :ios.*$",
            f"platform :ios, '{IOS_TARGET}'",
            text,
            count=1,
            flags=re.M,
        )

    if text != original:
        podfile.write_text(text, encoding="utf-8")
        ok(f"Podfile: platform :ios, '{IOS_TARGET}'")
    else:
        ok("Podfile: deployment target đã đúng")


def main() -> None:
    print("Android:")
    patch_android_gradle()
    patch_android_manifest()
    print("iOS:")
    patch_ios_plist()
    patch_ios_podfile()


if __name__ == "__main__":
    main()
