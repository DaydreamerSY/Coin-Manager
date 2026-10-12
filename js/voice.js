// Nhận giọng nói bằng Web Speech API có sẵn trong Chrome Android (tiếng Việt: vi-VN).

export function createRecognizer({ onInterim, onFinal, onError, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  const rec = new SR();
  rec.lang = 'vi-VN';
  rec.interimResults = true;
  rec.continuous = false;   // tự dừng khi bạn ngừng nói
  rec.maxAlternatives = 5;  // lấy nhiều phương án để chọn câu có số tiền hợp lệ

  let listening = false;
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) onFinal(Array.from(r, a => a.transcript.trim()).filter(Boolean));
      else interim += r[0].transcript;
    }
    if (interim) onInterim(interim);
  };
  rec.onerror = e => onError(e.error);
  rec.onend = () => { listening = false; onEnd(); };

  return {
    get listening() { return listening; },
    start() { if (!listening) { listening = true; rec.start(); } },
    stop() { rec.stop(); },
  };
}

export const VOICE_ERRORS = {
  'not-allowed': 'Chưa cho phép dùng micro. Bấm biểu tượng ổ khoá trên thanh địa chỉ để bật lại.',
  'service-not-allowed': 'Trình duyệt chặn nhận giọng nói. Hãy mở bằng Chrome.',
  'no-speech': 'Không nghe thấy gì, thử nói lại nhé.',
  'audio-capture': 'Không tìm thấy micro.',
  'network': 'Cần có mạng để nhận giọng nói. Bạn vẫn có thể gõ tay bên dưới.',
  'aborted': '',
};
