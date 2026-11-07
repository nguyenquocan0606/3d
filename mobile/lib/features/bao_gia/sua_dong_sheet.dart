import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/config/app_settings.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bao_gia.dart';
import '../../data/repositories/bao_gia_repository.dart';
import 'o_nhap.dart';

/// Hàm sửa một hạng mục của màn soạn: áp `f` lên bản mới nhất, trả bản sau khi sửa (null = dòng đã bị xoá).
typedef SuaDong = DongBaoGia? Function(String id, DongBaoGia Function(DongBaoGia) f);

/// Mở bảng sửa một hạng mục. Mọi thay đổi ghi thẳng vào phiếu ngay khi gõ (màn soạn tự lưu), nên
/// không có nút "Lưu" — vuốt xuống hay bấm Xong đều giữ nguyên những gì đã nhập.
Future<void> moSuaDong(
  BuildContext context, {
  required DongBaoGia dong,
  required int thuTu,
  required SuaDong suaDong,
  required double Function() tyLeSauCkTong,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surfaceAlt,
    builder: (_) => FractionallySizedBox(
      heightFactor: 0.94,
      child: _SuaDongSheet(dong: dong, thuTu: thuTu, suaDong: suaDong, tyLeSauCkTong: tyLeSauCkTong),
    ),
  );
}

class _SuaDongSheet extends ConsumerStatefulWidget {
  const _SuaDongSheet({
    required this.dong,
    required this.thuTu,
    required this.suaDong,
    required this.tyLeSauCkTong,
  });

  final DongBaoGia dong;
  final int thuTu;
  final SuaDong suaDong;
  final double Function() tyLeSauCkTong;

  @override
  ConsumerState<_SuaDongSheet> createState() => _SuaDongSheetState();
}

class _SuaDongSheetState extends ConsumerState<_SuaDongSheet> {
  late DongBaoGia d = widget.dong;
  int _dangTai = 0;

  void _sua(DongBaoGia Function(DongBaoGia) f) {
    final moi = widget.suaDong(d.id, f);
    if (moi != null && mounted) setState(() => d = moi);
  }

  Future<void> _themAnh(ImageSource nguon) async {
    final conCho = anhToiDaMoiDong - d.anh.length;
    if (conCho <= 0) {
      showToast(context, 'Mỗi hạng mục tối đa $anhToiDaMoiDong ảnh', isError: true);
      return;
    }
    final picker = ImagePicker();
    // Server tự thu nhỏ về cạnh 1600 px — thu bớt ở máy cho đỡ tốn 4G lúc gửi lên.
    final List<XFile> chon;
    try {
      if (nguon == ImageSource.camera) {
        final x = await picker.pickImage(source: ImageSource.camera, maxWidth: 2000, maxHeight: 2000, imageQuality: 85);
        chon = x == null ? const [] : [x];
      } else {
        chon = await picker.pickMultiImage(maxWidth: 2000, maxHeight: 2000, imageQuality: 85);
      }
    } catch (e) {
      if (mounted) {
        final cai = nguon == ImageSource.camera ? 'camera' : 'thư viện ảnh';
        showToast(context, 'Không mở được $cai: $e', isError: true);
      }
      return;
    }
    if (chon.isEmpty) return;
    final nhan = chon.take(conCho).toList();
    if (nhan.length < chon.length && mounted) {
      showToast(context, 'Mỗi hạng mục tối đa $anhToiDaMoiDong ảnh — bỏ bớt ${chon.length - nhan.length} ảnh');
    }
    final repo = ref.read(baoGiaRepositoryProvider);
    if (mounted) setState(() => _dangTai += nhan.length);
    for (final x in nhan) {
      try {
        final id = await repo.taiAnhLen(await x.readAsBytes(), x.name);
        // Đóng bảng giữa chừng thì vẫn gắn ảnh vào phiếu — `suaDong` là của màn soạn.
        final moi = widget.suaDong(d.id, (y) => y.copyWith(anh: [...y.anh, id].take(anhToiDaMoiDong).toList()));
        if (moi != null && mounted) setState(() => d = moi);
      } catch (e) {
        if (mounted) showToast(context, '$e', isError: true);
      } finally {
        if (mounted) setState(() => _dangTai--);
      }
    }
  }

  void _xemAnh(String url) {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.black,
        insetPadding: const EdgeInsets.all(12),
        child: Stack(
          children: [
            InteractiveViewer(maxScale: 5, child: Center(child: Image.network(url, fit: BoxFit.contain))),
            Positioned(
              right: 4,
              top: 4,
              child: IconButton.filledTonal(
                tooltip: 'Đóng',
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close_rounded),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mayChu = ref.watch(appSettingsProvider).baseUrl;
    final tyLe = widget.tyLeSauCkTong();
    final donVi = d.donVi.trim().isEmpty ? 'đv' : d.donVi.trim();
    final tuTinh = donGiaTheoGramGio(d);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 8, 6),
            child: Row(
              children: [
                Expanded(
                  child: Text('Hạng mục ${widget.thuTu}',
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                ),
                FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Xong')),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
              children: [
                ONhapChu(
                  nhan: 'Tên hạng mục',
                  goiY: 'VD: In móc khoá logo công ty',
                  giaTri: d.ten,
                  inDam: true,
                  toiDa: 300,
                  onDoi: (v) => _sua((x) => x.copyWith(ten: v)),
                ),
                const SizedBox(height: 12),
                ONhapChu(
                  nhan: 'Quy cách',
                  goiY: 'Nhựa PLA trắng, 5×3 cm, in 2 màu…',
                  giaTri: d.moTa,
                  soDong: 4,
                  onDoi: (v) => _sua((x) => x.copyWith(moTa: v)),
                ),
                const SizedBox(height: 14),
                _khoiAnh(mayChu),
                const SizedBox(height: 16),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: ONhapSo(
                        nhan: 'Số lượng',
                        giaTri: d.soLuong,
                        onDoi: (v) => _sua((x) => x.copyWith(soLuong: v)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ONhapChu(
                        nhan: 'Đơn vị',
                        giaTri: d.donVi,
                        toiDa: 30,
                        onDoi: (v) => _sua((x) => x.copyWith(donVi: v)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final v in donViGoiY)
                      ChipGon(nhan: v, chon: d.donVi == v, onTap: () => _sua((x) => x.copyWith(donVi: v))),
                  ],
                ),
                const SizedBox(height: 16),
                _khung(
                  tieuDe: 'Tính đơn giá theo gram & giờ in',
                  phu: tuTinh == null
                      ? 'Nhập gram hoặc giờ in thì đơn giá tự tính. Để trống cả hai để gõ đơn giá tay.'
                      : 'Đơn giá = gram × tiền/gr + giờ × tiền/giờ = ${dinhDangVnd(tuTinh)}',
                  children: [
                    ONhapSo(
                      nhan: 'Số gr / 1 sp',
                      hauTo: 'g',
                      giaTri: d.gram ?? 0,
                      onDoi: (v) => _sua((x) => suaGramGio(x, gram: v)),
                    ),
                    const SizedBox(height: 10),
                    ONhapSo(
                      nhan: 'Tiền / gr',
                      tien: true,
                      giaTri: d.giaGram ?? giaGramMacDinh,
                      goiY: goiYGiaGram,
                      onDoi: (v) => _sua((x) => suaGramGio(x, giaGram: v)),
                    ),
                    const SizedBox(height: 14),
                    ONhapSo(
                      nhan: 'Số giờ in / 1 sp',
                      hauTo: 'giờ',
                      giaTri: d.gioIn ?? 0,
                      onDoi: (v) => _sua((x) => suaGramGio(x, gioIn: v)),
                    ),
                    const SizedBox(height: 10),
                    ONhapSo(
                      nhan: 'Tiền / giờ in',
                      tien: true,
                      giaTri: d.giaGio ?? giaGioMacDinh,
                      goiY: goiYGiaGio,
                      onDoi: (v) => _sua((x) => suaGramGio(x, giaGio: v)),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 3,
                      child: ONhapSo(
                        nhan: 'Đơn giá',
                        tien: true,
                        giaTri: d.donGia,
                        onDoi: (v) => _sua((x) => x.copyWith(donGia: v).boGiaCanTay()),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: ONhapSo(
                        nhan: 'CK',
                        hauTo: '%',
                        toiDa: 100,
                        giaTri: lamTronPct(d.chietKhauPct),
                        onDoi: (v) => _sua((x) => x.copyWith(chietKhauPct: v).boGiaCanTay()),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                ONhapSo(
                  nhan: 'Phí khác / 1 sp',
                  tien: true,
                  tro: 'Cộng vào giá sản phẩm, không bị chiết khấu. Khách chỉ thấy giá đã gộp.',
                  giaTri: d.phiKhac ?? 0,
                  onDoi: (v) => _sua((x) => x.copyWith(phiKhac: v)),
                ),
                ..._canGiaSauGiam(tyLe),
                const SizedBox(height: 16),
                _thanhTien(donVi),
                ..._loiNhuan(donVi, tyLe),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _khoiAnh(String mayChu) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        NhanNhom('Ảnh sản phẩm (${d.anh.length}/$anhToiDaMoiDong) — hiện trên phiếu và link khách'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final a in d.anh)
              SizedBox(
                width: 72,
                height: 72,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned.fill(
                      child: GestureDetector(
                        onTap: () => _xemAnh('$mayChu${duongDanAnhDong(a)}'),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: ColoredBox(
                            color: Colors.white,
                            child: Image.network(
                              '$mayChu${duongDanAnhDong(a)}',
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) =>
                                  const Icon(Icons.broken_image_rounded, color: AppColors.muted),
                            ),
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      right: -8,
                      top: -8,
                      child: Material(
                        color: AppColors.background,
                        shape: const CircleBorder(side: BorderSide(color: AppColors.border)),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: () => _sua((x) => x.copyWith(anh: x.anh.where((y) => y != a).toList())),
                          child: const Padding(
                            padding: EdgeInsets.all(5),
                            child: Icon(Icons.close_rounded, size: 14),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            for (var i = 0; i < _dangTai; i++)
              Container(
                width: 72,
                height: 72,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.border),
                ),
                child: const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)),
              ),
          ],
        ),
        if (d.anh.length + _dangTai < anhToiDaMoiDong) ...[
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _themAnh(ImageSource.camera),
                  icon: const Icon(Icons.photo_camera_rounded),
                  label: const Text('Chụp ảnh'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _themAnh(ImageSource.gallery),
                  icon: const Icon(Icons.photo_library_rounded),
                  label: const Text('Chọn ảnh'),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  /// Tiền / gr và tiền / giờ sau giảm — giống `CanGiaSauGiam` của web: chỉ khi đơn giá đúng là
  /// tính từ gram/giờ, và có chiết khấu dòng hoặc chiết khấu tổng.
  List<Widget> _canGiaSauGiam(double tyLe) {
    if (donGiaTheoGramGio(d) != d.donGia) return const [];
    final coCkTong = tyLe < 1;
    if (d.chietKhauPct <= 0 && !coCkTong) return const [];
    final sau = giaSauCk(d);
    final truocGram = d.giaGram ?? giaGramMacDinh;
    final truocGio = d.giaGio ?? giaGioMacDinh;
    return [
      const SizedBox(height: 16),
      _khung(
        tieuDe: 'Căn giá sau giảm',
        mau: AppColors.success,
        phu: coCkTong
            ? 'Tính cả chiết khấu trên tổng, khách thực trả ${nhomNghin(jsRound(sau.gram * tyLe))} ₫/gr · '
                '${nhomNghin(jsRound(sau.gio * tyLe))} ₫/giờ'
            : 'Sửa giá ở đây thì CK % tự tính lại.',
        children: [
          if (d.chietKhauPct > 0 && (d.gram ?? 0) > 0) ...[
            ONhapSo(
              nhan: 'Tiền / gr sau giảm · trước ${nhomNghin(truocGram)}',
              tien: true,
              giaTri: sau.gram,
              goiY: goiYGiaSauCk(sau.gram, truocGram, 50),
              onDoi: (v) => _sua((x) => canGiaSauCk(x, gram: v)),
            ),
            const SizedBox(height: 12),
          ],
          if (d.chietKhauPct > 0 && (d.gioIn ?? 0) > 0)
            ONhapSo(
              nhan: 'Tiền / giờ sau giảm · trước ${nhomNghin(truocGio)}',
              tien: true,
              giaTri: sau.gio,
              goiY: goiYGiaSauCk(sau.gio, truocGio, 500),
              onDoi: (v) => _sua((x) => canGiaSauCk(x, gio: v)),
            ),
        ],
      ),
    ];
  }

  Widget _thanhTien(String donVi) {
    final coGiam = d.chietKhauPct > 0 || (d.phiKhac ?? 0) > 0;
    return SectionCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Thành tiền', style: TextStyle(color: AppColors.muted, fontSize: 13)),
                if (coGiam)
                  Text(
                    '${dinhDangVnd(donGiaSauCk(d))}/$donVi'
                    '${d.chietKhauPct > 0 ? ' sau CK' : ''}${(d.phiKhac ?? 0) > 0 ? ' gồm phí' : ''}',
                    style: const TextStyle(color: AppColors.success, fontSize: 12.5),
                  ),
              ],
            ),
          ),
          Text(
            dinhDangVnd(thanhTienDong(d)),
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _loiNhuan(String donVi, double tyLe) {
    final goc = giaGocDong(d);
    if (goc == null) return const [];
    final lai = loiNhuanMotSp(d, goc, tyLe);
    final mau = lai.tien < 0 ? AppColors.danger : AppColors.success;
    return [
      const SizedBox(height: 10),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('CHỈ XƯỞNG XEM',
                style:
                    TextStyle(fontSize: 11, letterSpacing: 0.8, color: AppColors.muted, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            InfoRow(label: 'Giá gốc / $donVi', value: dinhDangVnd(goc)),
            InfoRow(label: 'Lãi / $donVi', value: dinhDangVnd(lai.tien), valueColor: mau),
            InfoRow(label: 'Lợi nhuận trên giá gốc', value: hienPctLai(lai.pct), valueColor: mau),
          ],
        ),
      ),
    ];
  }

  Widget _khung({
    required String tieuDe,
    required String phu,
    required List<Widget> children,
    Color mau = AppColors.indigoLight,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: mau.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: mau.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(tieuDe, style: TextStyle(fontWeight: FontWeight.w800, color: mau)),
          const SizedBox(height: 2),
          Text(phu, style: const TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.35)),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

/// "12,5%" — % lợi nhuận một số lẻ như web, không có giá gốc thì "—".
String hienPctLai(double? pct) {
  if (pct == null) return '—';
  final r = jsRound(pct * 10) / 10;
  return '${soGon(r).replaceAll('.', ',')}%';
}
