// 클라이언트 컴포넌트에서도 쓴다. 다른 모듈을 import하지 않는다.

export const MIN_POSTING_TEXT_LENGTH = 300;
export const MAX_POSTING_TEXT_LENGTH = 50_000;
/** 업로드는 한 번에 이 개수까지만 받는다. */
export const MAX_UPLOAD_FILES = 10;

export const POSTING_TEXT_TOO_LONG_MESSAGE = `공고 본문이 너무 깁니다(최대 ${MAX_POSTING_TEXT_LENGTH.toLocaleString('en-US')}자). 핵심 내용만 남겨 다시 붙여넣어 주세요.`;
export const TOO_MANY_FILES_MESSAGE = `파일은 한 번에 ${MAX_UPLOAD_FILES}개까지 올릴 수 있습니다.`;
