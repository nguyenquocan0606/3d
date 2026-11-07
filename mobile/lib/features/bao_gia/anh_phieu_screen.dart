import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bao_gia.dart';
import '../../data/repositories/bao_gia_repository.dart';

/// Tên file như web: "BG-2611-004 - Anh Nam" (bỏ ký tự cấm trong tên file).
String tenFilePhieu(PhieuBaoGia p) =>
    '${p.so}${p.khach.ten.trim().isNotEmpty ? ' - ${p.khach.ten.trim()}' : ''}'.replaceAll(RegExp(r'[\\/:*?"<>|]'), '');

/// Tờ báo giá thành ảnh, đúng như bản in / PDF của web.
///
/// Không vẽ lại tờ A4 trên app: server mở trang phiếu bằng Chromium và chụp (`/api/phieu-bao-gia/<id>/anh`),
/// nên logo, mã QR VietQR, bố cục, chữ "Bằng chữ"… luôn giống hệt cái khách nhận trên web. PDF cũng
/// dựng từ chính ảnh đó.
class AnhPhieuScreen extends ConsumerStatefulWidget {
  const AnhPhieuScreen({super.key, required this.phieu, this.daGuiKhach});

  final PhieuBaoGia phieu;

  /// Gọi sau khi chia sẻ ảnh / PDF — màn soạn chuyển phiếu nháp sang "Đã gửi" như web.
  final VoidCallback? daGuiKhach;

  @override
  ConsumerState<AnhPhieuScreen> createState() => _AnhPhieuScreenState();
}

class _AnhPhieuScreenState extends ConsumerState<AnhPhieuScreen> {
  late Future<Uint8List> _anh = _tai();
  bool _dang = false;

  Future<Uint8List> _tai() => ref.read(baoGiaRepositoryProvider).anhPhieu(widget.phieu.id);

  /// Một trang PDF đúng tỉ lệ ảnh, bề ngang A4 — phiếu nhiều hạng mục dài hơn A4 thì trang dài theo.
  Future<Uint8List> _pdf(Uint8List png) async {
    final anh = pw.MemoryImage(png);
    final rong = PdfPageFormat.a4.width;
    final cao = anh.width != null && anh.height != null && anh.width! > 0
        ? rong * anh.height! / anh.width!
        : PdfPageFormat.a4.height;
    final doc = pw.Document(title: tenFilePhieu(widget.phieu));
    doc.addPage(pw.Page(
      pageFormat: PdfPageFormat(rong, cao),
      margin: pw.EdgeInsets.zero,
      build: (_) => pw.Image(anh, fit: pw.BoxFit.contain),
    ));
    return doc.save();
  }

  Future<void> _lam(Future<void> Function(Uint8List png) viec) async {
    setState(() => _dang = true);
    try {
      await viec(await _anh);
    } catch (e) {
      if (mounted) showToast(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _dang = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ten = tenFilePhieu(widget.phieu);
    return Scaffold(
      appBar: AppBar(
        title: Text('Ảnh phiếu ${widget.phieu.so}'),
        actions: [
          IconButton(
            tooltip: 'Tạo lại ảnh',
            onPressed: () => setState(() => _anh = _tai()),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: FutureBuilder<Uint8List>(
        future: _anh,
        builder: (context, snap) {
          if (snap.hasError) {
            return ErrorView(message: '${snap.error}', onRetry: () => setState(() => _anh = _tai()));
          }
          if (!snap.hasData) {
            return const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 14),
                  Text('Máy chủ đang dựng ảnh nét…', style: TextStyle(color: AppColors.muted)),
                ],
              ),
            );
          }
          return InteractiveViewer(
            maxScale: 6,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Image.memory(snap.data!, fit: BoxFit.contain),
              ),
            ),
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
          child: Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(AppSize.touchTarget)),
                  onPressed: _dang
                      ? null
                      : () => _lam((png) async {
                            final kq = await Share.shareXFiles(
                              [XFile.fromData(png, mimeType: 'image/png', name: '$ten.png')],
                              fileNameOverrides: ['$ten.png'],
                              subject: 'Báo giá ${widget.phieu.so}',
                            );
                            if (kq.status == ShareResultStatus.success) widget.daGuiKhach?.call();
                          }),
                  icon: const Icon(Icons.share_rounded),
                  label: const Text('Gửi ảnh'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(AppSize.touchTarget)),
                  onPressed: _dang
                      ? null
                      : () => _lam((png) async {
                            await Printing.sharePdf(bytes: await _pdf(png), filename: '$ten.pdf');
                            widget.daGuiKhach?.call();
                          }),
                  icon: const Icon(Icons.picture_as_pdf_rounded),
                  label: const Text('PDF'),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.outlined(
                tooltip: 'In',
                onPressed:
                    _dang ? null : () => _lam((png) => Printing.layoutPdf(name: ten, onLayout: (_) => _pdf(png))),
                icon: const Icon(Icons.print_rounded),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
