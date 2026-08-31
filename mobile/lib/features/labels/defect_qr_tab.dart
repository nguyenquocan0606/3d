import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/scan/code_normalizer.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'qr_commands_screen.dart' show showQrPreview;

/// Tờ QR số con lỗi 1..[ScanCommands.maxDefectNumber].
///
/// Dùng lúc chốt lượt in SLL: quét mã lượt (mâm đang in) rồi quét số ở tờ này là mâm chốt xong
/// kèm đúng số con lỗi — khỏi gõ bàn phím. Tờ này in bằng **máy in giấy thường**, không phải máy
/// tem TSPL của xưởng, nên đi qua hộp thoại in của hệ điều hành.
class DefectQrTab extends StatefulWidget {
  const DefectQrTab({super.key});

  @override
  State<DefectQrTab> createState() => _DefectQrTabState();
}

class _DefectQrTabState extends State<DefectQrTab> {
  bool _busy = false;

  Future<void> _chay(Future<void> Function() viec) async {
    setState(() => _busy = true);
    try {
      await viec();
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        const SectionCard(
          child: Row(
            children: [
              Icon(Icons.error_outline_rounded, color: AppColors.danger, size: 20),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'In tờ này dán cạnh máy in. Chốt mâm SLL: quét mã lượt → quét số con lỗi. '
                  'Không con nào lỗi thì quét tem máy in thay vì quét số.',
                  style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.4),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: _busy ? null : () => _chay(_inPdf),
                icon: const Icon(Icons.print_rounded, size: 18),
                label: const Text('In tờ QR số'),
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(AppSize.touchTarget),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _busy ? null : () => _chay(_luuPdf),
                icon: const Icon(Icons.picture_as_pdf_rounded, size: 18),
                label: const Text('Lưu file PDF'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(AppSize.touchTarget),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 4,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
            childAspectRatio: 0.82,
          ),
          itemCount: ScanCommands.maxDefectNumber,
          itemBuilder: (context, index) => _SoCard(so: index + 1),
        ),
      ],
    );
  }

  Future<void> _inPdf() => Printing.layoutPdf(
        name: 'qr-so-con-loi',
        onLayout: (format) => _dungPdf(format),
      );

  Future<void> _luuPdf() async {
    final bytes = await _dungPdf(PdfPageFormat.a4);
    await Printing.sharePdf(bytes: bytes, filename: 'qr-so-con-loi.pdf');
  }
}

/// Sinh tờ PDF: lưới 5×6 = đủ 30 số trong một trang A4.
///
/// Chữ trong PDF **không dấu**: font dựng sẵn của thư viện PDF chỉ có bảng mã Latin-1, mà nhét
/// thêm một file font tiếng Việt vào app chỉ để in tờ này thì không đáng. Cùng lý do với tem
/// TSPL của máy in nhãn.
Future<Uint8List> _dungPdf(PdfPageFormat format) async {
  final doc = pw.Document(title: 'QR so con loi');

  doc.addPage(
    pw.Page(
      pageFormat: format.applyMargin(
        left: 1.2 * PdfPageFormat.cm,
        top: 1.2 * PdfPageFormat.cm,
        right: 1.2 * PdfPageFormat.cm,
        bottom: 1.2 * PdfPageFormat.cm,
      ),
      build: (context) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        children: [
          pw.Text(
            'QR SO CON LOI - DON SAN XUAT SO LUONG LON',
            style: pw.TextStyle(fontSize: 15, fontWeight: pw.FontWeight.bold),
          ),
          pw.SizedBox(height: 3),
          pw.Text(
            'Chot mam: quet ma luot in (mam dang in) roi quet so con loi o duoi. '
            'Khong con nao loi thi quet tem may in.',
            style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700),
          ),
          pw.SizedBox(height: 10),
          pw.Expanded(
            child: pw.GridView(
              crossAxisCount: 5,
              childAspectRatio: 0.78,
              children: [
                for (var so = 1; so <= ScanCommands.maxDefectNumber; so++)
                  _oPdf(so),
              ],
            ),
          ),
        ],
      ),
    ),
  );

  return doc.save();
}

pw.Widget _oPdf(int so) {
  return pw.Container(
    margin: const pw.EdgeInsets.all(3),
    padding: const pw.EdgeInsets.all(4),
    decoration: pw.BoxDecoration(
      border: pw.Border.all(color: PdfColors.grey400, width: 0.7),
      borderRadius: pw.BorderRadius.circular(4),
    ),
    child: pw.Column(
      mainAxisAlignment: pw.MainAxisAlignment.center,
      children: [
        pw.Expanded(
          child: pw.BarcodeWidget(
            barcode: pw.Barcode.qrCode(),
            data: ScanCommands.defect(so),
            drawText: false,
          ),
        ),
        pw.SizedBox(height: 3),
        pw.Text(
          '$so',
          style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold),
        ),
        pw.Text(
          'con loi',
          style: const pw.TextStyle(fontSize: 7, color: PdfColors.grey700),
        ),
      ],
    ),
  );
}

class _SoCard extends StatelessWidget {
  const _SoCard({required this.so});

  final int so;

  @override
  Widget build(BuildContext context) {
    final code = ScanCommands.defect(so);

    return SectionCard(
      padding: const EdgeInsets.all(8),
      onTap: () => showQrPreview(context, code, '$so con lỗi'),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(6),
              ),
              child: QrImageView(
                data: code,
                padding: EdgeInsets.zero,
                backgroundColor: Colors.white,
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '$so',
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}
