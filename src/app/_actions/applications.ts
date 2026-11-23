'use server';

import { z } from 'zod';
import {
  changeStatus,
  deleteApplication,
  getRecentApplications,
  markApplied,
  type RecentApplication,
  updateApplication,
  updateNotes,
} from '@/lib/applications/repo';
import { deleteStatusEvent, updateStatusEvent } from '@/lib/applications/events';
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

export type RecentApplicationsResult = { ok: true; records: RecentApplication[] } | { ok: false; error: string };

/** [지원 완료]를 누르면 먼저 부른다. 최근 6개월 안에 같은 공고·같은 회사에 지원한 기록(확인 창용). */
export async function recentApplicationsAction(postingId: number): Promise<RecentApplicationsResult> {
  try {
    return { ok: true, records: getRecentApplications(z.number().int().parse(postingId)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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

export async function updateStatusEventAction(input: {
  eventId: number;
  status: string;
  interviewRound?: number | null;
  at: string;
  note?: string;
}): Promise<ActionResult> {
  return run(() => {
    const v = z
      .object({
        eventId: z.number().int(),
        status,
        interviewRound: z.number().int().min(1).nullish(),
        at: date,
        note: z.string().optional(),
      })
      .parse(input);
    updateStatusEvent(v.eventId, {
      status: v.status,
      interviewRound: v.interviewRound ?? null,
      at: v.at,
      note: v.note?.trim() || null,
    });
  }, '상태 이력을 고쳤습니다');
}

export async function deleteStatusEventAction(eventId: number): Promise<ActionResult> {
  return run(() => {
    deleteStatusEvent(z.number().int().parse(eventId));
  }, '상태 이력을 삭제했습니다');
}
