import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Chế độ "quét hàng loạt" đang bật.
///
/// Port của `scanMode` trong `src/app/page.tsx`: sau khi mở 1 kho / máy in và bấm
/// "gán cuộn", mọi mã cuộn nhựa quét tiếp theo sẽ được gán (hoặc tháo) khỏi đích
/// đó cho tới khi người dùng thoát chế độ.
class ScanMode {
  const ScanMode({
    required this.target,
    required this.targetId,
    required this.targetName,
    required this.action,
    this.slot,
  });

  final ScanTarget target;
  final String targetId;
  final String targetName;
  final ScanAction action;

  /// Slot AMS khi gán cuộn vào 1 line cụ thể của máy in.
  final int? slot;

  String get description {
    final verb = action == ScanAction.add ? 'gắn vào' : 'tháo khỏi';
    final place = target == ScanTarget.location ? 'kho' : 'máy';
    final suffix = slot == null ? '' : ' (Line $slot)';
    return 'Quét QR cuộn nhựa để $verb $place $targetName$suffix';
  }
}

enum ScanTarget { location, printer }

enum ScanAction { add, remove }

class ScanModeNotifier extends Notifier<ScanMode?> {
  @override
  ScanMode? build() => null;

  void start(ScanMode mode) => state = mode;

  void clear() => state = null;
}

final scanModeProvider =
    NotifierProvider<ScanModeNotifier, ScanMode?>(ScanModeNotifier.new);
