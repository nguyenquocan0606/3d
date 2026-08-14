import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Phát âm thanh offline khi cân — port từ `update-weight-modal.tsx`.
///
/// Dùng đúng bộ mp3 của bản web (đã copy vào `assets/audio/`) thay vì TTS để
/// đọc số tức thì, không cần mạng và không lệ thuộc giọng đọc của hệ điều hành.
/// Người thợ cầm cuộn nhựa hai tay nên chỉ nghe, không nhìn màn hình.
class ScaleAudio {
  ScaleAudio() {
    _player.setPlayerMode(PlayerMode.lowLatency);

    // iPhone gạt sang chế độ im lặng vẫn phải nghe được số cân — category
    // `playback` bỏ qua công tắc rung, `mixWithOthers` để không cắt nhạc của
    // người dùng đang nghe trong xưởng.
    AudioPlayer.global.setAudioContext(
      AudioContext(
        iOS: AudioContextIOS(
          category: AVAudioSessionCategory.playback,
          options: const {AVAudioSessionOptions.mixWithOthers},
        ),
      ),
    );
  }

  final AudioPlayer _player = AudioPlayer();

  /// Bản web đặt 1.35 để đọc nhanh mà vẫn rõ.
  static const _rate = 1.35;

  static const _clips = <String, String>{
    'active': 'audio/active.mp3',
    'spool': 'audio/spool.mp3',
    'done': 'audio/done.mp3',
    'tab_total': 'audio/tab_total.mp3',
    'tab_remaining': 'audio/tab_remaining.mp3',
    'tab_empty': 'audio/tab_empty.mp3',
  };

  /// Đọc từng chữ số của [value] (VD 701 → "bảy" "không" "một").
  Future<void> speakNumber(num value) async {
    final digits = value.round().abs().toString().split('');
    for (final digit in digits) {
      await _playAsset('audio/$digit.mp3');
      // Chờ hết clip rồi mới sang số tiếp theo, nếu không sẽ chồng tiếng.
      await _player.onPlayerComplete.first.timeout(
        const Duration(milliseconds: 900),
        onTimeout: () {},
      );
    }
  }

  /// Phát 1 clip có sẵn theo khóa trong [_clips].
  Future<void> speak(String key) async {
    final asset = _clips[key];
    if (asset == null) return;
    await _playAsset(asset);
  }

  Future<void> _playAsset(String asset) async {
    try {
      await _player.stop();
      await _player.setPlaybackRate(_rate);
      await _player.play(AssetSource(asset));
    } catch (_) {
      // Thiết bị chặn phát âm thanh (chế độ im lặng, quyền audio...) — luồng cân
      // vẫn phải chạy bình thường nên nuốt lỗi ở đây.
    }
  }

  Future<void> dispose() => _player.dispose();
}

final scaleAudioProvider = Provider<ScaleAudio>((ref) {
  final audio = ScaleAudio();
  ref.onDispose(audio.dispose);
  return audio;
});
