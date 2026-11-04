import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatters.dart';
import '../../core/routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/facebook.dart';
import '../../data/providers.dart';
import '../../data/repositories/facebook_repository.dart';
import 'the_bai_facebook.dart';

/// Khách Facebook: agent lướt Facebook, LLM chấm từng bài xem có phải người đang cần thuê in 3D.
///
/// App không có phiên Facebook, chỉ xếp việc — agent đăng bình luận, gửi tin nhắn. Cài đặt (chế độ,
/// lịch chạy, phân hạng, mẫu, danh sách đen, kênh báo) chỉ sửa trên web.
class KhachFacebookScreen extends ConsumerStatefulWidget {
  const KhachFacebookScreen({super.key});

  @override
  ConsumerState<KhachFacebookScreen> createState() => _KhachFacebookScreenState();
}

class _KhachFacebookScreenState extends ConsumerState<KhachFacebookScreen> {
  /// Agent gửi bài về liên tục — tự làm mới để khách mới hiện ra mà không phải kéo.
  static const _nhipTaiLai = Duration(seconds: 60);

  LocKhach _loc = LocKhach.khach;
  Timer? _nhip;
  final _henTaiLai = <Timer>[];
  bool _dangCham = false;
  String? _dangGuiLenh;

  KhachFacebookNotifier get _ds => ref.read(khachFacebookProvider(_loc).notifier);
  FacebookRepository get _repo => ref.read(facebookRepositoryProvider);

  @override
  void initState() {
    super.initState();
    _nhip = Timer.periodic(_nhipTaiLai, (_) => _taiLai());
  }

  @override
  void dispose() {
    _nhip?.cancel();
    for (final h in _henTaiLai) {
      h.cancel();
    }
    super.dispose();
  }

  Future<void> _taiLai() async {
    ref.invalidate(nhomFacebookProvider);
    await _ds.taiLai();
  }

  /// Agent hỏi việc mỗi phút — tải lại sau các mốc này để thấy "đã gửi" mà không phải kéo.
  void _taiLaiSau(List<int> cacGiay) {
    for (final giay in cacGiay) {
      _henTaiLai.add(Timer(Duration(seconds: giay), () {
        if (mounted) _taiLai();
      }));
    }
  }

  void _baoLoi(Object loi) {
    if (mounted) showToast(context, '$loi', isError: true);
  }

  Future<void> _doiTrangThai(BaiFacebook b, String trangThai) async {
    if (_loc != LocKhach.tatCa) _ds.boBai(b.id);
    try {
      await _repo.doiTrangThai(b.id, trangThai);
    } catch (e) {
      _baoLoi(e);
    }
    await _taiLai();
  }

  void _ghiMoLink(BaiFacebook b) {
    _ds.suaBai(b.id, {'lanMoLink': DateTime.now().toUtc().toIso8601String()});
    // Không chờ: người dùng đã sang app Facebook rồi, ghi trượt cũng không có gì để báo.
    unawaited(_repo.ghiDaMoLink(b.id).catchError((Object _) {}));
  }

  Future<void> _binhLuan(BaiFacebook b, String noiDung) async {
    try {
      await _repo.binhLuan(b.id, noiDung);
      _ds.suaBai(b.id, {
        'binhLuanTrangThai': 'cho',
        'binhLuanNoiDung': noiDung,
        'binhLuanTuDong': false,
        'binhLuanGiuLai': null,
        'binhLuanLoi': null,
      });
      _taiLaiSau(const [30, 75]);
      if (mounted) {
        showToast(context, 'Đã xếp bình luận. Agent chưa nhận thì còn huỷ được.');
      }
    } catch (e) {
      _baoLoi(e);
    }
  }

  Future<void> _huyBinhLuan(BaiFacebook b) async {
    try {
      await _repo.huyBinhLuan(b.id);
    } catch (e) {
      _baoLoi(e);
    }
    await _taiLai();
  }

  /// Trả câu lỗi, hoặc null nếu đã xếp được — khung tin nhắn hiện lỗi ngay dưới ô soạn.
  Future<String?> _nhanTin(BaiFacebook b, String noiDung) async {
    try {
      await _repo.nhanTin(b.id, noiDung);
    } catch (e) {
      return '$e';
    }
    await _taiLai();
    _taiLaiSau(const [30, 75]);
    return null;
  }

  Future<void> _huyTinNhan(BaiFacebook b, String tinId) async {
    try {
      await _repo.huyTinNhan(b.id, tinId);
    } catch (e) {
      _baoLoi(e);
    }
    await _taiLai();
  }

  Future<void> _timLaiViTri(BaiFacebook b) async {
    try {
      await _repo.timLaiViTri(b.id);
      _ds.suaBai(b.id, {
        'viTriTrangThai': 'cho-thu-thap',
        'viTri': null,
        'viTriChiTiet': null,
        'viTriNguon': null,
        'viTriDoTinCay': null,
        'viTriCanCu': null,
        'viTriLoi': null,
      });
    } catch (e) {
      _baoLoi(e);
    }
  }

  Future<void> _chan(BaiFacebook b) async {
    try {
      final khoa = await _repo.chan(b.id);
      if (mounted) {
        showToast(context, 'Đã chặn (${khoa.join(' / ')}) — bài sau của người này bỏ qua luôn.');
      }
    } catch (e) {
      _baoLoi(e);
    }
    await _taiLai();
  }

  Future<void> _guiLenh(AgentFacebook a, String lenh) async {
    setState(() => _dangGuiLenh = a.ten);
    try {
      await _repo.guiLenhAgent(a.ten, lenh);
      _ds.suaLenhAgent(a.ten, lenh);
      // Agent hỏi lệnh vài giây một lần (đang lướt thì 15 giây).
      _taiLaiSau(const [7, 20]);
    } catch (e) {
      _baoLoi(e);
    } finally {
      if (mounted) setState(() => _dangGuiLenh = null);
    }
  }

  Future<void> _chamLai() async {
    setState(() => _dangCham = true);
    try {
      final kq = await _repo.chamLai();
      if (mounted) {
        showToast(
          context,
          kq.dangCho == 0
              ? 'Không còn bài nào chờ chấm.'
              : 'Đang chấm ${kq.dangCho} bài — kết quả hiện dần trong nhật ký.'
                  '${kq.loi != null ? ' Lần gọi trước lỗi: ${kq.loi}' : ''}',
          isError: kq.loi != null,
        );
      }
      await _taiLai();
    } catch (e) {
      _baoLoi(e);
    } finally {
      if (mounted) setState(() => _dangCham = false);
    }
  }

  void _moHuongDan() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _HuongDanAgent(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final duLieu = ref.watch(khachFacebookProvider(_loc));
    final caiDat = ref.watch(caiDatFacebookProvider).valueOrNull ?? const CaiDatFacebook();
    final nhom = ref.watch(nhomFacebookProvider).valueOrNull;
    final tenNhom = {for (final n in nhom ?? const <NhomFacebook>[]) n.id: n.tenHienThi};
    final dl = duLieu.valueOrNull;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Khách Facebook'),
        actions: [
          IconButton(
            tooltip: 'Nhóm theo dõi',
            onPressed: () => context.push(Routes.nhomFacebook),
            icon: const Icon(Icons.groups_rounded),
          ),
          IconButton(
            tooltip: 'Nhật ký realtime',
            onPressed: () => context.push(Routes.nhatKyFacebook),
            icon: const Icon(Icons.terminal_rounded),
          ),
          IconButton(
            tooltip: 'Cách chạy agent',
            onPressed: _moHuongDan,
            icon: const Icon(Icons.help_outline_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              children: [
                for (final l in LocKhach.values)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(_nhanLoc(l, dl)),
                      selected: _loc == l,
                      onSelected: (_) => setState(() => _loc = l),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: AsyncView(
              value: duLieu,
              onRetry: () => ref.invalidate(khachFacebookProvider(_loc)),
              builder: (data) => RefreshIndicator(
                onRefresh: _taiLai,
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, AppSize.listBottomInset),
                  itemCount: data.bai.length + 1,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, i) {
                    if (i == 0) return _dauDanhSach(data);
                    final b = data.bai[i - 1];
                    return TheBaiFacebook(
                      key: ValueKey(b.id),
                      bai: b,
                      tenNhom: b.nhomId == null ? null : (tenNhom[b.nhomId] ?? 'nhóm đã xoá'),
                      mauBinhLuan: caiDat.mauBinhLuan,
                      onDoiTrangThai: (s) => _doiTrangThai(b, s),
                      onMoLink: () => _ghiMoLink(b),
                      onBinhLuan: (noiDung) => _binhLuan(b, noiDung),
                      onHuyBinhLuan: () => _huyBinhLuan(b),
                      onNhanTin: () => _moTinNhan(b, caiDat.mauTinNhan),
                      onTimLaiViTri: () => _timLaiViTri(b),
                      onChan: () => _chan(b),
                    );
                  },
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _moTinNhan(BaiFacebook b, String mauTinNhan) {
    final loc = _loc;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => KhungTinNhanFacebook(
        baiBanDau: b,
        loc: loc,
        mauTinNhan: mauTinNhan,
        onGui: (noiDung) => _nhanTin(b, noiDung),
        onHuy: (tinId) => _huyTinNhan(b, tinId),
      ),
    );
  }

  String _nhanLoc(LocKhach l, DuLieuKhach? dl) {
    if (dl == null) return l.nhan;
    return switch (l) {
      LocKhach.khach => '${l.nhan} (${dl.demKhach})',
      LocKhach.chuaCham => '${l.nhan} (${dl.demChuaCham})',
      LocKhach.tatCa => '${l.nhan} (${Fmt.number(dl.demTatCa)})',
      _ => l.nhan,
    };
  }

  Widget _dauDanhSach(DuLieuKhach data) {
    final bayGio = DateTime.now();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!data.coKhoaLlm) ...[
          const _CanhBao(
            'Máy chủ chưa có khoá LLM — bài vẫn được lưu nhưng chưa chấm. Thêm khoá vào .env, khởi động '
            'lại web rồi chấm bài treo.',
          ),
          const SizedBox(height: 10),
        ],
        if (data.agent.isEmpty)
          const Text(
            'Chưa có agent nào kết nối. Bấm dấu ? ở trên để xem cách chạy.',
            style: TextStyle(fontSize: AppSize.textCaption, color: AppColors.muted),
          )
        else
          for (final a in data.agent)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _DongAgent(
                agent: a,
                song: a.conSong(bayGio),
                dangGui: _dangGuiLenh == a.ten,
                onLenh: (lenh) => _guiLenh(a, lenh),
              ),
            ),
        if (data.demChuaCham > 0)
          OutlinedButton.icon(
            onPressed: _dangCham ? null : _chamLai,
            icon: _dangCham
                ? const SizedBox(
                    width: AppSize.iconSm,
                    height: AppSize.iconSm,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.auto_awesome_rounded, size: AppSize.iconSm),
            label: Text('Chấm ${Fmt.number(data.demChuaCham)} bài treo'),
          ),
        if (data.bai.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 48),
            child: Text(
              _loc == LocKhach.khach ? 'Chưa có khách tiềm năng mới.' : 'Không có bài nào.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.muted),
            ),
          ),
      ],
    );
  }
}

class _CanhBao extends StatelessWidget {
  const _CanhBao(this.chu);

  final String chu;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.warning_amber_rounded, size: AppSize.iconSm, color: AppColors.warning),
          const SizedBox(width: 8),
          Expanded(
            child: Text(chu, style: const TextStyle(fontSize: AppSize.textCaption, height: 1.4)),
          ),
        ],
      ),
    );
  }
}

class _DongAgent extends StatelessWidget {
  const _DongAgent({
    required this.agent,
    required this.song,
    required this.dangGui,
    required this.onLenh,
  });

  final AgentFacebook agent;
  final bool song;
  final bool dangGui;
  final void Function(String lenh) onLenh;

  @override
  Widget build(BuildContext context) {
    final dangChay = agent.lenh == 'chay';
    return SectionCard(
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      child: Row(
        children: [
          Icon(
            Icons.smart_toy_rounded,
            size: AppSize.iconMd,
            color: song ? AppColors.success : AppColors.muted,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  agent.ten,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  '${song ? (agent.trangThai ?? 'đang chạy') : 'tắt · ${Fmt.tuongDoi(agent.lanCuoi)}'}'
                  ' · ${Fmt.number(agent.soBaiDaGui)} bài',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: AppSize.textCaption,
                    color: song ? AppColors.muted : AppColors.danger,
                  ),
                ),
              ],
            ),
          ),
          if (song) ...[
            const SizedBox(width: 8),
            dangChay
                ? OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.danger,
                      side: BorderSide(color: AppColors.danger.withValues(alpha: 0.5)),
                    ),
                    onPressed: dangGui ? null : () => onLenh('dung'),
                    icon: const Icon(Icons.stop_rounded, size: AppSize.iconSm),
                    label: const Text('Dừng'),
                  )
                : FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: AppColors.success),
                    onPressed: dangGui ? null : () => onLenh('chay'),
                    icon: const Icon(Icons.play_arrow_rounded, size: AppSize.iconSm),
                    label: const Text('Chạy'),
                  ),
          ],
        ],
      ),
    );
  }
}

/// Agent chạy trên PC hoặc máy chủ nên ở đây chỉ tóm tắt; bản đầy đủ và file tải về nằm trên web.
class _HuongDanAgent extends StatelessWidget {
  const _HuongDanAgent();

  @override
  Widget build(BuildContext context) {
    const dong = TextStyle(fontSize: AppSize.textBody, height: 1.5);
    return const SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Cách chạy agent',
            style: TextStyle(fontSize: AppSize.textTitle, fontWeight: FontWeight.w700),
          ),
          SizedBox(height: 12),
          Text(
            'Agent chạy trên PC Windows hoặc máy chủ, không chạy trên điện thoại. Dùng nick Facebook phụ '
            'vì lướt tự động có thể bị checkpoint.',
            style: dong,
          ),
          SizedBox(height: 10),
          Text(
            '1. Mở tab Khách Facebook trên web, phần "Cách chạy agent", tải fb-khach-agent.exe.\n'
            '2. Bấm đúp file, đăng nhập nick phụ trong cửa sổ Chrome nó mở ra (chỉ lần đầu).\n'
            '3. Agent hiện ở đầu màn này với trạng thái chờ lệnh. Bấm Chạy để bắt đầu lướt, Dừng để thôi.\n'
            '4. Dừng rồi Chrome vẫn mở, agent vẫn đăng được bình luận.',
            style: dong,
          ),
        ],
      ),
    );
  }
}
