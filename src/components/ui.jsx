export function StatusBadge({ status }) {
  const map = { expired: ['danger', 'Expired'], near: ['warning', 'Near expiry'], ok: ['ok', 'OK'], unknown: ['muted', 'No expiry'] };
  const [cls, text] = map[status] || map.unknown;
  return <span className={`badge ${cls}`}>{text}</span>;
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Card({ title, value, sub, tone = '', onClick }) {
  return (
    <div className={`card ${tone} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="card-title">{title}</div>
      <div className="card-value">{value}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}
