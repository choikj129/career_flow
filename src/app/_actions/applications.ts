'use server';

import { z } from 'zod';
import {
  changeStatus,
  deleteApplication,
  markApplied,
  updateApplication,
  updateNotes,
} from '@/lib/applications/repo';
import { validDate } from '@/lib/domain/dates';
import { APPLICATION_STATUSES, SITE_IDS, type ApplicationStatus, type SiteId } from '@/lib/domain/types';
import { run } from './run';
import type { ActionResult } from './types';

const date = z.string().refine(validDate, '날짜 형식이 올바르지 않습니다');
const status = z.enum(APPLICATION_STATUSES as [ApplicationStatus, ...ApplicationStatus[]]);
const site = z.enum(SITE_IDS as [SiteId, ...SiteId[]]);

export async function changeStatusAction(input: {
  applicationId: number;
  status: string;
  interviewRound?: number | null;
  at?: string;
  note?: string;
}): Promise<ActionResult> {
  return run(() => {
    const v = z
      .object({
        applicationId: z.number().int(),
        status,
        interviewRound: z.number().int().min(1).nullish(),
        at: date.optional(),
        note: z.string().optional(),
      })
      .parse(input);
    changeStatus(v.applicationId, v.status, {
      interviewRound: v.interviewRound ?? undefined,
      at: v.at,
      note: v.note?.trim() || undefined,
    });
  }, '상태를 바꿨습니다');
}

export async function markAppliedAction(input: {
  postingId: number;
  appliedAt: string;
  site: string;
  siteNote?: string;
  notes?: string;
}): Promise<ActionResult> {
  return run(() => {
    const v = z
      .object({
        postingId: z.number().int(),
        appliedAt: date,
        site,
        siteNote: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(input);
    markApplied({
      postingId: v.postingId,
      appliedAt: v.appliedAt,
      site: v.site,
      siteNote: v.siteNote,
      notes: v.notes?.trim() || undefined,
    });
  }, '지원 완료로 저장했습니다');
}

export async function updateApplicationAction(input: {
  applicationId: number;
  companyName: string;
  positionTitle: string;
  site: string;
  siteNote?: string;
  appliedAt: string;
}): Promise<ActionResult> {
  return run(() => {
    const v = z
      .object({
        applicationId: z.number().int(),
        companyName: z.string().trim().min(1, '회사 이름을 입력하세요'),
        positionTitle: z.string().trim().min(1, '포지션을 입력하세요'),
        site,
        siteNote: z.string().optional(),
        appliedAt: date,
      })
      .parse(input);
    updateApplication(v.applicationId, {
      companyName: v.companyName,
      positionTitle: v.positionTitle,
      site: v.site,
      siteNote: v.siteNote ?? null,
      appliedAt: v.appliedAt,
    });
  }, '지원 기록을 고쳤습니다');
}

export async function deleteApplicationAction(applicationId: number): Promise<ActionResult> {
  return run(() => {
    deleteApplication(z.number().int().parse(applicationId));
  }, '지원 기록을 삭제했습니다');
}

export async function updateNotesAction(applicationId: number, notes: string): Promise<ActionResult> {
  return run(() => {
    updateNotes(z.number().int().parse(applicationId), z.string().parse(notes));
  }, '메모를 저장했습니다');
}
