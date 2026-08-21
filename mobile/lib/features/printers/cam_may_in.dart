import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// Khung xem camera trong máy in.
///
/// App không đọc được MJPEG nên dùng chế độ ảnh tĩnh của route camera, xin lại mỗi 2 giây. Máy in
/// vốn chỉ đẩy ~0,4 hình/giây nên nhịp này đã dư, xin dày hơn cũng chỉ nhận lại đúng hình cũ.
///
/// Cố ý **không tự bật**: mỗi người xem là một kết nối tới máy in, mà firmware giới hạn số client
/// camera. Bấm mới xem, và rời màn hình là huỷ luôn hẹn giờ.
class CamMayIn extends StatefulWidget {
  const CamMayIn({super.key, required this.baseUrl, required this.may, this.tenMay});

  final String baseUrl;

  /// `cloudPrinterId` — khoá để máy chủ tìm ra IP và Access Code của máy in.
  final String? may;
  final String? tenMay;

  @override
  State<CamMayIn> createState() => _CamMayInState();
}

class _CamMayInState extends State<CamMayIn> {
  Timer? _hen;
  int _nhip = 0;
  bool _dangXem = false;
  bool _loi = false;

  @override
  void dispose() {
    _hen?.cancel();
    super.dispose();
  }

  void _bat() {
    setState(() {
      _loi = false;
      _dangXem = true;
      _nhip++;
    });
    _hen?.cancel();
    _hen = Timer.periodic(const Duration(seconds: 2), (_) {
      if (mounted) setState(() => _nhip++);
    });
  }

  void _tat() {
    _hen?.cancel();
    _hen = null;
    setState(() => _dangXem = false);
  }

  String get _url {
    final goc = widget.baseUrl.endsWith('/')
        ? widget.baseUrl.substring(0, widget.baseUrl.length - 1)
        : widget.baseUrl;
    // `t` chỉ để phá cache — thiếu nó là app hiện mãi một tấm hình.
    return '$goc/api/printers/camera?may=${Uri.encodeComponent(widget.may!)}&anh=1&t=$_nhip';
  }

  @override
  Widget build(BuildContext context) {
    if (widget.may == null || widget.may!.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text(
              'CAMERA',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.1,
                color: AppColors.muted,
              ),
            ),
            const Spacer(),
            TextButton.icon(
              onPressed: _dangXem ? _tat : _bat,
              icon: Icon(_dangXem ? Icons.videocam_off_rounded : Icons.videocam_rounded, size: 16),
              label: Text(_dangXem ? 'Tắt' : 'Xem camera', style: const TextStyle(fontSize: 12.5)),
            ),
          ],
        ),
        if (_dangXem)
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: _loi
                ? Container(
                    height: 120,
                    color: Colors.black,
                    alignment: Alignment.center,
                    child: TextButton(
                      onPressed: _bat,
                      child: const Text('Không mở được camera. Thử lại'),
                    ),
                  )
                : Image.network(
                    _url,
                    // Giữ hình cũ trong lúc tải hình mới, nếu không thì cứ 2 giây lại nháy đen một cái.
                    gaplessPlayback: true,
                    fit: BoxFit.cover,
                    width: double.infinity,
                    errorBuilder: (_, __, ___) {
                      // Khung đầu mất tới ~7 giây (bắt tay TLS + chờ hình); đừng vội kêu lỗi.
                      if (_nhip > 5 && !_loi) {
                        WidgetsBinding.instance.addPostFrameCallback((_) {
                          if (mounted) setState(() => _loi = true);
                        });
                      }
                      return Container(
                        height: 120,
                        color: Colors.black,
                        alignment: Alignment.center,
                        child: const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      );
                    },
                  ),
          ),
        if (_dangXem)
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text(
              'Camera A1/P1 chỉ đẩy khoảng 0,4 hình/giây — giật là bình thường.',
              style: TextStyle(fontSize: 11, color: AppColors.muted),
            ),
          ),
      ],
    );
  }
}
