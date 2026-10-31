import { useState } from 'react';
import { config } from '../config';

export default function AITools() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { if (config.aiTools.notifyEndpoint !== 'TODO') await fetch(config.aiTools.notifyEndpoint, { method: 'POST', body: JSON.stringify({ email }) }); }
    catch {}
    // eslint-disable-next-line no-console
    console.log('notify:', email);
    setSent(true);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(config.aiTools.sampleCode); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  };

  return (
    <section id="ai-tools" className="section container-x">
      <h2 className="heading mb-3">{config.aiTools.title}</h2>
      <p className="sub mb-6">Talk to Exam Studio from your own tools. Planned, not available yet.</p>
      <div className="grid lg:grid-cols-2 gap-6">
        <form onSubmit={submit} className="card space-y-3">
          <p className="text-sm opacity-80">Notify me when it ships.</p>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="w-full px-3 py-2 rounded-lg border border-[color:var(--c-line)] bg-transparent" aria-label="Email" />
          <button className="btn btn-primary" type="submit">{sent ? 'Thanks, you are on the list!' : 'Notify me'}</button>
        </form>
        <div className="card relative">
          <pre className="text-xs whitespace-pre-wrap font-mono overflow-auto">{config.aiTools.sampleCode}</pre>
          <button onClick={copy} className="btn btn-ghost btn-small absolute top-3 right-3" aria-label="Copy code">{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
    </section>
  );
}
