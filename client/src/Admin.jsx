import React, { useEffect, useRef, useState } from 'react';
import { isAuthenticated } from './auth.js';
import { useAdminQuery } from './AdminData.jsx';
import AdminOverview from './AdminOverview.jsx';
import AdminUsers from './AdminUsers.jsx';
import Plans from './AdminPlans.jsx';
import { Audit, Content, Usage } from './AdminActivity.jsx';
import { AIConfig, Announcements, System } from './AdminOperations.jsx';
import AdminSettings from './AdminSettings.jsx';
import Icon from './ui/Icon.jsx';
import brandMark from './assets/exam-studio-mark.svg';
import './theme/admin.css';

const PAGES = [
  { key: 'overview', title: 'Overview', icon: 'dashboard', description: 'Monitor account activity, platform usage and service health.', component: AdminOverview },
  { key: 'users', title: 'Users', icon: 'user', description: 'Manage personal accounts and platform access.', component: AdminUsers },
  { key: 'plans', title: 'Plans', icon: 'modules', description: 'Manage usage limits and features available to each plan.', component: Plans },
  { key: 'exam-studio-ai', title: 'Exam Studio AI', icon: 'spark', description: 'Manage the platform’s shared AI provider and model.', component: AIConfig },
  { key: 'usage', title: 'Usage', icon: 'chart', description: 'Explore recorded activity and request outcomes.', component: Usage },
  { key: 'content', title: 'Content', icon: 'library', description: 'Review and moderate saved library items.', component: Content },
  { key: 'announcements', title: 'Announcements', icon: 'bell', description: 'Manage notices shown in the teaching workspace.', component: Announcements },
  { key: 'system', title: 'System', icon: 'activity', description: 'Inspect service health, storage and host resources.', component: System },
  { key: 'audit', title: 'Audit', icon: 'clipboard', description: 'Review the platform administration activity trail.', component: Audit },
  { key: 'settings', title: 'Settings', icon: 'settings', description: 'Manage platform defaults and administrator security.', component: AdminSettings },
];

function Brand() {
  return (
    <div className="admin-brand">
      <img src={brandMark} alt="" width="40" height="40" />
      <div><strong>Exam Studio</strong><small>Administration</small></div>
    </div>
  );
}

function AccessScreen({ title, message, retry, onExit }) {
  return (
    <main className="admin-access">
      <section className="admin-panel">
        <Brand />
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="admin-actions">
          {retry && <button type="button" className="primary" onClick={retry}>Try again</button>}
          <button type="button" onClick={onExit}>Back to Exam Studio</button>
        </div>
      </section>
    </main>
  );
}

export default function Admin({ onExit, theme, toggleTheme }) {
  const [signedIn, setSignedIn] = useState(isAuthenticated);
  const [tab, setTab] = useState(() => PAGES.find(({ key }) => key === window.location.hash.slice(1))?.key || 'overview');
  const [navOpen, setNavOpen] = useState(false);
  const menu = useRef(null);
  const heading = useRef(null);
  const access = useAdminQuery(signedIn ? '/admin/me' : null);
  useEffect(() => {
    const endSession = () => setSignedIn(false);
    window.addEventListener('exam-studio:signed-out', endSession);
    return () => window.removeEventListener('exam-studio:signed-out', endSession);
  }, []);
  if (!signedIn) return <AccessScreen title="Sign in to continue" message="Platform administration requires an active administrator session." onExit={onExit} />;
  if (access.error?.status === 403) return <AccessScreen title="Administrator access required" message="This account does not have platform administration access." onExit={onExit} />;
  if (access.error) return <AccessScreen title="Could not verify access" message={access.error.message} retry={access.reload} onExit={onExit} />;
  if (access.pending || !access.data?.user) return <main className="admin-access" role="status">Verifying administrator access…</main>;

  const page = PAGES.find(({ key }) => key === tab);
  const Section = page.component;
  const account = access.data.user;
  function openSection(key) {
    setTab(key);
    setNavOpen(false);
    window.history.replaceState(window.history.state, '', `#${key}`);
    heading.current?.focus();
  }
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-head">
          <Brand />
          <button type="button" className="admin-menu-toggle" ref={menu} aria-label={navOpen ? 'Close admin navigation' : 'Open admin navigation'}
            aria-controls="admin-navigation" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}><Icon name={navOpen ? 'close' : 'menu'} /></button>
        </div>
        <nav id="admin-navigation" className={navOpen ? 'admin-nav is-open' : 'admin-nav'} aria-label="Administration"
          onKeyDown={(event) => { if (event.key === 'Escape' && navOpen) { setNavOpen(false); menu.current?.focus(); } }}>
          <p>Workspace</p>
          {PAGES.map(({ key, title, icon }) => (
            <React.Fragment key={key}>
              {key === 'system' && <p>Operations</p>}
              <button type="button" aria-current={key === tab ? 'page' : undefined} onClick={() => openSection(key)}>
                <Icon name={icon} size={18} />{title}
              </button>
            </React.Fragment>
          ))}
        </nav>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <span className="admin-topbar-label"><Icon name="admin" size={17} /> Platform administration</span>
          <div className="admin-topbar-actions">
            <button type="button" className="admin-theme" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
            <button type="button" onClick={onExit}>Back to workspace <Icon name="arrow" size={15} /></button>
          </div>
        </header>
        <main className="admin-main-content" id="admin-main">
          <header className="admin-page-title">
            <div>
              <p className="admin-kicker">Admin dashboard</p>
              <h1 ref={heading} tabIndex={-1}>{page.title}</h1>
              <p>{page.description}</p>
            </div>
            <div className="admin-account">
              <span className="admin-avatar" aria-hidden="true">{(account.name || account.email || 'A').slice(0, 1).toUpperCase()}</span>
              <div><strong>{account.name || 'Administrator'}</strong><small>Platform administrator</small></div>
            </div>
          </header>
          <Section />
        </main>
      </div>
    </div>
  );
}
