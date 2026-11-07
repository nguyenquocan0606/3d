import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/phien_admin.dart';
import '../../core/config/app_settings.dart';
import '../../core/routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bao_gia.dart';
import '../../data/repositories/bao_gia_repository.dart';
import 'dang_nhap_admin.dart';

Color mauTrangThai(TrangThaiPhieu t) => switch (t) {
      TrangThaiPhieu.nhap => AppColors.muted,
      TrangThaiPhieu.daGui => AppColors.info,
      TrangThaiPhieu.chot => AppColors.success,
      TrangThaiPhieu.huy => AppColors.danger,
    };

/// Lọc theo trạng thái: một trạng thái của phiếu, hoặc "hết hiệu lực" (tính theo ngày), null = tất cả.
sealed class _Loc {
  const _Loc();
}

class _LocTatCa extends _Loc {
  const _LocTatCa();
}

class _LocTrangThai extends _Loc {
  const _LocTrangThai(this.t);
  final TrangThaiPhieu t;
}

class _LocHetHan extends _Loc {
  const _LocHetHan();
}

/// Tab phân loại đang mở được nhớ lại, giống `localStorage` của bản web. Không lưu = "Tất cả".
const _kTabPhanLoai = 'bao_gia_tab_phan_loai';

/// Màn "Báo giá" — port `src/components/PhieuBaoGia/danh-sach.tsx`.
class BaoGiaScreen extends ConsumerStatefulWidget {
  const BaoGiaScreen({super.key});

  @override
  ConsumerState<BaoGiaScreen> createState() => _BaoGiaScreenState();
}

class _BaoGiaScreenState extends ConsumerState<BaoGiaScreen> {
  _Loc _loc = const _LocTatCa();
  String _tim = '';

  /// null = tất cả, '' = chưa phân loại, còn lại là tên nhãn.
  String? _tab;
  bool _dangTao = false;

  @override
  void initState() {
    super.initState();
    _tab = ref.read(sharedPreferencesProvider).getString(_kTabPhanLoai);
  }

  void _chonTab(String? tab) {
    setState(() => _tab = tab);
    final prefs = ref.read(sharedPreferencesProvider);
    if (tab == null) {
      prefs.remove(_kTabPhanLoai);
    } else {
      prefs.setString(_kTabPhanLoai, tab);
    }
  }

  Future<void> _tao(String? phanLoai) async {
    setState(() => _dangTao = true);
    try {
      final p = await ref.read(baoGiaRepositoryProvider).tao(phanLoai: phanLoai);
      ref.read(danhSachBaoGiaProvider.notifier).capNhat(p);
      if (mounted) context.push(Routes.phieuBaoGia(p.id));
    } catch (e) {
      if (mounted) showToast(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _dangTao = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final phien = ref.watch(phienAdminProvider);
    final ds = ref.watch(danhSachBaoGiaProvider);

    if (phien == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Báo giá khách hàng')),
        body: const DangNhapAdminCard(),
      );
    }

    final tatCa = ds.valueOrNull ?? const <PhieuBaoGia>[];
    final dsLoai = {
      for (final p in tatCa)
        if (p.phanLoai.isNotEmpty) p.phanLoai
    }.toList()
      ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    final soChuaLoai = tatCa.where((p) => p.phanLoai.isEmpty).length;
    // Tab đã nhớ mà không còn phiếu nào thì về "Tất cả".
    final tab = _tab == '' ? (soChuaLoai > 0 ? '' : null) : (_tab != null && dsLoai.contains(_tab) ? _tab : null);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Báo giá khách hàng'),
        actions: [
          IconButton(
            tooltip: 'Tải lại',
            onPressed: () => ref.read(danhSachBaoGiaProvider.notifier).refresh(),
            icon: const Icon(Icons.refresh_rounded),
          ),
          PopupMenuButton<String>(
            onSelected: (v) async {
              if (v == 'dang-xuat') {
                final ok = await confirmAction(
                  context,
                  title: 'Đăng xuất admin?',
                  message: 'Máy này sẽ không xem được báo giá cho tới khi đăng nhập lại.',
                  confirmLabel: 'Đăng xuất',
                );
                if (ok) await ref.read(phienAdminProvider.notifier).dangXuat();
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                value: 'dang-xuat',
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.logout_rounded),
                  title: const Text('Đăng xuất admin'),
                  subtitle: Text(phien.tenHien),
                ),
              ),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _dangTao ? null : () => _tao(tab),
        icon: _dangTao
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.add_rounded),
        label: const Text('Tạo báo giá'),
      ),
      body: AsyncView(
        value: ds,
        onRetry: () => ref.read(danhSachBaoGiaProvider.notifier).refresh(),
        builder: (_) => RefreshIndicator(
          onRefresh: () => ref.read(danhSachBaoGiaProvider.notifier).refresh(),
          child: _noiDung(tatCa, dsLoai, soChuaLoai, tab),
        ),
      ),
    );
  }

  Widget _noiDung(List<PhieuBaoGia> tatCa, List<String> dsLoai, int soChuaLoai, String? tab) {
    final homNay = ngayVN();
    final thang = homNay.substring(0, 7);
    final trongTab = tatCa.where((p) => tab == null || p.phanLoai == tab).toList();

    bool khop(PhieuBaoGia p, _Loc loc) => switch (loc) {
          _LocTatCa() => true,
          _LocHetHan() => hetHieuLuc(p, homNay),
          _LocTrangThai(:final t) => p.trangThai == t,
        };

    final q = _tim.trim().toLowerCase();
    final loc = trongTab.where((p) {
      if (!khop(p, _loc)) return false;
      if (q.isEmpty) return true;
      return [p.so, p.tieuDe, p.phanLoai, p.khach.ten, p.khach.congTy, p.khach.sdt, ...p.dong.map((d) => d.ten)]
          .any((x) => x.toLowerCase().contains(q));
    }).toList();

    // Số liệu tháng này — giống 4 thẻ đầu trang web.
    final trongThang = tatCa.where((p) {
      final tao = p.ngayTaoLuc;
      return tao != null && ngayVN(0, tao).substring(0, 7) == thang;
    }).toList();
    final chot = trongThang.where((p) => p.trangThai == TrangThaiPhieu.chot).toList();
    final daGui = trongThang.where((p) => p.trangThai != TrangThaiPhieu.nhap).length;
    final choKhach = tatCa.where((p) => p.trangThai == TrangThaiPhieu.daGui && !hetHieuLuc(p, homNay)).toList();
    final doanhSoChot = chot.fold<double>(0, (t, p) => t + tinhTong(p).tongCong);
    final giaTriCho = choKhach.fold<double>(0, (t, p) => t + tinhTong(p).tongCong);

    final locs = <(_Loc, String)>[
      (const _LocTatCa(), 'Tất cả'),
      for (final t in TrangThaiPhieu.values.where((t) => t != TrangThaiPhieu.huy)) (_LocTrangThai(t), t.nhan),
      (const _LocHetHan(), 'Hết hiệu lực'),
      (const _LocTrangThai(TrangThaiPhieu.huy), TrangThaiPhieu.huy.nhan),
    ];

    return ListView(
      // Ít phiếu thì danh sách không đủ dài để cuộn — vẫn phải kéo xuống làm mới được.
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, AppSize.listBottomInset),
      children: [
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.55,
          children: [
            StatTile(
              label: 'Tháng này',
              value: '${trongThang.length}',
              caption: '${tatCa.length} phiếu tổng',
              icon: Icons.description_rounded,
              color: AppColors.info,
            ),
            StatTile(
              label: 'Chờ khách',
              value: '${choKhach.length}',
              caption: 'trị giá ${rutGonTien(giaTriCho)}',
              icon: Icons.schedule_rounded,
              color: AppColors.warning,
            ),
            StatTile(
              label: 'Chốt tháng này',
              value: rutGonTien(doanhSoChot),
              caption: '${chot.length} phiếu',
              icon: Icons.check_circle_rounded,
              color: AppColors.success,
            ),
            StatTile(
              label: 'Tỷ lệ chốt',
              value: '${daGui == 0 ? 0 : (chot.length / daGui * 100).round()}%',
              caption: 'trên phiếu đã gửi trong tháng',
              icon: Icons.trending_up_rounded,
              color: AppColors.indigoLight,
            ),
          ],
        ),
        const SizedBox(height: 14),
        TextField(
          decoration: const InputDecoration(
            hintText: 'Tìm số phiếu, tên khách, SĐT, hạng mục…',
            prefixIcon: Icon(Icons.search_rounded),
            isDense: true,
          ),
          onChanged: (v) => setState(() => _tim = v),
        ),
        if (dsLoai.isNotEmpty) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 38,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _ChipTab(nhan: 'Tất cả', so: tatCa.length, chon: tab == null, onTap: () => _chonTab(null)),
                for (final l in dsLoai)
                  _ChipTab(
                    nhan: l,
                    so: tatCa.where((p) => p.phanLoai == l).length,
                    chon: tab == l,
                    onTap: () => _chonTab(l),
                  ),
                if (soChuaLoai > 0)
                  _ChipTab(nhan: 'Chưa phân loại', so: soChuaLoai, chon: tab == '', onTap: () => _chonTab('')),
              ],
            ),
          ),
        ],
        const SizedBox(height: 10),
        SizedBox(
          height: 36,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final (l, nhan) in locs)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    label: Text('$nhan  ${trongTab.where((p) => khop(p, l)).length}'),
                    selected: _cungLoc(_loc, l),
                    onSelected: (_) => setState(() => _loc = l),
                    visualDensity: VisualDensity.compact,
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (loc.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 32),
            child: EmptyView(
              icon: Icons.request_quote_rounded,
              message: tatCa.isEmpty
                  ? 'Chưa có báo giá nào. Bấm "Tạo báo giá" để soạn phiếu đầu tiên.'
                  : 'Không có phiếu nào khớp bộ lọc.',
            ),
          )
        else
          for (final p in loc)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _ThePhieu(phieu: p, homNay: homNay, dsLoai: dsLoai),
            ),
      ],
    );
  }

  bool _cungLoc(_Loc a, _Loc b) => switch ((a, b)) {
        (_LocTatCa(), _LocTatCa()) => true,
        (_LocHetHan(), _LocHetHan()) => true,
        (_LocTrangThai(t: final x), _LocTrangThai(t: final y)) => x == y,
        _ => false,
      };
}

class _ChipTab extends StatelessWidget {
  const _ChipTab({required this.nhan, required this.so, required this.chon, required this.onTap});

  final String nhan;
  final int so;
  final bool chon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: FilterChip(
        label: Text('$nhan  $so'),
        selected: chon,
        showCheckmark: false,
        selectedColor: AppColors.indigo,
        onSelected: (_) => onTap(),
        visualDensity: VisualDensity.compact,
      ),
    );
  }
}

class _ThePhieu extends ConsumerWidget {
  const _ThePhieu({required this.phieu, required this.homNay, required this.dsLoai});

  final PhieuBaoGia phieu;
  final String homNay;
  final List<String> dsLoai;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = phieu;
    final t = tinhTong(p);
    final hetHan = hetHieuLuc(p, homNay);
    final mau = mauTrangThai(p.trangThai);
    final khach = [p.khach.ten.trim(), p.khach.congTy.trim()].where((x) => x.isNotEmpty).join(' · ');

    return SectionCard(
      onTap: () => context.push(Routes.phieuBaoGia(p.id)),
      padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(p.so, style: const TextStyle(fontWeight: FontWeight.w800, fontFamily: 'monospace')),
                    StatusChip(label: p.trangThai.nhan, color: mau, dense: true),
                    if (hetHan) const StatusChip(label: 'Hết hiệu lực', color: AppColors.warning, dense: true),
                    if (p.phanLoai.isNotEmpty) StatusChip(label: p.phanLoai, color: AppColors.indigoLight, dense: true),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  khach.isEmpty ? 'Chưa có tên khách' : khach,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: khach.isEmpty ? AppColors.muted : null,
                  ),
                ),
                if (p.tieuDe.isNotEmpty)
                  Text(p.tieuDe,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Text(
                      dinhDangVnd(t.tongCong),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                    const Spacer(),
                    Flexible(
                      child: Text(
                        [
                          hienNgay(p.ngayTaoLuc == null ? null : ngayVN(0, p.ngayTaoLuc)),
                          if (p.khachXemLuc != null) 'khách đã xem',
                          if (p.donHangMa != null) 'đơn ${p.donHangMa}',
                        ].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.right,
                        style: const TextStyle(fontSize: 12, color: AppColors.muted),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          PopupMenuButton<String>(
            tooltip: 'Thao tác',
            icon: const Icon(Icons.more_vert_rounded, color: AppColors.muted),
            onSelected: (v) => _thaoTac(context, ref, v),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'link', child: Text('Chép link gửi khách')),
              PopupMenuItem(value: 'loai', child: Text('Đổi phân loại')),
              PopupMenuItem(value: 'nhan-ban', child: Text('Nhân bản thành phiếu mới')),
              PopupMenuItem(value: 'xoa', child: Text('Xoá phiếu', style: TextStyle(color: AppColors.danger))),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _thaoTac(BuildContext context, WidgetRef ref, String v) async {
    final repo = ref.read(baoGiaRepositoryProvider);
    final ds = ref.read(danhSachBaoGiaProvider.notifier);
    try {
      switch (v) {
        case 'link':
          await Clipboard.setData(ClipboardData(text: linkKhach(phieu.token)));
          if (context.mounted) showToast(context, 'Đã chép link báo giá ${phieu.so}');
        case 'loai':
          final moi = await chonPhanLoai(context, hienTai: phieu.phanLoai, dsLoai: dsLoai);
          if (moi == null || moi == phieu.phanLoai) return;
          ds.capNhat(await repo.luu(phieu.id, {'phanLoai': moi}));
        case 'nhan-ban':
          final p = await repo.nhanBan(phieu.id);
          ds.capNhat(p);
          if (context.mounted) context.push(Routes.phieuBaoGia(p.id));
        case 'xoa':
          final ok = await confirmAction(
            context,
            title: 'Xoá báo giá ${phieu.so}?',
            message: 'Xoá hẳn phiếu này. Link đã gửi khách cũng hết dùng được.',
            confirmLabel: 'Xoá',
          );
          if (!ok) return;
          await repo.xoa(phieu.id);
          ds.boDi(phieu.id);
          if (context.mounted) showToast(context, 'Đã xoá ${phieu.so}');
      }
    } catch (e) {
      if (context.mounted) showToast(context, '$e', isError: true);
    }
  }
}

/// Hộp chọn phân loại: nhãn đang dùng, "Chưa phân loại", hoặc gõ nhãn mới. Trả null nếu bấm huỷ.
Future<String?> chonPhanLoai(BuildContext context, {required String hienTai, required List<String> dsLoai}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => _ChonPhanLoaiSheet(hienTai: hienTai, dsLoai: dsLoai),
  );
}

class _ChonPhanLoaiSheet extends StatefulWidget {
  const _ChonPhanLoaiSheet({required this.hienTai, required this.dsLoai});

  final String hienTai;
  final List<String> dsLoai;

  @override
  State<_ChonPhanLoaiSheet> createState() => _ChonPhanLoaiSheetState();
}

class _ChonPhanLoaiSheetState extends State<_ChonPhanLoaiSheet> {
  final _moi = TextEditingController();

  @override
  void dispose() {
    _moi.dispose();
    super.dispose();
  }

  void _xong() {
    final ten = _moi.text.trim();
    if (ten.isEmpty) return;
    Navigator.pop(context, ten.length > 40 ? ten.substring(0, 40) : ten);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
        children: [
          const Text('Phân loại phiếu', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text(
            'Mỗi phân loại là một tab ở danh sách. Khách không thấy nhãn này.',
            style: TextStyle(color: AppColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ChoiceChip(
                label: const Text('Chưa phân loại'),
                selected: widget.hienTai.isEmpty,
                onSelected: (_) => Navigator.pop(context, ''),
              ),
              for (final l in widget.dsLoai)
                ChoiceChip(
                  label: Text(l),
                  selected: widget.hienTai == l,
                  onSelected: (_) => Navigator.pop(context, l),
                ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _moi,
            maxLength: 40,
            textCapitalization: TextCapitalization.sentences,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _xong(),
            decoration: InputDecoration(
              labelText: 'Phân loại mới',
              hintText: 'VD: Khách sỉ, Thiết kế, Mô hình',
              suffixIcon: IconButton(
                tooltip: 'Dùng phân loại này',
                onPressed: _xong,
                icon: const Icon(Icons.check_rounded),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
