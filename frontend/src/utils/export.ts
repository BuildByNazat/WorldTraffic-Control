function escapeCsvValue(value: unknown): string {
  const stringValue =
    value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCsv(
  filename: string,
  rows: Array<Record<string, unknown>>
) {
  if (rows.length === 0) {
    downloadFile(filename, "", "text/csv;charset=utf-8");
    return;
  }

  const headers = Array.from(
    rows.reduce<Set<string>>((acc, row) => {
      Object.keys(row).forEach((key) => acc.add(key));
      return acc;
    }, new Set())
  );
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(",")
    ),
  ];

  downloadFile(filename, lines.join("\n"), "text/csv;charset=utf-8");
}

export function downloadJson(filename: string, value: unknown) {
  downloadFile(
    filename,
    JSON.stringify(value, null, 2),
    "application/json;charset=utf-8"
  );
}
