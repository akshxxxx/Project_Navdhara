import React, { useState, useEffect } from 'react';
import { Shield, Loader2, CheckCircle2, X, Trash2, KeyRound, Megaphone, Ban, Plus, Download, FileText } from 'lucide-react';
import {
  fetchFieldReports, postAdminValidateReport, fetchPriorityList, fetchClosures,
  deleteAdminClosure, postAdminClosure, postAlertAll, getAdminKey, setAdminKey,
  fetchNodeLogDays, fetchNodeLogRows, downloadNodeLog,
} from '../api/client';
import { scoreToLevel } from '../api/adapters';
import { RiskBadge } from '../components/RiskIcon';
import { SEGMENTS } from '../data/segments';

const STATUS_STYLE = {
  pending: 'bg-tint-moderate text-risk-moderate',
  verified: 'bg-tint-low text-risk-low',
  rejected: 'bg-glacier text-granite',
};

const NODE_STATE_STYLE = {
  ALARM: 'bg-tint-severe text-risk-severe',
  WARNING: 'bg-tint-high text-risk-high',
  WATCH: 'bg-tint-moderate text-risk-moderate',
  OK: 'bg-tint-low text-risk-low',
};

// Admin / control room. The whole dashboard is for officials, so there is no login screen:
// every admin call sends the key from Frontend/.env (VITE_ADMIN_API_KEY) or the one saved below.
export const Officials = () => {
  const [tab, setTab] = useState('reports');
  const [reports, setReports] = useState([]);
  const [priority, setPriority] = useState([]);
  const [closures, setClosures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [keyInput, setKeyInput] = useState(getAdminKey());
  const [closureForm, setClosureForm] = useState({ segmentId: 'seg_05', status: 'closed', reason: '', source: 'NH-7 Control Room' });
  const [broadcast, setBroadcast] = useState({ segmentId: 'all', message: '' });
  const [busy, setBusy] = useState(false);
  const [logDays, setLogDays] = useState([]);
  const [logDate, setLogDate] = useState(null);
  const [logNode, setLogNode] = useState('');
  const [logRows, setLogRows] = useState([]);
  const [logLoading, setLogLoading] = useState(false);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  }

  const authHint = e => (e?.status === 401 ? ' Admin key rejected: it must match ADMIN_API_KEY in Backend/.env.' : '');

  async function loadData() {
    setLoading(true);
    try {
      const [r, p, c] = await Promise.allSettled([
        fetchFieldReports(),
        fetchPriorityList(),
        fetchClosures({ activeOnly: false }),
      ]);
      if (r.status === 'fulfilled') setReports(Array.isArray(r.value) ? r.value : (r.value?.reports || []));
      if (p.status === 'fulfilled') setPriority(p.value?.priority_list || p.value?.segments || []);
      if (c.status === 'fulfilled') setClosures(c.value?.closures || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  // Sensor log: the list of days, then the newest readings of the chosen day
  async function loadLogDays() {
    setLogLoading(true);
    try {
      const res = await fetchNodeLogDays();
      const days = res.days || [];
      setLogDays(days);
      const date = logDate || days[0]?.date;
      if (date) {
        setLogDate(date);
        loadLogRows(date, logNode);
      }
    } catch (e) {
      showToast('Could not load the sensor log.' + authHint(e));
    } finally {
      setLogLoading(false);
    }
  }

  async function loadLogRows(date = logDate, nodeId = logNode) {
    if (!date) return;
    setLogLoading(true);
    try {
      const res = await fetchNodeLogRows({ date, nodeId, limit: 200 });
      setLogRows(res.rows || []);
    } catch (e) {
      setLogRows([]);
      showToast('Could not load that day.' + authHint(e));
    } finally {
      setLogLoading(false);
    }
  }

  async function handleDownloadLog(date) {
    try {
      await downloadNodeLog({ date });
    } catch (e) {
      showToast('Download failed.' + authHint(e));
    }
  }

  async function handleValidate(reportId, newStatus) {
    try {
      const res = await postAdminValidateReport({ reportId, status: newStatus });
      showToast(res.message || `Report #${reportId} ${newStatus}.`);
      setReports(rs => rs.map(r => r.id === reportId ? { ...r, status: newStatus } : r));
    } catch (e) {
      showToast('Action failed.' + authHint(e));
    }
  }

  async function handleDeleteClosure(id) {
    if (!window.confirm(`Reopen the road: lift closure #${id}?`)) return;
    try {
      await deleteAdminClosure({ id });
      showToast('Closure lifted. The stretch is open again.');
      setClosures(cs => cs.filter(c => c.id !== id));
    } catch (e) {
      showToast('Could not lift the closure.' + authHint(e));
    }
  }

  async function handleCreateClosure(e) {
    e.preventDefault();
    if (closureForm.reason.trim().length < 3) { showToast('Give a reason for the closure.'); return; }
    setBusy(true);
    try {
      const c = await postAdminClosure({
        segmentId: closureForm.segmentId, status: closureForm.status,
        reason: closureForm.reason.trim(), source: closureForm.source.trim() || 'NH-7 Control Room',
      });
      showToast(`Closure #${c.id} declared on ${c.segment_name || c.segment_id}. Trip plans through it now say ${c.status === 'closed' ? 'AVOID' : 'CAUTION'}.`);
      setClosureForm(f => ({ ...f, reason: '' }));
      loadData();
    } catch (err) {
      showToast('Could not declare the closure.' + authHint(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleBroadcast(e) {
    e.preventDefault();
    const target = broadcast.segmentId === 'all' ? 'every subscriber on the corridor' : `every subscriber of ${SEGMENTS.find(s => s.id === broadcast.segmentId)?.nameEn}`;
    if (!window.confirm(`Send this official alert to ${target}?`)) return;
    setBusy(true);
    try {
      const res = await postAlertAll({ segmentId: broadcast.segmentId, message: broadcast.message.trim() });
      showToast(`Alert sent to ${res.sent} of ${res.recipients} subscribers.${res.dry_run ? ' Test mode (DRY_RUN): logged, not delivered.' : ''}`);
    } catch (err) {
      showToast('Broadcast failed.' + authHint(err));
    } finally {
      setBusy(false);
    }
  }

  const saveKey = () => {
    setAdminKey(keyInput.trim());
    showToast(keyInput.trim() ? 'Admin key saved in this browser.' : 'Saved key cleared; using Frontend/.env.');
  };

  const pendingCount = reports.filter(r => r.status === 'pending').length;
  const activeClosures = closures.filter(c => !c.ends_at || new Date(c.ends_at) > new Date());

  return (
    <div className="flex-1 w-full max-w-[1100px] mx-auto p-4 lg:p-8 pb-24">
      {toast && (
        <div className="fixed bottom-20 lg:bottom-8 left-1/2 -translate-x-1/2 bg-ink text-white px-6 py-3 rounded-md shadow-pop z-50 text-sm font-sans max-w-[90vw]">
          {toast}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-condensed text-[26px] md:text-[28px] font-semibold text-ink flex items-center gap-2">
            <Shield className="w-7 h-7 text-river" /> Admin · NH-7 control room
          </h1>
          <p className="text-granite text-sm mt-1">Verify reports, declare and lift closures, broadcast alerts, plan BRO pre-positioning, and download the sensor log.</p>
        </div>
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-granite shrink-0" />
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="Admin key (default from .env)"
            className="h-9 w-48 px-3 rounded-md border border-mist bg-white text-sm min-w-0"
          />
          <button onClick={saveKey} className="h-9 px-3 rounded-md bg-river text-white text-xs font-semibold">Save</button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-mist overflow-x-auto">
        {[
          { key: 'reports', label: `Reports${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}` },
          { key: 'closures', label: `Closures (${activeClosures.length})` },
          { key: 'broadcast', label: 'Broadcast' },
          { key: 'priority', label: 'BRO Priority' },
          { key: 'sensorlog', label: 'Sensor log' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); if (t.key === 'sensorlog') loadLogDays(); }}
            className={`px-4 py-2 font-condensed font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key ? 'border-river text-ink' : 'border-transparent text-granite hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button onClick={() => { loadData(); if (tab === 'sensorlog') loadLogDays(); }} className="ml-auto text-xs text-river hover:underline font-sans px-2 shrink-0">
          {loading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Refresh'}
        </button>
      </div>

      {tab === 'reports' && (
        <div className="space-y-3">
          {reports.length === 0 && !loading && <p className="text-granite font-sans text-sm">No reports yet.</p>}
          {reports.map(report => (
            <div key={report.id} className="bg-snow border border-mist rounded-md p-4 font-sans text-sm">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-granite text-xs font-semibold">#{report.id}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[report.status] || STATUS_STYLE.pending}`}>
                      {report.status || 'pending'}
                    </span>
                    <span className="text-granite text-xs">{report.segment_id}</span>
                  </div>
                  <p className="text-ink font-medium break-words">{report.description}</p>
                  <p className="text-granite text-xs mt-1">
                    {report.reporter_name || 'Anonymous'} · {report.reported_at ? new Date(report.reported_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}
                    {report.decision_notes ? ` · ${report.decision_notes}` : ''}
                  </p>
                </div>
                {(!report.status || report.status === 'pending') && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleValidate(report.id, 'verified')}
                      className="px-3 py-1.5 bg-risk-low text-white rounded-md text-xs font-semibold hover:opacity-90 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Verify
                    </button>
                    <button
                      onClick={() => handleValidate(report.id, 'rejected')}
                      className="px-3 py-1.5 bg-glacier border border-mist text-granite rounded-md text-xs font-semibold hover:bg-mist flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'closures' && (
        <div className="space-y-5">
          <form onSubmit={handleCreateClosure} className="bg-snow border border-mist rounded-md p-4 grid gap-3 md:grid-cols-4 text-sm">
            <div className="md:col-span-4 font-condensed font-semibold text-ink flex items-center gap-2"><Ban className="w-4 h-4 text-risk-severe" /> Declare a closure or restriction</div>
            <select value={closureForm.segmentId} onChange={e => setClosureForm(f => ({ ...f, segmentId: e.target.value }))}
              className="h-10 px-2 rounded-md border border-mist bg-white md:col-span-2">
              {SEGMENTS.map(s => <option key={s.id} value={s.id}>{s.id} · {s.nameEn}</option>)}
            </select>
            <select value={closureForm.status} onChange={e => setClosureForm(f => ({ ...f, status: e.target.value }))}
              className="h-10 px-2 rounded-md border border-mist bg-white">
              <option value="closed">Closed</option>
              <option value="one_way">One-way</option>
              <option value="restricted">Restricted</option>
            </select>
            <input value={closureForm.source} onChange={e => setClosureForm(f => ({ ...f, source: e.target.value }))}
              placeholder="Issuing authority" className="h-10 px-3 rounded-md border border-mist bg-white" />
            <input value={closureForm.reason} onChange={e => setClosureForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Reason (e.g. debris clearance at km 112)" className="h-10 px-3 rounded-md border border-mist bg-white md:col-span-3" />
            <button type="submit" disabled={busy}
              className="h-10 rounded-md bg-risk-severe text-white font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Plus className="w-4 h-4" /> Declare
            </button>
          </form>

          {closures.length === 0 && !loading && <p className="text-granite font-sans text-sm">No closures recorded.</p>}
          {closures.map(closure => (
            <div key={closure.id} className="bg-snow border border-mist rounded-md p-4 font-sans text-sm flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-tint-closed text-ink">{closure.status.replace('_', '-')}</span>
                  <span className="font-medium text-ink">{closure.segment_name || closure.segment_id}</span>
                </div>
                <p className="text-granite break-words">{closure.reason}</p>
                <p className="text-xs text-granite mt-1">
                  Source: {closure.source || '—'}
                  {closure.starts_at && ` · Since ${new Date(closure.starts_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`}
                </p>
              </div>
              <button
                onClick={() => handleDeleteClosure(closure.id)}
                className="px-3 py-1.5 bg-tint-high border border-risk-high text-risk-high rounded-md text-xs font-semibold hover:opacity-90 flex items-center gap-1 shrink-0 self-start"
              >
                <Trash2 className="w-3 h-3" /> Reopen
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'broadcast' && (
        <form onSubmit={handleBroadcast} className="bg-snow border border-mist rounded-md p-4 space-y-3 text-sm max-w-[640px]">
          <div className="font-condensed font-semibold text-ink flex items-center gap-2"><Megaphone className="w-4 h-4 text-river" /> Official alert to subscribers</div>
          <p className="text-xs text-granite">Goes to every subscriber who gave consent, by Telegram / SMS, and is recorded in the alert log. Leave the message empty to send the stretch's current risk level.</p>
          <select value={broadcast.segmentId} onChange={e => setBroadcast(b => ({ ...b, segmentId: e.target.value }))}
            className="h-10 w-full px-2 rounded-md border border-mist bg-white">
            <option value="all">Entire NH-7 corridor (all subscribers)</option>
            {SEGMENTS.map(s => <option key={s.id} value={s.id}>{s.id} · {s.nameEn}</option>)}
          </select>
          <textarea value={broadcast.message} onChange={e => setBroadcast(b => ({ ...b, message: e.target.value }))}
            rows={4} maxLength={600} placeholder="Optional custom message, e.g. Convoy halted at Srinagar until 14:00."
            className="w-full px-3 py-2 rounded-md border border-mist bg-white" />
          <button type="submit" disabled={busy}
            className="h-10 px-5 rounded-md bg-river text-white font-semibold flex items-center gap-2 disabled:opacity-60">
            <Megaphone className="w-4 h-4" /> {busy ? 'Sending…' : 'Send alert'}
          </button>
        </form>
      )}

      {tab === 'priority' && (
        <div>
          <p className="text-sm text-granite font-sans mb-4">Where should BRO machines be pre-positioned? Priority = hazard × consequence.</p>
          {priority.length === 0 && !loading && <p className="text-granite font-sans text-sm">No priority data available.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans min-w-[560px]">
              <thead>
                <tr className="border-b border-mist text-granite text-left">
                  <th className="py-2 pr-4 font-semibold">Rank</th>
                  <th className="py-2 pr-4 font-semibold">Stretch</th>
                  <th className="py-2 pr-4 font-semibold">Hazard</th>
                  <th className="py-2 pr-4 font-semibold">Priority</th>
                  <th className="py-2 pr-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {priority.map((item, i) => (
                  <tr key={item.segment_id || item.id || i} className="border-b border-mist hover:bg-glacier align-top">
                    <td className="py-3 pr-4 font-condensed font-bold text-ink">{item.rank}</td>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-ink">{item.segment_name || item.name}</div>
                      {item.nearest_town && <div className="text-xs text-granite">{item.nearest_town}</div>}
                    </td>
                    <td className="py-3 pr-4"><RiskBadge level={scoreToLevel(item.hazard_risk_score ?? item.risk_index ?? 0)} /></td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-mist rounded-full">
                          <div className="h-full bg-granite rounded-full" style={{ width: `${Math.min((item.priority_score || 0) * 100, 100)}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-granite">{(item.priority_score || 0).toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="py-3 text-xs text-granite">{item.recommended_action || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === 'sensorlog' && (
        <div className="space-y-5 font-sans text-sm">
          <p className="text-granite">
            Every reading from the Raah Node sensors is saved here, one file per day (IST), for incident reviews and calibration.
            Simulated SIM- nodes are not logged. Only the tilt sensor can raise an ALARM; vibration and soil moisture stop at WARNING.
          </p>

          <div className="bg-snow border border-mist rounded-md overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="text-left text-xs text-granite border-b border-mist">
                  <th className="px-4 py-2 font-semibold">Day (IST)</th>
                  <th className="px-4 py-2 font-semibold">Readings</th>
                  <th className="px-4 py-2 font-semibold">Nodes</th>
                  <th className="px-4 py-2 font-semibold">Size</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {logDays.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-4 text-granite">{logLoading ? 'Loading…' : 'No sensor readings logged yet. Connect a node or run tools/mock_node.py.'}</td></tr>
                )}
                {logDays.map(d => (
                  <tr key={d.date} className={`border-b border-mist last:border-0 ${d.date === logDate ? 'bg-river-tint' : ''}`}>
                    <td className="px-4 py-2 font-semibold text-ink">{d.date}</td>
                    <td className="px-4 py-2 tabular-nums">{d.rows.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 text-granite">{d.nodes.join(', ')}</td>
                    <td className="px-4 py-2 tabular-nums text-granite">{(d.size_bytes / 1024).toFixed(1)} KB</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setLogDate(d.date); setLogNode(''); loadLogRows(d.date, ''); }} className="px-3 py-1.5 rounded-md border border-mist bg-white text-xs font-semibold text-ink hover:bg-glacier flex items-center gap-1">
                          <FileText className="w-3 h-3" /> View
                        </button>
                        <button onClick={() => handleDownloadLog(d.date)} className="px-3 py-1.5 rounded-md bg-river text-white text-xs font-semibold hover:opacity-90 flex items-center gap-1">
                          <Download className="w-3 h-3" /> CSV
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {logDate && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-condensed font-semibold text-ink text-lg">Readings on {logDate}</h2>
                <select value={logNode} onChange={e => { setLogNode(e.target.value); loadLogRows(logDate, e.target.value); }} aria-label="Filter by node" className="h-9 px-3 rounded-md border border-mist bg-white text-sm">
                  <option value="">All nodes</option>
                  {(logDays.find(d => d.date === logDate)?.nodes || []).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-xs text-granite">Newest first · last {logRows.length} shown · download the CSV for the full day</span>
              </div>
              <div className="bg-snow border border-mist rounded-md overflow-x-auto">
                <table className="w-full min-w-[860px] text-xs">
                  <thead>
                    <tr className="text-left text-granite border-b border-mist">
                      <th className="px-3 py-2 font-semibold">Time</th>
                      <th className="px-3 py-2 font-semibold">Node</th>
                      <th className="px-3 py-2 font-semibold">State</th>
                      <th className="px-3 py-2 font-semibold text-right">Tilt °</th>
                      <th className="px-3 py-2 font-semibold text-right">Rate °/min</th>
                      <th className="px-3 py-2 font-semibold text-right">Vib peak / RMS g</th>
                      <th className="px-3 py-2 font-semibold text-right">Soil %</th>
                      <th className="px-3 py-2 font-semibold">Rain</th>
                      <th className="px-3 py-2 font-semibold">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logRows.length === 0 && (
                      <tr><td colSpan={9} className="px-3 py-4 text-granite">{logLoading ? 'Loading…' : 'No readings for this filter.'}</td></tr>
                    )}
                    {logRows.map((r, i) => (
                      <tr key={`${r.server_ms}-${r.node_id}-${i}`} className="border-b border-mist last:border-0 tabular-nums">
                        <td className="px-3 py-1.5 whitespace-nowrap">{(r.time_ist || '').slice(11)}{r.late === '1' ? ' (late)' : ''}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{r.node_id}{r.kind && r.kind !== 'hardware' ? <span className="text-granite"> · {r.kind}</span> : null}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded font-semibold ${NODE_STATE_STYLE[r.state] || ''}`}>{r.state}</span>
                          {r.state_capped_from && <span className="ml-1 text-granite" title="The node sent ALARM without a tilt reason; only the tilt sensor may raise ALARM">capped from {r.state_capped_from}</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right">{r.tilt_deg || '—'}</td>
                        <td className="px-3 py-1.5 text-right">{r.tilt_rate_dpm || '—'}</td>
                        <td className="px-3 py-1.5 text-right">{r.vib_g || '—'}{r.vib_rms_g ? ` / ${r.vib_rms_g}` : ''}</td>
                        <td className="px-3 py-1.5 text-right">{r.moisture_pct || '—'}</td>
                        <td className="px-3 py-1.5">{r.rain_wet === '1' ? 'wet' : r.rain_wet === '0' ? 'dry' : '—'}</td>
                        <td className="px-3 py-1.5 text-granite">{r.link || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
