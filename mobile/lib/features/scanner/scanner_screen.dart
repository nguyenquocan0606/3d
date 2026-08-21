import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/config/app_settings.dart';
import '../../core/scan/pda_scan.dart';
import '../../core/scan/scan_input_mode.dart';
import '../../core/scan/scan_mode.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';

/// Màn quét dùng chung cho toàn app.
///
/// Chạy được hai kiểu máy tùy [ScanInputMode] đã chọn trong Cài đặt:
///  - **Camera**: khung ngắm `mobile_scanner`, dành cho điện thoại.
///  - **Máy PDA**: không mở camera, chỉ đứng chờ đầu đọc bắn mã vào. Ở chế độ này
///    người dùng thường không cần vào đây — bóp cò ngay tại màn nghiệp vụ là
///    xong (xem [PdaScanScope]) — nhưng vẫn giữ màn này cho các nút "Quét ..."
///    có sẵn và cho ô nhập tay.
///
/// Ô nhập tay dùng chung cho cả hai chế độ: camera bẩn/thiếu sáng thì gõ, còn
/// PDA thì bắn thẳng vào ô khi ô đang có con trỏ. [continuous] giữ màn mở sau mỗi
/// lần quét, phục vụ kiểm kho / kiểm hàng.
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
  /// Chỉ tồn tại ở chế độ camera — máy PDA không được mở camera làm gì cho tốn
  /// pin và khỏi phải xin quyền.
  MobileScannerController? _camera;

  /// Chốt một lần lúc mở màn thay vì `watch` liên tục: đổi chế độ giữa chừng phải
  /// đi qua [_switchMode] để còn kịp dựng/hủy controller camera.
  late bool _pda;

  final _manualController = TextEditingController();
  bool _torchOn = false;
  bool _busy = false;
  String? _feedback;
  bool _feedbackIsError = false;

  /// Chống quét trùng liên tiếp: cùng 1 mã phải cách nhau tối thiểu 1,2s.
  String? _lastCode;
  DateTime _lastAt = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    _pda = ref.read(appSettingsProvider).scanInputMode == ScanInputMode.pda;
    if (!_pda) _camera = _newCamera();
  }

  MobileScannerController _newCamera() => MobileScannerController(
        detectionSpeed: DetectionSpeed.noDuplicates,
        formats: const [
          BarcodeFormat.qrCode,
          BarcodeFormat.code128,
          BarcodeFormat.ean13,
        ],
      );

  /// Đổi chế độ ngay trong lúc đang quét (camera mờ, hoặc PDA hết pin) và nhớ
  /// luôn vào Cài đặt để lần sau mở là đúng chế độ.
  Future<void> _switchMode(ScanInputMode mode) async {
    final pda = mode == ScanInputMode.pda;
    if (pda == _pda) return;

    final old = _camera;
    setState(() {
      _pda = pda;
      _torchOn = false;
      _feedback = null;
      _camera = pda ? null : _newCamera();
    });
    // Hủy sau khi widget MobileScanner đã rời khỏi cây, tránh nó đụng vào
    // controller vừa bị hủy.
    if (old != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
    }

    await ref.read(appSettingsProvider.notifier).setScanInputMode(mode);
  }

  @override
  void dispose() {
    _camera?.dispose();
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

      // Quét tem khay AMS bật chế độ gán ngay giữa chừng: giữ màn mở để quét
      // tiếp từng cuộn, khỏi phải mở lại máy quét sau mỗi mã.
      final keepOpen = widget.continuous || ref.read(scanModeProvider) != null;

      if (!keepOpen) {
        // Màn quét đóng ngay sau đây nên hộp phản hồi trong màn không kịp đọc —
        // bắn toast ở tầng ScaffoldMessenger của app để nó sống qua cú pop.
        if (message != null && message.isNotEmpty) showToast(context, message);
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
    final background = _pda ? AppColors.background : Colors.black;

    return PdaScanScope(
      enabled: _pda,
      // _submit đã tự lo hiện kết quả và đóng màn, không cần toast chồng lên.
      showFeedback: false,
      onCode: (code) async {
        await _submit(code);
        return null;
      },
      child: Scaffold(
        backgroundColor: background,
        appBar: AppBar(
          backgroundColor: background,
          title: Text(widget.title),
          actions: [
            if (!_pda) ...[
              IconButton(
                tooltip: _torchOn ? 'Tắt đèn' : 'Bật đèn',
                onPressed: () async {
                  await _camera?.toggleTorch();
                  if (mounted) setState(() => _torchOn = !_torchOn);
                },
                icon: Icon(
                  _torchOn ? Icons.flash_on_rounded : Icons.flash_off_rounded,
                ),
              ),
              IconButton(
                tooltip: 'Đổi camera',
                onPressed: () => _camera?.switchCamera(),
                icon: const Icon(Icons.cameraswitch_rounded),
              ),
            ],
            IconButton(
              tooltip: _pda ? 'Chuyển sang quét bằng camera' : 'Chuyển sang máy PDA',
              onPressed: () => _switchMode(
                _pda ? ScanInputMode.camera : ScanInputMode.pda,
              ),
              icon: Icon(
                _pda ? Icons.photo_camera_rounded : Icons.qr_code_scanner_rounded,
              ),
            ),
          ],
        ),
        body: Column(
          children: [
            if (scanMode != null) _ScanModeBanner(mode: scanMode),
            Expanded(child: _pda ? _pdaWaiting() : _cameraView()),
            _manualRow(),
          ],
        ),
      ),
    );
  }

  Widget _cameraView() {
    final camera = _camera;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (camera != null)
          MobileScanner(controller: camera, onDetect: _handleDetection),
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
              if (_feedback != null) _feedbackBox(),
              Text(
                widget.hint ?? 'Đưa mã QR / barcode vào khung',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 13),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// Chế độ PDA: không có gì để nhìn, chỉ báo cho người quét biết máy đã sẵn sàng.
  Widget _pdaWaiting() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
      child: Column(
        children: [
          Icon(
            _busy ? Icons.hourglass_top_rounded : Icons.qr_code_scanner_rounded,
            size: 72,
            color: AppColors.indigoLight,
          ),
          const SizedBox(height: 16),
          Text(
            _busy ? 'Đang xử lý mã...' : 'Bóp cò trên máy PDA',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Text(
            widget.hint ?? 'Chĩa đầu đọc vào mã rồi bóp cò',
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.muted, height: 1.4),
          ),
          const SizedBox(height: 20),
          if (_feedback != null) _feedbackBox(),
          const SizedBox(height: 12),
          const Text(
            'Ở chế độ này không cần vào màn quét: đứng ngay màn đang làm rồi bóp '
            'cò là mã tự vào.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12.5,
              color: AppColors.muted,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _feedbackBox() {
    final color = _feedbackIsError ? AppColors.danger : AppColors.success;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        _feedback!,
        textAlign: TextAlign.center,
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
    );
  }

  /// Ô nhập tay — dùng chung cho cả hai chế độ.
  ///
  /// Không `autofocus` kể cả ở chế độ PDA: chạm vào ô là bàn phím ảo bung lên che
  /// nửa màn, trong khi máy PDA vốn không cần ô này. Ai muốn gõ thì tự chạm vào,
  /// lúc đó đầu đọc cũng bắn thẳng vào ô luôn.
  Widget _manualRow() {
    return Container(
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
