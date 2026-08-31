/// Tem "in tự do" — port của tab In Tem bản web (`print-label-tab.tsx`).
///
/// Khác hẳn các tem còn lại của app: thay vì gửi 3 dòng chữ cho máy chủ sinh lệnh TSPL, màn này
/// **tự vẽ cả tem** ra ảnh đen trắng 320×240 rồi gửi ảnh đó đi. Đổi lại được hai thứ mà lệnh TSPL
/// không cho: **chữ tiếng Việt có dấu** (font dựng sẵn của máy in chỉ có ASCII) và **xem trước
/// đúng bằng bản in ra**. Bản web làm y hệt bằng canvas — chung một endpoint, chung một bố cục.
library;

import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:barcode/barcode.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';


/// Kích thước tem 40×30mm quy ra dot ở 203 DPI.
const int kLabelWidth = 320;
const int kLabelHeight = 240;

/// Bố cục tem.
enum LabelTemplate {
  qrText('QR + chữ', 'QR trái, chữ phải'),
  barcodeText('Mã vạch + chữ', 'Mã vạch 1D ở giữa'),
  textOnly('Chỉ chữ', '3 dòng to, căn giữa'),
  qrLarge('QR lớn', 'QR to kín tem + 1 dòng chữ');

  const LabelTemplate(this.label, this.desc);
  final String label;
  final String desc;
}

/// Cỡ chữ, tính bằng pixel trên tem 320×240 (đúng con số của bản web).
enum LabelFontSize {
  sm('Nhỏ', '~1.7mm', 14),
  md('Vừa', '~2.5mm', 20),
  lg('Lớn', '~3.5mm', 28),
  xl('Rất lớn', '~14mm', 160),
  xxl('Khổng lồ', 'lấp đầy tem', 320);

  const LabelFontSize(this.label, this.desc, this.px);
  final String label;
  final String desc;
  final double px;
}

/// Mẫu nào có mã QR / mã vạch thì chữ to quá sẽ đè lên mã — chặn trần như bản web.
const double _maxFontWithCode = 40;

/// Nội dung một tem in tự do.
class CustomLabelSpec {
  const CustomLabelSpec({
    required this.template,
    required this.line1,
    required this.line2,
    required this.line3,
    required this.codeContent,
    required this.fontSize,
    this.copies = 1,
  });

  final LabelTemplate template;
  final String line1;
  final String line2;
  final String line3;

  /// Nội dung mã QR / mã vạch. Bỏ trống thì lấy [line1].
  final String codeContent;

  final LabelFontSize fontSize;
  final int copies;

  bool get isEmpty =>
      line1.trim().isEmpty && line2.trim().isEmpty && line3.trim().isEmpty;

  /// Mã thật sự được mã hóa lên tem.
  String get code => codeContent.trim().isEmpty ? line1.trim() : codeContent.trim();

  /// Cỡ chữ dùng khi vẽ, đã chặn trần với mẫu có mã.
  double get resolvedFontPx => template == LabelTemplate.textOnly
      ? fontSize.px
      : (fontSize.px > _maxFontWithCode ? _maxFontWithCode : fontSize.px);

  /// Mô tả ngắn để lưu vào lịch sử in.
  String get summary =>
      [line1, line2, line3].where((e) => e.trim().isNotEmpty).join(' | ');
}

/// Vẽ tem lên canvas 320×240 (nền trắng, mực đen).
///
/// Tách khỏi widget để **xem trước và bản in dùng chung đúng một hàm vẽ** — hai đường vẽ riêng
/// là kiểu gì cũng có ngày lệch nhau.
void paintCustomLabel(Canvas canvas, CustomLabelSpec spec) {
  canvas.drawRect(
    const Rect.fromLTWH(0, 0, kLabelWidth * 1.0, kLabelHeight * 1.0),
    Paint()..color = Colors.white,
  );

  switch (spec.template) {
    case LabelTemplate.qrText:
      _veQrText(canvas, spec);
    case LabelTemplate.barcodeText:
      _veBarcodeText(canvas, spec);
    case LabelTemplate.textOnly:
      _veChiChu(canvas, spec);
    case LabelTemplate.qrLarge:
      _veQrLon(canvas, spec);
  }
}

/// QR bên trái, vạch ngăn, hai dòng chữ xoay 270° bên phải — giống tem cuộn nhựa.
void _veQrText(Canvas canvas, CustomLabelSpec spec) {
  const qrSize = 168.0;
  _veQr(canvas, spec.code, const Offset(10, 10), qrSize);

  final fs = spec.resolvedFontPx;

  _veChu(canvas, spec.line2, const Offset(16, 190), fontSize: 12, maxWidth: 155);

  // Vạch ngăn dọc, đúng vị trí của bản TSPL (x = 176).
  canvas.drawRect(
    const Rect.fromLTWH(176, 0, 2, kLabelHeight * 1.0),
    Paint()..color = Colors.black,
  );

  _veChuXoay(canvas, spec.line1, const Offset(198, 232), fontSize: fs, bold: true);
  _veChuXoay(canvas, spec.line3, const Offset(240, 232), fontSize: fs * 0.85);
}

/// Tên to trên cùng, mã vạch Code 128 ở giữa, dòng phụ dưới cùng — giống tem miếng in.
void _veBarcodeText(Canvas canvas, CustomLabelSpec spec) {
  final fs = spec.resolvedFontPx;

  _veChuGiua(canvas, spec.line2, 8, fontSize: fs, bold: true);

  final barcodeY = 12 + fs + 6;
  _veBarcode(canvas, spec.code, Rect.fromLTWH(30, barcodeY, 260, 80));

  _veChuGiua(canvas, spec.line3, barcodeY + 88, fontSize: 14);
}

/// Chỉ chữ: 3 dòng căn giữa, **tự co cho vừa tem**.
///
/// Đây là mẫu người dùng hay cần nhất mà app trước giờ thiếu: viết tay mấy chữ thật to dán lên
/// thùng hàng, không mã miếc gì cả.
void _veChiChu(Canvas canvas, CustomLabelSpec spec) {
  final lines = [spec.line1, spec.line2, spec.line3]
      .map((e) => e.trim())
      .where((e) => e.isNotEmpty)
      .toList();
  if (lines.isEmpty) return;

  const padX = 10.0;
  const padY = 8.0;
  const gap = 8.0;
  const maxW = kLabelWidth - padX * 2;
  const maxH = kLabelHeight - padY * 2;

  List<TextPainter> do_(double size) => [
        for (var i = 0; i < lines.length; i++)
          _dungChu(lines[i], fontSize: size, bold: i == 0)..layout(),
      ];

  var size = spec.resolvedFontPx;
  var painters = do_(size);
  double tongCao(List<TextPainter> ps) =>
      ps.fold(0.0, (s, p) => s + p.height) + gap * (ps.length - 1);
  double rongNhat(List<TextPainter> ps) =>
      ps.fold(0.0, (s, p) => p.width > s ? p.width : s);

  while (size > 8 && (tongCao(painters) > maxH || rongNhat(painters) > maxW)) {
    size -= 2;
    painters = do_(size);
  }

  var y = (kLabelHeight - tongCao(painters)) / 2;
  if (y < padY) y = padY;
  for (final painter in painters) {
    painter.paint(canvas, Offset((kLabelWidth - painter.width) / 2, y));
    y += painter.height + gap;
  }
}

/// QR to gần kín tem + một dòng chữ nhỏ dưới cùng.
void _veQrLon(Canvas canvas, CustomLabelSpec spec) {
  const qrSize = 200.0;
  _veQr(canvas, spec.code, const Offset((kLabelWidth - qrSize) / 2, 5), qrSize);

  final nhan = spec.line1.trim().isNotEmpty ? spec.line1 : spec.line2;
  _veChuGiua(canvas, nhan, 212, fontSize: 13);
}

// ── Bút vẽ dùng chung ────────────────────────────────────────────────────────

TextPainter _dungChu(
  String text, {
  required double fontSize,
  bool bold = false,
}) =>
    TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: Colors.black,
          fontSize: fontSize,
          height: 1.05,
          fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    );

void _veChu(
  Canvas canvas,
  String text,
  Offset at, {
  required double fontSize,
  double? maxWidth,
  bool bold = false,
}) {
  if (text.trim().isEmpty) return;
  final painter = _dungChu(text, fontSize: fontSize, bold: bold)
    ..layout(maxWidth: maxWidth ?? kLabelWidth * 1.0);
  painter.paint(canvas, at);
}

void _veChuGiua(
  Canvas canvas,
  String text,
  double top, {
  required double fontSize,
  bool bold = false,
}) {
  if (text.trim().isEmpty) return;
  final painter = _dungChu(text, fontSize: fontSize, bold: bold)
    ..layout(maxWidth: kLabelWidth - 20);
  painter.paint(canvas, Offset((kLabelWidth - painter.width) / 2, top));
}

/// Chữ xoay 270° (đọc từ dưới lên) cho nửa phải của mẫu QR + chữ.
void _veChuXoay(
  Canvas canvas,
  String text,
  Offset at, {
  required double fontSize,
  bool bold = false,
}) {
  if (text.trim().isEmpty) return;
  final painter = _dungChu(text, fontSize: fontSize, bold: bold)..layout(maxWidth: 220);
  canvas.save();
  canvas.translate(at.dx, at.dy);
  canvas.rotate(-1.5707963267948966); // -90°
  painter.paint(canvas, Offset.zero);
  canvas.restore();
}

void _veQr(Canvas canvas, String data, Offset at, double size) {
  final painter = QrPainter(
    data: data.isEmpty ? 'QR' : data,
    version: QrVersions.auto,
    gapless: true,
  );
  canvas.save();
  canvas.translate(at.dx, at.dy);
  painter.paint(canvas, Size(size, size));
  canvas.restore();
}

void _veBarcode(Canvas canvas, String data, Rect rect) {
  if (data.trim().isEmpty) return;
  final muc = Paint()..color = Colors.black;
  for (final element in Barcode.code128().make(
    data,
    width: rect.width,
    height: rect.height,
  )) {
    if (element is BarcodeBar && element.black) {
      canvas.drawRect(
        Rect.fromLTWH(
          rect.left + element.left,
          rect.top + element.top,
          element.width,
          element.height,
        ),
        muc,
      );
    }
  }
}

// ── Ảnh → bitmap 1-bit ───────────────────────────────────────────────────────

/// Vẽ tem rồi đóng gói thành **bitmap 1-bit base64** đúng định dạng
/// `POST /api/print-jobs/custom` chờ: 320×240, 40 byte/dòng, MSB trước,
/// **bit 0 = chấm đen** (máy in đốt nhiệt), bit 1 = để trắng.
Future<String> renderCustomLabelBase64(CustomLabelSpec spec) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    const Rect.fromLTWH(0, 0, kLabelWidth * 1.0, kLabelHeight * 1.0),
  );
  paintCustomLabel(canvas, spec);

  final picture = recorder.endRecording();
  final image = await picture.toImage(kLabelWidth, kLabelHeight);
  try {
    final data = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (data == null) {
      throw StateError('Không dựng được ảnh tem để gửi máy in.');
    }
    return base64Encode(_rgbaSangBitmap(data.buffer.asUint8List()));
  } finally {
    image.dispose();
    picture.dispose();
  }
}

Uint8List _rgbaSangBitmap(Uint8List rgba) {
  const bytesPerRow = kLabelWidth ~/ 8; // 40
  final bitmap = Uint8List(bytesPerRow * kLabelHeight)..fillRange(0, bytesPerRow * kLabelHeight, 0xFF);

  for (var y = 0; y < kLabelHeight; y++) {
    for (var x = 0; x < kLabelWidth; x++) {
      final i = (y * kLabelWidth + x) * 4;
      final alpha = rgba[i + 3] / 255;
      // Trộn với nền giấy trắng rồi xám hóa — đúng công thức của bản web.
      final gray = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * alpha +
          255 * (1 - alpha);
      if (gray < 128) {
        bitmap[y * bytesPerRow + (x >> 3)] &= ~(1 << (7 - (x & 7)));
      }
    }
  }
  return bitmap;
}
