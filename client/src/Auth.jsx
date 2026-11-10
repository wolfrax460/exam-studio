import React, { useRef, useState } from 'react';
import { login, register, requestPasswordReset, resetPassword } from './auth.js';
import Icon from './ui/Icon.jsx';
import Modal from './ui/Modal.jsx';
import brandMark from './assets/exam-studio-mark.svg';
import workspaceArt from './assets/auth-workspace.svg';
import './theme/auth.css';

const VIEWS = {
  login: ['Welcome back', 'Sign in to your teaching workspace.', 'Sign in'],
  signup: ['Create your account', 'Start with a personal Exam Studio workspace.', 'Create account'],
  forgot: ['Reset your password', 'Enter the email address associated with your account.', 'Send reset link'],
  reset: ['Choose a new password', 'Use a new password for your Exam Studio account.', 'Update password'],
};
const PASSWORD_RULES = [
  ['8 characters', (value) => value.length >= 8],
  ['Lowercase letter', (value) => /[a-z]/.test(value)],
  ['Uppercase letter', (value) => /[A-Z]/.test(value)],
  ['Number', (value) => /[0-9]/.test(value)],
];

export default function Auth({ theme, toggleTheme, notice, onDismissNotice, onSession, resetToken, onRecoveryExit, onInstitution }) {
  const [view, setView] = useState(() => {
    if (resetToken) return 'reset';
    const requested = new URLSearchParams(window.location.search).get('auth');
    return requested === 'signup' || requested === 'forgot' ? requested : 'login';
  });
  const [fields, setFields] = useState({ email: '', name: '', password: '' });
  const [visible, setVisible] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [institution, setInstitution] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const heading = useRef(null);
  const signup = view === 'signup';
  const showAccounts = view === 'login' || signup;
  const needsNewPassword = signup || view === 'reset';
  const [title, description, submitLabel] = VIEWS[view];

  function switchView(next, confirmation = '') {
    if (view === 'reset') onRecoveryExit(Boolean(confirmation));
    setView(next);
    setFields((current) => ({ email: current.email, name: '', password: '' }));
    setVisible(false);
    setShowCode(false);
    setError('');
    setMessage(confirmation);
    onDismissNotice();
    const url = new URL(window.location.href);
    if (next === 'login') url.searchParams.delete('auth');
    else url.searchParams.set('auth', next);
    window.history.replaceState(window.history.state, '', url);
    heading.current?.focus();
  }

  function edit(event) {
    const { name, value } = event.target;
    setFields((current) => ({ ...current, [name]: value }));
    setError('');
    onDismissNotice();
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setMessage('');
    onDismissNotice();
    const email = fields.email.trim();
    const name = fields.name.trim();
    if (signup && !name) return setError('Enter your name.');
    if (needsNewPassword && PASSWORD_RULES.some(([, passes]) => !passes(fields.password))) {
      return setError('Use at least eight characters with a lowercase letter, an uppercase letter and a number.');
    }
    setBusy(true);
    try {
      if (view === 'forgot') {
        const result = await requestPasswordReset(email);
        setMessage(result.message);
      } else if (view === 'reset') {
        const result = await resetPassword(resetToken, fields.password);
        switchView('login', result.message);
      } else {
        const authenticate = signup ? register : login;
        onSession(await authenticate({ email, name, password: fields.password, totpCode: showCode ? fields.totpCode : undefined }), signup);
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-editorial">
        <a className="auth-brand" href="https://exams-studio.vercel.app/"><img src={brandMark} alt="" /><strong>Exam Studio</strong></a>
        <div className="auth-editorial-copy">
          <p className="auth-kicker">The teaching workspace</p>
          <h2>{signup ? 'Your teaching journey starts here.' : 'Good teaching starts with good material.'}</h2>
          <p>Turn what you know into study guides, assessments and revision materials your learners can use.</p>
        </div>
        <img className="auth-art" src={workspaceArt} alt="" width="640" height="338" />
        <a className="auth-home" href="https://exams-studio.vercel.app/"><Icon name="arrow" size={16} /> Back to the website</a>
      </div>
      <div className="auth-entry">
        <button type="button" className="auth-theme" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} />
        </button>
        <section className="auth-form-panel" aria-labelledby="auth-title">
          <header className="auth-form-heading">
            <p className="auth-kicker">Exam Studio account</p>
            <h1 ref={heading} id="auth-title" tabIndex={-1}>{title}</h1>
            <p>{description}</p>
          </header>
          {showAccounts && (
            <fieldset className="auth-account-types">
              <legend>Account type</legend>
              <div>
                <button type="button" className="auth-account is-selected" aria-pressed="true" onClick={() => setInstitution(false)}>
                  <Icon name="user" /><strong>Personal Account</strong>
                  <small>Access your personal teaching and learning workspace.</small>
                </button>
                <button type="button" className="auth-account" aria-haspopup="dialog" disabled={busy} onClick={() => setInstitution(true)}>
                  <Icon name="institution" /><strong>Institution Account</strong>
                  <small>For schools, colleges, universities and training institutions.</small>
                </button>
              </div>
            </fieldset>
          )}
          <form className="auth-form" onSubmit={submit}>
            {(error || notice) && <p className="auth-feedback is-error" role="alert">{error || notice}</p>}
            {message && <p className="auth-feedback" role="status">{message}</p>}
            {signup && <label>Your name<input name="name" autoComplete="name" value={fields.name} onChange={edit} required maxLength={80} /></label>}
            {view !== 'reset' && <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" value={fields.email} onChange={edit} required maxLength={254} /></label>}
            {view !== 'forgot' && (
              <div className="auth-password">
                <div><label htmlFor="auth-password">{view === 'reset' ? 'New password' : 'Password'}</label>
                  {view === 'login' && <button className="auth-text-link" type="button" disabled={busy} onClick={() => switchView('forgot')}>Forgot password?</button>}
                </div>
                <div>
                  <input id="auth-password" name="password" type={visible ? 'text' : 'password'}
                    autoComplete={needsNewPassword ? 'new-password' : 'current-password'} value={fields.password}
                    onChange={edit} required maxLength={72} aria-describedby={needsNewPassword ? 'auth-password-rules' : undefined} />
                  <button type="button" className="auth-visibility" onClick={() => setVisible(!visible)}
                    aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}><Icon name="eye" /></button>
                </div>
              </div>
            )}
            {needsNewPassword && <ul id="auth-password-rules" className="auth-password-rules">{PASSWORD_RULES.map(([label, passes]) => (
              <li key={label} className={passes(fields.password) ? 'is-met' : ''}><span aria-hidden="true">{passes(fields.password) ? '✓' : '○'}</span> {label}</li>
            ))}</ul>}
            {view === 'login' && (
              showCode
                ? <label>Authenticator code<input name="totpCode" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={fields.totpCode || ''} onChange={edit} required /></label>
                : <button className="auth-text-link auth-2fa" type="button" onClick={() => setShowCode(true)}>Use an authenticator code</button>
            )}
            <button className="auth-submit primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : submitLabel}<Icon name="arrow" size={17} /></button>
          </form>
          <p className="auth-switch">
            {view === 'login' && <>New to Exam Studio? <button type="button" className="auth-text-link" disabled={busy} onClick={() => switchView('signup')}>Create an account</button></>}
            {view !== 'login' && <>{signup && 'Already have an account? '}<button type="button" className="auth-text-link" disabled={busy} onClick={() => switchView('login')}>{signup ? 'Sign in' : 'Back to sign in'}</button></>}
          </p>
        </section>
      </div>
      {institution && (
        <Modal title={onInstitution ? 'Institution registration' : 'Institution Workspaces — Coming Soon'} onClose={() => setInstitution(false)} className="auth-institution-modal">
          <div className="auth-institution-mark"><Icon name="institution" size={26} /></div>
          <p className="auth-kicker">{onInstitution ? 'Platform review' : 'Coming soon'}</p>
          <p>{onInstitution
            ? 'Use your Exam Studio account to submit an institution for approval. You can check the status of your application from your workspace.'
            : 'We’re building Exam Studio for educational institutions, including collaborative workspaces, school management and examination administration. This feature is not available yet.'}</p>
          <div className="studio-modal-actions">
            <button className="primary" type="button" onClick={() => { setInstitution(false); onInstitution?.(); }}>
              {onInstitution ? (signup ? 'Continue to create account' : 'Continue to sign in') : 'Back to Personal Account'}
            </button>
            <button type="button" onClick={() => setInstitution(false)}>Close</button>
          </div>
        </Modal>
      )}
    </main>
  );
}
