import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:manage3d/core/auth/phien_admin.dart';
import 'package:manage3d/data/models/bao_gia.dart';

/// Chép lại các ca của `src/utils/tests/phieu-bao-gia.test.ts`: app soạn phiếu, web / link khách / ảnh
/// phiếu đọc lại cùng file JSON — công thức lệch một đồng là khách thấy số khác người soạn.
PhieuBaoGia _phieu(
  List<DongBaoGia> dong, {
  ChietKhauTong ck = const ChietKhauTong(),
  double phiVanChuyen = 0,
  double vatPct = 0,
  double datCocPct = 50,
  KieuQr? kieuQr,
  double? daCoc,
  bool layHoaDon = false,
}) =>
    PhieuBaoGia(
      id: 'p',
      so: 'BG-2611-001',
      tieuDe: '',
      trangThai: TrangThaiPhieu.nhap,
      ngayTao: '2026-11-07T00:00:00.000Z',
      ngaySua: '2026-11-07T00:00:00.000Z',
      hieuLucDen: '2026-11-14',
      khach: const KhachBaoGia(),
      dong: dong,
      chietKhauTong: ck,
      phiVanChuyen: phiVanChuyen,
      vatPct: vatPct,
      datCocPct: datCocPct,
      kieuQr: kieuQr,
      daCoc: daCoc,
      layHoaDon: layHoaDon,
      thoiGianGiao: '',
      ghiChu: '',
      dieuKhoan: '',
      token: 'abc',
    );

void main() {
  group('docSoTien', () {
    const ca = {
      0: 'Không đồng',
      5: 'Năm đồng',
      15: 'Mười lăm đồng',
      21: 'Hai mươi mốt đồng',
      24: 'Hai mươi tư đồng',
      105: 'Một trăm lẻ năm đồng',
      1010: 'Một nghìn không trăm mười đồng',
      1250000: 'Một triệu hai trăm năm mươi nghìn đồng',
      1005000: 'Một triệu không trăm lẻ năm nghìn đồng',
      12345678: 'Mười hai triệu ba trăm bốn mươi lăm nghìn sáu trăm bảy mươi tám đồng',
      5000000000: 'Năm tỷ đồng',
      2000500000: 'Hai tỷ năm trăm nghìn đồng',
    };
    ca.forEach((n, chu) => test('$n', () => expect(docSoTien(n), chu)));
  });

  group('tinhTong', () {
    final p = _phieu(
      const [
        DongBaoGia(id: 'a', ten: 'Móc khoá', soLuong: 100, donGia: 15000, chietKhauPct: 10),
        DongBaoGia(id: 'b', ten: 'Thiết kế', soLuong: 1, donVi: 'gói', donGia: 300000),
      ],
      ck: const ChietKhauTong(giaTri: 5),
      phiVanChuyen: 30000,
      vatPct: 8,
    );

    test('chiết khấu dòng → chiết khấu tổng → cộng ship → VAT → cọc', () {
      final t = tinhTong(p);
      expect(t.tamTinh, 1800000);
      expect(t.chietKhauDong, 150000);
      expect(t.chietKhauTong, 82500);
      expect(t.truocThue, 1597500);
      expect(t.vat, 127800);
      expect(t.tongCong, 1725300);
      expect(t.datCoc, 862650);
      expect(t.conLai, 862650);
    });

    test('chiết khấu tổng bằng tiền không vượt quá tiền hàng', () {
      final t = tinhTong(_phieu(
        const [DongBaoGia(id: 'a', soLuong: 1, donGia: 1000)],
        ck: const ChietKhauTong(theoPct: false, giaTri: 999999),
      ));
      expect(t.tongCong, 0);
    });

    test('số rác (âm, NaN) không làm hỏng phép tính', () {
      expect(thanhTienDong(const DongBaoGia(id: 'a', soLuong: -3, donGia: 1000)), 0);
      expect(thanhTienDong(const DongBaoGia(id: 'a', soLuong: 2, donGia: double.nan)), 0);
      expect(thanhTienDong(const DongBaoGia(id: 'a', soLuong: 2, donGia: 1000, chietKhauPct: 150)), 0);
    });

    test('hết hiệu lực chỉ tính với phiếu chưa chốt / chưa huỷ', () {
      final base = _phieu(const []);
      PhieuBaoGia voi(String den, TrangThaiPhieu t) => base.copyWith(hieuLucDen: den, trangThai: t);
      expect(hetHieuLuc(voi('2026-10-01', TrangThaiPhieu.daGui), '2026-10-14'), isTrue);
      expect(hetHieuLuc(voi('2026-10-01', TrangThaiPhieu.chot), '2026-10-14'), isFalse);
      expect(hetHieuLuc(voi('2026-10-20', TrangThaiPhieu.nhap), '2026-10-14'), isFalse);
    });

    test('QR kiểu cọc thu theo %, kiểu thanh toán thu tổng trừ số đã cọc', () {
      final dong = [const DongBaoGia(id: 'a', soLuong: 1, donGia: 1000000)];
      final coc = _phieu(dong);
      expect(khoanQr(coc, tinhTong(coc)).soTien, 500000);
      expect(khoanQr(coc, tinhTong(coc)).conLai, 500000);
      final khongCoc = _phieu(dong, datCocPct: 0);
      expect(khoanQr(khongCoc, tinhTong(khongCoc)).soTien, 0);
      final tt = _phieu(dong, kieuQr: KieuQr.thanhToan, daCoc: 300000);
      expect(khoanQr(tt, tinhTong(tt)).soTien, 700000);
      expect(khoanQr(tt, tinhTong(tt)).daCoc, 300000);
      final du = _phieu(dong, kieuQr: KieuQr.thanhToan, daCoc: 2000000);
      expect(khoanQr(du, tinhTong(du)).soTien, 0);
    });

    test('lấy hoá đơn: thu đủ 100%, bỏ qua cọc', () {
      final dong = [const DongBaoGia(id: 'a', soLuong: 1, donGia: 1000000)];
      final p = _phieu(dong, kieuQr: KieuQr.thanhToan, daCoc: 300000, layHoaDon: true);
      final k = khoanQr(p, tinhTong(p));
      expect(k.kieu, KieuKhoanQr.hoaDon);
      expect(k.soTien, 1000000);
      expect(k.daCoc, 0);
    });

    test('giờ in mặc định 4.000 đ/giờ, giá bấm nhanh 6 mức', () {
      expect(donGiaTheoGramGio(const DongBaoGia(id: 'a', gram: 10, gioIn: 2)), 10 * 500 + 2 * 4000);
      expect(donGiaTheoGramGio(const DongBaoGia(id: 'a', gram: 10, giaGram: 450, gioIn: 2, giaGio: 0)), 4500);
      expect(goiYGiaGram, [450, 500, 550, 600, 650, 700]);
      expect(goiYGiaGio, [2500, 3000, 3500, 4000, 4500, 5000]);
    });
  });

  group('phí khác trên từng sản phẩm', () {
    DongBaoGia co({String id = 'd1', double? phiKhac = 20000, double soLuong = 2, double ck = 10}) =>
        DongBaoGia.trong(id).copyWith(soLuong: soLuong, donGia: 100000, chietKhauPct: ck, phiKhac: phiKhac);

    test('cộng theo số lượng, chiết khấu dòng không trừ vào phí', () {
      expect(donGiaSauCk(co()), 110000);
      expect(thanhTienDong(co()), 220000);
    });

    test('chiết khấu trên tổng cũng không trừ vào phí', () {
      final t = tinhTong(_phieu([co()], ck: const ChietKhauTong(giaTri: 50)));
      expect(t.phiKhac, 40000);
      expect(t.chietKhauTong, 90000);
      expect(t.tongCong, 130000);
    });

    test('chiết khấu tổng theo số tiền không vượt tiền hàng', () {
      final t = tinhTong(_phieu([co()], ck: const ChietKhauTong(theoPct: false, giaTri: 999000000)));
      expect(t.tongCong, 40000);
    });

    test('không tính vào lợi nhuận', () {
      final d = DongBaoGia.trong('d1').copyWith(soLuong: 1, donGia: 20000, gram: 10, gioIn: 1);
      double lai(double phi) => loiNhuanPhieu(_phieu([d.copyWith(phiKhac: phi)])).tien;
      expect(lai(50000), lai(0));
      expect(loiNhuanMotSp(d.copyWith(phiKhac: 50000), 3000, 1).tien, 17000);
      expect(tyLeSauCkTong(tinhTong(_phieu([co()], ck: const ChietKhauTong(giaTri: 25)))), closeTo(0.75, 1e-6));
    });
  });

  group('giá gốc và lợi nhuận', () {
    DongBaoGia co({String id = 'd1', double ck = 0}) =>
        DongBaoGia.trong(id).copyWith(soLuong: 3, donGia: 27250, gram: 37, gioIn: 2.5, chietKhauPct: ck);
    PhieuBaoGia phieu(List<DongBaoGia> dong, [double ck = 0]) =>
        _phieu(dong, ck: ChietKhauTong(giaTri: ck), phiVanChuyen: 30000, vatPct: 10);

    test('giá gốc = gram × 150 + giờ × 1.500, chưa có gram lẫn giờ thì không biết', () {
      expect(giaGocDong(const DongBaoGia(id: 'a', gram: 37, gioIn: 2.5)), 37 * 150 + 2.5 * 1500);
      expect(giaGocDong(const DongBaoGia(id: 'a', gram: 0, gioIn: 0)), isNull);
      expect(giaGocDong(const DongBaoGia(id: 'a')), isNull);
    });

    test('% lợi nhuận tính trên giá gốc, lỗ thì âm, giá gốc 0 thì không có %', () {
      expect(tinhLoiNhuan(15000, 10000), (tien: 5000.0, pct: 50.0));
      expect(tinhLoiNhuan(8000, 10000), (tien: -2000.0, pct: -20.0));
      expect(tinhLoiNhuan(8000, 0).pct, isNull);
    });

    test('cả phiếu: nhân số lượng, trừ chiết khấu tổng, không tính vận chuyển và VAT', () {
      final lai = loiNhuanPhieu(phieu([co()], 10));
      expect(lai.giaGoc, 3 * 9300);
      expect(lai.doanhThu, jsRound(3 * 27250 * 0.9));
      expect(lai.tien, jsRound(3 * 27250 * 0.9) - 3 * 9300);
    });

    test('hạng mục chưa có gram / giờ không làm phồng lãi, chỉ đếm lại', () {
      final lai = loiNhuanPhieu(phieu([co(), DongBaoGia.trong('d2').copyWith(soLuong: 1, donGia: 500000)]));
      expect(lai.giaGoc, 3 * 9300);
      expect(lai.doanhThu, 3 * 27250);
      expect(lai.soDongChuaCoGoc, 1);
    });

    test('chiết khấu tổng tính đúng tỷ lệ khi có cả chiết khấu dòng', () {
      expect(tyLeSauCkTong(tinhTong(phieu([co(ck: 20)], 25))), closeTo(0.75, 1e-6));
      expect(tyLeSauCkTong(tinhTong(phieu([]))), 1);
    });

    test('lãi âm làm tròn kiểu JS (.5 làm tròn lên)', () {
      expect(jsRound(-2.5), -2);
      expect(jsRound(2.5), 3);
      expect(tinhLoiNhuan(0, 0.5).tien, 0);
    });
  });

  group('căn giá sau giảm', () {
    DongBaoGia dong({double ck = 0}) {
      final d = DongBaoGia.trong('d1')
          .copyWith(soLuong: 3, gram: 37, giaGram: 550, gioIn: 2.5, giaGio: 4000, chietKhauPct: ck);
      return d.copyWith(donGia: donGiaTheoGramGio(d));
    }

    test('gõ CK % thì giá gr, giá giờ giảm theo', () {
      expect(giaSauCk(dong(ck: 10)), (gram: 495.0, gio: 3600.0));
      expect(giaSauCk(dong()), (gram: 550.0, gio: 4000.0));
    });

    test('căn tay một giá: giá kia giữ nguyên, đơn giá và thành tiền ra đúng từng đồng', () {
      final d = canGiaSauCk(dong(ck: 10), gram: 500);
      expect(giaSauCk(d), (gram: 500.0, gio: 3600.0));
      expect(donGiaSauCk(d), 37 * 500 + 2.5 * 3600);
      expect(thanhTienDong(d), 3 * (37 * 500 + 2.5 * 3600));
      expect(lamTronPct(d.chietKhauPct), 9.39);
    });

    test('giá sau giảm không vượt giá trước giảm', () {
      expect(giaSauCk(canGiaSauCk(dong(ck: 10), gram: 900)), (gram: 550.0, gio: 3600.0));
    });

    test('đưa cả hai về giá trước giảm thì hết giảm', () {
      final d = canGiaSauCk(canGiaSauCk(dong(ck: 10), gram: 550), gio: 4000);
      expect(d.chietKhauPct, 0);
      expect(d.giaGramSauCk, isNull);
      expect(d.giaGioSauCk, isNull);
    });

    test('đổi gram: giá đã căn giữ nguyên, CK % tính lại', () {
      final can = canGiaSauCk(dong(ck: 10), gram: 500);
      final d = suaGramGio(can, gram: 100);
      expect(giaSauCk(d), (gram: 500.0, gio: 3600.0));
      expect(donGiaSauCk(d), 100 * 500 + 2.5 * 3600);
    });

    test('chưa căn tay thì tinhLaiCk không đụng CK %', () {
      final d = dong(ck: 7);
      expect(identical(tinhLaiCk(d), d), isTrue);
    });

    test('sửa tay đơn giá thì bỏ giá đã căn', () {
      final d = canGiaSauCk(dong(ck: 10), gram: 500).copyWith(donGia: 99000).boGiaCanTay();
      expect(d.giaGramSauCk, isNull);
      expect(d.giaGioSauCk, isNull);
    });
  });

  group('JSON', () {
    test('đọc rồi ghi giữ đủ trường hạng mục — server dựng lại dòng từ đầu, thiếu là mất', () {
      final j = {
        'id': 'x',
        'so': 'BG-2611-002',
        'tieuDe': 'Báo giá dịch vụ in 3D',
        'phanLoai': ' Khách sỉ ',
        'trangThai': 'da-gui',
        'ngayTao': '2026-11-07T01:00:00.000Z',
        'ngaySua': '2026-11-07T01:00:00.000Z',
        'hieuLucDen': '2026-11-14',
        'khach': {'ten': 'Nam', 'congTy': '', 'sdt': '09', 'email': '', 'diaChi': ''},
        'dong': [
          {
            'id': 'd',
            'ten': 'Móc khoá',
            'moTa': '',
            'soLuong': 10,
            'donVi': 'cái',
            'donGia': 15000,
            'chietKhauPct': 9.3912,
            'gram': 12,
            'giaGram': 550,
            'gioIn': 0.5,
            'giaGio': 4000,
            'giaGramSauCk': 500,
            'phiKhac': 2000,
            'anh': ['11111111-1111-1111-1111-111111111111'],
          },
        ],
        'chietKhauTong': {'kieu': 'vnd', 'giaTri': 10000},
        'phiVanChuyen': 30000,
        'vatPct': 8,
        'datCocPct': 50,
        'kieuQr': 'thanh-toan',
        'daCoc': 50000,
        'thoiGianGiao': '3 ngày',
        'ghiChu': '',
        'dieuKhoan': 'a\nb',
        'token': 'tok',
        'khachChotLuc': null,
        'khachChotGhiChu': null,
        'khachXemLuc': '2026-11-07T02:00:00.000Z',
      };
      final p = PhieuBaoGia.fromJson(j);
      expect(p.phanLoai, 'Khách sỉ');
      expect(p.trangThai, TrangThaiPhieu.daGui);
      expect(p.kieuQr, KieuQr.thanhToan);
      expect(p.khachXemLuc, isNotNull);
      final ra = jsonDecode(jsonEncode(p.toJson())) as Map<String, dynamic>;
      final d = (ra['dong'] as List).first as Map<String, dynamic>;
      expect(d['giaGramSauCk'], 500);
      expect(d.containsKey('giaGioSauCk'), isFalse);
      expect(d['phiKhac'], 2000);
      expect(d['anh'], ['11111111-1111-1111-1111-111111111111']);
      expect(ra['chietKhauTong'], {'kieu': 'vnd', 'giaTri': 10000});
      expect(ra['kieuQr'], 'thanh-toan');
      expect(ra['trangThai'], 'da-gui');
      // Trường của server không gửi lên.
      expect(ra.containsKey('token'), isFalse);
      expect(ra.containsKey('so'), isFalse);
    });

    test('lần tính giá → hạng mục như web', () {
      final q = LanTinhGia.fromJson({
        'id': 'q',
        'fileName': 'moc-khoa.STL',
        'createdAt': '2026-11-01T00:00:00.000Z',
        'soLuong': 4,
        'weightG': 50,
        'timeMinutes': 150,
        'infillPercent': 15,
        'layerHeightMm': 0.2,
        'cheDo': 'estimate',
        'nhua': 'PLA · Trắng',
        'giaBanLe': 123456,
      });
      final d = q.thanhDong('n');
      expect(d.ten, 'In 3D: moc-khoa');
      expect(d.moTa, 'PLA · Trắng · infill 15% · lớp 0.2 mm · ~13 g/cái');
      expect(d.donGia, 30900);
      expect(d.gram, 13);
      expect(d.gioIn, 0.63);
    });
  });

  group('định dạng', () {
    test('tiền có dấu chấm ngăn nghìn', () {
      expect(dinhDangVnd(1250000), '1.250.000 ₫');
      expect(dinhDangVnd(0), '0 ₫');
      expect(nhomNghin(-1500), '-1.500');
      expect(rutGonTien(1250000), '1,3 tr');
      expect(hienNgay('2026-11-07'), '07/11/2026');
    });

    test('ngày theo giờ Việt Nam', () {
      // 18:00 UTC = 01:00 hôm sau ở VN.
      expect(ngayVN(0, DateTime.utc(2026, 11, 6, 18)), '2026-11-07');
      expect(ngayVN(7, DateTime.utc(2026, 11, 6, 10)), '2026-11-13');
    });
  });

  group('phiên admin', () {
    test('lấy token từ Set-Cookie và đọc hạn', () {
      final exp = DateTime.utc(2026, 12, 7).millisecondsSinceEpoch ~/ 1000;
      final payload =
          base64Url.encode(utf8.encode(jsonEncode({'id': 'u', 'vaiTro': 'admin', 'exp': exp}))).replaceAll('=', '');
      final token = '$payload.chuKy';
      final cookie = ['khac=1; Path=/', '$tenCookiePhien=$token; Path=/; Max-Age=2592000; HttpOnly; SameSite=lax'];
      expect(tokenTuSetCookie(cookie), token);
      expect(tokenTuSetCookie(['khac=1']), isNull);
      expect(hanCuaToken(token)?.toUtc(), DateTime.utc(2026, 12, 7));
      expect(hanCuaToken('rac'), isNull);
    });
  });
}
