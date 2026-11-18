import { z } from 'zod';

/**
 * zod 스키마를 `claude --json-schema`에 넘길 JSON Schema로 바꾼다.
 * z.toJSONSchema의 기본 출력은 `$schema`로 draft 2020-12를 가리키는데,
 * 실제 claude CLI(2.1.x)는 이 메타 스키마를 찾지 못해 거부한다.
 * 그래서 draft-7 형식으로 만들고 `$schema` 키를 뺀다.
 */
export function toCliJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _omit, ...rest } = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  void _omit;
  return rest;
}
