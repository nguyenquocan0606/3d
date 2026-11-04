import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/facebook.dart';
import '../../data/repositories/facebook_repository.dart';

const _loaiNhatKy = <String, ({String ten, Color mau})>{
  'he-thong': (ten: 'hệ thống', mau: AppColors.info),
  'cuon': (ten: 'cuộn', mau: AppColors.muted),
  'mang': (ten: 'mạng', mau: Color(0xFFE879F9)),
  'doc': (ten: 'đọc bài', mau: Color(0xFFE2E8F0)),
  'gui': (ten: 'gửi', mau: AppColors.success),
  'llm': (ten: 'LLM', mau: Color(0xFFFCD34D)),
  'khach': (ten: 'KHÁCH', mau: Color(0xFF86EFAC)),
  'loi': (ten: 'lỗi', mau: AppColors.danger),
};

/// Giữ trong máy chừng này dòng — đủ đọc lại một lượt lướt, không làm màn hình nặng dần.
const _toiDaDong = 1500;

/// Nhật ký realtime: agent đọc được gì, gửi gì lên, LLM chấm ra sao — từng dòng một.
///
/// Hỏi server 2 giây một lần theo id dòng cuối đã có, như bản web; server chỉ giữ nhật ký trong
/// RAM nên khởi động lại là id đếm lại từ đầu.
class NhatKyFacebookScreen extends ConsumerStatefulWidget {
  const NhatKyFacebookScreen({super.key});

  @override
  ConsumerState<NhatKyFacebookScreen> createState() => _NhatKyFacebookScreenState();
}

class _NhatKyFacebookScreenState extends ConsumerState<NhatKyFacebookScreen> {
  final _cuon = ScrollController();
  final _an = <String>{'cuon'};
  List<DongNhatKy> _dong = const [];
  int _cuoi = 0;
  int? _dongMo;
  bool _tamDung = false;
  bool _tuCuon = true;
  bool _dangHoi = false;
  Timer? _nhip;

  @override
  void initState() {
    super.initState();
    _hoi();
    _nhip = Timer.periodic(const Duration(seconds: 2), (_) => _hoi());
  }

  @override
  void dispose() {
    _nhip?.cancel();
    _cuon.dispose();
    super.dispose();
  }

  Future<void> _hoi() async {
    // Mạng chậm hơn nhịp hỏi thì bỏ qua nhịp này, kẻo cùng một đoạn nhật ký về hai lần.
    if (_tamDung || _dangHoi) return;
    _dangHoi = true;
    try {
      final trang = await ref.read(facebookRepositoryProvider).nhatKySau(_cuoi);
      if (!mounted) return;
      if (trang.cuoi < _cuoi) {
        _cuoi = 0;
        return;
      }
      _cuoi = trang.cuoi;
      if (trang.dong.isEmpty) return;
      final gop = [..._dong, ...trang.dong];
      setState(() {
        _dong = gop.length > _toiDaDong ? gop.sublist(gop.length - _toiDaDong) : gop;
      });
      if (_tuCuon) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_cuon.hasClients) _cuon.jumpTo(_cuon.position.maxScrollExtent);
        });
      }
    } catch (_) {
      // Lỡ một nhịp thì nhịp sau lấy bù — server nhớ theo id.
    } finally {
      _dangHoi = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final hien = _dong.where((d) => !_an.contains(d.loai)).toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Nhật ký realtime'),
        actions: [
          IconButton(
            tooltip: _tamDung ? 'Chạy tiếp' : 'Tạm dừng',
            onPressed: () => setState(() => _tamDung = !_tamDung),
            icon: Icon(_tamDung ? Icons.play_arrow_rounded : Icons.pause_rounded),
          ),
          IconButton(
            tooltip: 'Tự cuộn xuống dòng mới nhất',
            onPressed: () => setState(() => _tuCuon = !_tuCuon),
            icon: Icon(
              Icons.vertical_align_bottom_rounded,
              color: _tuCuon ? AppColors.success : AppColors.muted,
            ),
          ),
          IconButton(
            tooltip: 'Xoá màn hình (không xoá trên máy chủ)',
            onPressed: () => setState(() => _dong = const []),
            icon: const Icon(Icons.delete_outline_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 6),
              children: [
                for (final e in _loaiNhatKy.entries)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: FilterChip(
                      label: Text(e.value.ten),
                      labelStyle: TextStyle(
                        fontSize: 12,
                        color: _an.contains(e.key) ? AppColors.muted : e.value.mau,
                        decoration: _an.contains(e.key) ? TextDecoration.lineThrough : null,
                      ),
                      showCheckmark: false,
                      // Nền trung tính: chữ mỗi loại đã có màu riêng, nền tím mặc định làm chữ khó đọc.
                      selectedColor: AppColors.surfaceAlt,
                      selected: !_an.contains(e.key),
                      onSelected: (_) => setState(() {
                        if (!_an.remove(e.key)) _an.add(e.key);
                      }),
                    ),
                  ),
              ],
            ),
          ),
          const Divider(),
          Expanded(
            child: hien.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text(
                        'Chưa có dòng nào. Chạy agent là nhật ký hiện ra ở đây.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.muted),
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _cuon,
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 32),
                    itemCount: hien.length,
                    itemBuilder: (context, i) {
                      final d = hien[i];
                      return _DongLog(
                        dong: d,
                        mo: _dongMo == d.id,
                        onBam: d.chiTiet == null
                            ? null
                            : () => setState(() => _dongMo = _dongMo == d.id ? null : d.id),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _DongLog extends StatelessWidget {
  const _DongLog({required this.dong, required this.mo, required this.onBam});

  final DongNhatKy dong;
  final bool mo;
  final VoidCallback? onBam;

  @override
  Widget build(BuildContext context) {
    final loai = _loaiNhatKy[dong.loai];
    final mau = loai?.mau ?? const Color(0xFFCBD5E1);
    const phu = TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.muted);
    return InkWell(
      onTap: onBam,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(Fmt.time(dong.luc), style: phu),
                const SizedBox(width: 6),
                Text(
                  loai?.ten ?? dong.loai,
                  style: phu.copyWith(
                    color: mau,
                    fontWeight: dong.loai == 'khach' ? FontWeight.w700 : null,
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(dong.nguon, maxLines: 1, overflow: TextOverflow.ellipsis, style: phu),
                ),
                if (onBam != null)
                  Icon(
                    mo ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                    size: AppSize.iconSm,
                    color: AppColors.muted,
                  ),
              ],
            ),
            Text(
              dong.chu,
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
                height: 1.35,
                color: dong.loai == 'khach' ? mau : const Color(0xFFCBD5E1),
              ),
            ),
            if (mo)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(top: 4),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.surfaceAlt,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: SelectableText(
                  const JsonEncoder.withIndent('  ').convert(dong.chiTiet),
                  style: phu,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
