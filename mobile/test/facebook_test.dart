import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:manage3d/core/api/api_client.dart';
import 'package:manage3d/core/config/app_settings.dart';
import 'package:manage3d/core/format/formatters.dart';
import 'package:manage3d/data/models/facebook.dart';
import 'package:manage3d/data/models/json.dart';
import 'package:manage3d/data/repositories/facebook_repository.dart';
import 'package:manage3d/features/facebook/khach_facebook_screen.dart';
import 'package:manage3d/features/facebook/nhat_ky_facebook_screen.dart';
import 'package:manage3d/features/facebook/nhom_facebook_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> _baiJson([Map<String, dynamic> them = const {}]) => {
      'id': 'b1',
      'maSo': 57,
      'url': 'https://www.facebook.com/groups/1/posts/2',
      'noiDung': 'Cần in 200 móc khoá logo công ty',
      'tacGia': 'Ngô Phi Long',
      'tacGiaUrl': 'https://www.facebook.com/long',
      'tacGiaId': null,
      'thoiGianDang': '2026-11-04T07:00:00.000Z',
      'createdAt': '2026-11-04T07:15:00.000Z',
      'laKhach': true,
      'doTinCay': 85,
      'lyDo': 'Đang tìm nơi in 3D số lượng',
      'trangThai': 'moi',
      'binhLuanTrangThai': null,
      'binhLuanTuDong': false,
      'tinNhan': const <Object>[],
      'viTriTrangThai': 'xong',
      'viTri': 'Hà Nội',
      'viTriChiTiet': 'Cầu Giấy',
      'viTriNguon': 'binh-luan',
      'viTriDoTinCay': 90,
      'viTriCanCu': 'mình ở Cầu Giấy',
      'anh': null,
      ...them,
    };

Map<String, dynamic> _nhomJson(String id, Map<String, dynamic> them) => {
      'id': id,
      'duongDan': 'nhom-$id',
      'ten': 'Nhóm $id',
      'coAnh': false,
      'bat': true,
      'mocThoiGian': '2026-11-01T00:00:00.000Z',
      'soBaiDaQuet': 10,
      'soKhach': 2,
      'hang': 'vua',
      'tuDong': true,
      'khachTuan': 1,
      'baiNgay': 2.5,
      'denHanLuc': 0,
      'denHan': true,
      'toiLuot': false,
      ...them,
    };

/// Repository giả: ghi lại lệnh đã gọi thay vì gọi mạng.
class _RepoGia extends FacebookRepository {
  _RepoGia(this.bai) : super(ApiClient(Dio()));

  List<Map<String, dynamic>> bai;
  List<AgentFacebook> agent = const [];
  List<NhomFacebook> nhom = const [];
  final binhLuanDaGui = <String>[];
  final lenhDaGui = <String>[];
  final trangThaiDaDoi = <String>[];
  Object? loiBinhLuan;

  @override
  Future<DuLieuKhach> fetchKhach(String loc) async => DuLieuKhach(
        bai: bai.map(BaiFacebook.fromJson).toList(),
        agent: agent,
        demKhach: bai.length,
        demChuaCham: 3,
        demTatCa: 45125,
        coKhoaLlm: true,
      );

  @override
  Future<CaiDatFacebook> fetchCaiDat() async => const CaiDatFacebook(mauBinhLuan: 'Chào {goi} ạ');

  @override
  Future<List<NhomFacebook>> fetchNhom() async => nhom;

  @override
  Future<void> binhLuan(String id, String noiDung) async {
    if (loiBinhLuan != null) throw loiBinhLuan!;
    binhLuanDaGui.add(noiDung);
  }

  @override
  Future<void> guiLenhAgent(String agent, String lenh) async => lenhDaGui.add('$agent:$lenh');

  @override
  Future<void> doiTrangThai(String id, String trangThai) async {
    trangThaiDaDoi.add(trangThai);
    bai = bai.where((b) => b['id'] != id).toList();
  }

  @override
  Future<TrangNhatKy> nhatKySau(int sau) async => TrangNhatKy(
        cuoi: 2,
        dong: sau == 0
            ? [
                DongNhatKy(id: 1, luc: DateTime(2026, 11, 4, 9), nguon: 'agent', loai: 'cuon', chu: 'cuộn trang'),
                DongNhatKy(id: 2, luc: DateTime(2026, 11, 4, 9), nguon: 'server', loai: 'khach', chu: '★ KHÁCH', chiTiet: const {'a': 1}),
              ]
            : const [],
      );
}

Future<void> _mo(WidgetTester tester, Widget man, _RepoGia repo, {double rong = 360}) async {
  tester.view.physicalSize = Size(rong, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        facebookRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp(home: man),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() => initializeDateFormatting('vi_VN'));

  group('dienMau — phải giống hệt web', () {
    test('{goi} là chữ cuối của tên, {ten} là họ tên', () {
      expect(dienMau('Chào {goi} ({ten})', 'Ngô Phi Long'), 'Chào Long (Ngô Phi Long)');
    });

    test('ẩn danh hoặc không rõ tên thì gọi "bạn"', () {
      expect(dienMau('Chào {goi}', 'Người tham gia ẩn danh'), 'Chào bạn');
      expect(dienMau('Chào {goi}, {ten}', null), 'Chào bạn, bạn');
      expect(dienMau('Chào {goi}', '   '), 'Chào bạn');
    });

    test('mẫu mặc định không còn sót chỗ trống', () {
      expect(dienMau(mauBinhLuanMacDinh, 'Ha Vu'), isNot(contains('{')));
      expect(dienMau(mauTinNhanMacDinh, null), isNot(contains('{')));
    });
  });

  group('BaiFacebook', () {
    test('laKhach phân biệt được chưa chấm (null) với không phải khách', () {
      expect(BaiFacebook.fromJson(_baiJson({'laKhach': null})).laKhach, isNull);
      expect(BaiFacebook.fromJson(_baiJson({'laKhach': false})).laKhach, isFalse);
    });

    test('voi đổi được một trường thành null', () {
      final b = BaiFacebook.fromJson(_baiJson({'binhLuanGiuLai': 'Miền Nam'}));
      final moi = b.voi({'binhLuanGiuLai': null, 'binhLuanTrangThai': 'cho'});
      expect(moi.binhLuanGiuLai, isNull);
      expect(moi.binhLuanDangCho, isTrue);
      expect(moi.viTri, 'Hà Nội');
    });

    test('ảnh đã lưu đi qua máy chủ, ảnh chưa lưu dùng link gốc', () {
      final b = BaiFacebook.fromJson(_baiJson({
        'anh': [
          {'url': 'https://fbcdn/a.jpg', 'loai': 'anh', 'tep': '0.jpg'},
          {'url': 'https://fbcdn/b.jpg', 'loai': 'video'},
        ],
      }));
      expect(b.nguonAnh(0, 'http://x:3000/'), 'http://x:3000/api/facebook/khach/b1/anh/0.jpg');
      expect(b.nguonAnh(1, 'http://x:3000'), 'https://fbcdn/b.jpg');
      expect(b.anh[1].laVideo, isTrue);
    });

    test('vị trí đầy đủ ghép chi tiết với tỉnh', () {
      expect(BaiFacebook.fromJson(_baiJson()).viTriDayDu, 'Cầu Giấy, Hà Nội');
      expect(BaiFacebook.fromJson(_baiJson({'viTriChiTiet': null})).viTriDayDu, 'Hà Nội');
      expect(BaiFacebook.fromJson(_baiJson({'viTri': null})).viTriDayDu, isNull);
    });

    test('trang cá nhân biết qua ID hoặc link', () {
      expect(BaiFacebook.fromJson(_baiJson({'tacGiaUrl': null})).coTrangCaNhan, isFalse);
      expect(BaiFacebook.fromJson(_baiJson({'tacGiaUrl': null, 'tacGiaId': '10'})).coTrangCaNhan, isTrue);
    });
  });

  group('agent còn sống', () {
    final bayGio = DateTime(2026, 11, 4, 12);
    AgentFacebook agent(int phutTruoc, [String? trangThai]) => AgentFacebook(
          ten: 'a',
          lanCuoi: bayGio.subtract(Duration(minutes: phutTruoc)),
          trangThai: trangThai,
          soBaiDaGui: 0,
          lenh: 'chay',
        );

    test('im lặng quá 8 phút là coi như tắt', () {
      expect(agent(7).conSong(bayGio), isTrue);
      expect(agent(8).conSong(bayGio), isFalse);
    });

    test('tự báo "đã tắt" thì tắt ngay', () {
      expect(agent(0, 'đã tắt').conSong(bayGio), isFalse);
    });
  });

  group('nhóm', () {
    test('đang bật lên trước, hạng tốt trước, cùng hạng thì nhiều khách trước', () {
      final ds = [
        _nhomJson('tat', {'bat': false, 'hang': 'cao'}),
        _nhomJson('thap', {'hang': 'thap'}),
        _nhomJson('vuaIt', {'khachTuan': 1}),
        _nhomJson('vuaNhieu', {'khachTuan': 9}),
        _nhomJson('moi', {'hang': 'moi'}),
        _nhomJson('cao', {'hang': 'cao'}),
      ].map(NhomFacebook.fromJson).toList();
      expect(xepNhom(ds).map((n) => n.id), ['cao', 'moi', 'vuaNhieu', 'vuaIt', 'thap', 'tat']);
    });

    test('denHanLuc = 0 nghĩa là quét ngay', () {
      expect(NhomFacebook.fromJson(_nhomJson('a', {})).denHanLuc, isNull);
      expect(
        NhomFacebook.fromJson(_nhomJson('a', {'denHanLuc': 1793794397501})).denHanLuc,
        isNotNull,
      );
    });

    test('đếm link theo cùng cách tách với web', () {
      expect(demLink(''), 0);
      expect(demLink('  \n '), 0);
      expect(demLink('a\nb, c ; d'), 4);
    });
  });

  group('chuoiHopLe — chuỗi JS cắt đứt giữa emoji làm Flutter ném lỗi lúc vẽ', () {
    final emoji = String.fromCharCode(0x1F525);

    test('giữ nguyên chuỗi đúng, kể cả emoji nguyên vẹn', () {
      expect(chuoiHopLe('Tiếng Việt $emoji ok'), 'Tiếng Việt $emoji ok');
      expect(chuoiHopLe(''), '');
    });

    test('thay nửa đầu và nửa sau bị lẻ', () {
      final nuaDau = emoji.substring(0, 1);
      final nuaSau = emoji.substring(1);
      expect(chuoiHopLe('abc$nuaDau'), 'abc\uFFFD');
      expect(chuoiHopLe('$nuaSau abc'), '\uFFFD abc');
      expect(chuoiHopLe('a$nuaDau b$emoji'), 'a\uFFFD b$emoji');
    });

    test('jsonHopLe đi hết cây JSON', () {
      final nuaDau = emoji.substring(0, 1);
      final ra = jsonHopLe({
        'a': 'x$nuaDau',
        'b': [
          {'c': nuaDau},
          1,
          null,
        ],
      });
      expect(ra, {
        'a': 'x\uFFFD',
        'b': [
          {'c': '\uFFFD'},
          1,
          null,
        ],
      });
    });
  });

  test('tuongDoi', () {
    final bayGio = DateTime(2026, 11, 4, 12);
    expect(Fmt.tuongDoi(null), '—');
    expect(Fmt.tuongDoi(bayGio, now: bayGio), 'vừa xong');
    expect(Fmt.tuongDoi(bayGio.subtract(const Duration(minutes: 5)), now: bayGio), '5 phút trước');
    expect(Fmt.tuongDoi(bayGio.subtract(const Duration(hours: 3)), now: bayGio), '3 giờ trước');
    expect(
      Fmt.tuongDoi(DateTime(2026, 11, 1, 8, 30), now: bayGio),
      Fmt.dateTime(DateTime(2026, 11, 1, 8, 30)),
    );
  });

  group('màn Khách Facebook', () {
    testWidgets('bấm Bình luận: gửi mẫu đã điền tên, thẻ đổi sang chờ agent, có nút huỷ', (tester) async {
      final repo = _RepoGia([_baiJson()]);
      await _mo(tester, const KhachFacebookScreen(), repo);

      await tester.tap(find.text('Bình luận'));
      await tester.pump();
      await tester.pump();

      expect(repo.binhLuanDaGui, ['Chào Long ạ']);
      expect(find.text('Chờ agent bình luận'), findsOneWidget);
      expect(find.text('Huỷ bình luận'), findsOneWidget);
      expect(find.text('Bình luận'), findsNothing);

      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 3));
    });

    testWidgets('xếp bình luận lỗi thì báo, thẻ giữ nguyên', (tester) async {
      final repo = _RepoGia([_baiJson()])..loiBinhLuan = ApiException('Bài không có link');
      await _mo(tester, const KhachFacebookScreen(), repo);

      await tester.tap(find.text('Bình luận'));
      await tester.pump();
      await tester.pump();

      expect(find.text('Bài không có link'), findsOneWidget);
      expect(find.text('Bình luận'), findsOneWidget);
    });

    testWidgets('bỏ qua là bài rời danh sách ngay', (tester) async {
      final repo = _RepoGia([_baiJson()]);
      await _mo(tester, const KhachFacebookScreen(), repo);

      await tester.ensureVisible(find.text('Bỏ qua'));
      await tester.tap(find.text('Bỏ qua'));
      await tester.pump();
      await tester.pump();

      expect(repo.trangThaiDaDoi, ['bo-qua']);
      expect(find.text('Chưa có khách tiềm năng mới.'), findsOneWidget);
    });

    testWidgets('agent còn sống mới có nút, đang chạy thì nút Dừng', (tester) async {
      final repo = _RepoGia(const [])
        ..agent = [
          AgentFacebook(ten: 'pc', lanCuoi: DateTime.now(), trangThai: 'lướt', soBaiDaGui: 5, lenh: 'chay'),
          AgentFacebook(ten: 'cu', lanCuoi: DateTime(2026, 1, 1), soBaiDaGui: 1, lenh: 'dung'),
        ];
      await _mo(tester, const KhachFacebookScreen(), repo);

      expect(find.text('Dừng'), findsOneWidget);
      expect(find.text('Chạy'), findsNothing);

      await tester.tap(find.text('Dừng'));
      await tester.pump();
      await tester.pump();

      expect(repo.lenhDaGui, ['pc:dung']);
      expect(find.text('Chạy'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 1));
    });

    testWidgets('thẻ đủ mọi nhãn với chữ dài không tràn ở màn 320', (tester) async {
      final dai = 'Tên nhóm Facebook rất dài ' * 6;
      final repo = _RepoGia([
        _baiJson({
          'noiDung': 'Nội dung bài rất dài. ' * 40,
          'tacGia': 'Người Đăng Bài Có Tên Dài Thật Là Dài Luôn Ấy',
          'viTri': dai,
          'lanMoLink': '2026-11-04T07:30:00.000Z',
          'lanBaoZalo': '2026-11-04T07:16:00.000Z',
          'binhLuanGiuLai': 'Miền Nam — Khách ở $dai',
          'nhomId': 'n1',
          'anh': [
            for (var i = 0; i < 6; i++) {'url': 'https://fbcdn/$i.jpg', 'loai': i == 0 ? 'video' : 'anh'},
          ],
          'tinNhan': [
            {'id': 't', 'noiDung': 'x', 'trangThai': 'da-gui', 'luc': '2026-11-04T07:30:00.000Z'},
          ],
        }),
      ])
        ..nhom = [NhomFacebook.fromJson(_nhomJson('n1', {'ten': dai}))];
      await _mo(tester, const KhachFacebookScreen(), repo, rong: 320);
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.textContaining('Máy không tự bình luận'), findsOneWidget);
      expect(find.text('+2'), findsOneWidget);
    });
  });

  testWidgets('nhóm: chữ dài không tràn ở màn 320', (tester) async {
    final dai = 'Tên nhóm Facebook rất dài ' * 6;
    final repo = _RepoGia(const [])
      ..nhom = [
        NhomFacebook.fromJson(_nhomJson('a', {
          'ten': dai,
          'moTa': dai,
          'hang': 'cao',
          'toiLuot': true,
          'tuDong': false,
          'hangCoDinh': 'cao',
          'ketQuaCuoi': 'gặp lại 4 bài cũ sau 0 bài mới · 0 lần cuộn, 6s',
          'lanQuetCuoi': '2026-11-04T07:30:00.000Z',
        })),
        NhomFacebook.fromJson(_nhomJson('b', {'bat': false})),
      ];
    await _mo(tester, const NhomFacebookScreen(), repo, rong: 320);
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('TỚI LƯỢT'), findsOneWidget);
    expect(find.textContaining('1/2 đang bật'), findsOneWidget);
  });

  testWidgets('nhật ký: mặc định ẩn dòng cuộn, bấm mở được chi tiết', (tester) async {
    final repo = _RepoGia(const []);
    await _mo(tester, const NhatKyFacebookScreen(), repo);
    await tester.pump();

    expect(find.text('cuộn trang'), findsNothing);
    expect(find.text('★ KHÁCH'), findsOneWidget);

    await tester.tap(find.text('★ KHÁCH'));
    await tester.pump();
    expect(find.textContaining('"a": 1'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 3));
  });
}
