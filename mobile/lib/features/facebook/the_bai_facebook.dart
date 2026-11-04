import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_settings.dart';
import '../../core/format/formatters.dart';
import '../../core/mo_link.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/facebook.dart';
import '../../data/providers.dart';

const _nguonViTri = {'ho-so': 'hồ sơ', 'binh-luan': 'bình luận', 'bai-viet': 'bài viết'};

/// Bài dài hơn chừng này thì thu gọn, bấm "Xem thêm" mới hiện hết.
const _kyTuThuGon = 280;

/// Thẻ một bài Facebook. Mọi thao tác nằm ở màn cha; thẻ chỉ giữ trạng thái hiển thị.
class TheBaiFacebook extends StatefulWidget {
  const TheBaiFacebook({
    super.key,
    required this.bai,
    required this.tenNhom,
    required this.mauBinhLuan,
    required this.onDoiTrangThai,
    required this.onMoLink,
    required this.onBinhLuan,
    required this.onHuyBinhLuan,
    required this.onNhanTin,
    required this.onTimLaiViTri,
    required this.onChan,
  });

  final BaiFacebook bai;

  /// Tên nhóm nếu bài nhặt được lúc quét nhóm.
  final String? tenNhom;
  final String mauBinhLuan;
  final void Function(String trangThai) onDoiTrangThai;
  final VoidCallback onMoLink;
  final Future<void> Function(String noiDung) onBinhLuan;
  final VoidCallback onHuyBinhLuan;
  final VoidCallback onNhanTin;
  final VoidCallback onTimLaiViTri;
  final VoidCallback onChan;

  @override
  State<TheBaiFacebook> createState() => _TheBaiFacebookState();
}

class _TheBaiFacebookState extends State<TheBaiFacebook> {
  bool _moRong = false;
  bool _dangGui = false;

  BaiFacebook get b => widget.bai;

  // Lấy thẳng từ mẫu đã cài — bấm một lần là xếp cho agent, lỡ tay thì "Huỷ bình luận".
  Future<void> _guiBinhLuan() async {
    final noiDung = dienMau(widget.mauBinhLuan, b.tacGia);
    if (noiDung.trim().isEmpty) return;
    setState(() => _dangGui = true);
    await widget.onBinhLuan(noiDung);
    if (mounted) setState(() => _dangGui = false);
  }

  Future<void> _moBai() async {
    final url = b.url;
    if (url == null) return;
    widget.onMoLink();
    await moLinkNgoai(context, url);
  }

  Future<void> _xacNhanChan() async {
    final dongY = await confirmAction(
      context,
      title: 'Chặn ${b.tacGia ?? 'người này'}?',
      message: 'Bài sau của họ sẽ bị bỏ qua luôn, không chấm. Gỡ chặn trên web, phần danh sách đen.',
      confirmLabel: 'Chặn',
    );
    if (dongY) widget.onChan();
  }

  void _moViTri() {
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      builder: (context) => _ChiTietViTri(
        bai: b,
        onTimLai: () {
          Navigator.pop(context);
          widget.onTimLaiViTri();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final dai = b.noiDung.length > _kyTuThuGon;
    return SectionCard(
      padding: const EdgeInsets.all(12),
      borderColor: b.laKhach == true && b.trangThai == 'moi'
          ? AppColors.success.withValues(alpha: 0.55)
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(spacing: 6, runSpacing: 6, children: _cacNhan()),
          const SizedBox(height: 8),
          _DongTacGia(bai: b),
          if (b.lyDo != null && b.laKhach == true) ...[
            const SizedBox(height: 8),
            Text(
              b.lyDo!,
              style: const TextStyle(
                fontSize: AppSize.textBody,
                fontWeight: FontWeight.w600,
                color: AppColors.success,
              ),
            ),
          ],
          const SizedBox(height: 6),
          if (dai && !_moRong)
            Text(
              b.noiDung,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: AppSize.textBody, height: 1.4),
            )
          else
            SelectableText(
              b.noiDung,
              style: const TextStyle(fontSize: AppSize.textBody, height: 1.4),
            ),
          if (dai)
            TextButton(
              style: TextButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: const Size(0, 36),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              onPressed: () => setState(() => _moRong = !_moRong),
              child: Text(_moRong ? 'Thu gọn' : 'Xem thêm'),
            ),
          if (b.anh.isNotEmpty) ...[
            const SizedBox(height: 8),
            _AnhCuaBai(bai: b, onMoBai: _moBai),
          ],
          ..._cacDongPhu(),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: _cacNut()),
        ],
      ),
    );
  }

  List<Widget> _cacNhan() {
    return [
      NhanFacebook('K${b.maSo}', mau: Colors.white, dam: true),
      if (b.laKhach == true)
        NhanFacebook(
          'Khách · ${b.doTinCay ?? '?'}%',
          icon: Icons.auto_awesome_rounded,
          mau: AppColors.success,
          dam: true,
        ),
      if (b.laKhach == true) _nhanViTri(),
      if (b.laKhach == false) const NhanFacebook('Không phải khách', mau: AppColors.muted),
      if (b.laKhach == null) const NhanFacebook('Chưa chấm', mau: AppColors.warning),
      if (b.trangThai == 'da-lien-he') const NhanFacebook('Đã liên hệ', mau: AppColors.info),
      if (b.lanMoLink != null)
        NhanFacebook(
          'Đã mở link · ${Fmt.gioNgay(b.lanMoLink)}',
          icon: Icons.visibility_rounded,
          mau: AppColors.indigoLight,
        ),
      if (b.lanBaoZalo != null) const NhanFacebook('Đã báo Zalo', mau: AppColors.info),
      if (b.binhLuanDangCho)
        NhanFacebook(
          (b.binhLuanTrangThai == 'cho' ? 'Chờ agent bình luận' : 'Agent đang bình luận') +
              (b.binhLuanTuDong ? ' · tự động' : ''),
          icon: Icons.hourglass_top_rounded,
          mau: AppColors.warning,
        ),
      if (b.binhLuanTrangThai == 'da-gui' && b.binhLuanLuc != null)
        NhanFacebook(
          '${b.binhLuanTuDong ? 'Đã tự bình luận' : 'Đã bình luận'} · ${Fmt.gioNgay(b.binhLuanLuc)}',
          icon: Icons.chat_bubble_rounded,
          mau: AppColors.success,
        ),
      if (b.binhLuanGiuLai != null && b.binhLuanTrangThai == null && b.trangThai == 'moi')
        const NhanFacebook('✋ Chưa tự bình luận', mau: AppColors.warning, dam: true),
      if (b.binhLuanTrangThai == 'loi') const NhanFacebook('Bình luận lỗi', mau: AppColors.danger),
      if (b.tinNhan.isNotEmpty) _nhanTinNhan(),
      if (widget.tenNhom != null)
        NhanFacebook(widget.tenNhom!, icon: Icons.groups_rounded, mau: AppColors.muted),
    ];
  }

  Widget _nhanViTri() {
    if (b.dangTimViTri) {
      final chu = switch (b.viTriTrangThai) {
        'cho-llm' => 'LLM đang tìm vị trí',
        'dang-thu-thap' => 'Agent đang đọc hồ sơ',
        _ => 'Chờ tìm vị trí',
      };
      return NhanFacebook(chu, icon: Icons.hourglass_top_rounded, mau: AppColors.muted);
    }
    final coViTri = b.viTriTrangThai == 'xong' && b.viTri != null;
    final nhan = coViTri
        ? b.viTriDayDu!
        : switch (b.viTriTrangThai) {
            'xong' => 'Chưa rõ vị trí',
            'loi' => 'Lỗi tìm vị trí',
            _ => 'Tìm vị trí',
          };
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: _moViTri,
      child: NhanFacebook(
        nhan,
        icon: Icons.place_rounded,
        mau: coViTri ? const Color(0xFFFB7185) : AppColors.muted,
        dam: coViTri,
      ),
    );
  }

  Widget _nhanTinNhan() {
    final cuoi = b.tinNhan.last;
    if (cuoi.trangThai == 'loi') return const NhanFacebook('Nhắn tin lỗi', mau: AppColors.danger);
    if (cuoi.dangCho) {
      return const NhanFacebook('Chờ agent nhắn tin', icon: Icons.hourglass_top_rounded, mau: AppColors.warning);
    }
    final daGui = b.tinNhan.where((t) => t.trangThai == 'da-gui').length;
    return NhanFacebook(
      'Đã nhắn $daGui tin · ${Fmt.gioNgay(cuoi.luc)}',
      icon: Icons.send_rounded,
      mau: AppColors.indigoLight,
    );
  }

  /// Trên điện thoại không có rê chuột như web nên nội dung bình luận và lỗi phải hiện thẳng ra.
  List<Widget> _cacDongPhu() {
    const nho = TextStyle(fontSize: AppSize.textCaption, color: AppColors.muted, height: 1.4);
    const loi = TextStyle(fontSize: AppSize.textCaption, color: AppColors.danger, height: 1.4);
    final dong = <Widget>[
      if (b.binhLuanGiuLai != null && b.binhLuanTrangThai == null && b.trangThai == 'moi')
        Text(
          'Máy không tự bình luận: ${b.binhLuanGiuLai}',
          style: const TextStyle(fontSize: AppSize.textCaption, color: AppColors.warning, height: 1.4),
        ),
      if (b.lyDo != null && b.laKhach == false) Text('LLM: ${b.lyDo}', style: nho),
      if (b.loiChamDiem != null && b.laKhach == null) Text('Lỗi chấm: ${b.loiChamDiem}', style: loi),
      if (b.binhLuanNoiDung != null && (b.binhLuanDangCho || b.binhLuanTrangThai == 'da-gui'))
        Text('Bình luận: “${b.binhLuanNoiDung}”', style: nho),
      if (b.binhLuanTrangThai == 'loi' && b.binhLuanLoi != null)
        Text('Bình luận lỗi: ${b.binhLuanLoi}', style: loi),
    ];
    return [
      for (final d in dong) ...[const SizedBox(height: 6), d],
    ];
  }

  List<Widget> _cacNut() {
    return [
      if (b.url != null)
        _Nut(
          chu: 'Mở bài viết',
          icon: Icons.open_in_new_rounded,
          nhan: true,
          onTap: _moBai,
        ),
      if (b.url != null && !b.binhLuanDangCho)
        _Nut(
          chu: b.binhLuanTrangThai != null ? 'Bình luận lại' : 'Bình luận',
          icon: Icons.chat_bubble_outline_rounded,
          mau: AppColors.indigoLight,
          onTap: _dangGui ? null : _guiBinhLuan,
        ),
      if (b.binhLuanTrangThai == 'cho')
        _Nut(chu: 'Huỷ bình luận', mau: AppColors.muted, onTap: widget.onHuyBinhLuan),
      if (b.coTrangCaNhan)
        _Nut(
          chu: b.tinNhan.isEmpty ? 'Nhắn tin' : 'Nhắn tin (${b.tinNhan.length})',
          icon: Icons.send_rounded,
          mau: AppColors.indigoLight,
          onTap: widget.onNhanTin,
        ),
      if (b.trangThai != 'da-lien-he')
        _Nut(
          chu: 'Đã liên hệ',
          icon: Icons.check_circle_outline_rounded,
          onTap: () => widget.onDoiTrangThai('da-lien-he'),
        ),
      if (b.trangThai != 'bo-qua')
        _Nut(
          chu: 'Bỏ qua',
          icon: Icons.block_rounded,
          mau: AppColors.muted,
          onTap: () => widget.onDoiTrangThai('bo-qua'),
        ),
      if (b.trangThai != 'moi')
        _Nut(
          chu: 'Đưa về mới',
          icon: Icons.undo_rounded,
          mau: AppColors.muted,
          onTap: () => widget.onDoiTrangThai('moi'),
        ),
      if (b.tacGiaUrl != null)
        _Nut(
          chu: 'Chặn người này',
          icon: Icons.person_off_rounded,
          mau: AppColors.danger,
          onTap: _xacNhanChan,
        ),
    ];
  }
}

/// Nhãn nhỏ. Không dùng `StatusChip` vì tên nhóm hay vị trí có thể dài hơn cả thẻ — phải cắt bớt
/// chứ không được tràn.
class NhanFacebook extends StatelessWidget {
  const NhanFacebook(this.chu, {super.key, required this.mau, this.icon, this.dam = false});

  final String chu;
  final Color mau;
  final IconData? icon;
  final bool dam;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: mau.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: mau),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              chu,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: AppSize.textCaption,
                fontWeight: dam ? FontWeight.w700 : FontWeight.w500,
                color: mau,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Nut extends StatelessWidget {
  const _Nut({
    required this.chu,
    required this.onTap,
    this.icon,
    this.mau,
    this.nhan = false,
  });

  final String chu;
  final VoidCallback? onTap;
  final IconData? icon;
  final Color? mau;

  /// Nút chính của thẻ, tô nền.
  final bool nhan;

  @override
  Widget build(BuildContext context) {
    const dem = EdgeInsets.symmetric(horizontal: 12);
    const co = Size(0, 40);
    const chuNho = TextStyle(fontSize: 13, fontWeight: FontWeight.w600);
    final bieuTuong = icon == null ? null : Icon(icon, size: AppSize.iconSm);
    if (nhan) {
      return FilledButton.icon(
        style: FilledButton.styleFrom(padding: dem, minimumSize: co, textStyle: chuNho),
        onPressed: onTap,
        icon: bieuTuong,
        label: Text(chu),
      );
    }
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        padding: dem,
        minimumSize: co,
        textStyle: chuNho,
        foregroundColor: mau ?? const Color(0xFFE2E8F0),
        side: BorderSide(color: (mau ?? AppColors.muted).withValues(alpha: 0.45)),
      ),
      onPressed: onTap,
      icon: bieuTuong,
      label: Text(chu),
    );
  }
}

class _DongTacGia extends StatelessWidget {
  const _DongTacGia({required this.bai});

  final BaiFacebook bai;

  @override
  Widget build(BuildContext context) {
    final url = bai.tacGiaUrl;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (bai.tacGia != null)
          InkWell(
            onTap: url == null ? null : () => moLinkNgoai(context, url),
            child: Text(
              bai.tacGia!,
              style: TextStyle(
                fontSize: AppSize.textBody,
                fontWeight: FontWeight.w700,
                decoration: url == null ? null : TextDecoration.underline,
                decorationColor: AppColors.muted,
              ),
            ),
          ),
        Text(
          [
            if (bai.thoiGianDang != null) 'đăng ${Fmt.tuongDoi(bai.thoiGianDang)}',
            'quét ${Fmt.gioNgay(bai.createdAt)}${bai.agent != null ? ' bởi ${bai.agent}' : ''}',
          ].join(' · '),
          style: const TextStyle(fontSize: AppSize.textCaption, color: AppColors.muted),
        ),
      ],
    );
  }
}

/// Vị trí khách: web cho rê chuột xem căn cứ, điện thoại thì bấm mở bảng này.
class _ChiTietViTri extends StatelessWidget {
  const _ChiTietViTri({required this.bai, required this.onTimLai});

  final BaiFacebook bai;
  final VoidCallback onTimLai;

  @override
  Widget build(BuildContext context) {
    final nguon = _nguonViTri[bai.viTriNguon];
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            bai.viTriDayDu ?? 'Chưa rõ vị trí',
            style: const TextStyle(fontSize: AppSize.textTitle, fontWeight: FontWeight.w700),
          ),
          if (nguon != null) ...[
            const SizedBox(height: 4),
            Text(
              'Từ $nguon${bai.viTriDoTinCay != null ? ' · tin cậy ${bai.viTriDoTinCay}%' : ''}',
              style: const TextStyle(fontSize: AppSize.textCaption, color: AppColors.muted),
            ),
          ],
          if (bai.viTriCanCu != null) ...[
            const SizedBox(height: 10),
            Text(bai.viTriCanCu!, style: const TextStyle(fontSize: AppSize.textBody, height: 1.4)),
          ],
          if (bai.viTriLoi != null) ...[
            const SizedBox(height: 10),
            Text(
              'Lỗi: ${bai.viTriLoi}',
              style: const TextStyle(fontSize: AppSize.textCaption, color: AppColors.danger),
            ),
          ],
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: onTimLai,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Tìm lại vị trí'),
          ),
        ],
      ),
    );
  }
}

/// Ảnh đính kèm bài. Bài khách thì ảnh đã tải về máy chủ nên xem lại lúc nào cũng được; bài thường
/// hiện thẳng từ Facebook, link đó hết hạn sau ít hôm.
class _AnhCuaBai extends ConsumerWidget {
  const _AnhCuaBai({required this.bai, required this.onMoBai});

  static const _soAnhHien = 4;
  static const _coThe = 72.0;

  final BaiFacebook bai;
  final VoidCallback onMoBai;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final baseUrl = ref.watch(appSettingsProvider).baseUrl;
    final soHien = bai.anh.length < _soAnhHien ? bai.anh.length : _soAnhHien;
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (var i = 0; i < soHien; i++)
          GestureDetector(
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                fullscreenDialog: true,
                builder: (_) => _XemAnh(bai: bai, baseUrl: baseUrl, batDau: i, onMoBai: onMoBai),
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SizedBox.square(
                dimension: _coThe,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.network(
                      bai.nguonAnh(i, baseUrl),
                      fit: BoxFit.cover,
                      // Thẻ chỉ hiện 72dp: giải mã nhỏ lại cho danh sách dài khỏi ngốn RAM.
                      cacheWidth: 216,
                      errorBuilder: (_, __, ___) => Container(
                        color: AppColors.surfaceAlt,
                        alignment: Alignment.center,
                        padding: const EdgeInsets.all(4),
                        child: const Text(
                          'Ảnh hết hạn',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 11, color: AppColors.muted),
                        ),
                      ),
                    ),
                    if (bai.anh[i].laVideo)
                      const ColoredBox(
                        color: Colors.black38,
                        child: Icon(Icons.play_arrow_rounded, color: Colors.white),
                      ),
                    if (i == soHien - 1 && bai.anh.length > soHien)
                      ColoredBox(
                        color: Colors.black54,
                        child: Center(
                          child: Text(
                            '+${bai.anh.length - soHien}',
                            style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.white),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _XemAnh extends StatefulWidget {
  const _XemAnh({
    required this.bai,
    required this.baseUrl,
    required this.batDau,
    required this.onMoBai,
  });

  final BaiFacebook bai;
  final String baseUrl;
  final int batDau;
  final VoidCallback onMoBai;

  @override
  State<_XemAnh> createState() => _XemAnhState();
}

class _XemAnhState extends State<_XemAnh> {
  late final _trang = PageController(initialPage: widget.batDau);
  late int _dangXem = widget.batDau;

  @override
  void dispose() {
    _trang.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds = widget.bai.anh;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: Text(
          '${_dangXem + 1}/${ds.length}${ds[_dangXem].laVideo ? ' · ảnh bìa video' : ''}',
          style: const TextStyle(fontSize: AppSize.textTitle),
        ),
        actions: [
          if (widget.bai.url != null)
            TextButton(onPressed: widget.onMoBai, child: const Text('Mở bài viết')),
        ],
      ),
      body: PageView.builder(
        controller: _trang,
        itemCount: ds.length,
        onPageChanged: (i) => setState(() => _dangXem = i),
        itemBuilder: (context, i) => InteractiveViewer(
          maxScale: 4,
          child: Center(
            child: Image.network(
              widget.bai.nguonAnh(i, widget.baseUrl),
              fit: BoxFit.contain,
              loadingBuilder: (_, anh, tienDo) =>
                  tienDo == null ? anh : const CircularProgressIndicator(),
              errorBuilder: (_, __, ___) => const Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Link ảnh đã hết hạn — mở bài viết để xem.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.muted),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Nhắn Messenger cho người đăng: đoạn tin đã gửi + ô soạn. Agent gửi bằng nick Facebook đang chạy
/// (trong vòng 1 phút); khách trả lời thì đọc trong Messenger của nick đó.
///
/// Theo dõi danh sách để tin nhảy trạng thái ngay trong bảng. Bài có thể rời danh sách giữa chừng
/// (vừa gửi xong là sang "Đã liên hệ"), khi đó giữ bản cuối cùng thấy được.
class KhungTinNhanFacebook extends ConsumerStatefulWidget {
  const KhungTinNhanFacebook({
    super.key,
    required this.baiBanDau,
    required this.loc,
    required this.mauTinNhan,
    required this.onGui,
    required this.onHuy,
  });

  final BaiFacebook baiBanDau;
  final LocKhach loc;
  final String mauTinNhan;

  /// Trả câu lỗi, hoặc null nếu đã xếp được.
  final Future<String?> Function(String noiDung) onGui;
  final void Function(String tinId) onHuy;

  @override
  ConsumerState<KhungTinNhanFacebook> createState() => _KhungTinNhanFacebookState();
}

class _KhungTinNhanFacebookState extends ConsumerState<KhungTinNhanFacebook> {
  late BaiFacebook _bai = widget.baiBanDau;

  // Lần đầu nhắn thì soạn sẵn theo mẫu; nhắn tiếp thì để trống cho gõ câu mới.
  late final _chu = TextEditingController(
    text: widget.baiBanDau.tinNhan.isEmpty ? dienMau(widget.mauTinNhan, widget.baiBanDau.tacGia) : '',
  );
  bool _dangGui = false;
  String? _loi;

  @override
  void dispose() {
    _chu.dispose();
    super.dispose();
  }

  Future<void> _gui() async {
    if (_chu.text.trim().isEmpty) return;
    setState(() {
      _dangGui = true;
      _loi = null;
    });
    final loi = await widget.onGui(_chu.text);
    if (!mounted) return;
    setState(() {
      _dangGui = false;
      _loi = loi;
      if (loi == null) _chu.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final moiNhat = ref.watch(khachFacebookProvider(widget.loc)).valueOrNull?.bai;
    for (final b in moiNhat ?? const <BaiFacebook>[]) {
      if (b.id == _bai.id) _bai = b;
    }
    final dangCho = _bai.tinNhan.any((t) => t.dangCho);

    // Cuộn được cả bảng: máy nhỏ mở bàn phím lên thì không còn đủ chỗ cho hết các phần.
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Nhắn cho ${_bai.tacGia ?? 'khách'}',
            style: const TextStyle(fontSize: AppSize.textTitle, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          if (_bai.tinNhan.isNotEmpty)
            ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.4),
              child: ListView(
                shrinkWrap: true,
                reverse: true,
                children: [
                  for (final t in _bai.tinNhan.reversed)
                    _BongTin(tin: t, onHuy: () => widget.onHuy(t.id)),
                ],
              ),
            ),
          const SizedBox(height: 8),
          TextField(
            controller: _chu,
            enabled: !dangCho,
            minLines: 3,
            maxLines: 6,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(hintText: 'Nhắn cho ${_bai.tacGia ?? 'khách'}…'),
          ),
          if (_loi != null) ...[
            const SizedBox(height: 6),
            Text(
              _loi!,
              style: const TextStyle(fontSize: AppSize.textCaption, color: AppColors.danger),
            ),
          ],
          const SizedBox(height: 6),
          Text(
            dangCho
                ? 'Đợi tin trước gửi xong mới nhắn tiếp được.'
                : 'Agent gửi bằng nick Facebook đang chạy, trong vòng 1 phút.',
            style: const TextStyle(fontSize: AppSize.textCaption, color: AppColors.muted),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: _dangGui || dangCho || _chu.text.trim().isEmpty ? null : _gui,
            icon: const Icon(Icons.send_rounded, size: AppSize.iconSm),
            label: Text(_dangGui ? 'Đang gửi…' : 'Gửi tin'),
          ),
        ],
      ),
    );
  }
}

class _BongTin extends StatelessWidget {
  const _BongTin({required this.tin, required this.onHuy});

  final TinNhanFacebook tin;
  final VoidCallback onHuy;

  @override
  Widget build(BuildContext context) {
    final (chu, mau) = switch (tin.trangThai) {
      'cho' => ('chờ agent', AppColors.warning),
      'dang-gui' => ('agent đang gửi', AppColors.warning),
      'da-gui' => ('đã gửi', AppColors.success),
      _ => ('lỗi${tin.loi != null ? ': ${tin.loi}' : ''}', AppColors.danger),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.indigo,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(tin.noiDung, style: const TextStyle(color: Colors.white, height: 1.35)),
            ),
          ),
          const SizedBox(height: 2),
          Wrap(
            alignment: WrapAlignment.end,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 6,
            children: [
              Text(
                Fmt.gioNgay(tin.luc),
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
              Text(chu, style: TextStyle(fontSize: 12, color: mau)),
              if (tin.trangThai == 'cho')
                TextButton(
                  style: TextButton.styleFrom(
                    minimumSize: const Size(0, 32),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    foregroundColor: AppColors.muted,
                  ),
                  onPressed: onHuy,
                  child: const Text('huỷ', style: TextStyle(fontSize: 12)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
