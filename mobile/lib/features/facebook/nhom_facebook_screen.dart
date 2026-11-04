import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_settings.dart';
import '../../core/format/formatters.dart';
import '../../core/mo_link.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/facebook.dart';
import '../../data/providers.dart';
import '../../data/repositories/facebook_repository.dart';
import 'the_bai_facebook.dart';

/// Số ngày lùi mặc định khi thêm nhóm hoặc quét lại — khớp ô nhập trên web.
const _ngayLuiMacDinh = 3;

Color _mauHang(HangNhom h) => switch (h) {
      HangNhom.cao => AppColors.success,
      HangNhom.vua => AppColors.warning,
      HangNhom.thap => AppColors.muted,
      HangNhom.moi => AppColors.info,
    };

/// Các nhóm Facebook agent theo dõi. Agent mở nhóm theo bài mới nhất, cuộn tới khi gặp lại bài đã
/// quét lần trước thì dừng. Ngưỡng phân hạng là cài đặt nên sửa trên web; ở đây chỉ ghim từng nhóm.
class NhomFacebookScreen extends ConsumerWidget {
  const NhomFacebookScreen({super.key});

  Future<void> _lam(
    BuildContext context,
    WidgetRef ref,
    Future<void> Function(FacebookRepository repo) viec,
  ) async {
    try {
      await viec(ref.read(facebookRepositoryProvider));
    } catch (e) {
      if (context.mounted) showToast(context, '$e', isError: true);
    }
    ref.invalidate(nhomFacebookProvider);
  }

  Future<void> _xoa(BuildContext context, WidgetRef ref, NhomFacebook n) async {
    final dongY = await confirmAction(
      context,
      title: 'Xoá nhóm?',
      message: 'Xoá "${n.tenHienThi}"? Danh sách bài đã quét của nhóm cũng mất theo.',
      confirmLabel: 'Xoá',
    );
    if (dongY && context.mounted) {
      await _lam(context, ref, (repo) => repo.xoaNhom(n.id));
    }
  }

  Future<void> _quetLai(BuildContext context, WidgetRef ref, NhomFacebook n) async {
    final soNgay = await showDialog<int>(
      context: context,
      builder: (_) => _HoiSoNgay(tenNhom: n.tenHienThi),
    );
    if (soNgay != null && context.mounted) {
      await _lam(context, ref, (repo) => repo.quetLaiNhom(n.id, soNgay));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nhom = ref.watch(nhomFacebookProvider);
    final phanHangBat = ref.watch(caiDatFacebookProvider).valueOrNull?.phanHangBat ?? true;
    final baseUrl = ref.watch(appSettingsProvider).baseUrl;
    final goc = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;

    return Scaffold(
      appBar: AppBar(title: const Text('Nhóm theo dõi')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          useSafeArea: true,
          builder: (_) => const _ThemNhom(),
        ),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Thêm nhóm'),
      ),
      body: AsyncView(
        value: nhom,
        onRetry: () => ref.invalidate(nhomFacebookProvider),
        builder: (data) {
          if (data.isEmpty) {
            return const EmptyView(
              message: 'Chưa có nhóm nào.\nBấm Thêm nhóm rồi dán link nhóm Facebook.',
              icon: Icons.groups_rounded,
            );
          }
          final ds = xepNhom(data);
          final soBat = data.where((n) => n.bat).length;
          final toiLuot = data.where((n) => n.toiLuot).firstOrNull;
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(nhomFacebookProvider),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, AppSize.listBottomInset),
              itemCount: ds.length + 1,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                if (i == 0) {
                  return Text(
                    '$soBat/${data.length} đang bật'
                    '${toiLuot != null ? ' · tới lượt: ${toiLuot.tenHienThi}' : ''}',
                    style: const TextStyle(fontSize: AppSize.textCaption, color: AppColors.muted),
                  );
                }
                final n = ds[i - 1];
                return _TheNhom(
                  nhom: n,
                  gocAnh: goc,
                  phanHangBat: phanHangBat,
                  onBatTat: () => _lam(context, ref, (repo) => repo.batTatNhom(n.id, !n.bat)),
                  onQuetLai: () => _quetLai(context, ref, n),
                  onXoa: () => _xoa(context, ref, n),
                  onGhim: (hang) => _lam(context, ref, (repo) => repo.ghimHangNhom(n.id, hang)),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _TheNhom extends StatelessWidget {
  const _TheNhom({
    required this.nhom,
    required this.gocAnh,
    required this.phanHangBat,
    required this.onBatTat,
    required this.onQuetLai,
    required this.onXoa,
    required this.onGhim,
  });

  final NhomFacebook nhom;
  final String gocAnh;
  final bool phanHangBat;
  final VoidCallback onBatTat;
  final VoidCallback onQuetLai;
  final VoidCallback onXoa;
  final void Function(String? hang) onGhim;

  String get _lichQuet {
    if (!phanHangBat || nhom.hang == HangNhom.cao || nhom.hang == HangNhom.moi) {
      return 'quét mỗi vòng';
    }
    if (nhom.denHan) return 'đã tới hạn quét lại';
    return 'quét lại sau ${Fmt.gioNgay(nhom.denHanLuc)}';
  }

  @override
  Widget build(BuildContext context) {
    const nho = TextStyle(fontSize: AppSize.textCaption, color: AppColors.muted, height: 1.4);
    final thongTin = [
      if (nhom.quyenRiengTu != null) nhom.quyenRiengTu!,
      if (nhom.soThanhVien != null) nhom.soThanhVien!,
    ].join(' · ');

    return Opacity(
      opacity: nhom.bat ? 1 : 0.6,
      child: SectionCard(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: SizedBox(
                    width: 64,
                    height: 48,
                    child: nhom.coAnh
                        ? Image.network(
                            '$gocAnh/api/facebook/nhom/${Uri.encodeComponent(nhom.id)}/anh',
                            fit: BoxFit.cover,
                            cacheWidth: 192,
                            errorBuilder: (_, __, ___) => const _AnhTrong(),
                          )
                        : const _AnhTrong(),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      InkWell(
                        onTap: () => moLinkNgoai(context, nhom.link),
                        child: Text(
                          nhom.tenHienThi,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: [
                          if (nhom.toiLuot)
                            const NhanFacebook('TỚI LƯỢT', mau: AppColors.indigoLight, dam: true),
                          if (!nhom.bat)
                            const NhanFacebook('đang tắt', mau: AppColors.muted),
                          if (nhom.bat && phanHangBat)
                            NhanFacebook('${nhom.hang.ten}${nhom.tuDong ? '' : ' · ghim'}', mau: _mauHang(nhom.hang), dam: true),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (thongTin.isNotEmpty) Text(thongTin, style: nho),
            if (nhom.moTa != null)
              Text(nhom.moTa!, maxLines: 1, overflow: TextOverflow.ellipsis, style: nho),
            Text(
              nhom.lanQuetCuoi != null
                  ? 'Quét lần cuối ${Fmt.gioNgay(nhom.lanQuetCuoi)}'
                      '${nhom.ketQuaCuoi != null ? ' — ${nhom.ketQuaCuoi}' : ''}'
                  : 'Chưa quét lần nào · lần đầu lùi tới ${Fmt.gioNgay(nhom.mocThoiGian)}',
              style: nho,
            ),
            Text.rich(
              TextSpan(
                style: nho,
                children: [
                  TextSpan(text: '${Fmt.number(nhom.soBaiDaQuet)} bài đã quét · '),
                  TextSpan(
                    text: '${Fmt.number(nhom.soKhach)} khách tiềm năng',
                    style: nhom.soKhach > 0
                        ? const TextStyle(fontWeight: FontWeight.w700, color: AppColors.success)
                        : null,
                  ),
                ],
              ),
            ),
            Text(
              '${Fmt.number(nhom.khachTuan)} khách/tuần · ${Fmt.number(nhom.baiNgay)} bài mới/ngày'
              '${nhom.bat ? ' · $_lichQuet' : ''}',
              style: nho,
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: PopupMenuButton<String>(
                      tooltip: 'Ghim hạng tiềm năng',
                      initialValue: nhom.hangCoDinh ?? '',
                      // Chuỗi rỗng là "trả về tự xếp"; PopupMenu không nhận được giá trị null.
                      onSelected: (v) => onGhim(v.isEmpty ? null : v),
                      itemBuilder: (_) => const [
                        PopupMenuItem(value: '', child: Text('Hạng: tự động')),
                        PopupMenuItem(value: 'cao', child: Text('Ghim: cao')),
                        PopupMenuItem(value: 'vua', child: Text('Ghim: vừa')),
                        PopupMenuItem(value: 'thap', child: Text('Ghim: thấp')),
                      ],
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.push_pin_outlined,
                                size: AppSize.iconSm, color: AppColors.muted),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                nhom.hangCoDinh == null ? 'Hạng: tự động' : 'Đã ghim hạng',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 13, color: AppColors.muted),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: nhom.bat ? 'Tạm dừng quét nhóm này' : 'Bật lại',
                  onPressed: onBatTat,
                  icon: Icon(nhom.bat ? Icons.pause_rounded : Icons.play_arrow_rounded),
                ),
                IconButton(
                  tooltip: 'Quét lại từ đầu',
                  onPressed: onQuetLai,
                  icon: const Icon(Icons.replay_rounded),
                ),
                IconButton(
                  tooltip: 'Xoá nhóm',
                  onPressed: onXoa,
                  icon: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AnhTrong extends StatelessWidget {
  const _AnhTrong();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: AppColors.surfaceAlt,
      child: Icon(Icons.groups_rounded, color: AppColors.muted),
    );
  }
}

Widget _oSoNgay(TextEditingController chu, {ValueChanged<String>? onSubmitted}) => TextField(
      controller: chu,
      keyboardType: TextInputType.number,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      onSubmitted: onSubmitted,
      decoration: const InputDecoration(labelText: 'Lùi về (ngày, tối đa 60)'),
    );

/// Số ngày người dùng gõ, kẹp vào khoảng máy chủ nhận; null nếu ô trống.
int? _docSoNgay(String chu) => int.tryParse(chu.trim())?.clamp(0, 60);

class _HoiSoNgay extends StatefulWidget {
  const _HoiSoNgay({required this.tenNhom});

  final String tenNhom;

  @override
  State<_HoiSoNgay> createState() => _HoiSoNgayState();
}

class _HoiSoNgayState extends State<_HoiSoNgay> {
  final _chu = TextEditingController(text: '$_ngayLuiMacDinh');

  @override
  void dispose() {
    _chu.dispose();
    super.dispose();
  }

  void _xong() {
    final so = _docSoNgay(_chu.text);
    if (so != null) Navigator.pop(context, so);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Quét lại từ đầu'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Quên các bài đã quét của "${widget.tenNhom}" rồi quét lại từ mốc này.',
            style: const TextStyle(height: 1.4),
          ),
          const SizedBox(height: 12),
          _oSoNgay(_chu, onSubmitted: (_) => _xong()),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Hủy')),
        FilledButton(onPressed: _xong, child: const Text('Quét lại')),
      ],
    );
  }
}

/// Dán được nhiều link một lúc. Link thêm hỏng giữ lại trong ô để sửa rồi bấm lại.
class _ThemNhom extends ConsumerStatefulWidget {
  const _ThemNhom();

  @override
  ConsumerState<_ThemNhom> createState() => _ThemNhomState();
}

class _ThemNhomState extends ConsumerState<_ThemNhom> {
  final _links = TextEditingController();
  final _ngayLui = TextEditingController(text: '$_ngayLuiMacDinh');
  bool _dangThem = false;
  List<KetQuaThemNhom> _ketQua = const [];

  @override
  void dispose() {
    _links.dispose();
    _ngayLui.dispose();
    super.dispose();
  }

  Future<void> _them() async {
    setState(() {
      _dangThem = true;
      _ketQua = const [];
    });
    try {
      final kq = await ref
          .read(facebookRepositoryProvider)
          .themNhom(_links.text, _docSoNgay(_ngayLui.text) ?? _ngayLuiMacDinh);
      if (!mounted) return;
      setState(() {
        _ketQua = kq;
        _links.text = kq.where((k) => !k.ok).map((k) => k.link).join('\n');
      });
      ref.invalidate(nhomFacebookProvider);
    } catch (e) {
      if (mounted) setState(() => _ketQua = [KetQuaThemNhom(link: '', ok: false, chu: '$e')]);
    } finally {
      if (mounted) setState(() => _dangThem = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final soLink = demLink(_links.text);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 20, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Thêm nhóm',
              style: TextStyle(fontSize: AppSize.textTitle, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _links,
              minLines: 3,
              maxLines: 6,
              keyboardType: TextInputType.multiline,
              autocorrect: false,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'Dán link nhóm — nhiều link thì mỗi dòng một link',
              ),
            ),
            const SizedBox(height: 10),
            _oSoNgay(_ngayLui),
            const SizedBox(height: 4),
            const Text(
              'Lần quét đầu chưa có bài cũ nên chỉ lùi về số ngày này.',
              style: TextStyle(fontSize: AppSize.textCaption, color: AppColors.muted),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _dangThem || soLink == 0 ? null : _them,
              icon: const Icon(Icons.add_rounded),
              label: Text(
                _dangThem
                    ? 'Đang đọc nhóm…'
                    : soLink > 1
                        ? 'Thêm $soLink nhóm'
                        : 'Thêm nhóm',
              ),
            ),
            for (final k in _ketQua)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      k.ok ? Icons.check_circle_rounded : Icons.error_rounded,
                      size: AppSize.iconSm,
                      color: k.ok ? AppColors.success : AppColors.danger,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        '${k.chu}${k.link.isNotEmpty && !k.ok ? ' — ${k.link}' : ''}',
                        style: TextStyle(
                          fontSize: AppSize.textCaption,
                          color: k.ok ? AppColors.success : AppColors.danger,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
