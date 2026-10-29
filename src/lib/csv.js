import Papa from 'papaparse';

// Prevent spreadsheet formula injection when users open exported files in Excel.
const safe = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function toCSV(rows, columns) {
  return Papa.unparse({
    fields: columns.map((c) => c.header),
    data: rows.map((r) => columns.map((c) => safe(typeof c.value === 'function' ? c.value(r) : r[c.value]) ?? '')),
  });
}

export function downloadCSV(filename, rows, columns) {
  const blob = new Blob(['\ufeff' + toCSV(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCSVFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (res) => resolve({ headers: res.meta.fields || [], rows: res.data }),
      error: reject,
    });
  });
}

export const inr = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
