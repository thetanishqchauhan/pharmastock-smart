import { useState } from 'react';
import { store } from '../store/index.js';
import { Field } from '../components/ui.jsx';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const act = (fn) => async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (err) {
      setMsg(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="center">
      <form className="panel auth" onSubmit={act(() => store.signIn(email, password))}>
        <h1>💊 PharmaStock Smart</h1>
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></Field>
        {msg && <div className="alert danger">{msg}</div>}
        <button className="primary" disabled={busy}>Sign in</button>{' '}
        <button
          type="button"
          disabled={busy}
          onClick={act(async () => {
            const res = await store.signUp(email, password);
            if (!res.session) setMsg('Account created. Check your email to confirm, then sign in.');
          })}
        >
          Create account
        </button>
      </form>
    </div>
  );
}

export function CreatePharmacy({ onDone }) {
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await store.createPharmacy(name.trim());
      await onDone();
    } catch (err) {
      setMsg(err.message);
    }
  };
  return (
    <div className="center">
      <form className="panel auth" onSubmit={submit}>
        <h1>Set up your pharmacy</h1>
        <Field label="Pharmacy name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        {msg && <div className="alert danger">{msg}</div>}
        <button className="primary">Create</button>{' '}
        <button type="button" onClick={() => store.signOut()}>Sign out</button>
      </form>
    </div>
  );
}
