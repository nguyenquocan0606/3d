import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import 'package:uuid/uuid.dart';

import '../../core/config/app_settings.dart';
import '../../core/format/formatters.dart';
import '../../core/mo_link.dart';
import '../../core/routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bao_gia.dart';
import '../../data/repositories/bao_gia_repository.dart';
import 'anh_phieu_screen.dart';
import 'bao_gia_screen.dart';
import 'chon_tu_may_tinh_sheet.dart';
import 'o_nhap.dart';
import 'sua_dong_sheet.dart';

enum _Luu { daLuu, cho, dang, loi }

/// Màn soạn một phiếu báo giá — port `src/components/PhieuBaoGia/trinh-soan.tsx`.
///
/// Tự lưu như web: gõ xong 0,8 giây là gửi nguyên phiếu lên (`PUT`), rời màn hình thì lưu nốt.
/// Không có xem trước tờ A4 vẽ lại trên app — nút "Ảnh phiếu / PDF" lấy ảnh do server chụp từ đúng
/// trang in của web, nên thứ khách nhận luôn giống hệt.
class SoanBaoGiaScreen extends ConsumerStatefulWidget {
  const SoanBaoGiaScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<SoanBaoGiaScreen> createState() => _SoanBaoGiaScreenState();
}

class _SoanBaoGiaScreenState extends ConsumerState<SoanBaoGiaScreen> {
  static const _uuid = Uuid();

  late final BaoGiaRepository _repo = ref.read(baoGiaRepositoryProvider);
  late final DanhSachBaoGiaNotifier _ds = ref.read(danhSachBaoGiaProvider.notifier);

  PhieuBaoGia? _p;
  Object? _loiTai;
  _Luu _luu = _Luu.daLuu;
  String? _loiLuu;
  Timer? _hen;

  /// Tăng mỗi lần sửa; lưu xong mà số này đã khác thì người dùng gõ thêm trong lúc chờ — lưu tiếp.
  int _banSua = 0;
  int _banDaLuu = 0;
  Future<bool>? _dangLuu;

  bool get _conChuaLuu => _banSua != _banDaLuu || _dangLuu != null;

  @override
  void initState() {
    super.initState();
    _tai();
  }

  Future<void> _tai() async {
    setState(() => _loiTai = null);
    try {
      final p = await _repo.lay(widget.id);
      if (mounted) setState(() => _p = p);
    } catch (e) {
      if (mounted) setState(() => _loiTai = e);
    }
  }

  @override
  void dispose() {
    _hen?.cancel();
    final p = _p;
    // Thoát màn hình khi còn sửa chưa lưu: lưu nốt ở nền, sau lượt đang chạy (nếu có).
    if (p != null && _banSua != _banDaLuu) {
      final repo = _repo;
      final ds = _ds;
      unawaited(
          (_dangLuu ?? Future.value(true)).then((_) => repo.luu(p.id, p.toJson())).then(ds.capNhat).catchError((_) {}));
    }
    super.dispose();
  }

  // ── Sửa & lưu ──────────────────────────────────────────────────────────────

  void _sua(PhieuBaoGia Function(PhieuBaoGia) f) {
    final p = _p;
    if (!mounted || p == null) return;
    setState(() {
      _p = f(p);
      _banSua++;
      _luu = _Luu.cho;
    });
    _hen?.cancel();
    _hen = Timer(const Duration(milliseconds: 800), _luuNgay);
  }

  DongBaoGia? _suaDong(String id, DongBaoGia Function(DongBaoGia) f) {
    DongBaoGia? moi;
    _sua((p) => p.copyWith(dong: [
          for (final d in p.dong)
            if (d.id == id) moi = f(d) else d,
        ]));
    return moi;
  }

  Future<bool> _luuNgay() async {
    _hen?.cancel();
    while (_dangLuu != null) {
      await _dangLuu;
    }
    final p = _p;
    if (p == null || _banSua == _banDaLuu) return _luu != _Luu.loi;
    final ban = _banSua;
    if (mounted) setState(() => _luu = _Luu.dang);

    Future<bool> viec() async {
      try {
        final kq = await _repo.luu(p.id, p.toJson());
        _banDaLuu = ban;
        _ds.capNhat(kq);
        if (mounted) {
          setState(() {
            _p = _p?.kemTuServer(kq);
            _luu = _banSua == _banDaLuu ? _Luu.daLuu : _Luu.cho;
            _loiLuu = null;
          });
          if (_banSua != _banDaLuu) _hen = Timer(const Duration(milliseconds: 800), _luuNgay);
        }
        return true;
      } catch (e) {
        if (mounted) {
          setState(() {
            _luu = _Luu.loi;
            _loiLuu = '$e';
          });
        }
        return false;
      }
    }

    final lam = viec();
    _dangLuu = lam;
    try {
      return await lam;
    } finally {
      _dangLuu = null;
    }
  }

  Future<void> _thoat() async {
    final ok = await _luuNgay();
    if (!mounted) return;
    if (!ok) {
      final van = await confirmAction(
        context,
        title: 'Chưa lưu được',
        message: '${_loiLuu ?? 'Lỗi kết nối.'}\n\nVẫn thoát? App sẽ thử lưu lại ở nền.',
        confirmLabel: 'Thoát',
      );
      if (!van || !mounted) return;
    }
    Navigator.of(context).pop();
  }

  /// Phiếu nháp mà đã gửi cho khách (chép link, gửi tin, gửi ảnh) thì chuyển "Đã gửi" như web.
  void _daGuiKhach() {
    if (_p?.trangThai == TrangThaiPhieu.nhap) _sua((p) => p.copyWith(trangThai: TrangThaiPhieu.daGui));
  }

  // ── Gửi khách ──────────────────────────────────────────────────────────────

  String _tinNhan(PhieuBaoGia p, String tenXuong) {
    final t = tinhTong(p);
    final ten = p.khach.ten.trim();
    final xung = ten.isNotEmpty ? 'anh/chị ${ten.split(RegExp(r'\s+')).last}' : 'anh/chị';
    return [
      'Chào $xung, $tenXuong gửi $xung báo giá ${p.so}${p.tieuDe.isNotEmpty ? ' — ${p.tieuDe}' : ''}:',
      '• Tổng cộng: ${dinhDangVnd(t.tongCong)}${p.vatPct > 0 ? ' (đã gồm VAT ${soGon(p.vatPct)}%)' : ''}',
      if (p.thoiGianGiao.isNotEmpty) '• Thời gian giao: ${p.thoiGianGiao}',
      '• Hiệu lực đến: ${hienNgay(p.hieuLucDen)}',
      '',
      'Xem chi tiết & đồng ý báo giá tại: ${linkKhach(p.token)}',
    ].join('\n');
  }

  Future<void> _moGuiKhach() async {
    final p = _p;
    if (p == null) return;
    final tenXuong = ref.read(caiDatBaoGiaProvider).valueOrNull?.tenXuong ?? 'Xưởng In 3D';
    final chon = await showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(8, 14, 8, 12),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
              child: Text('Gửi báo giá ${p.so}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: SelectableText(linkKhach(p.token), style: const TextStyle(fontSize: 12.5, color: AppColors.info)),
            ),
            const _MucGui(
              giaTri: 'tin',
              icon: Icons.send_rounded,
              tieuDe: 'Gửi tin nhắn kèm link',
              phu: 'Mở Zalo / Messenger với lời chào, tổng tiền và link xem & đồng ý',
            ),
            const _MucGui(
              giaTri: 'anh',
              icon: Icons.image_rounded,
              tieuDe: 'Gửi ảnh phiếu / PDF',
              phu: 'Ảnh tờ báo giá nét như bản in, kèm mã QR cọc',
            ),
            const _MucGui(giaTri: 'chep-tin', icon: Icons.notes_rounded, tieuDe: 'Chép tin nhắn'),
            const _MucGui(giaTri: 'chep-link', icon: Icons.link_rounded, tieuDe: 'Chép link'),
            const _MucGui(
              giaTri: 'mo',
              icon: Icons.open_in_new_rounded,
              tieuDe: 'Mở trang khách',
              phu: 'Xem đúng trang khách thấy (xưởng mở thì không tính là khách xem)',
            ),
          ],
        ),
      ),
    );
    if (chon == null || !mounted) return;
    // Link và ảnh lấy từ bản đã lưu — gửi trước khi lưu xong thì khách thấy bản cũ.
    final ok = await _luuNgay();
    if (!mounted) return;
    if (!ok) {
      showToast(context, 'Chưa lưu được phiếu: ${_loiLuu ?? ''}', isError: true);
      return;
    }
    final moi = _p!;
    switch (chon) {
      case 'tin':
        final kq = await Share.share(_tinNhan(moi, tenXuong), subject: 'Báo giá ${moi.so}');
        if (kq.status != ShareResultStatus.dismissed) _daGuiKhach();
      case 'anh':
        await Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => AnhPhieuScreen(phieu: moi, daGuiKhach: _daGuiKhach),
        ));
      case 'chep-tin':
        await Clipboard.setData(ClipboardData(text: _tinNhan(moi, tenXuong)));
        _daGuiKhach();
        if (mounted) showToast(context, 'Đã chép tin nhắn — dán vào Zalo / Messenger');
      case 'chep-link':
        await Clipboard.setData(ClipboardData(text: linkKhach(moi.token)));
        _daGuiKhach();
        if (mounted) showToast(context, 'Đã chép link gửi khách');
      case 'mo':
        await _moLink(linkKhach(moi.token));
    }
  }

  Future<void> _moLink(String url) => moLinkNgoai(context, url.trim());

  // ── Thao tác phiếu ─────────────────────────────────────────────────────────

  Future<void> _thaoTac(String v) async {
    final p = _p;
    if (p == null) return;
    try {
      switch (v) {
        case 'nhan-ban':
          await _luuNgay();
          final moi = await _repo.nhanBan(p.id);
          _ds.capNhat(moi);
          if (mounted) context.pushReplacement(Routes.phieuBaoGia(moi.id));
        case 'doi-link':
          final ok = await confirmAction(
            context,
            title: 'Tạo link khách mới?',
            message: 'Link cũ đã gửi đi sẽ không mở được nữa.',
            confirmLabel: 'Tạo link mới',
          );
          if (!ok) return;
          await _luuNgay();
          final moi = await _repo.doiLink(p.id);
          _ds.capNhat(moi);
          if (mounted) {
            setState(() => _p = _p?.kemTuServer(moi));
            showToast(context, 'Đã tạo link mới');
          }
        case 'xoa':
          final ok = await confirmAction(
            context,
            title: 'Xoá báo giá ${p.so}?',
            message: 'Xoá hẳn phiếu này. Link đã gửi khách cũng hết dùng được.',
            confirmLabel: 'Xoá',
          );
          if (!ok) return;
          _hen?.cancel();
          await _repo.xoa(p.id);
          _ds.boDi(p.id);
          // Không lưu nốt khi thoát — phiếu đã xoá.
          _banDaLuu = _banSua;
          if (mounted) {
            showToast(context, 'Đã xoá ${p.so}');
            Navigator.of(context).pop();
          }
      }
    } catch (e) {
      if (mounted) showToast(context, '$e', isError: true);
    }
  }

  // ── Giao diện ──────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final p = _p;
    if (p == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Báo giá')),
        body: _loiTai != null
            ? ErrorView(message: '$_loiTai', onRetry: _tai)
            : const Center(child: CircularProgressIndicator()),
      );
    }

    final caiDat = ref.watch(caiDatBaoGiaProvider).valueOrNull ?? const CaiDatBaoGia();
    final tatCa = ref.watch(danhSachBaoGiaProvider).valueOrNull ?? const <PhieuBaoGia>[];
    final t = tinhTong(p);
    final hetHan = hetHieuLuc(p);

    return PopScope(
      canPop: !_conChuaLuu,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _thoat();
      },
      child: Scaffold(
        appBar: AppBar(
          titleSpacing: 0,
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(p.so, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800)),
              _TrangThaiLuu(luu: _luu, onThuLai: _luuNgay),
            ],
          ),
          actions: [
            IconButton(
              tooltip: 'Ảnh phiếu / PDF',
              onPressed: () async {
                if (!await _luuNgay() || !context.mounted) return;
                await Navigator.of(context).push(MaterialPageRoute<void>(
                  builder: (_) => AnhPhieuScreen(phieu: _p!, daGuiKhach: _daGuiKhach),
                ));
              },
              icon: const Icon(Icons.image_rounded),
            ),
            PopupMenuButton<String>(
              onSelected: _thaoTac,
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'nhan-ban', child: Text('Nhân bản thành phiếu mới')),
                PopupMenuItem(value: 'doi-link', child: Text('Tạo link khách mới')),
                PopupMenuItem(value: 'xoa', child: Text('Xoá phiếu', style: TextStyle(color: AppColors.danger))),
              ],
            ),
          ],
        ),
        bottomNavigationBar: _thanhDuoi(p, t),
        body: GestureDetector(
          onTap: () => FocusScope.of(context).unfocus(),
          behavior: HitTestBehavior.translucent,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 32),
            children: [
              _khoiTrangThai(p, tatCa, hetHan),
              const SizedBox(height: 12),
              _khoiKhach(p, tatCa),
              const SizedBox(height: 12),
              _khoiHangMuc(p, t),
              const SizedBox(height: 12),
              _khoiThanhToan(p, t, caiDat),
              const SizedBox(height: 12),
              _TomTat(phieu: p, tong: t),
              const SizedBox(height: 12),
              _khoiGhiChu(p, caiDat),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: () => _thaoTac('nhan-ban'),
                    icon: const Icon(Icons.copy_all_rounded),
                    label: const Text('Nhân bản'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _thaoTac('doi-link'),
                    icon: const Icon(Icons.link_rounded),
                    label: const Text('Tạo link mới'),
                  ),
                  TextButton.icon(
                    style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                    onPressed: () => _thaoTac('xoa'),
                    icon: const Icon(Icons.delete_outline_rounded),
                    label: const Text('Xoá phiếu'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _thanhDuoi(PhieuBaoGia p, TongBaoGia t) {
    final khoan = khoanQr(p, t);
    final phu = switch (khoan.kieu) {
      KieuKhoanQr.hoaDon => 'Lấy hoá đơn · thanh toán 100%',
      KieuKhoanQr.thanhToan => 'Còn lại ${dinhDangVnd(khoan.soTien)}',
      KieuKhoanQr.coc => p.datCocPct > 0 ? 'Cọc ${soGon(p.datCocPct)}% = ${dinhDangVnd(t.datCoc)}' : 'Không cọc',
    };
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        dinhDangVnd(t.tongCong),
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                    Text(phu, style: const TextStyle(fontSize: 12.5, color: AppColors.success)),
                  ],
                ),
              ),
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size(0, AppSize.touchTarget)),
                onPressed: _moGuiKhach,
                icon: const Icon(Icons.send_rounded),
                label: const Text('Gửi khách'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _khoiTrangThai(PhieuBaoGia p, List<PhieuBaoGia> tatCa, bool hetHan) {
    final dsLoai = {
      for (final x in tatCa)
        if (x.phanLoai.isNotEmpty) x.phanLoai
    }.toList()
      ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const NhanNhom('Trạng thái'),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final s in TrangThaiPhieu.values)
                ChipGon(
                  nhan: s.nhan,
                  chon: p.trangThai == s,
                  mau: mauTrangThai(s),
                  onTap: () => _sua((x) => x.copyWith(trangThai: s)),
                ),
            ],
          ),
          if (p.trangThai == TrangThaiPhieu.chot && p.donHangMa == null)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text('Phiếu chốt sẽ tự tạo đơn hàng sau khi lưu.',
                  style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
            ),
          if (p.donHangMa != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Row(
                children: [
                  const Icon(Icons.assignment_turned_in_rounded, size: AppSize.iconSm, color: AppColors.info),
                  const SizedBox(width: 6),
                  Text('Đơn hàng ${p.donHangMa}',
                      style: const TextStyle(color: AppColors.info, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          if (p.khachChotLuc != null)
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.success.withValues(alpha: 0.4)),
              ),
              child: Text(
                'Khách tự bấm đồng ý lúc ${Fmt.dateTime(p.khachChotLuc)}'
                '${p.khachChotGhiChu != null ? '\n“${p.khachChotGhiChu}”' : ''}',
                style: const TextStyle(color: AppColors.success, height: 1.4),
              ),
            ),
          if (p.khachXemLuc != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('Khách xem lần cuối: ${Fmt.dateTime(p.khachXemLuc)}',
                  style: const TextStyle(fontSize: 12.5, color: AppColors.info)),
            ),
          const Divider(height: 24),
          ListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            leading: const Icon(Icons.sell_rounded, color: AppColors.muted),
            title: const Text('Phân loại'),
            subtitle: Text(p.phanLoai.isEmpty ? 'Chưa phân loại · khách không thấy' : p.phanLoai),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () async {
              final moi = await chonPhanLoai(context, hienTai: p.phanLoai, dsLoai: dsLoai);
              if (moi != null) _sua((x) => x.copyWith(phanLoai: moi));
            },
          ),
          const SizedBox(height: 6),
          ONhapChu(
            nhan: 'Tiêu đề phiếu',
            giaTri: p.tieuDe,
            toiDa: 200,
            onDoi: (v) => _sua((x) => x.copyWith(tieuDe: v)),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () => _chonHieuLuc(p),
                  child: InputDecorator(
                    decoration: InputDecoration(
                      labelText: 'Hiệu lực đến',
                      isDense: true,
                      errorText: hetHan ? 'Hết hiệu lực — khách không bấm đồng ý được' : null,
                      suffixIcon: const Icon(Icons.event_rounded),
                    ),
                    child: Text(hienNgay(p.hieuLucDen)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ONhapChu(
            nhan: 'Thời gian giao',
            giaTri: p.thoiGianGiao,
            onDoi: (v) => _sua((x) => x.copyWith(thoiGianGiao: v)),
          ),
        ],
      ),
    );
  }

  Future<void> _chonHieuLuc(PhieuBaoGia p) async {
    final hienTai = DateTime.tryParse(p.hieuLucDen) ?? DateTime.now();
    final chon = await showDatePicker(
      context: context,
      initialDate: hienTai,
      firstDate: DateTime(2024),
      lastDate: DateTime(2100),
      helpText: 'Báo giá có hiệu lực đến',
    );
    if (chon == null) return;
    final iso = '${chon.year.toString().padLeft(4, '0')}-${chon.month.toString().padLeft(2, '0')}-'
        '${chon.day.toString().padLeft(2, '0')}';
    _sua((x) => x.copyWith(hieuLucDen: iso));
  }

  Widget _khoiKhach(PhieuBaoGia p, List<PhieuBaoGia> tatCa) {
    // Danh bạ khách cũ để gõ tên là điền nốt SĐT, địa chỉ — giống web.
    final theoTen = <String, KhachBaoGia>{};
    for (final x in tatCa) {
      if (x.id == p.id) continue;
      final k = x.khach.tenHien;
      if (k.isNotEmpty) theoTen.putIfAbsent(k, () => x.khach);
    }
    final go = p.khach.ten.trim().toLowerCase();
    final goiY = go.length < 2
        ? const <KhachBaoGia>[]
        : theoTen.values
            .where((k) => k.tenHien.toLowerCase().contains(go) && k.tenHien.toLowerCase() != go)
            .take(4)
            .toList();
    final sdt = p.khach.sdt.trim();
    final link = p.khach.link.trim();

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const TieuDeKhoi(so: 1, chu: 'Khách hàng'),
          ONhapChu(
            nhan: 'Tên khách',
            goiY: 'Gõ tên — khách cũ sẽ gợi ý',
            giaTri: p.khach.ten,
            onDoi: (v) => _sua((x) => x.copyWith(khach: x.khach.copyWith(ten: v))),
            onXong: (v) {
              final k = theoTen[v.trim()];
              if (k != null && k.sdt != p.khach.sdt) _sua((x) => x.copyWith(khach: k));
            },
          ),
          if (goiY.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final k in goiY)
                  ActionChip(
                    avatar: const Icon(Icons.history_rounded, size: AppSize.iconSm),
                    label: Text([k.tenHien, if (k.sdt.isNotEmpty) k.sdt].join(' · ')),
                    onPressed: () {
                      FocusScope.of(context).unfocus();
                      _sua((x) => x.copyWith(khach: k));
                    },
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          ONhapChu(
            nhan: 'Công ty / cửa hàng',
            giaTri: p.khach.congTy,
            onDoi: (v) => _sua((x) => x.copyWith(khach: x.khach.copyWith(congTy: v))),
          ),
          const SizedBox(height: 12),
          ONhapChu(
            nhan: 'Số điện thoại / Zalo',
            giaTri: p.khach.sdt,
            kieuBanPhim: TextInputType.phone,
            cuoi: sdt.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Gọi',
                    onPressed: () => _moLink('tel:${sdt.replaceAll(RegExp(r'[^\d+]'), '')}'),
                    icon: const Icon(Icons.call_rounded),
                  ),
            onDoi: (v) => _sua((x) => x.copyWith(khach: x.khach.copyWith(sdt: v))),
          ),
          const SizedBox(height: 12),
          ONhapChu(
            nhan: 'Email',
            giaTri: p.khach.email,
            kieuBanPhim: TextInputType.emailAddress,
            onDoi: (v) => _sua((x) => x.copyWith(khach: x.khach.copyWith(email: v))),
          ),
          const SizedBox(height: 12),
          ONhapChu(
            nhan: 'Địa chỉ giao hàng',
            giaTri: p.khach.diaChi,
            onDoi: (v) => _sua((x) => x.copyWith(khach: x.khach.copyWith(diaChi: v))),
          ),
          const SizedBox(height: 12),
          ONhapChu(
            nhan: 'Link khách (Facebook, Messenger…)',
            tro: 'Chỉ xưởng xem, không in lên phiếu',
            giaTri: p.khach.link,
            kieuBanPhim: TextInputType.url,
            cuoi: RegExp(r'^https?://', caseSensitive: false).hasMatch(link)
                ? IconButton(
                    tooltip: 'Mở link khách',
                    onPressed: () => _moLink(link),
                    icon: const Icon(Icons.open_in_new_rounded),
                  )
                : null,
            onDoi: (v) => _sua((x) => x.copyWith(khach: x.khach.copyWith(link: v))),
          ),
        ],
      ),
    );
  }

  /// Bỏ những dòng trống trơn trước khi thêm dòng mẫu / từ máy tính giá — phiếu mới luôn có sẵn một dòng trống.
  List<DongBaoGia> _boDongTrong(List<DongBaoGia> ds) =>
      ds.where((x) => x.ten.trim().isNotEmpty || x.donGia > 0 || x.anh.isNotEmpty).toList();

  void _moDong(String id) {
    final p = _p;
    if (p == null) return;
    final i = p.dong.indexWhere((d) => d.id == id);
    if (i < 0) return;
    moSuaDong(
      context,
      dong: p.dong[i],
      thuTu: i + 1,
      suaDong: _suaDong,
      tyLeSauCkTong: () => _p == null ? 1 : tyLeSauCkTong(tinhTong(_p!)),
    );
  }

  Widget _khoiHangMuc(PhieuBaoGia p, TongBaoGia t) {
    final mayChu = ref.watch(appSettingsProvider).baseUrl;
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TieuDeKhoi(
            so: 2,
            chu: 'Hạng mục báo giá',
            cuoi: Text('${p.dong.length} dòng', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          ),
          if (p.dong.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('Chưa có hạng mục nào.', style: TextStyle(color: AppColors.muted)),
            ),
          for (var i = 0; i < p.dong.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _TheDong(
                key: ValueKey(p.dong[i].id),
                dong: p.dong[i],
                thuTu: i + 1,
                mayChu: mayChu,
                laDau: i == 0,
                laCuoi: i == p.dong.length - 1,
                onMo: () => _moDong(p.dong[i].id),
                onThaoTac: (v) => _thaoTacDong(i, v),
              ),
            ),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () {
                    final moi = DongBaoGia.trong(_uuid.v4());
                    _sua((x) => x.copyWith(dong: [...x.dong, moi]));
                    _moDong(moi.id);
                  },
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Thêm hạng mục'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final ds = await chonTuMayTinh(context);
                    if (ds == null || ds.isEmpty) return;
                    _sua((x) => x.copyWith(dong: [..._boDongTrong(x.dong), ...ds]));
                    if (mounted) showToast(context, 'Đã thêm ${ds.length} hạng mục');
                  },
                  icon: const Icon(Icons.calculate_rounded),
                  label: const Text('Từ máy tính giá'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final m in mauDongNhanh)
                ActionChip(
                  avatar: const Icon(Icons.add_rounded, size: AppSize.iconSm),
                  label: Text(m.ten, style: const TextStyle(fontSize: 12.5)),
                  onPressed: () => _sua((x) => x.copyWith(dong: [
                        ..._boDongTrong(x.dong),
                        DongBaoGia(id: _uuid.v4(), ten: m.ten, moTa: m.moTa, donVi: m.donVi),
                      ])),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _thaoTacDong(int i, String v) async {
    final p = _p;
    if (p == null || i >= p.dong.length) return;
    final d = p.dong[i];
    switch (v) {
      case 'len' || 'xuong':
        final j = v == 'len' ? i - 1 : i + 1;
        if (j < 0 || j >= p.dong.length) return;
        _sua((x) {
          final ds = [...x.dong];
          final tam = ds[i];
          ds[i] = ds[j];
          ds[j] = tam;
          return x.copyWith(dong: ds);
        });
      case 'nhan-doi':
        _sua((x) => x.copyWith(dong: [...x.dong.take(i + 1), d.copyWith(id: _uuid.v4()), ...x.dong.skip(i + 1)]));
      case 'xoa':
        if (d.ten.trim().isNotEmpty || d.donGia > 0) {
          final ok = await confirmAction(
            context,
            title: 'Xoá hạng mục?',
            message: d.ten.trim().isEmpty ? 'Xoá hạng mục ${i + 1}.' : 'Xoá "${d.ten.trim()}".',
            confirmLabel: 'Xoá',
          );
          if (!ok) return;
        }
        _sua((x) => x.copyWith(dong: x.dong.where((y) => y.id != d.id).toList()));
    }
  }

  Widget _khoiThanhToan(PhieuBaoGia p, TongBaoGia t, CaiDatBaoGia caiDat) {
    final vat = {0.0, 5.0, 8.0, 10.0, p.vatPct}.toList()..sort();
    final coc = {0.0, 30.0, 50.0, 70.0, 100.0, p.datCocPct}.toList()..sort();
    final kieuQr = p.kieuQr ?? KieuQr.coc;
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const TieuDeKhoi(so: 3, chu: 'Chiết khấu, thuế & thanh toán'),
          const NhanNhom('Chiết khấu trên tổng'),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SegmentedButton<bool>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: true, label: Text('%')),
                  ButtonSegment(value: false, label: Text('₫')),
                ],
                selected: {p.chietKhauTong.theoPct},
                onSelectionChanged: (s) =>
                    _sua((x) => x.copyWith(chietKhauTong: ChietKhauTong(theoPct: s.first, giaTri: 0))),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ONhapSo(
                  key: ValueKey(p.chietKhauTong.theoPct),
                  nhan: p.chietKhauTong.theoPct ? 'Phần trăm' : 'Số tiền',
                  tien: !p.chietKhauTong.theoPct,
                  hauTo: p.chietKhauTong.theoPct ? '%' : null,
                  toiDa: p.chietKhauTong.theoPct ? 100 : null,
                  giaTri: p.chietKhauTong.giaTri,
                  onDoi: (v) => _sua(
                      (x) => x.copyWith(chietKhauTong: ChietKhauTong(theoPct: x.chietKhauTong.theoPct, giaTri: v))),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ONhapSo(
            nhan: 'Phí vận chuyển',
            tien: true,
            giaTri: p.phiVanChuyen,
            onDoi: (v) => _sua((x) => x.copyWith(phiVanChuyen: v)),
          ),
          const SizedBox(height: 14),
          const NhanNhom('VAT'),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final v in vat)
                ChipGon(
                  nhan: v == 0 ? 'Không' : '${soGon(v)}%',
                  chon: p.vatPct == v,
                  onTap: () => _sua((x) => x.copyWith(vatPct: v)),
                ),
            ],
          ),
          const SizedBox(height: 14),
          const NhanNhom('Hoá đơn'),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              // Bỏ lấy hoá đơn thì trả cọc về mặc định — lúc lấy hoá đơn không có cọc.
              ChipGon(
                nhan: 'Không lấy · cọc ${soGon(p.layHoaDon ? caiDat.datCocPctMacDinh : p.datCocPct)}%',
                chon: !p.layHoaDon,
                onTap: () =>
                    _sua((x) => x.layHoaDon ? x.copyWith(layHoaDon: false, datCocPct: caiDat.datCocPctMacDinh) : x),
              ),
              ChipGon(
                nhan: 'Lấy hoá đơn · thanh toán 100%',
                chon: p.layHoaDon,
                onTap: () => _sua((x) => x.copyWith(layHoaDon: true)),
              ),
            ],
          ),
          if (p.layHoaDon)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                caiDat.coTaiKhoanHoaDon
                    ? 'QR thu đủ ${dinhDangVnd(t.tongCong)} vào tài khoản lấy hoá đơn '
                        '${caiDat.nganHangHoaDon} · ${caiDat.soTaiKhoanHoaDon}'
                    : 'Chưa điền tài khoản lấy hoá đơn (QR 2) ở Thông tin xưởng trên web — phiếu sẽ không có mã QR.',
                style: TextStyle(
                  fontSize: 12.5,
                  color: caiDat.coTaiKhoanHoaDon ? AppColors.muted : AppColors.warning,
                ),
              ),
            ),
          if (!p.layHoaDon) ...[
            const SizedBox(height: 14),
            const NhanNhom('Đặt cọc'),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final v in coc)
                  ChipGon(
                    nhan: v == 0 ? 'Không' : '${soGon(v)}%',
                    chon: p.datCocPct == v,
                    onTap: () => _sua((x) => x.copyWith(datCocPct: v)),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            const NhanNhom('Mã QR trên phiếu thu'),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                ChipGon(
                  nhan: 'Tiền cọc',
                  chon: kieuQr == KieuQr.coc,
                  onTap: () => _sua((x) => x.copyWith(kieuQr: KieuQr.coc)),
                ),
                // Lần đầu chuyển sang thanh toán: điền sẵn số cọc theo % làm "đã cọc".
                ChipGon(
                  nhan: 'Thanh toán còn lại',
                  chon: kieuQr == KieuQr.thanhToan,
                  onTap: () => _sua((x) => x.copyWith(
                        kieuQr: KieuQr.thanhToan,
                        daCoc: x.daCoc ?? (x.datCocPct > 0 ? tinhTong(x).datCoc : 0),
                      )),
                ),
              ],
            ),
            if (kieuQr == KieuQr.thanhToan) ...[
              const SizedBox(height: 12),
              ONhapSo(
                nhan: 'Khách đã cọc',
                tien: true,
                giaTri: p.daCoc ?? 0,
                onDoi: (v) => _sua((x) => x.copyWith(daCoc: v)),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _khoiGhiChu(PhieuBaoGia p, CaiDatBaoGia caiDat) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const TieuDeKhoi(so: 4, chu: 'Ghi chú & điều khoản'),
          ONhapChu(
            nhan: 'Ghi chú cho khách',
            goiY: 'VD: Giá áp dụng cho file khách cung cấp…',
            giaTri: p.ghiChu,
            soDong: 5,
            onDoi: (v) => _sua((x) => x.copyWith(ghiChu: v)),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Expanded(child: NhanNhom('Điều khoản (mỗi dòng một điều)')),
              TextButton.icon(
                onPressed: caiDat.dieuKhoanMacDinh.isEmpty
                    ? null
                    : () => _sua((x) => x.copyWith(dieuKhoan: caiDat.dieuKhoanMacDinh)),
                icon: const Icon(Icons.restart_alt_rounded, size: AppSize.iconSm),
                label: const Text('Lấy mặc định'),
              ),
            ],
          ),
          ONhapChu(
            nhan: 'Điều khoản',
            giaTri: p.dieuKhoan,
            soDong: 12,
            onDoi: (v) => _sua((x) => x.copyWith(dieuKhoan: v)),
          ),
        ],
      ),
    );
  }
}

class _MucGui extends StatelessWidget {
  const _MucGui({required this.giaTri, required this.icon, required this.tieuDe, this.phu});

  final String giaTri;
  final IconData icon;
  final String tieuDe;
  final String? phu;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: AppColors.indigoLight),
      title: Text(tieuDe, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: phu == null ? null : Text(phu!),
      onTap: () => Navigator.pop(context, giaTri),
    );
  }
}

class _TrangThaiLuu extends StatelessWidget {
  const _TrangThaiLuu({required this.luu, required this.onThuLai});

  final _Luu luu;
  final Future<bool> Function() onThuLai;

  @override
  Widget build(BuildContext context) {
    const nho = TextStyle(fontSize: 12, fontWeight: FontWeight.w500);
    return switch (luu) {
      _Luu.daLuu => Text('✓ Đã lưu', style: nho.copyWith(color: AppColors.success)),
      _Luu.cho => Text('Chưa lưu…', style: nho.copyWith(color: AppColors.muted)),
      _Luu.dang => Text('Đang lưu…', style: nho.copyWith(color: AppColors.muted)),
      _Luu.loi => GestureDetector(
          onTap: onThuLai,
          child: Text('Lưu lỗi — chạm để thử lại', style: nho.copyWith(color: AppColors.danger)),
        ),
    };
  }
}

class _TheDong extends StatelessWidget {
  const _TheDong({
    super.key,
    required this.dong,
    required this.thuTu,
    required this.mayChu,
    required this.laDau,
    required this.laCuoi,
    required this.onMo,
    required this.onThaoTac,
  });

  final DongBaoGia dong;
  final int thuTu;
  final String mayChu;
  final bool laDau;
  final bool laCuoi;
  final VoidCallback onMo;
  final ValueChanged<String> onThaoTac;

  @override
  Widget build(BuildContext context) {
    final d = dong;
    final donVi = d.donVi.trim().isEmpty ? 'đv' : d.donVi.trim();
    return Material(
      color: AppColors.surfaceAlt,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onMo,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 0, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 20,
                child: Text('$thuTu',
                    style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700, fontSize: 12.5)),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      d.ten.trim().isEmpty ? 'Chưa đặt tên — chạm để sửa' : d.ten,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: d.ten.trim().isEmpty ? AppColors.muted : null,
                      ),
                    ),
                    if (d.moTa.trim().isNotEmpty)
                      Text(d.moTa,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                    if (d.anh.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      SizedBox(
                        height: 40,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          children: [
                            for (final a in d.anh)
                              Padding(
                                padding: const EdgeInsets.only(right: 6),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(6),
                                  child: ColoredBox(
                                    color: Colors.white,
                                    child: Image.network(
                                      '$mayChu${duongDanAnhDong(a)}',
                                      width: 40,
                                      height: 40,
                                      fit: BoxFit.contain,
                                      errorBuilder: (_, __, ___) => const SizedBox(width: 40, height: 40),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${soGon(d.soLuong)} $donVi × ${dinhDangVnd(d.donGia)}'
                            '${d.chietKhauPct > 0 ? ' · CK ${soGon(lamTronPct(d.chietKhauPct))}%' : ''}'
                            '${(d.phiKhac ?? 0) > 0 ? ' · phí ${nhomNghin(d.phiKhac!)}' : ''}',
                            style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
                          ),
                        ),
                        Text(
                          dinhDangVnd(thanhTienDong(d)),
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                tooltip: 'Thao tác hạng mục',
                icon: const Icon(Icons.more_vert_rounded, color: AppColors.muted),
                onSelected: onThaoTac,
                itemBuilder: (_) => [
                  PopupMenuItem(value: 'len', enabled: !laDau, child: const Text('Lên trên')),
                  PopupMenuItem(value: 'xuong', enabled: !laCuoi, child: const Text('Xuống dưới')),
                  const PopupMenuItem(value: 'nhan-doi', child: Text('Nhân đôi dòng')),
                  const PopupMenuItem(
                    value: 'xoa',
                    child: Text('Xoá dòng', style: TextStyle(color: AppColors.danger)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Tóm tắt số tiền — giống khối tối màu bên phải mục 3 của web, kèm lợi nhuận "chỉ xưởng xem".
class _TomTat extends StatelessWidget {
  const _TomTat({required this.phieu, required this.tong});

  final PhieuBaoGia phieu;
  final TongBaoGia tong;

  @override
  Widget build(BuildContext context) {
    final p = phieu;
    final t = tong;
    final khoan = khoanQr(p, t);
    final lai = loiNhuanPhieu(p);
    final ck = t.chietKhauDong + t.chietKhauTong;

    Widget dong(String nhan, String giaTri, {Color? mau, bool dam = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(
            children: [
              Expanded(child: Text(nhan, style: const TextStyle(color: Colors.white70))),
              Text(
                giaTri,
                style: TextStyle(
                  color: mau ?? Colors.white,
                  fontWeight: dam ? FontWeight.w700 : FontWeight.w500,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        );

    final mauLai = lai.tien < 0 ? AppColors.danger : AppColors.success;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1E1B4B), Color(0xFF0F172A)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          dong('Tạm tính', dinhDangVnd(t.tamTinh)),
          dong('Chiết khấu', ck > 0 ? '−${dinhDangVnd(ck)}' : dinhDangVnd(0)),
          dong('Vận chuyển', dinhDangVnd(t.phiVanChuyen)),
          dong('VAT ${soGon(p.vatPct)}%', dinhDangVnd(t.vat)),
          const Divider(color: Colors.white24, height: 20),
          const Text('TỔNG CỘNG',
              style: TextStyle(fontSize: 11, letterSpacing: 1, color: Colors.white54, fontWeight: FontWeight.w700)),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              dinhDangVnd(t.tongCong),
              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Colors.white),
            ),
          ),
          Text('Bằng chữ: ${docSoTien(t.tongCong)}',
              style: const TextStyle(fontSize: 12.5, color: Colors.white60, fontStyle: FontStyle.italic)),
          const SizedBox(height: 8),
          ...switch (khoan.kieu) {
            KieuKhoanQr.hoaDon => [
                dong('Lấy hoá đơn · thanh toán 100%', dinhDangVnd(t.tongCong), mau: AppColors.success, dam: true),
              ],
            KieuKhoanQr.thanhToan => [
                dong('Đã cọc', '−${dinhDangVnd(khoan.daCoc)}'),
                dong('Còn lại cần thanh toán', dinhDangVnd(khoan.soTien), mau: AppColors.success, dam: true),
              ],
            KieuKhoanQr.coc => [
                if (p.datCocPct > 0)
                  dong('Cọc ${soGon(p.datCocPct)}%', dinhDangVnd(t.datCoc), mau: AppColors.success, dam: true),
              ],
          },
          if (lai.giaGoc > 0) ...[
            const Divider(color: Colors.white24, height: 20),
            const Text('CHỈ XƯỞNG XEM',
                style: TextStyle(fontSize: 11, letterSpacing: 1, color: Colors.white54, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            if (t.phiKhac > 0) dong('Phí khác đã gộp vào giá', dinhDangVnd(t.phiKhac)),
            dong('Giá gốc', dinhDangVnd(lai.giaGoc)),
            dong('Lãi', dinhDangVnd(lai.tien), mau: mauLai, dam: true),
            dong('% lợi nhuận trên giá gốc', hienPctLai(lai.pct), mau: mauLai, dam: true),
            const SizedBox(height: 4),
            Text(
              'Không tính vận chuyển, phí khác, VAT'
              '${lai.soDongChuaCoGoc > 0 ? ' và ${lai.soDongChuaCoGoc} hạng mục chưa có gr / giờ' : ''}.',
              style: const TextStyle(fontSize: 11.5, color: Colors.white54),
            ),
          ],
        ],
      ),
    );
  }
}
