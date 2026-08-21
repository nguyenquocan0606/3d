import 'package:flutter_test/flutter_test.dart';
import 'package:manage3d/data/models/dashboard.dart';

/// Test parse JSON từ hai endpoint dashboard.
///
/// Fixture lấy từ dữ liệu thật của server ngày 2026-08-17 (xem curl trong
/// bước kiểm chứng của đợt 6 kế hoạch dashboard).
void main() {
  group('KetQuaCanhBao.fromJson', () {
    /// Fixture thực tế từ `curl http://localhost:3000/api/dashboard/canh-bao`
    final fixture = {
      'status': 'success',
      'data': {
        'tinhLuc': '2026-08-17T09:49:50.687Z',
        'canhBao': [
          {
            'ma': 'C12',
            'mucDo': 'loi',
            'tieuDe': 'Thao tác app bị từ chối',
            'soLuong': 2,
            'chiTiet': [
              {
                'id': '93fc50b7',
                'nhan': 'Không rõ thiết bị: spool.weigh',
                'luc': '2026-08-16T17:37:13.625Z',
              }
            ],
            'dichDen': {'web': 'sync-actions', 'app': '/sync-actions'},
          },
          {
            'ma': 'C3',
            'mucDo': 'canhBao',
            'tieuDe': 'Lượt SLL chạy quá lâu',
            'soLuong': 1,
            'chiTiet': [],
            'dichDen': {'web': 'bulk', 'app': '/bulk'},
          },
          {
            'ma': 'C6',
            'mucDo': 'tin',
            'tieuDe': 'Cuộn nhựa không rõ vị trí',
            'soLuong': 28,
            'chiTiet': [],
            'dichDen': {'web': 'spools?filter=unassigned', 'app': '/spools'},
          },
        ],
        'tongTheoMuc': {'loi': 1, 'canhBao': 7, 'tin': 2},
      },
    };

    late KetQuaCanhBao result;

    setUp(() {
      result = KetQuaCanhBao.fromJson(fixture);
    });

    test('parse đủ số cảnh báo', () {
      expect(result.canhBao, hasLength(3));
    });

    test('parse mức độ đúng', () {
      expect(result.canhBao[0].mucDo, MucDoCanhBao.loi);
      expect(result.canhBao[1].mucDo, MucDoCanhBao.canhBao);
      expect(result.canhBao[2].mucDo, MucDoCanhBao.tin);
    });

    test('parse mã cảnh báo', () {
      expect(result.canhBao[0].ma, 'C12');
      expect(result.canhBao[1].ma, 'C3');
    });

    test('parse số lượng', () {
      expect(result.canhBao[0].soLuong, 2);
      expect(result.canhBao[2].soLuong, 28);
    });

    test('parse dichDen.app', () {
      expect(result.canhBao[0].dichDenApp, '/sync-actions');
      expect(result.canhBao[2].dichDenApp, '/spools');
    });

    test('parse tongTheoMuc', () {
      expect(result.soLoi, 1);
      expect(result.soCanhBao, 7);
      expect(result.soTin, 2);
    });

    test('coGi trả true khi có cảnh báo', () {
      expect(result.coGi, isTrue);
    });

    test('coGi trả false khi mảng rỗng', () {
      final empty = KetQuaCanhBao.fromJson({
        'data': {
          'tinhLuc': '2026-08-17T00:00:00.000Z',
          'canhBao': <dynamic>[],
          'tongTheoMuc': {'loi': 0, 'canhBao': 0, 'tin': 0},
        },
      });
      expect(empty.coGi, isFalse);
    });
  });

  group('KetQuaTongQuan.fromJson', () {
    /// Fixture thực tế từ `curl http://localhost:3000/api/dashboard/tong-quan?range=today`
    final fixture = {
      'data': {
        'ky': {
          'tu': '2026-08-16T16:00:00.000Z',
          'den': '2026-08-17T09:49:59.267Z',
          'nhan': 'Hôm nay',
        },
        'sanXuatSLL': {
          'conXong': 208,
          'conLoi': 0,
          'tiLeLoi': 0.0,
          'luot': {'xong': 15, 'dangIn': 4, 'cho': 67},
          'luotInBu': 0,
          'phutTrungBinhMoiLuot': 724,
          'donDangChay': [],
          'luotDangIn': [
            {
              'id': '57696335',
              'may': 'BambuLab A1',
              'peiIndex': 7,
              'soCon': 35,
              'batDauLuc': '2026-08-17T04:26:53.911Z',
              'phutDaTroi': 323,
            },
            {
              'id': '51381579',
              'may': 'Kobra X-1',
              'peiIndex': 2,
              'soCon': 35,
              'batDauLuc': '2026-08-14T15:26:09.123Z',
              'phutDaTroi': 3984,
            },
          ],
        },
        'nhua': {
          'tongCuon': 64,
          'theoTrangThai': {'active': 64},
          'kgCon': 45.367,
          'gDaTruTrongKy': 0,
          'theoLoai': [],
          'theoMau': [],
          'duBaoCanKiet': [],
          'chuaGanCho': 3,
        },
        'kho': null,
        'hangHoa': null,
        'eshop': null,
        'haTang': null,
      },
    };

    late KetQuaTongQuan result;

    setUp(() {
      result = KetQuaTongQuan.fromJson(fixture);
    });

    test('parse nhãn kỳ', () {
      expect(result.nhanKy, 'Hôm nay');
    });

    test('parse conXong', () {
      expect(result.conXong, 208);
    });

    test('parse tiLeLoi', () {
      // tiLeLoi = 0.0 không phải null
      expect(result.tiLeLoi, 0.0);
    });

    test('parse kgCon', () {
      expect(result.kgCon, closeTo(45.367, 0.001));
    });

    test('parse soMayDangIn', () {
      expect(result.soMayDangIn, 4);
    });

    test('luotDangIn sắp xếp lâu nhất lên đầu', () {
      final luots = result.luotDangIn;
      expect(luots, hasLength(2));
      // Kobra X-1 chạy 3984 phút, BambuLab A1 chạy 323 phút → Kobra lên đầu
      expect(luots.first.may, 'Kobra X-1');
      expect(luots.first.phutDaTroi, 3984);
    });

    test('parse lượt đang in đủ field', () {
      final luot = result.luotDangIn.last;
      expect(luot.may, 'BambuLab A1');
      expect(luot.peiIndex, 7);
      expect(luot.soCon, 35);
    });

    test('tiLeLoi = null khi không có lượt SLL', () {
      final khongSLL = KetQuaTongQuan.fromJson({
        'data': {
          'ky': {'tu': '', 'den': '', 'nhan': 'Hôm nay'},
          'sanXuatSLL': null,
          'nhua': {'kgCon': 10.0},
        },
      });
      expect(khongSLL.tiLeLoi, isNull);
      expect(khongSLL.conXong, 0);
      expect(khongSLL.luotDangIn, isEmpty);
    });
  });

  group('DashboardResult', () {
    test('laCache = false khi cachedAt null', () {
      const r = DashboardResult('data');
      expect(r.laCache, isFalse);
    });

    test('laCache = true khi có cachedAt', () {
      final r = DashboardResult('data', cachedAt: DateTime.now());
      expect(r.laCache, isTrue);
    });
  });
}
