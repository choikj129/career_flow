import { describe, expect, test } from 'vitest';
import { AnalysisResult, ImportedApplications } from '@/lib/ai/tasks/schemas';
import { ResumeContent } from '@/lib/resume/schema';
import { toCliJsonSchema } from '@/lib/ai/tasks/json-schema';

// 실제 claude --json-schema는 draft 2020-12 메타 스키마를 모른다
// ("no schema with key or ref .../draft/2020-12/schema", 2026-11-18 실제 호출에서 확인).
describe('toCliJsonSchema', () => {
  test.each([
    ['AnalysisResult', AnalysisResult],
    ['ImportedApplications', ImportedApplications],
    ['ResumeContent', ResumeContent],
  ])('%s has no $schema key and stays an object schema', (_name, schema) => {
    const out = toCliJsonSchema(schema) as Record<string, unknown>;
    expect(out).not.toHaveProperty('$schema');
    expect(out.type).toBe('object');
    expect(out.properties).toBeTruthy();
  });

  test('keeps nullable and enum information', () => {
    const out = JSON.stringify(toCliJsonSchema(AnalysisResult));
    expect(out).toContain('"requirements"');
    expect(out).toContain('"null"');
  });
});
