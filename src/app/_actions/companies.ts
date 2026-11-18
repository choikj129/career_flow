'use server';

import { z } from 'zod';
import { addCompanyAlias, getCompanyUsage, mergeCompanies, searchCompanies } from '@/lib/companies/repo';
import { setPostingCompany } from '@/lib/postings/repo';
import { run } from './run';
import type { ActionResult } from './types';

export type CompanyCandidate = {
  id: number;
  displayName: string;
  legalName: string | null;
  postings: number;
  applications: number;
};

/** 회사 검색(연결 변경·합치기 창). 공고·지원 기록 수를 함께 돌려준다. */
export async function searchCompaniesAction(text: string): Promise<CompanyCandidate[]> {
  const q = z.string().parse(text).trim();
  if (!q) return [];
  return searchCompanies(q)
    .slice(0, 8)
    .map((c) => ({ id: c.id, displayName: c.displayName, legalName: c.legalName, ...getCompanyUsage(c.id) }));
}

export async function linkCompanyAction(postingId: number, companyId: number): Promise<ActionResult> {
  return run(() => {
    setPostingCompany(z.number().int().parse(postingId), z.number().int().parse(companyId));
  }, '회사 연결을 바꿨습니다');
}

export async function addAliasAction(companyId: number, alias: string): Promise<ActionResult> {
  return run(() => {
    addCompanyAlias(z.number().int().parse(companyId), z.string().parse(alias));
  }, '별칭을 추가했습니다');
}

export async function mergeCompaniesAction(keepId: number, removeId: number): Promise<ActionResult> {
  return run(() => {
    mergeCompanies(z.number().int().parse(keepId), z.number().int().parse(removeId));
  }, '회사를 합쳤습니다');
}
