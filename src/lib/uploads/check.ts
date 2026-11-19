// 클라이언트 컴포넌트에서도 쓴다. 파일·설정 모듈을 import하지 않는다.

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export type UploadKind = 'resume' | 'image';
const ALLOWED: Record<UploadKind, string[]> = {
  resume: ['.pdf', '.docx', '.txt', '.md'],
  image: ['.png', '.jpg', '.jpeg'],
};
const KIND_TEXT: Record<UploadKind, string> = {
  resume: 'PDF, DOCX, TXT, MD',
  image: 'PNG, JPG',
};

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

export function checkUpload(
  name: string,
  size: number,
  kind: UploadKind,
): { ok: true } | { ok: false; reason: string } {
  if (!ALLOWED[kind].includes(extOf(name))) {
    return { ok: false, reason: `지원하지 않는 형식입니다(${KIND_TEXT[kind]}만 가능).` };
  }
  if (size <= 0) return { ok: false, reason: '빈 파일입니다.' };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, reason: '20MB를 넘습니다.' };
  return { ok: true };
}

/** 파일 크기를 "900 B", "1.5 KB", "12.3 MB"로. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
