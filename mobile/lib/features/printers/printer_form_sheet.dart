import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../data/models/printer.dart';
import '../../data/providers.dart';
import '../../data/repositories/printer_repository.dart';

/// Form thêm/sửa máy in.
///
/// Ba ô kết nối (IP, Access Code, ID máy in) là tất cả những gì cần để nói chuyện thẳng với máy
/// Bambu qua MQTT trong LAN. Nút "Lấy từ Home Assistant" điền hộ IP và ID — HA phơi sẵn hai thứ đó
/// — nhưng **Access Code thì HA không có** (nằm trong config entry chứ không thành entity), nên ô
/// đó luôn phải gõ từ màn hình máy: ⚙️ → WLAN → Access Code.
Future<bool?> moFormMayIn(BuildContext context, {Printer? may}) => showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) => Padding(
        // Đẩy form lên trên bàn phím, kẻo ô đang gõ bị che.
        padding: EdgeInsets.only(bottom: MediaQuery.of(sheetCtx).viewInsets.bottom),
        child: _FormMayIn(may: may),
      ),
    );

class _FormMayIn extends ConsumerStatefulWidget {
  const _FormMayIn({this.may});

  final Printer? may;

  @override
  ConsumerState<_FormMayIn> createState() => _FormMayInState();
}

class _FormMayInState extends ConsumerState<_FormMayIn> {
  late final TextEditingController _id;
  late final TextEditingController _ten;
  late final TextEditingController _model;
  late final TextEditingController _ip;
  late final TextEditingController _accessCode;
  late final TextEditingController _serial;

  String _haId = '';
  bool _dangLuu = false;
  bool _dangTaiGoiY = false;
  String? _loi;

  bool get _laSua => widget.may != null;

  @override
  void initState() {
    super.initState();
    final m = widget.may;
    _id = TextEditingController(text: m?.id ?? '');
    _ten = TextEditingController(text: m?.name ?? '');
    _model = TextEditingController(text: m?.model ?? '');
    _ip = TextEditingController(text: m?.lanIp ?? '');
    // Cố tình để trống: máy chủ không trả Access Code đã lưu về, và để trống = giữ mã cũ.
    _accessCode = TextEditingController();
    _serial = TextEditingController(text: m?.lanSerial ?? '');
    _haId = m?.cloudPrinterId ?? '';
  }

  @override
  void dispose() {
    for (final c in [_id, _ten, _model, _ip, _accessCode, _serial]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _layGoiY() async {
    setState(() {
      _dangTaiGoiY = true;
      _loi = null;
    });
    try {
      final ds = await ref.read(printerRepositoryProvider).goiYTuHa();
      if (!mounted) return;
      if (ds.isEmpty) {
        setState(() => _loi = 'Home Assistant không thấy máy nào.');
        return;
      }
      final chon = await showModalBottomSheet<GoiYTuHa>(
        context: context,
        backgroundColor: AppColors.surfaceAlt,
        builder: (chonCtx) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              for (final m in ds)
                ListTile(
                  title: Text(m.ten),
                  subtitle: Text(
                    '${m.ip ?? '?'} · ${m.serial ?? '?'}',
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                  ),
                  trailing: m.daGhep
                      ? const Text('đã ghép', style: TextStyle(fontSize: 11, color: AppColors.warning))
                      : null,
                  onTap: () => Navigator.pop(chonCtx, m),
                ),
            ],
          ),
        ),
      );
      if (chon == null || !mounted) return;
      setState(() {
        _ip.text = chon.ip ?? '';
        _serial.text = chon.serial ?? '';
        _haId = chon.haId;
        if (_ten.text.trim().isEmpty) _ten.text = chon.ten;
      });
    } catch (e) {
      if (mounted) setState(() => _loi = 'Không lấy được danh sách: $e');
    } finally {
      if (mounted) setState(() => _dangTaiGoiY = false);
    }
  }

  Future<void> _luu() async {
    final ten = _ten.text.trim();
    if (ten.isEmpty) {
      setState(() => _loi = 'Tên máy in không được để trống.');
      return;
    }

    var id = _id.text.trim().toUpperCase();
    if (!_laSua) {
      if (id.isEmpty) {
        setState(() => _loi = 'Mã máy in không được để trống.');
        return;
      }
      if (!id.startsWith('PRT-')) id = 'PRT-$id';
    }

    setState(() {
      _dangLuu = true;
      _loi = null;
    });
    try {
      final repo = ref.read(printerRepositoryProvider);
      final model = _model.text.trim();
      final code = _accessCode.text.trim();
      if (_laSua) {
        await repo.updatePrinter(
          widget.may!.id,
          name: ten,
          model: model,
          // Gửi chuỗi rỗng (không phải null) để máy chủ hiểu là "xoá cấu hình", vì `compact` lọc
          // sạch null trước khi gửi đi.
          lanIp: _ip.text.trim(),
          lanSerial: _serial.text.trim(),
          lanAccessCode: code.isEmpty ? null : code,
          cloudPrinterId: _haId,
        );
      } else {
        await repo.createPrinter(
          id: id,
          name: ten,
          model: model.isEmpty ? null : model,
          lanIp: _ip.text.trim(),
          lanSerial: _serial.text.trim(),
          lanAccessCode: code.isEmpty ? null : code,
          cloudPrinterId: _haId,
        );
      }
      await ref.read(printersProvider.notifier).refresh();
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _loi = '$e');
    } finally {
      if (mounted) setState(() => _dangLuu = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _laSua ? 'Sửa máy in' : 'Thêm máy in',
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 16),
            if (_loi != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
                ),
                child: Text(_loi!, style: const TextStyle(fontSize: 12.5, color: AppColors.danger)),
              ),
              const SizedBox(height: 12),
            ],
            if (!_laSua) ...[
              _ONhap(control: _id, nhan: 'Mã máy in', goiY: 'PRT-A1-1', mono: true),
              const SizedBox(height: 12),
            ],
            _ONhap(control: _ten, nhan: 'Tên máy in', goiY: 'Bambu A1 số 1'),
            const SizedBox(height: 12),
            _ONhap(control: _model, nhan: 'Model (tuỳ chọn)', goiY: 'Bambu Lab A1'),
            const SizedBox(height: 20),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'KẾT NỐI TRỰC TIẾP',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.1,
                      color: AppColors.muted,
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: _dangTaiGoiY ? null : _layGoiY,
                  icon: _dangTaiGoiY
                      ? const SizedBox(
                          width: 13,
                          height: 13,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.download_rounded, size: 16),
                  label: const Text('Lấy từ HA', style: TextStyle(fontSize: 12.5)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            _ONhap(control: _ip, nhan: 'Địa chỉ IP', goiY: '192.168.99.20', mono: true),
            const SizedBox(height: 12),
            _ONhap(
              control: _accessCode,
              nhan: 'Access Code',
              goiY: (widget.may?.coAccessCode ?? false)
                  ? 'Đã lưu — để trống nếu không đổi'
                  : '8 ký tự trên màn hình máy',
              mono: true,
            ),
            const SizedBox(height: 12),
            _ONhap(control: _serial, nhan: 'ID máy in', goiY: '03900D611509363', mono: true),
            const SizedBox(height: 6),
            const Text(
              'Access Code lấy trên màn hình máy: ⚙️ → WLAN → Access Code. Home Assistant không đọc được mã này.',
              style: TextStyle(fontSize: 11, height: 1.35, color: AppColors.muted),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: FilledButton(
                onPressed: _dangLuu ? null : _luu,
                child: Text(_dangLuu ? 'Đang kiểm tra kết nối…' : 'Lưu'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ONhap extends StatelessWidget {
  const _ONhap({
    required this.control,
    required this.nhan,
    required this.goiY,
    this.mono = false,
  });

  final TextEditingController control;
  final String nhan;
  final String goiY;
  final bool mono;

  @override
  Widget build(BuildContext context) => TextField(
        controller: control,
        style: TextStyle(fontSize: 14, fontFamily: mono ? 'monospace' : null),
        decoration: InputDecoration(
          labelText: nhan,
          hintText: goiY,
          isDense: true,
          border: const OutlineInputBorder(),
        ),
      );
}
