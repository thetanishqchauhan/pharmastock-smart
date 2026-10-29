import { useState } from 'react';
import { IMPORT_FIELDS, autoMapHeaders, planImport, validateRows } from '../lib/importer.js';
import { parseCSVFile } from '../lib/csv.js';
import { formatDate } from '../lib/dates.js';

export default function Import({ data, store, run, today, go }) {
  const [file, setFile] = useState(null);
  const [map, setMap] = useState({});
  const [mode, setMode] = useState('receive');
  const [busy, setBusy] = useState(false);
  const [parseError, setParseError] = useState('');

  const onFile = async (e) => {
    setParseError('');
    const f = e.target.files[0];
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      setParseError('Please upload a .csv file. In Excel use File → Save As → "CSV UTF-8".');
      return;
    }
    try {
      const parsed = await parseCSVFile(f);
      setFile({ name: f.name, ...parsed });
      setMap(autoMapHeaders(parsed.headers));
    } catch (err) {
      setParseError(err.message);
    }
  };

  const result = file ? validateRows(file.rows, map, data, today) : null;
  const valid = result?.rows.filter((r) => !r.errors.length) || [];
  const invalid = result?.rows.filter((r) => r.errors.length) || [];

  const confirm = async () => {
    setBusy(true);
    const plan = planImport(result.rows, mode, data, store.newId, new Date().toISOString());
    const ok = await run(async () => {
      await store.insertMedicines(plan.newMedicines);
      await store.insertBatches(plan.newBatches);
      await store.insertMovements(plan.newMovements);
    }, `Imported: ${plan.newMedicines.length} new medicines, ${plan.newBatches.length} new batches, ${plan.newMovements.length} stock movements${plan.unchanged ? `, ${plan.unchanged} unchanged` : ''}.`);
    setBusy(false);
    if (ok) {
      setFile(null);
      go('dashboard', { keepNotice: true });
    }
  };

  return (
    <>
      <h1>Import stock from CSV</h1>
      <div className="panel">
        <p>
          Export stock from your billing software or Excel as CSV. Required columns: <b>medicine name, batch, expiry, quantity</b>.
          Optional: strength, dosage form, manufacturer, purchase price, MRP, unit, minimum stock.{' '}
          <a href="/stock-import-template.csv" download>Download template</a>
        </p>
        <div className="row">
          <label><input type="radio" checked={mode === 'receive'} onChange={() => setMode('receive')} /> <b>Received stock</b> — add quantities as new purchases</label>
        </div>
        <div className="row">
          <label><input type="radio" checked={mode === 'snapshot'} onChange={() => setMode('snapshot')} /> <b>Stock snapshot</b> — set each batch to the file quantity (use for weekly exports from billing software; reductions are counted as estimated sales)</label>
        </div>
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
        {parseError && <div className="alert danger">{parseError}</div>}
      </div>

      {file && (
        <>
          <h2>Column mapping — {file.name}</h2>
          <div className="grid">
            {Object.entries(IMPORT_FIELDS).map(([field, def]) => (
              <label className="field" key={field}>
                <span>{def.label}{def.required ? ' *' : ''}</span>
                <select value={map[field] || ''} onChange={(e) => setMap({ ...map, [field]: e.target.value || undefined })}>
                  <option value="">— not in file —</option>
                  {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>

          {result.fatal ? (
            <div className="alert danger">{result.fatal}</div>
          ) : (
            <>
              <h2>Review ({valid.length} ready, {invalid.length} with errors)</h2>
              <p className="note">Check the preview carefully. Rows with errors are skipped — fix them in the file and import again. Month-only expiry (e.g. 03/2027) is read as the last day of that month.</p>
              <div className="scroll">
                <table>
                  <thead>
                    <tr><th>Line</th><th>Medicine</th><th>Batch</th><th>Expiry</th><th className="num">Qty</th><th className="num">Price</th><th>Status</th><th>Issues</th></tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={r.line} className={r.errors.length ? 'row-error' : r.warnings.length ? 'row-warn' : ''}>
                        <td>{r.line}</td>
                        <td>{[r.data.name, r.data.strength].filter(Boolean).join(' ')}</td>
                        <td>{r.data.batch_number}</td>
                        <td>{r.data.expiry_date ? formatDate(r.data.expiry_date) : r.data.expiry_raw}</td>
                        <td className="num">{r.errors.length ? r.data.quantity_raw : r.data.quantity}</td>
                        <td className="num">{r.data.purchase_price ?? ''}</td>
                        <td>{r.errors.length ? 'Skip' : r.data.existingBatch ? 'Existing batch' : r.data.existingMedicine ? 'New batch' : 'New medicine'}</td>
                        <td>{[...r.errors, ...r.warnings].join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="primary" disabled={!valid.length || busy} onClick={confirm}>
                {busy ? 'Importing…' : `Confirm import of ${valid.length} rows`}
              </button>
            </>
          )}
        </>
      )}
    </>
  );
}
