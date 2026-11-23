import { describe, expect, test } from 'vitest';
import { parseGuide } from '@/lib/kit/parse-guide';

// 실제로 쓰는 가이드에서 흔한 마크다운 변형(굵게·코드 표시, 붙여 쓴 순서, 이름 안의 ·,
// 하위 제목 아래 자기소개, 굵은 줄 "추가 조정", 줄여 쓴 개인 프로젝트 이름). 내용은 지어낸 예시다.
const GUIDE = `# 가이드 (지어낸 예시)

## 1. 구성

### 기본 서류 (범용)
| 직무 | 이력서 | 경력기술서 | 기본 프로필 |
|---|---|---|---|
| 서버 | \`이력서_서버.md\` | \`경력기술서_서버.md\` | **S1** |

## 3. 프로필별 레시피

### 기본 서류 번호표
**서버 이력서**
- 개인 프로젝트: 메모장 · 가상 일정 관리 도구 · 날씨봇
- 핵심 역량: ⓐ 설계 ⓑ 운영 ⓒ 협업
- 주요 성과: 1 큐 분리 · 2 배치 분할·재개 · 3 2인 리딩·가이드
- 경력기술서: 1 성능 · 2 정합성·장애 대응

### 서버
| 프로필 | 공고 단어 | ① 자기소개 | ② 핵심 역량 | ③ 주요 성과 | ⑤ 경력기술서 | ④ 개인 프로젝트 |
|---|---|---|---|---|---|---|
| **S1 범용** (기본) | 애매할 때 | S1 | ⓐⓑⓒ | 123 | 12 | 메모장, 일정 도구, 날씨봇 |
| **S2 운영** | 운영, 장애 | S2 | ⓑⓐⓒ | 312 | 21 | 날씨봇 |

**추가 조정 (프로필과 함께 적용)**
- 공고에 **Kafka, 큐**가 있으면: 주요 성과 1을 2번째로 올림.
- 공고에 **Spring, JPA**가 필수로 있으면: 개인 프로젝트를 위로.

---

## 4. 자기소개 후보

> 모두 3문단입니다.

### 서버

**S1 범용형 (기본)**
> 첫 문단입니다.
>
> 둘째 문단입니다.

**S2 운영형**
> 운영을 잘합니다.

## 5. 허용 범위
| 원래 표현 | 바꿔도 되는 표현 | 쓰면 안 되는 표현 |
|---|---|---|
| 서버 개발 | 백엔드 개발 | 최고 |

## 6. 제출 전 체크리스트
- [ ] 회사 이름 확인
`;

describe('parseGuide: 흔한 마크다운 변형 (TC-KIT-37)', () => {
  const { guide, errors } = parseGuide(GUIDE);

  test('오류 없이 읽는다', () => {
    expect(errors).toEqual([]);
    expect(guide).not.toBeNull();
  });

  test('기본 서류 표의 `파일 이름`과 **기본 프로필** 표시를 벗긴다', () => {
    expect(guide!.tracks[0]).toMatchObject({ name: '서버', resumeFile: '이력서_서버.md', careerFile: '경력기술서_서버.md', defaultProfileId: 'S1' });
  });

  test('번호표: 이름 안의 · 는 나누지 않는다', () => {
    expect(guide!.tracks[0].parts.achievements).toEqual(['큐 분리', '배치 분할·재개', '2인 리딩·가이드']);
    expect(guide!.tracks[0].parts.chapters).toEqual(['성능', '정합성·장애 대응']);
  });

  test('프로필: **굵게** 표시를 벗기고, 붙여 쓴 순서(ⓐⓑⓒ, 123)를 읽는다', () => {
    const s1 = guide!.profiles.find((p) => p.id === 'S1')!;
    expect(s1).toMatchObject({ name: '범용', isDefault: true, competencyOrder: [0, 1, 2], achievementOrder: [0, 1, 2], chapterOrder: [0, 1] });
    const s2 = guide!.profiles.find((p) => p.id === 'S2')!;
    expect(s2).toMatchObject({ name: '운영', isDefault: false, competencyOrder: [1, 0, 2], achievementOrder: [2, 0, 1], chapterOrder: [1, 0] });
  });

  test('프로필의 줄여 쓴 개인 프로젝트 이름은 번호표 이름으로 맞춘다', () => {
    expect(guide!.profiles.find((p) => p.id === 'S1')!.projects).toEqual(['메모장', '가상 일정 관리 도구', '날씨봇']);
  });

  test('하위 제목(### 서버) 아래 자기소개 후보를 읽고, 빈 > 줄은 문단 구분으로 남긴다', () => {
    expect(guide!.intros.S1).toBe('첫 문단입니다.\n\n둘째 문단입니다.');
    expect(guide!.intros.S2).toBe('운영을 잘합니다.');
  });

  test('직무 블록 안의 굵은 줄 "추가 조정" 목록도 읽는다', () => {
    expect(guide!.adjustments).toHaveLength(2);
    expect(guide!.adjustments[0]).toMatchObject({ id: '서버-1', track: '서버', triggers: ['Kafka', '큐'] });
    // "가 필수로 있으면"도 읽는다
    expect(guide!.adjustments[1]).toMatchObject({ id: '서버-2', triggers: ['Spring', 'JPA'], instruction: '개인 프로젝트를 위로.' });
  });

  test('줄여 쓴 이름이 번호표의 둘 이상과 맞으면 오류', () => {
    const bad = GUIDE.replace('| 날씨봇 |\n\n**추가', '| 도구 |\n\n**추가').replace('메모장 · 가상 일정 관리 도구', '메모 도구 · 가상 일정 관리 도구');
    expect(parseGuide(bad).errors.some((e) => e.message.includes('개인 프로젝트 "도구"'))).toBe(true);
  });
});
