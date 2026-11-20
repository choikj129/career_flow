// PDF·md 내려받기 파일 이름과 Content-Disposition. 순수 함수.

const DOC_LABEL = { resume: '이력서', career: '경력기술서' } as const;

/** 파일 이름에 못 쓰는 글자·공백·제어 문자를 뺀다. */
function clean(s: string): string {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f\s]+/g, '').replace(/^\.+|\.+$/g, '');
}

/** 기본 서류 md 첫 제목 "이름 · 직함"의 이름. 제목이 없으면 빈 문자열 */
export function personNameFromMd(md: string): string {
  const m = /^#\s+(.+)$/m.exec(md);
  if (!m) return '';
  return m[1].split('·')[0].trim();
}

/** `{이름}_{이력서|경력기술서}_{직무}.pdf`(회사·버전·날짜 없음). 이름이 없으면 `{이력서|경력기술서}_{직무}.pdf` */
export function kitPdfFileName(i: { name: string; doc: 'resume' | 'career'; track: string }): string {
  const parts = [clean(i.name), DOC_LABEL[i.doc], clean(i.track)].filter(Boolean);
  return `${parts.join('_')}.pdf`;
}

/** RFC 5987/6266: ASCII 대체 이름 + UTF-8 이름. 따옴표·줄바꿈이 헤더를 깨지 못한다. */
export function contentDisposition(fileName: string, inline = false): string {
  const safe = fileName.replace(/[\u0000-\u001f\u007f]/g, '');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const star = encodeURIComponent(safe).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${star}`;
}
