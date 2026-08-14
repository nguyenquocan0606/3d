import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/scan/scan_mode.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';

/// Màn quét camera dùng chung cho toàn app.
///
/// Thay thế súng quét HID của bản web (bắt `keydown` toàn cục) — iPhone không có
/// bàn phím ngoài. Vẫn giữ ô nhập tay để dùng khi camera bẩn/thiếu sáng, và cho
/// phép quét liên tục ([continuous]) phục vụ kiểm kho / kiểm hàng.
class ScannerScreen extends ConsumerStatefulWidget {
  const ScannerScreen({
    super.key,
    this.title = 'Quét mã',
    this.hint,
    this.continuous = false,
    this.onCode,
  });

  final String title;
  final String? hint;

  /// true: không đóng màn sau mỗi lần quét (kiểm kho, kiểm hàng).
  final bool continuous;

  /// Trả về thông báo hiện lên màn quét, hoặc null nếu không cần.
  /// Bỏ trống thì màn hình pop và trả mã về cho caller.
  final Future<String?> Function(String code)? onCode;

  @override
  ConsumerState<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends ConsumerState<ScannerScreen> {
  late final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode, BarcodeFormat.code128, BarcodeFormat.ean13],
  );

  final _manualController = TextEditingController();
  bool _torchOn = false;
  bool _busy = false;
  String? _feedback;
  bool _feedbackIsError = false;

  /// Chống quét trùng liên tiếp: cùng 1 mã phải cách nhau tối thiểu 1,2s.
  String? _lastCode;
  DateTime _lastAt = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void dispose() {
    _controller.dispose();
    _manualController.dispose();
    super.dispose();
  }

  Future<void> _handleDetection(BarcodeCapture capture) async {
    final raw = capture.barcodes
        .map((b) => b.rawValue)
        .firstWhere((value) => value != null && value.trim().isNotEmpty,
            orElse: () => null);
    if (raw == null) return;

    final code = raw.trim();
    final now = DateTime.now();
    if (code == _lastCode && now.difference(_lastAt) < const Duration(milliseconds: 1200)) {
      return;
    }
    _lastCode = code;
    _lastAt = now;

    await _submit(code);
  }

  Future<void> _submit(String code) async {
    if (_busy || code.trim().isEmpty) return;
    setState(() => _busy = true);
    HapticFeedback.mediumImpact();

    try {
      if (widget.onCode == null) {
        if (mounted) Navigator.pop(context, code.trim());
        return;
      }

      final message = await widget.onCode!(code.trim());
      if (!mounted) return;

      if (!widget.continuous) {
        Navigator.pop(context, code.trim());
        return;
      }
      setState(() {
        _feedback = message;
        _feedbackIsError = false;
      });
    } catch (error) {
      if (!mounted) return;
      HapticFeedback.heavyImpact();
      setState(() {
        _feedback = '$error';
        _feedbackIsError = true;
      });
      if (!widget.continuous) {
        showToast(context, '$error', isError: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scanMode = ref.watch(scanModeProvider);

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: _torchOn ? 'Tắt đèn' : 'Bật đèn',
            onPressed: () async {
              await _controller.toggleTorch();
              if (mounted) setState(() => _torchOn = !_torchOn);
            },
            icon: Icon(_torchOn ? Icons.flash_on_rounded : Icons.flash_off_rounded),
          ),
          IconButton(
            tooltip: 'Đổi camera',
            onPressed: () => _controller.switchCamera(),
            icon: const Icon(Icons.cameraswitch_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          if (scanMode != null) _ScanModeBanner(mode: scanMode),
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                MobileScanner(controller: _controller, onDetect: _handleDetection),
                const _ScannerOverlay(),
                if (_busy)
                  Container(
                    color: Colors.black45,
                    child: const Center(child: CircularProgressIndicator()),
                  ),
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: 16,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_feedback != null)
                        Container(
                          width: double.infinity,
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: (_feedbackIsError ? AppColors.danger : AppColors.success)
                                .withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: (_feedbackIsError
                                      ? AppColors.danger
                                      : AppColors.success)
                                  .withValues(alpha: 0.5),
                            ),
                          ),
                          child: Text(
                            _feedback!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                      Text(
                        widget.hint ?? 'Đưa mã QR / barcode vào khung',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white70, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Container(
            color: AppColors.surfaceAlt,
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 12,
              bottom: MediaQuery.of(context).viewInsets.bottom + 16,
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _manualController,
                    textInputAction: TextInputAction.done,
                    autocorrect: false,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      hintText: 'Hoặc nhập mã bằng tay',
                      prefixIcon: Icon(Icons.keyboard_rounded),
                      isDense: true,
                    ),
                    onSubmitted: (value) {
                      _manualController.clear();
                      _submit(value);
                    },
                  ),
                ),
                const SizedBox(width: 10),
                FilledButton(
                  onPressed: _busy
                      ? null
                      : () {
                          final value = _manualController.text;
                          _manualController.clear();
                          _submit(value);
                        },
                  child: const Text('Tìm'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ScanModeBanner extends ConsumerWidget {
  const _ScanModeBanner({required this.mode});

  final ScanMode mode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Material(
      color: AppColors.indigo.withValues(alpha: 0.18),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
        child: Row(
          children: [
            const Icon(Icons.bolt_rounded, color: AppColors.indigoLight, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                mode.description,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
            TextButton(
              onPressed: () => ref.read(scanModeProvider.notifier).clear(),
              child: const Text('Thoát'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScannerOverlay extends StatelessWidget {
  const _ScannerOverlay();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Center(
        child: Container(
          width: 250,
          height: 250,
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.indigoLight, width: 3),
            borderRadius: BorderRadius.circular(20),
          ),
        ),
      ),
    );
  }
}
