import 'json.dart';

// Port từ src/utils/binh-luan-facebook.ts — web và app phải điền mẫu giống hệt nhau.
const mauBinhLuanMacDinh =
    'Chào {goi}, bên em nhận thiết kế và in 3D theo yêu cầu, làm số lượng có giá tốt ạ. {goi} nhắn tin cho em để em báo giá nhé!';
const mauTinNhanMacDinh =
    'Chào {goi}, em thấy {goi} đang cần in 3D. Bên em nhận thiết kế và in 3D theo yêu cầu, làm số lượng có giá tốt. {goi} gửi em file hoặc ảnh mẫu để em báo giá nhé!';

/// Điền mẫu cho một tác giả: `{ten}` = họ tên, `{goi}` = tên gọi (chữ cuối — "Ngô Phi Long" → "Long").
/// Người đăng ẩn danh hoặc không rõ tên thì cả hai thành "bạn".
String dienMau(String mau, String? tacGia) {
  final ten = tacGia?.trim() ?? '';
  final anDanh = ten.isEmpty || RegExp(r'ẩn danh|anonymous', caseSensitive: false).hasMatch(ten);
  final goi = anDanh ? 'bạn' : ten.split(RegExp(r'\s+')).last;
  return mau.replaceAll('{goi}', goi).replaceAll('{ten}', anDanh ? 'bạn' : ten);
}

enum LocKhach {
  khach('khach', 'Khách tiềm năng'),
  daLienHe('da-lien-he', 'Đã liên hệ'),
  boQua('bo-qua', 'Đã bỏ qua'),
  chuaCham('chua-cham', 'Chưa chấm'),
  tatCa('tat-ca', 'Mọi bài đã quét');

  const LocKhach(this.khoa, this.nhan);

  final String khoa;
  final String nhan;
}

/// Tin Messenger gửi cho người đăng. `trangThai`: `cho` · `dang-gui` · `da-gui` · `loi`.
class TinNhanFacebook {
  const TinNhanFacebook({
    required this.id,
    required this.noiDung,
    required this.trangThai,
    this.luc,
    this.loi,
  });

  final String id;
  final String noiDung;
  final String trangThai;
  final DateTime? luc;
  final String? loi;

  bool get dangCho => trangThai == 'cho' || trangThai == 'dang-gui';

  factory TinNhanFacebook.fromJson(Map<String, dynamic> json) => TinNhanFacebook(
        id: asString(json['id']),
        noiDung: asString(json['noiDung']),
        trangThai: asString(json['trangThai'], 'cho'),
        luc: asDate(json['luc']),
        loi: asStringOrNull(json['loi']),
      );
}

/// Ảnh của bài (video thì là ảnh bìa). `tep` có nghĩa là đã tải về máy chủ — chỉ bài khách mới có;
/// còn lại là link fbcdn, hết hạn sau ít hôm.
class AnhBaiFacebook {
  const AnhBaiFacebook({required this.url, required this.laVideo, this.tep});

  final String url;
  final bool laVideo;
  final String? tep;

  factory AnhBaiFacebook.fromJson(Map<String, dynamic> json) => AnhBaiFacebook(
        url: asString(json['url']),
        laVideo: json['loai'] == 'video',
        tep: asStringOrNull(json['tep']),
      );
}

class BaiFacebook {
  BaiFacebook._(this._json)
      : id = asString(_json['id']),
        maSo = asInt(_json['maSo']),
        url = asStringOrNull(_json['url']),
        noiDung = asString(_json['noiDung']),
        tacGia = asStringOrNull(_json['tacGia']),
        tacGiaUrl = asStringOrNull(_json['tacGiaUrl']),
        tacGiaId = asStringOrNull(_json['tacGiaId']),
        thoiGianDang = asDate(_json['thoiGianDang']),
        createdAt = asDate(_json['createdAt']),
        laKhach = asBoolOrNull(_json['laKhach']),
        doTinCay = asIntOrNull(_json['doTinCay']),
        lyDo = asStringOrNull(_json['lyDo']),
        loiChamDiem = asStringOrNull(_json['loiChamDiem']),
        trangThai = asString(_json['trangThai'], 'moi'),
        lanMoLink = asDate(_json['lanMoLink']),
        lanBaoZalo = asDate(_json['lanBaoZalo']),
        agent = asStringOrNull(_json['agent']),
        nhomId = asStringOrNull(_json['nhomId']),
        binhLuanTrangThai = asStringOrNull(_json['binhLuanTrangThai']),
        binhLuanNoiDung = asStringOrNull(_json['binhLuanNoiDung']),
        binhLuanLuc = asDate(_json['binhLuanLuc']),
        binhLuanLoi = asStringOrNull(_json['binhLuanLoi']),
        binhLuanTuDong = asBool(_json['binhLuanTuDong']),
        binhLuanGiuLai = asStringOrNull(_json['binhLuanGiuLai']),
        tinNhan = asList(_json['tinNhan'], TinNhanFacebook.fromJson),
        viTriTrangThai = asStringOrNull(_json['viTriTrangThai']),
        viTri = asStringOrNull(_json['viTri']),
        viTriChiTiet = asStringOrNull(_json['viTriChiTiet']),
        viTriNguon = asStringOrNull(_json['viTriNguon']),
        viTriDoTinCay = asIntOrNull(_json['viTriDoTinCay']),
        viTriCanCu = asStringOrNull(_json['viTriCanCu']),
        viTriLoi = asStringOrNull(_json['viTriLoi']),
        anh = asList(_json['anh'], AnhBaiFacebook.fromJson);

  factory BaiFacebook.fromJson(Map<String, dynamic> json) => BaiFacebook._(json);

  final Map<String, dynamic> _json;

  final String id;
  final int maSo;
  final String? url;
  final String noiDung;
  final String? tacGia;
  final String? tacGiaUrl;
  final String? tacGiaId;
  final DateTime? thoiGianDang;
  final DateTime? createdAt;

  /// null = chưa chấm được.
  final bool? laKhach;
  final int? doTinCay;
  final String? lyDo;
  final String? loiChamDiem;

  /// `moi` · `da-lien-he` · `bo-qua`
  final String trangThai;
  final DateTime? lanMoLink;
  final DateTime? lanBaoZalo;
  final String? agent;
  final String? nhomId;

  /// null = chưa bình luận · `cho` · `dang-gui` · `da-gui` · `loi`
  final String? binhLuanTrangThai;
  final String? binhLuanNoiDung;
  final DateTime? binhLuanLuc;
  final String? binhLuanLoi;
  final bool binhLuanTuDong;

  /// Chế độ tự bình luận đã bỏ qua bài này — lý do, để người tự quyết.
  final String? binhLuanGiuLai;
  final List<TinNhanFacebook> tinNhan;

  /// `cho-thu-thap` · `dang-thu-thap` · `cho-llm` · `xong` · `loi` · null
  final String? viTriTrangThai;
  final String? viTri;
  final String? viTriChiTiet;

  /// `ho-so` · `binh-luan` · `bai-viet`
  final String? viTriNguon;
  final int? viTriDoTinCay;
  final String? viTriCanCu;
  final String? viTriLoi;
  final List<AnhBaiFacebook> anh;

  /// Agent đang giữ bình luận: chưa nên xếp thêm.
  bool get binhLuanDangCho => binhLuanTrangThai == 'cho' || binhLuanTrangThai == 'dang-gui';

  /// Có trang cá nhân thì agent mới mở được hội thoại Messenger.
  bool get coTrangCaNhan => tacGiaId != null || tacGiaUrl != null;

  bool get dangTimViTri =>
      viTriTrangThai == 'cho-thu-thap' ||
      viTriTrangThai == 'dang-thu-thap' ||
      viTriTrangThai == 'cho-llm';

  /// "Thủ Đức, TP. Hồ Chí Minh"; null nếu chưa có vị trí.
  String? get viTriDayDu => viTri == null
      ? null
      : [if (viTriChiTiet != null) viTriChiTiet!, viTri!].join(', ');

  /// Bản sao với vài trường đổi — chép qua JSON cho khỏi phải viết `copyWith` phân biệt
  /// "không đổi" với "đổi thành null".
  BaiFacebook voi(Map<String, dynamic> thayDoi) =>
      BaiFacebook._({..._json, ...thayDoi});

  /// URL tải được của ảnh thứ [i]: ảnh đã lưu đi qua máy chủ, còn lại là link gốc.
  String nguonAnh(int i, String baseUrl) {
    final a = anh[i];
    final tep = a.tep;
    if (tep == null) return a.url;
    final goc = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    return '$goc/api/facebook/khach/${Uri.encodeComponent(id)}/anh/${Uri.encodeComponent(tep)}';
  }
}

/// Agent gửi nhịp tim tối đa 5 phút một lần kể cả lúc nghỉ — quá 8 phút im lặng là coi như đã tắt.
const phutCoiLaTat = 8;

class AgentFacebook {
  const AgentFacebook({
    required this.ten,
    this.lanCuoi,
    this.trangThai,
    required this.soBaiDaGui,
    required this.lenh,
  });

  final String ten;
  final DateTime? lanCuoi;
  final String? trangThai;
  final int soBaiDaGui;

  /// `chay` · `dung`
  final String lenh;

  bool conSong(DateTime bayGio) {
    final cuoi = lanCuoi;
    if (cuoi == null || trangThai == 'đã tắt') return false;
    return bayGio.difference(cuoi) < const Duration(minutes: phutCoiLaTat);
  }

  AgentFacebook voiLenh(String moi) => AgentFacebook(
        ten: ten,
        lanCuoi: lanCuoi,
        trangThai: trangThai,
        soBaiDaGui: soBaiDaGui,
        lenh: moi,
      );

  factory AgentFacebook.fromJson(Map<String, dynamic> json) => AgentFacebook(
        ten: asString(json['ten']),
        lanCuoi: asDate(json['lanCuoi']),
        trangThai: asStringOrNull(json['trangThai']),
        soBaiDaGui: asInt(json['soBaiDaGui']),
        lenh: asString(json['lenh'], 'dung'),
      );
}

/// Phản hồi `GET /api/facebook/khach`.
class DuLieuKhach {
  const DuLieuKhach({
    required this.bai,
    required this.agent,
    required this.demKhach,
    required this.demChuaCham,
    required this.demTatCa,
    required this.coKhoaLlm,
  });

  final List<BaiFacebook> bai;
  final List<AgentFacebook> agent;
  final int demKhach;
  final int demChuaCham;
  final int demTatCa;
  final bool coKhoaLlm;

  DuLieuKhach voi({List<BaiFacebook>? bai, List<AgentFacebook>? agent}) => DuLieuKhach(
        bai: bai ?? this.bai,
        agent: agent ?? this.agent,
        demKhach: demKhach,
        demChuaCham: demChuaCham,
        demTatCa: demTatCa,
        coKhoaLlm: coKhoaLlm,
      );

  factory DuLieuKhach.fromJson(Map<String, dynamic> json) {
    final dem = asMap(json['dem']);
    return DuLieuKhach(
      bai: asList(json['bai'], BaiFacebook.fromJson),
      agent: asList(json['agent'], AgentFacebook.fromJson),
      demKhach: asInt(dem['khach']),
      demChuaCham: asInt(dem['chuaCham']),
      demTatCa: asInt(dem['tatCa']),
      coKhoaLlm: asBool(json['coKhoaLlm']),
    );
  }
}

enum HangNhom {
  cao('Tiềm năng cao'),
  moi('Nhóm mới'),
  vua('Tiềm năng vừa'),
  thap('Tiềm năng thấp');

  const HangNhom(this.ten);

  final String ten;

  static HangNhom tuKhoa(String? khoa) => switch (khoa) {
        'cao' => cao,
        'vua' => vua,
        'thap' => thap,
        _ => moi,
      };
}

class NhomFacebook {
  const NhomFacebook({
    required this.id,
    required this.duongDan,
    this.fbGroupId,
    this.ten,
    this.moTa,
    required this.coAnh,
    this.soThanhVien,
    this.quyenRiengTu,
    required this.bat,
    this.mocThoiGian,
    this.lanQuetCuoi,
    this.ketQuaCuoi,
    required this.soBaiDaQuet,
    required this.soKhach,
    this.hangCoDinh,
    required this.hang,
    required this.tuDong,
    required this.khachTuan,
    required this.baiNgay,
    required this.denHanLuc,
    required this.denHan,
    required this.toiLuot,
  });

  final String id;
  final String duongDan;
  final String? fbGroupId;
  final String? ten;
  final String? moTa;
  final bool coAnh;
  final String? soThanhVien;
  final String? quyenRiengTu;
  final bool bat;
  final DateTime? mocThoiGian;
  final DateTime? lanQuetCuoi;
  final String? ketQuaCuoi;
  final int soBaiDaQuet;
  final int soKhach;

  /// Ghim tay (`cao` · `vua` · `thap`); null = tự xếp.
  final String? hangCoDinh;
  final HangNhom hang;
  final bool tuDong;
  final num khachTuan;
  final num baiNgay;

  /// Mốc tới hạn quét lại; null = ngay.
  final DateTime? denHanLuc;
  final bool denHan;

  /// Nhóm agent sẽ quét kế tiếp.
  final bool toiLuot;

  String get tenHienThi => ten ?? duongDan;

  String get link => 'https://www.facebook.com/groups/$duongDan/?sorting_setting=CHRONOLOGICAL';

  factory NhomFacebook.fromJson(Map<String, dynamic> json) {
    final denHanMs = asInt(json['denHanLuc']);
    return NhomFacebook(
      id: asString(json['id']),
      duongDan: asString(json['duongDan']),
      fbGroupId: asStringOrNull(json['fbGroupId']),
      ten: asStringOrNull(json['ten']),
      moTa: asStringOrNull(json['moTa']),
      coAnh: asBool(json['coAnh']),
      soThanhVien: asStringOrNull(json['soThanhVien']),
      quyenRiengTu: asStringOrNull(json['quyenRiengTu']),
      bat: asBool(json['bat']),
      mocThoiGian: asDate(json['mocThoiGian']),
      lanQuetCuoi: asDate(json['lanQuetCuoi']),
      ketQuaCuoi: asStringOrNull(json['ketQuaCuoi']),
      soBaiDaQuet: asInt(json['soBaiDaQuet']),
      soKhach: asInt(json['soKhach']),
      hangCoDinh: asStringOrNull(json['hangCoDinh']),
      hang: HangNhom.tuKhoa(asStringOrNull(json['hang'])),
      tuDong: asBool(json['tuDong']),
      khachTuan: asDouble(json['khachTuan']),
      baiNgay: asDouble(json['baiNgay']),
      denHanLuc: denHanMs > 0 ? DateTime.fromMillisecondsSinceEpoch(denHanMs) : null,
      denHan: asBool(json['denHan']),
      toiLuot: asBool(json['toiLuot']),
    );
  }
}

/// Nhóm tốt lên đầu danh sách, nhóm đang tắt xuống cuối — cùng cách xếp với web.
List<NhomFacebook> xepNhom(List<NhomFacebook> ds) {
  return [...ds]
    ..sort((a, b) {
      if (a.bat != b.bat) return a.bat ? -1 : 1;
      final hang = a.hang.index.compareTo(b.hang.index);
      return hang != 0 ? hang : b.khachTuan.compareTo(a.khachTuan);
    });
}

/// Web tách link theo khoảng trắng, phẩy, chấm phẩy — đếm giống vậy để nút ghi "Thêm 3 nhóm".
int demLink(String links) =>
    links.split(RegExp(r'[\s,;]+')).where((l) => l.isNotEmpty).length;

class KetQuaThemNhom {
  const KetQuaThemNhom({required this.link, required this.ok, required this.chu});

  final String link;
  final bool ok;
  final String chu;

  factory KetQuaThemNhom.fromJson(Map<String, dynamic> json) => KetQuaThemNhom(
        link: asString(json['link']),
        ok: asBool(json['ok']),
        chu: asString(json['chu']),
      );
}

/// Phần cài đặt app đọc. Sửa cài đặt vẫn làm trên web.
class CaiDatFacebook {
  const CaiDatFacebook({
    this.mauBinhLuan = mauBinhLuanMacDinh,
    this.mauTinNhan = mauTinNhanMacDinh,
    this.phanHangBat = true,
  });

  final String mauBinhLuan;
  final String mauTinNhan;

  /// Tắt phân hạng thì nhóm nào cũng quét mỗi vòng, nhãn hạng không còn nghĩa.
  final bool phanHangBat;

  factory CaiDatFacebook.fromJson(Map<String, dynamic> json) => CaiDatFacebook(
        mauBinhLuan: asStringOrNull(json['mauBinhLuan']) ?? mauBinhLuanMacDinh,
        mauTinNhan: asStringOrNull(json['mauTinNhan']) ?? mauTinNhanMacDinh,
        phanHangBat: asBool(asMap(json['phanHangNhom'])['bat'], true),
      );
}

/// Một dòng nhật ký: `loai` là `he-thong` · `cuon` · `mang` · `doc` · `gui` · `llm` · `khach` · `loi`.
class DongNhatKy {
  const DongNhatKy({
    required this.id,
    this.luc,
    required this.nguon,
    required this.loai,
    required this.chu,
    this.chiTiet,
  });

  final int id;
  final DateTime? luc;
  final String nguon;
  final String loai;
  final String chu;

  /// JSON tuỳ ý kèm theo dòng; null = không có gì để mở ra xem.
  final Object? chiTiet;

  factory DongNhatKy.fromJson(Map<String, dynamic> json) => DongNhatKy(
        id: asInt(json['id']),
        luc: asDate(json['luc']),
        nguon: asString(json['nguon']),
        loai: asString(json['loai']),
        chu: asString(json['chu']),
        chiTiet: json['chiTiet'],
      );
}

/// Phản hồi `GET /api/facebook/nhat-ky?sau=<id>`.
class TrangNhatKy {
  const TrangNhatKy({required this.cuoi, required this.dong});

  /// id dòng cuối server đang có; server khởi động lại thì đếm lại từ đầu.
  final int cuoi;
  final List<DongNhatKy> dong;

  factory TrangNhatKy.fromJson(Map<String, dynamic> json) => TrangNhatKy(
        cuoi: asInt(json['cuoi']),
        dong: asList(json['dong'], DongNhatKy.fromJson),
      );
}
