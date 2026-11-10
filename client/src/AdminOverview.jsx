import React from 'react';
import Icon from './ui/Icon.jsx';
import { number, timestamp, uptime, useAdminQuery } from './AdminData.jsx';

function Metric({ label, value, detail, icon }) {
  return (
    <div className="admin-metric">
      <span className="admin-metric-icon"><Icon name={icon} size={17} /></span>
      <div><dt>{label}</dt><dd>{value ?? 'Unavailable'}</dd><small>{detail}</small></div>
    </div>
  );
}

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayLabel = (day) => shortDate.format(new Date(day));

export function ActivityChart({ title, series, metric, description, missing = 'No recorded data for this period.' }) {
  const width = 560;
  const height = 124;
  const max = Math.max(1, ...(series || []).map((item) => item[metric]));
  const step = width / Math.max(1, series?.length || 0);
  const bar = Math.min(step * .64, 32);
  return (
    <figure className="admin-panel admin-chart">
      <figcaption><h2>{title}</h2><p>{description}</p></figcaption>
      {series?.length ? (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            {[1, 41, 82, 123].map((y) => <path key={y} className="admin-chart-grid" d={`M0 ${y}h${width}`} />)}
            {series.map((item, i) => {
              const size = (item[metric] / max) * (height - 4);
              return <rect className="admin-chart-bar" key={item.date} x={i * step + (step - bar) / 2}
                y={height - 2 - size} width={bar} height={size} rx={3}><title>{dayLabel(item.date)} · {number(item[metric])}</title></rect>;
            })}
          </svg>
          <div className="admin-chart-dates" aria-hidden="true">
            <span>{dayLabel(series[0].date)}</span>{series.length > 1 && <span>{dayLabel(series.at(-1).date)}</span>}
          </div>
          <details className="admin-chart-values">
            <summary>View recorded values</summary>
            <dl>{series.map((item) => <div key={item.date}><dt>{dayLabel(item.date)}</dt><dd>{number(item[metric])}</dd></div>)}</dl>
          </details>
        </>
      ) : <p className="admin-chart-empty">{missing}</p>}
    </figure>
  );
}

export function Outcomes({ summary }) {
  const total = summary?.requestsMonth;
  const failed = summary?.failuresMonth;
  const successful = summary?.successesMonth;
  const known = (successful ?? 0) + (failed ?? 0);
  return (
    <section className="admin-panel admin-outcomes">
      <h2>Recorded outcomes</h2><p className="admin-muted">Last 30 days</p>
      {known > 0 && <meter aria-label="Share of known outcomes that succeeded" max={known} value={successful ?? 0} />}
      <dl>
        <div><dt><span className="admin-dot" />Succeeded</dt><dd>{number(successful)}</dd></div>
        <div><dt><span className="admin-dot is-failure" />Failed</dt><dd>{number(failed)}</dd></div>
        {total > known && <div><dt>Outcome unavailable</dt><dd>{number(total - known)}</dd></div>}
      </dl>
    </section>
  );
}

export default function AdminOverview() {
  const usage = useAdminQuery('/admin/usage/summary');
  const server = useAdminQuery('/admin/health');
  const ai = useAdminQuery('/admin/ai-health');
  const summary = usage.data;
  const health = server.data;
  const database = health?.storage?.backend === 'mongodb'
    ? (health.storage.connected ? 'Connected' : 'Disconnected')
    : health?.storage?.backend === 'file' ? 'Local file' : undefined;
  return (
    <div className="admin-stack">
      <div className="admin-section-line">
        <h2>Platform at a glance</h2>
        <button type="button" onClick={() => { usage.reload(); server.reload(); ai.reload(); }} disabled={usage.pending || server.pending || ai.pending}>Refresh metrics</button>
      </div>
      {(usage.pending || server.pending) && <p className="admin-muted" role="status">Loading platform metrics…</p>}
      {(usage.error || server.error || ai.error) && <p className="admin-feedback is-error" role="alert">Some metrics could not be loaded. Refresh metrics to try again.</p>}
      <dl className="admin-metric-grid">
        <Metric label="Total users" value={number(summary?.usersTotal)} detail="Registered accounts" icon="user" />
        <Metric label="Active users" value={number(summary?.usersActive)} detail="Accounts enabled to sign in" icon="check" />
        <Metric label="Requests today" value={number(summary?.requestsToday)} detail="Since midnight UTC" icon="activity" />
        <Metric label="Requests this week" value={number(summary?.requestsWeek)} detail="Last 7 days" icon="chart" />
        <Metric label="Requests this month" value={number(summary?.requestsMonth)} detail="Last 30 days" icon="chart" />
        <Metric label="Failed requests" value={number(summary?.failuresMonth)} detail="Recorded failures in the last 30 days" icon="question" />
        <Metric label="AI tokens reported" value={number(summary?.reportedTokens)} detail="Provider-reported usage, last 30 days" icon="spark" />
        <Metric label="Server uptime" value={uptime(health?.uptime)} detail={health?.version ? `Exam Studio v${health.version}` : 'API process'} icon="clock" />
        <Metric label="Database" value={database} detail={health?.storage?.backend === 'mongodb' ? 'MongoDB' : 'Application storage'} icon="database" />
      </dl>
      <div className="admin-overview-charts">
        <ActivityChart title="Requests over time" series={summary?.daily} metric="requests" description="Recorded requests by day · last 14 days (UTC)" />
        <Outcomes summary={summary} />
        <ActivityChart title="User growth" series={summary?.userGrowth} metric="registrations" description="New registrations by day · last 14 days (UTC)" />
        <ActivityChart title="AI usage over time" series={summary?.dailyTokens} metric="tokens" description="Only days with provider-reported token usage" missing="Provider-reported token usage is unavailable for this period." />
      </div>
      <section className="admin-panel admin-section-line admin-model-note">
        <div><h2>Model usage</h2><p className="admin-muted">Usage records do not include the model that handled each request.</p></div>
        <span className="admin-badge">Last AI response · {timestamp(ai.data?.lastSuccessAt)}</span>
      </section>
    </div>
  );
}
