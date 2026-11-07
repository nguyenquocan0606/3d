import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';
import '../../data/models/bao_gia.dart';

/// Ô nhập của màn soạn báo giá.
///
/// Màn soạn giữ cả phiếu trong một state và mỗi lần gõ là dựng lại toàn bộ, nên ô nhập phải tự giữ
/// `TextEditingController` của mình: chỉ ghi đè chữ khi giá trị đổi **từ ngoài** (bấm chip giá, chọn
/// khách cũ, lấy điều khoản mặc định) và ô không đang được gõ — nếu không con trỏ sẽ nhảy về cuối
/// sau mỗi phím.

InputDecoration _trangTri(String nhan, {String? goiY, String? hauTo, String? tro, Widget? cuoi}) => InputDecoration(
      labelText: nhan,
      hintText: goiY,
      suffixText: hauTo,
      helperText: tro,
      helperMaxLines: 2,
      suffixIcon: cuoi,
      isDense: true,
    );

class ONhapChu extends StatefulWidget {
  const ONhapChu({
    super.key,
    required this.nhan,
    required this.giaTri,
    required this.onDoi,
    this.goiY,
    this.tro,
    this.soDong = 1,
    this.toiDa,
    this.kieuBanPhim,
    this.cuoi,
    this.inDam = false,
    this.onXong,
  });

  final String nhan;
  final String giaTri;
  final ValueChanged<String> onDoi;
  final String? goiY;
  final String? tro;
  final int soDong;
  final int? toiDa;
  final TextInputType? kieuBanPhim;
  final Widget? cuoi;
  final bool inDam;

  /// Gọi khi rời ô (mất focus) — VD chọn khách cũ khi gõ xong tên.
  final ValueChanged<String>? onXong;

  @override
  State<ONhapChu> createState() => _ONhapChuState();
}

class _ONhapChuState extends State<ONhapChu> {
  late final TextEditingController _c = TextEditingController(text: widget.giaTri);
  final FocusNode _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      if (!_focus.hasFocus) widget.onXong?.call(_c.text);
    });
  }

  @override
  void didUpdateWidget(covariant ONhapChu old) {
    super.didUpdateWidget(old);
    if (widget.giaTri != _c.text && !_focus.hasFocus) _c.text = widget.giaTri;
  }

  @override
  void dispose() {
    _c.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _c,
      focusNode: _focus,
      minLines: widget.soDong > 1 ? 2 : 1,
      maxLines: widget.soDong,
      maxLength: widget.toiDa,
      keyboardType: widget.soDong > 1 ? TextInputType.multiline : widget.kieuBanPhim,
      textCapitalization: TextCapitalization.sentences,
      style: widget.inDam ? const TextStyle(fontWeight: FontWeight.w700) : null,
      decoration: _trangTri(widget.nhan, goiY: widget.goiY, tro: widget.tro, cuoi: widget.cuoi)
          .copyWith(counterText: widget.toiDa == null ? null : ''),
      onChanged: widget.onDoi,
    );
  }
}

/// Định dạng tiền ngay lúc gõ: chỉ giữ chữ số, chèn dấu chấm ngăn nghìn.
class _DinhDangTien extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final so = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (so.isEmpty) return const TextEditingValue(text: '');
    final chu = nhomNghin(int.parse(so.length > 15 ? so.substring(0, 15) : so));
    // Giữ con trỏ đúng sau cùng số chữ số đứng trước nó.
    final soTruoc = newValue.text
        .substring(0, newValue.selection.end.clamp(0, newValue.text.length))
        .replaceAll(RegExp(r'\D'), '')
        .length;
    var viTri = 0;
    var dem = 0;
    while (viTri < chu.length && dem < soTruoc) {
      if (RegExp(r'\d').hasMatch(chu[viTri])) dem++;
      viTri++;
    }
    return TextEditingValue(text: chu, selection: TextSelection.collapsed(offset: viTri));
  }
}

/// Ô số: [tien] = số nguyên đồng có dấu chấm ngăn nghìn; ngược lại số thập phân (gõ `,` hay `.` đều được).
class ONhapSo extends StatefulWidget {
  const ONhapSo({
    super.key,
    required this.nhan,
    required this.giaTri,
    required this.onDoi,
    this.tien = false,
    this.toiDa,
    this.hauTo,
    this.tro,
    this.goiY,
  });

  final String nhan;
  final double giaTri;
  final ValueChanged<double> onDoi;
  final bool tien;
  final double? toiDa;
  final String? hauTo;
  final String? tro;

  /// Các mức bấm nhanh hiện dưới ô.
  final List<double>? goiY;

  @override
  State<ONhapSo> createState() => _ONhapSoState();
}

class _ONhapSoState extends State<ONhapSo> {
  late final TextEditingController _c = TextEditingController(text: _hien(widget.giaTri));
  final FocusNode _focus = FocusNode();

  String _hien(double v) {
    if (v == 0) return '';
    return widget.tien ? nhomNghin(v) : soGon(v).replaceAll('.', ',');
  }

  double? _doc(String chu) {
    if (chu.trim().isEmpty) return 0;
    if (widget.tien) return double.tryParse(chu.replaceAll(RegExp(r'\D'), ''));
    return double.tryParse(chu.trim().replaceAll(',', '.'));
  }

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      // Rời ô thì viết lại cho gọn (VD "1," → "1", số bị kẹp trần → số đã kẹp).
      if (!_focus.hasFocus && _doc(_c.text) != widget.giaTri) _c.text = _hien(widget.giaTri);
    });
  }

  @override
  void didUpdateWidget(covariant ONhapSo old) {
    super.didUpdateWidget(old);
    // Chữ đang hiện không ra đúng giá trị: ô không được gõ thì viết lại; đang gõ thì chỉ viết lại khi
    // giá trị vừa đổi từ ngoài (bấm chip, bị kẹp trần 100%) — gõ dở "1," vẫn ra 1 nên không bị đè.
    if (_doc(_c.text) != widget.giaTri && (!_focus.hasFocus || widget.giaTri != old.giaTri)) {
      _c.text = _hien(widget.giaTri);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _doi(String chu) {
    final n = _doc(chu);
    if (n == null || n.isNaN) return;
    var v = n < 0 ? 0.0 : n;
    if (widget.toiDa != null && v > widget.toiDa!) v = widget.toiDa!;
    widget.onDoi(v);
  }

  @override
  Widget build(BuildContext context) {
    final o = TextField(
      controller: _c,
      focusNode: _focus,
      textAlign: TextAlign.right,
      keyboardType: TextInputType.numberWithOptions(decimal: !widget.tien),
      inputFormatters: widget.tien ? [_DinhDangTien()] : [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
      style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()], fontWeight: FontWeight.w600),
      decoration: _trangTri(
        widget.nhan,
        goiY: '0',
        hauTo: widget.hauTo ?? (widget.tien ? '₫' : null),
        tro: widget.tro,
      ),
      onChanged: _doi,
    );
    final goiY = widget.goiY;
    if (goiY == null || goiY.isEmpty) return o;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        o,
        const SizedBox(height: 6),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final v in goiY)
              ChipGon(
                nhan: widget.tien ? nhomNghin(v) : soGon(v),
                chon: v == widget.giaTri,
                onTap: () {
                  _c.text = _hien(v);
                  widget.onDoi(v);
                },
              ),
          ],
        ),
      ],
    );
  }
}

/// Chip nhỏ bấm nhanh.
class ChipGon extends StatelessWidget {
  const ChipGon({super.key, required this.nhan, required this.chon, required this.onTap, this.mau});

  final String nhan;
  final bool chon;
  final VoidCallback onTap;
  final Color? mau;

  @override
  Widget build(BuildContext context) {
    final m = mau ?? AppColors.indigoLight;
    return Material(
      color: chon ? m : AppColors.surfaceAlt,
      borderRadius: BorderRadius.circular(9),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(9),
        child: Container(
          constraints: const BoxConstraints(minHeight: 36),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(9),
            border: Border.all(color: chon ? m : AppColors.border),
          ),
          child: Text(
            nhan,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: chon ? Colors.white : Colors.white70,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ),
    );
  }
}

/// Nhãn nhóm nhỏ phía trên một hàng chip.
class NhanNhom extends StatelessWidget {
  const NhanNhom(this.chu, {super.key});

  final String chu;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(chu, style: const TextStyle(fontSize: 12.5, color: AppColors.muted, fontWeight: FontWeight.w600)),
    );
  }
}

/// Tiêu đề một khối trong màn soạn: số thứ tự + tên.
class TieuDeKhoi extends StatelessWidget {
  const TieuDeKhoi({super.key, required this.so, required this.chu, this.cuoi});

  final int so;
  final String chu;
  final Widget? cuoi;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.indigo.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(7),
            ),
            child: Text('$so',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.indigoLight)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(chu, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
          ),
          if (cuoi != null) cuoi!,
        ],
      ),
    );
  }
}
