/** 통계 공용 표: 첫 열 왼쪽, 나머지 오른쪽 정렬, 고정폭 숫자 */
export function StatsTable({
  head,
  rows,
  testId,
}: {
  head: string[];
  rows: { key: string; cells: React.ReactNode[] }[];
  testId?: string;
}) {
  return (
    <table className="stats-table" data-testid={testId}>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            {r.cells.map((c, i) => (
              <td key={i}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
