#!/usr/bin/env python3
"""Vá cấu hình native sau khi `flutter create` sinh ra android/ và ios/.

Những thứ script này bảo đảm:
  Android
    - minSdk = 29 (Android 10 trở lên, theo yêu cầu dự án)
    - quyền CAMERA (mobile_scanner) + INTERNET + POST_NOTIFICATIONS (thông báo đẩy)
    - plugin google-services CHỈ khi đã có android/app/google-services.json
    - core library desugaring (flutter_local_notifications bắt buộc)
    - cho phép HTTP thường (cleartext) vì máy chủ trong LAN chạy http://
  iOS
    - NSCameraUsageDescription (bắt buộc, thiếu là App Store từ chối)
    - NSPhotoLibraryUsageDescription (chọn ảnh sản phẩm cho phiếu báo giá)
    - NSAppTransportSecurity cho phép gọi http:// tới máy chủ LAN
    - NSLocalNetworkUsageDescription (iOS 14+ hỏi quyền khi truy cập LAN)
    - UIBackgroundModes: remote-notification (nhận push lúc app ở nền)
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
        # Android 13+ bắt buộc xin quyền này, thiếu là thông báo im lặng biến mất.
        '<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>',
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
        ok("AndroidManifest.xml: thêm quyền camera/internet/thông báo + cleartext")
    else:
        ok("AndroidManifest.xml: đã đủ cấu hình")


DESUGAR_VERSION = "2.1.5"


def patch_android_desugaring() -> None:
    """Bật core library desugaring.

    `flutter_local_notifications` (dùng để hiện thông báo lúc app đang mở) từ chối build nếu thiếu:
    "Dependency ':flutter_local_notifications' requires core library desugaring to be enabled".
    Đây là vá bắt buộc, không phải tùy chọn.
    """
    candidates = [
        ROOT / "android/app/build.gradle.kts",
        ROOT / "android/app/build.gradle",
    ]
    gradle = next((p for p in candidates if p.exists()), None)
    if gradle is None:
        fail("Không tìm thấy android/app/build.gradle(.kts)")
        return

    text = gradle.read_text(encoding="utf-8")
    if "coreLibraryDesugaring" in text:
        ok(f"{gradle.relative_to(ROOT)}: đã bật core library desugaring")
        return

    kts = gradle.suffix == ".kts"
    bat = (
        "        isCoreLibraryDesugaringEnabled = true"
        if kts
        else "        coreLibraryDesugaringEnabled true"
    )
    phuThuoc = (
        f'    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:{DESUGAR_VERSION}")'
        if kts
        else f"    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:{DESUGAR_VERSION}'"
    )

    moc = re.search(r"^\s*compileOptions\s*\{\s*$", text, flags=re.M)
    if moc is None:
        fail(f"{gradle.relative_to(ROOT)}: không thấy khối compileOptions, thêm tay: {bat.strip()}")
        return
    text = text[: moc.end()] + "\n" + bat + text[moc.end() :]

    # `dependencies` của module app do Flutter sinh ra thất thường (có bản không có khối này) —
    # không tìm thấy thì thêm hẳn một khối mới ở cuối file, Gradle gộp lại như nhau.
    dep = re.search(r"^dependencies\s*\{\s*$", text, flags=re.M)
    if dep is None:
        text = text.rstrip() + "\n\ndependencies {\n" + phuThuoc + "\n}\n"
    else:
        text = text[: dep.end()] + "\n" + phuThuoc + text[dep.end() :]

    gradle.write_text(text, encoding="utf-8")
    ok(f"{gradle.relative_to(ROOT)}: bật core library desugaring {DESUGAR_VERSION}")


GOOGLE_SERVICES_VERSION = "4.4.3"


def patch_android_google_services() -> None:
    """Bật plugin google-services — chỉ khi file cấu hình Firebase đã nằm đúng chỗ.

    Cố tình có điều kiện: plugin này ĐÒI android/app/google-services.json, thiếu là build gãy ngay
    với thông báo khó hiểu. Chưa ai tải file từ Firebase Console về thì cứ để app build bình thường
    và chạy không có push (PushService tự nuốt lỗi), hơn là chặn cả việc build APK.

    Phải vá HAI chỗ: khai version ở settings.gradle.kts (kiểu plugins DSL mà Flutter đang dùng) và
    apply ở app/build.gradle.kts. Thiếu chỗ đầu thì Gradle báo "Plugin ... was not found".
    """
    config = ROOT / "android/app/google-services.json"
    if not config.exists():
        ok("google-services.json: chưa có → bỏ qua plugin Firebase (app vẫn build, không có push)")
        return

    _patch_settings_gradle()
    _patch_app_gradle_plugin()


def _patch_settings_gradle() -> None:
    settings = ROOT / "android/settings.gradle.kts"
    if not settings.exists():
        fail("Không tìm thấy android/settings.gradle.kts")
        return

    text = settings.read_text(encoding="utf-8")
    if "com.google.gms.google-services" in text:
        ok("settings.gradle.kts: đã khai google-services")
        return

    dong = f'    id("com.google.gms.google-services") version "{GOOGLE_SERVICES_VERSION}" apply false'
    moc = re.search(r'^\s*id\("com\.android\.application"\).*$', text, flags=re.M)
    if moc is None:
        fail("settings.gradle.kts: không thấy khối plugins, thêm tay dòng: " + dong.strip())
        return

    text = text[: moc.end()] + "\n" + dong + text[moc.end() :]
    settings.write_text(text, encoding="utf-8")
    ok("settings.gradle.kts: khai google-services " + GOOGLE_SERVICES_VERSION)


def _patch_app_gradle_plugin() -> None:
    candidates = [
        ROOT / "android/app/build.gradle.kts",
        ROOT / "android/app/build.gradle",
    ]
    gradle = next((p for p in candidates if p.exists()), None)
    if gradle is None:
        fail("Không tìm thấy android/app/build.gradle(.kts)")
        return

    text = gradle.read_text(encoding="utf-8")
    if "com.google.gms.google-services" in text:
        ok(f"{gradle.relative_to(ROOT)}: đã bật plugin google-services")
        return

    if gradle.suffix == ".kts":
        dong = '    id("com.google.gms.google-services")'
        moc = re.search(r'^\s*id\("dev\.flutter\.flutter-gradle-plugin"\)\s*$', text, flags=re.M)
    else:
        dong = "    id 'com.google.gms.google-services'"
        moc = re.search(r"^\s*id ['\"]dev\.flutter\.flutter-gradle-plugin['\"]\s*$", text, flags=re.M)

    if moc is None:
        fail(f"{gradle.relative_to(ROOT)}: không thấy plugin Flutter, thêm tay dòng: {dong.strip()}")
        return

    # Phải đứng SAU plugin Flutter, đúng thứ tự tài liệu Firebase yêu cầu.
    text = text[: moc.end()] + "\n" + dong + text[moc.end() :]
    gradle.write_text(text, encoding="utf-8")
    ok(f"{gradle.relative_to(ROOT)}: bật plugin google-services")


# ── iOS ──────────────────────────────────────────────────────────────────────

# Từng key một, để lần chạy sau vẫn bù được key mới thêm vào script mà không phải xóa Info.plist.
IOS_KEYS = {
    "NSCameraUsageDescription": """	<key>NSCameraUsageDescription</key>
	<string>App dùng camera để quét mã QR/barcode của cuộn nhựa, kho, tem đơn hàng và hàng hóa.</string>
""",
    # image_picker: chọn ảnh sản phẩm gắn vào hạng mục báo giá. Thiếu key là app văng khi mở thư viện ảnh.
    "NSPhotoLibraryUsageDescription": """	<key>NSPhotoLibraryUsageDescription</key>
	<string>App lấy ảnh sản phẩm trong thư viện để gắn vào phiếu báo giá gửi khách.</string>
""",
    "NSLocalNetworkUsageDescription": """	<key>NSLocalNetworkUsageDescription</key>
	<string>App kết nối tới máy chủ 3D Manage và trạm cân trong mạng nội bộ của xưởng.</string>
""",
    "NSAppTransportSecurity": """	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsLocalNetworking</key>
		<true/>
		<key>NSAllowsArbitraryLoads</key>
		<true/>
	</dict>
""",
    # Thiếu key này thì iOS không đánh thức app khi có thông báo lúc app ở nền.
    "UIBackgroundModes": """	<key>UIBackgroundModes</key>
	<array>
		<string>remote-notification</string>
	</array>
""",
}


def patch_ios_plist() -> None:
    plist = ROOT / "ios/Runner/Info.plist"
    if not plist.exists():
        fail("Không tìm thấy ios/Runner/Info.plist (bỏ qua nếu không build iOS)")
        return

    text = plist.read_text(encoding="utf-8")
    thieu = [xml for key, xml in IOS_KEYS.items() if f"<key>{key}</key>" not in text]
    if not thieu:
        ok("Info.plist: đã có sẵn các key cần thiết")
        return

    # Chèn ngay trước </dict> cuối cùng của plist.
    index = text.rstrip().rfind("</dict>")
    if index == -1:
        fail("Info.plist có cấu trúc lạ, không chèn được")
        return

    plist.write_text(text[:index] + "".join(thieu) + text[index:], encoding="utf-8")
    ok(f"Info.plist: thêm {len(thieu)} key (camera, thư viện ảnh, LAN, ATS, nhận thông báo nền)")


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


# ── Dọn rác của flutter create ───────────────────────────────────────────────


def remove_template_widget_test() -> None:
    """Xóa `test/widget_test.dart` mẫu do `flutter create` sinh ra.

    File mẫu gọi `MyApp()`, còn app này tên `Manage3DApp` — để lại thì
    `flutter analyze` báo lỗi và `flutter test` chạy hỏng. Nó không nằm trong
    git nên chỉ mọc lên ở máy nào đã chạy setup_platforms, khiến lỗi trông như
    "chỉ máy tôi mới bị".

    Chỉ xóa khi đúng là file mẫu: kiểm tra có gọi `MyApp` không, để lỡ sau này
    ai viết widget test thật thì không bị mất.
    """
    f = ROOT / "test/widget_test.dart"
    if not f.exists():
        ok("test/widget_test.dart: không có (tốt)")
        return

    if "MyApp" not in f.read_text(encoding="utf-8"):
        ok("test/widget_test.dart: là test tự viết, giữ nguyên")
        return

    f.unlink()
    ok("test/widget_test.dart: đã xóa file mẫu của flutter create")


def main() -> None:
    print("Android:")
    patch_android_gradle()
    patch_android_manifest()
    patch_android_desugaring()
    patch_android_google_services()
    print("iOS:")
    patch_ios_plist()
    target = ios_deployment_target()
    patch_ios_podfile(target)
    patch_ios_project(target)
    print("Dọn dẹp:")
    remove_template_widget_test()


if __name__ == "__main__":
    main()
