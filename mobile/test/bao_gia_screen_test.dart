import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manage3d/core/auth/phien_admin.dart';
import 'package:manage3d/core/config/app_settings.dart';
import 'package:manage3d/data/models/bao_gia.dart';
import 'package:manage3d/data/repositories/bao_gia_repository.dart';
import 'package:manage3d/features/bao_gia/bao_gia_screen.dart';
import 'package:manage3d/features/bao_gia/soan_bao_gia_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Repository giả: giữ phiếu trong bộ nhớ, ghi lại mọi lần lưu để kiểm JSON app gửi lên.
class _RepoGia extends BaoGiaRepository {
  _RepoGia(super.ref, this.phieu);

  PhieuBaoGia phieu;
  final luuLan = <Map<String, dynamic>>[];

  @override
  Future<PhieuBaoGia> lay(String id) async => phieu;

  @override
  Future<List<PhieuBaoGia>> danhSach() async => [phieu];

  @override
  Future<CaiDatBaoGia> caiDat() async => const CaiDatBaoGia(dieuKhoanMacDinh: 'Điều 1\nĐiều 2');

  @override
  Future<PhieuBaoGia> luu(String id, Map<String, dynamic> truong) async {
    luuLan.add(truong);
    phieu = PhieuBaoGia.fromJson({
      'id': phieu.id,
      'so': phieu.so,
      'ngayTao': phieu.ngayTao,
      'ngaySua': phieu.ngaySua,
      'token': phieu.token,
      ...truong,
    });
    return phieu;
  }
}

class _PhienGia extends PhienAdminNotifier {
  _PhienGia(this.phien);

  final PhienAdmin? phien;

  @override
  PhienAdmin? build() => phien;
}

PhieuBaoGia _phieuMoi() => PhieuBaoGia.fromJson({
      'id': '11111111-1111-1111-1111-111111111111',
      'so': 'BG-2611-001',
      'tieuDe': 'Báo giá dịch vụ in 3D',
      'trangThai': 'nhap',
      'ngayTao': '2026-11-07T01:00:00.000Z',
      'ngaySua': '2026-11-07T01:00:00.000Z',
      'hieuLucDen': '2099-11-14',
      'khach': {'ten': '', 'congTy': '', 'sdt': '', 'email': '', 'diaChi': ''},
      'dong': <Object>[],
      'chietKhauTong': {'kieu': 'pct', 'giaTri': 0},
      'phiVanChuyen': 0,
      'vatPct': 0,
      'datCocPct': 50,
      'thoiGianGiao': '3–5 ngày làm việc',
      'ghiChu': '',
      'dieuKhoan': '',
      'token': 'tok12345678901234567',
    });

Future<(ProviderContainer, _RepoGia Function())> _dung(WidgetTester tester, Widget man, {bool dangNhap = true}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  _RepoGia? repo;
  final container = ProviderContainer(overrides: [
    sharedPreferencesProvider.overrideWithValue(prefs),
    phienAdminProvider.overrideWith(() =>
        _PhienGia(dangNhap ? const PhienAdmin(token: 't', tenDangNhap: 'admin', hoTen: 'Admin', hetHan: null) : null)),
    baoGiaRepositoryProvider.overrideWith((ref) => repo ??= _RepoGia(ref, _phieuMoi())),
  ]);
  addTearDown(container.dispose);
  tester.view.physicalSize = const Size(1000, 6000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: MaterialApp(theme: ThemeData.dark(), home: man),
  ));
  await tester.pumpAndSettle();
  return (container, () => repo!);
}

void main() {
  testWidgets('chưa đăng nhập thì hiện ô đăng nhập admin', (tester) async {
    await _dung(tester, const BaoGiaScreen(), dangNhap: false);
    expect(find.text('Đăng nhập admin để dùng báo giá'), findsOneWidget);
  });

  testWidgets('danh sách hiện phiếu và tổng tiền', (tester) async {
    await _dung(tester, const BaoGiaScreen());
    expect(find.text('BG-2611-001'), findsOneWidget);
    expect(find.text('Chưa có tên khách'), findsOneWidget);
  });

  testWidgets('thêm hạng mục, gõ gram → đơn giá tự tính, tự lưu gửi đúng phiếu', (tester) async {
    final (_, repo) = await _dung(tester, const SoanBaoGiaScreen(id: '11111111-1111-1111-1111-111111111111'));
    expect(find.text('BG-2611-001'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Tên khách'), 'Nguyễn Văn Nam');
    await tester.tap(find.text('Thêm hạng mục'));
    await tester.pumpAndSettle();
    expect(find.text('Hạng mục 1'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Tên hạng mục'), 'Móc khoá logo');
    await tester.enterText(find.widgetWithText(TextField, 'Số lượng'), '10');
    await tester.enterText(find.widgetWithText(TextField, 'Số gr / 1 sp'), '12');
    await tester.enterText(find.widgetWithText(TextField, 'Số giờ in / 1 sp'), '0,5');
    await tester.pump();
    // 12 g × 500 + 0,5 giờ × 4.000 = 8.000 ₫ / cái.
    expect(find.text('8.000'), findsOneWidget);
    await tester.tap(find.text('Xong'));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    final lan = repo().luuLan.last;
    expect((lan['khach'] as Map)['ten'], 'Nguyễn Văn Nam');
    final dong = (lan['dong'] as List).single as Map<String, dynamic>;
    expect(dong['ten'], 'Móc khoá logo');
    expect(dong['soLuong'], 10);
    expect(dong['gram'], 12);
    expect(dong['gioIn'], 0.5);
    expect(dong['donGia'], 8000);
    expect(find.text('✓ Đã lưu'), findsOneWidget);
    // Tổng ở thanh dưới và tóm tắt: 10 × 8.000.
    expect(find.text('80.000 ₫'), findsWidgets);
    expect(find.text('Bằng chữ: Tám mươi nghìn đồng'), findsOneWidget);
  });

  testWidgets('đổi VAT, cọc và lấy điều khoản mặc định', (tester) async {
    final (_, repo) = await _dung(tester, const SoanBaoGiaScreen(id: '11111111-1111-1111-1111-111111111111'));
    await tester.tap(find.text('8%'));
    await tester.tap(find.text('30%'));
    await tester.tap(find.text('Lấy mặc định'));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    final lan = repo().luuLan.last;
    expect(lan['vatPct'], 8);
    expect(lan['datCocPct'], 30);
    expect(lan['dieuKhoan'], 'Điều 1\nĐiều 2');
  });
}
