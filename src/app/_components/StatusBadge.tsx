import { STATUS_LABELS, type ApplicationStatus } from "@/lib/domain/types";

const CLASS: Record<ApplicationStatus, string> = {
  applied: "",
  document_passed: "pass",
  assignment: "asg",
  interview: "go",
  final_passed: "ok",
  rejected: "no",
  withdrawn: "no",
};

export function statusText(status: ApplicationStatus, round?: number | null): string {
  return status === "interview" && round ? `면접 ${round}차` : STATUS_LABELS[status];
}

/** 상태 배지(채운 알약). 불합격·지원취소는 배경 없이 흐리게. */
export function StatusBadge({ status, round }: { status: ApplicationStatus; round?: number | null }) {
  return <span className={`st ${CLASS[status]}`.trim()}>{statusText(status, round)}</span>;
}
