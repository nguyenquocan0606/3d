import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_settings.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/printer.dart';
import '../../data/providers.dart';

/// Xem camera của tất cả máy in cùng lúc.
///
/// Dùng chế độ ảnh tĩnh của route camera thay vì MJPEG: app không đọc được MJPEG, mà máy in cũng
/// chỉ đẩy ~0,4 hình/giây nên xin lại mỗi 2 giây là ra đúng cùng trải nghiệm.
///
/// Hẹn giờ **dừng khi rời màn** — đây là màn ngốn pin và băng thông nhất trong app, để nó chạy nền
/// thì vừa hao pin vừa giữ kết nối tới máy in vô ích.
class TuongCameraScreen extends ConsumerStatefulWidget {
  const TuongCameraScreen({super.key});

  @override
  ConsumerState<TuongCameraScreen> createState() => _TuongCameraScreenState();
}

class _TuongCameraScreenState extends ConsumerState<TuongCameraScreen> {
  Timer? _hen;
  int _nhip = 0;
  bool _bat = false;
  String? _phongTo;

  @override
  void dispose() {
    _hen?.cancel();
    super.dispose();
  }

  void _doiTrangThai() {
    if (_bat) {
      _hen?.cancel();
      _hen = null;
      setState(() {
        _bat = false;
        _phongTo = null;
      });
      return;
    }
    setState(() {
      _bat = true;
      _nhip++;
    });
    _hen = Timer.periodic(const Duration(seconds: 2), (_) {
      if (mounted) setState(() => _nhip++);
    });
  }

  @override
  Widget build(BuildContext context) {
    final baseUrl = ref.watch(appSettingsProvider).baseUrl;
    final tatCa = ref.watch(printersProvider).valueOrNull ?? const <Printer>[];
    // Chỉ máy đã khai IP + Access Code mới có camera.
    final coCam = tatCa.where((p) => (p.lanIp?.isNotEmpty ?? false) && p.cloudPrinterId != null).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Camera máy in'),
        actions: [
          if (coCam.isNotEmpty)
            IconButton(
              tooltip: _bat ? 'Tắt tất cả' : 'Xem tất cả',
              onPressed: _doiTrangThai,
              icon: Icon(_bat ? Icons.videocam_off_rounded : Icons.videocam_rounded),
            ),
        ],
      ),
      body: coCam.isEmpty
          ? const EmptyView(
              message: 'Chưa máy in nào khai IP và Access Code\nnên chưa xem được camera.',
              icon: Icons.videocam_off_rounded,
            )
          : !_bat
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(28),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.videocam_rounded, size: 44, color: AppColors.muted),
                        const SizedBox(height: 12),
                        Text(
                          'Có ${coCam.length} camera.\nMỗi máy in chỉ cho vài kết nối cùng lúc nên phải bấm mới xem.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 13, color: AppColors.muted, height: 1.4),
                        ),
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          onPressed: _doiTrangThai,
                          icon: const Icon(Icons.play_arrow_rounded),
                          label: Text('Xem ${coCam.length} camera'),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, AppSize.listBottomInset),
                  children: [
                    for (final p in _phongTo == null
                        ? coCam
                        : coCam.where((x) => x.cloudPrinterId == _phongTo))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _OCam(
                          ten: p.name,
                          url: '${baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl}'
                              '/api/printers/camera?may=${Uri.encodeComponent(p.cloudPrinterId!)}&anh=1&t=$_nhip',
                          phongTo: _phongTo != null,
                          onDoiCo: () => setState(
                            () => _phongTo = _phongTo == null ? p.cloudPrinterId : null,
                          ),
                        ),
                      ),
                    const Padding(
                      padding: EdgeInsets.only(top: 4),
                      child: Text(
                        'Camera A1/P1 chỉ đẩy khoảng 0,4 hình/giây — giật là bình thường.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 11, color: AppColors.muted),
                      ),
                    ),
                  ],
                ),
    );
  }
}

class _OCam extends StatelessWidget {
  const _OCam({
    required this.ten,
    required this.url,
    required this.phongTo,
    required this.onDoiCo,
  });

  final String ten;
  final String url;
  final bool phongTo;
  final VoidCallback onDoiCo;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Container(
        color: Colors.black,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      ten,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white),
                    ),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    onPressed: onDoiCo,
                    icon: Icon(
                      phongTo ? Icons.close_fullscreen_rounded : Icons.open_in_full_rounded,
                      size: 17,
                      color: AppColors.muted,
                    ),
                  ),
                ],
              ),
            ),
            Image.network(
              url,
              // Giữ hình cũ trong lúc tải hình mới, nếu không thì cứ 2 giây lại nháy đen một cái.
              gaplessPlayback: true,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const AspectRatio(
                aspectRatio: 16 / 9,
                child: Center(
                  child: Text('Chưa lấy được hình', style: TextStyle(fontSize: 12, color: AppColors.muted)),
                ),
              ),
              loadingBuilder: (context, child, tienDo) =>
                  tienDo == null ? child : AspectRatio(aspectRatio: 16 / 9, child: child),
            ),
          ],
        ),
      ),
    );
  }
}
