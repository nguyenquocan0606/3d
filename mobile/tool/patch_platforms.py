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
    - Deployment target >= 13 (mobile_scanner yêu cầu >= 12), nhưng không bao
      giờ thấp hơn mức mà bản Flutter đang dùng yêu cầu — pod "Flutter" sẽ
      không giải được nếu Podfile khai thấp hơn nó.

Chạy lại nhiều lần được (idempotent).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MIN_SDK = 29

# Sàn của dự án. Mức thực tế = max(sàn này, mức Flutter/Xcode template yêu cầu),
# xem ios_deployment_target().
IOS_TARGET_FLOOR = "13.0"


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


def _version_key(value: str) -> tuple[int, ...]:
    return tuple(int(part) for part in re.findall(r"\d+", value)) or (0,)


def ios_deployment_target() -> str:
    """Mức iOS tối thiểu an toàn cho dự án.

    Hardcode một con số là cái bẫy: mỗi lần Flutter nâng mức tối thiểu, `pod
    install` sẽ báo "Specs satisfying the `Flutter` dependency were found, but
    they required a higher minimum deployment target". Nên lấy mức cao nhất
    trong: sàn dự án, MinimumOSVersion của AppFrameworkInfo.plist, dòng
    `platform :ios` (kể cả đang bị comment) mà `flutter create` vừa sinh ra, và
    IPHONEOS_DEPLOYMENT_TARGET trong project.pbxproj — ba nguồn sau đều do bản
    Flutter/Xcode hiện tại quyết định.
    """
    candidates = [IOS_TARGET_FLOOR]

    plist = ROOT / "ios/Flutter/AppFrameworkInfo.plist"
    if plist.exists():
        found = re.search(
            r"<key>MinimumOSVersion</key>\s*<string>([\d.]+)</string>",
            plist.read_text(encoding="utf-8"),
        )
        if found:
            candidates.append(found.group(1))

    podfile = ROOT / "ios/Podfile"
    if podfile.exists():
        found = re.search(
            r"^\s*#?\s*platform :ios,\s*'([\d.]+)'",
            podfile.read_text(encoding="utf-8"),
            flags=re.M,
        )
        if found:
            candidates.append(found.group(1))

    pbxproj = ROOT / "ios/Runner.xcodeproj/project.pbxproj"
    if pbxproj.exists():
        candidates += re.findall(
            r"IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);",
            pbxproj.read_text(encoding="utf-8"),
        )

    return max(candidates, key=_version_key)


def patch_ios_podfile(target: str) -> None:
    podfile = ROOT / "ios/Podfile"
    if not podfile.exists():
        fail("Không tìm thấy ios/Podfile (bỏ qua nếu không build iOS)")
        return

    text = podfile.read_text(encoding="utf-8")
    original = text

    if re.search(r"^\s*#\s*platform :ios", text, flags=re.M):
        text = re.sub(
            r"^\s*#\s*platform :ios.*$",
            f"platform :ios, '{target}'",
            text,
            count=1,
            flags=re.M,
        )
    elif re.search(r"^platform :ios", text, flags=re.M):
        text = re.sub(
            r"^platform :ios.*$",
            f"platform :ios, '{target}'",
            text,
            count=1,
            flags=re.M,
        )
    else:
        # Podfile không có dòng nào để thay — chèn lên đầu.
        text = f"platform :ios, '{target}'\n" + text

    if text != original:
        podfile.write_text(text, encoding="utf-8")
        ok(f"Podfile: platform :ios, '{target}'")
    else:
        ok(f"Podfile: deployment target đã là {target}")


def patch_ios_project(target: str) -> None:
    """Đồng bộ IPHONEOS_DEPLOYMENT_TARGET của Runner với Podfile.

    Pod đã được post_install của Flutter nâng lên, nhưng target Runner thì
    không — lệch hai bên là lỗi link lúc build.
    """
    pbxproj = ROOT / "ios/Runner.xcodeproj/project.pbxproj"
    if not pbxproj.exists():
        fail("Không tìm thấy ios/Runner.xcodeproj/project.pbxproj")
        return

    text = pbxproj.read_text(encoding="utf-8")
    patched = re.sub(
        r"IPHONEOS_DEPLOYMENT_TARGET = [\d.]+;",
        f"IPHONEOS_DEPLOYMENT_TARGET = {target};",
        text,
    )

    if patched != text:
        pbxproj.write_text(patched, encoding="utf-8")
        ok(f"project.pbxproj: IPHONEOS_DEPLOYMENT_TARGET = {target}")
    else:
        ok(f"project.pbxproj: deployment target đã là {target}")


def main() -> None:
    print("Android:")
    patch_android_gradle()
    patch_android_manifest()
    print("iOS:")
    patch_ios_plist()
    target = ios_deployment_target()
    patch_ios_podfile(target)
    patch_ios_project(target)


if __name__ == "__main__":
    main()
