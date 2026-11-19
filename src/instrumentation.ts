// 서버가 시작될 때 한 번 실행된다(Next.js instrumentation).
// 마이그레이션 -> 백업 -> 중단된 작업 정리 -> 끝난 작업 폴더 정리 -> 워커 시작. `next build`에서는 실행되지 않는다.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const g = globalThis as unknown as { __cfWorkerStarted?: boolean };
  if (g.__cfWorkerStarted) return;
  g.__cfWorkerStarted = true;

  const { ensureDataDirs } = await import('@/lib/config');
  const { getDb, runMigrations } = await import('@/lib/db/client');
  const { runDailyBackup } = await import('@/lib/backup');
  const { cleanupFinishedWorkDirs, recoverInterruptedJobs, startWorker } = await import('@/lib/ai/queue');
  const { ClaudeCliRunner } = await import('@/lib/ai/claude-cli');
  const { handlers } = await import('@/lib/ai/tasks');

  ensureDataDirs();
  runMigrations(getDb());
  try {
    await runDailyBackup();
  } catch (e) {
    console.error('[backup]', e);
  }
  const recovered = recoverInterruptedJobs();
  if (recovered > 0) console.warn(`[worker] 중단된 작업 ${recovered}개를 실패 처리했습니다`);
  try {
    const cleaned = cleanupFinishedWorkDirs();
    if (cleaned > 0) console.warn(`[worker] 끝난 작업의 폴더 ${cleaned}개를 정리했습니다`);
  } catch (e) {
    console.error('[worker]', e);
  }
  startWorker({ runner: new ClaudeCliRunner(), handlers });
}
