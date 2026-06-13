import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import socket, { connectSocket } from '../lib/socket';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import LiveLog from '../components/LiveLog';

export default function CampaignDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [campaign, setCampaign] = useState(null);
    const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0, pending: 0 });
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editMessage, setEditMessage] = useState('');
    const [editDelay, setEditDelay] = useState('');
    const [editDelayUnit, setEditDelayUnit] = useState('seconds');
    const [editSendMode, setEditSendMode] = useState('interval');
    const [contacts, setContacts] = useState([]);
    const [contactsLoading, setContactsLoading] = useState(false);
    const [contactsPage, setContactsPage] = useState(1);
    const [contactsTotal, setContactsTotal] = useState(0);
    const [contactsPages, setContactsPages] = useState(0);
    const [showContacts, setShowContacts] = useState(false);
    const [addPhone, setAddPhone] = useState('');
    const [addName, setAddName] = useState('');
    const [editingContact, setEditingContact] = useState(null);
    const [editContactPhone, setEditContactPhone] = useState('');
    const [editContactName, setEditContactName] = useState('');
    const [contactActionLoading, setContactActionLoading] = useState(false);

    const loadCampaign = useCallback(async () => {
        try {
            const res = await api.get(`/campaign/${id}`);
            setCampaign(res.data);
            setStats(res.data.stats);
        } catch (err) {
            alert(err.message);
            navigate('/campaigns');
        } finally {
            setLoading(false);
        }
    }, [id, navigate]);

    const fetchLogs = useCallback(async () => {
        try {
            const res = await api.get(`/campaign/${id}/logs`);
            setLogs(res.data);
        } catch (_) {}
    }, [id]);

    const loadContacts = useCallback(async (page) => {
        setContactsLoading(true);
        try {
            const res = await api.get(`/campaign/${id}/contacts?page=${page}&limit=20`);
            setContacts(res.data.contacts);
            setContactsTotal(res.data.total);
            setContactsPages(res.data.pages);
            setContactsPage(res.data.page);
        } catch (_) {} finally {
            setContactsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadCampaign();
        fetchLogs();
    }, [loadCampaign, fetchLogs]);

    useEffect(() => {
        const s = connectSocket();
        s.emit('join', `campaign-${id}`);

        s.on('campaign:progress', (updatedStats) => {
            setStats(updatedStats);
            setCampaign((prev) => prev ? { ...prev, status: 'running', stats: updatedStats } : prev);
        });

        s.on('campaign:complete', (data) => {
            setStats(data.stats);
            setCampaign((prev) => prev ? { ...prev, status: 'completed', stats: data.stats } : prev);
            fetchLogs();
        });

        s.on('campaign:paused', (data) => {
            setStats(data.stats);
            setCampaign((prev) => prev ? { ...prev, status: 'paused', stats: data.stats } : prev);
        });

        s.on('campaign:stopped', (data) => {
            setStats(data.stats);
            setCampaign((prev) => prev ? { ...prev, status: 'draft', stats: data.stats } : prev);
        });

        return () => {
            s.off('campaign:progress');
            s.off('campaign:complete');
            s.off('campaign:paused');
            s.off('campaign:stopped');
        };
    }, [id, fetchLogs]);

    function startEdit() {
        if (!campaign) return;
        setEditName(campaign.name);
        setEditMessage(campaign.message);
        setEditDelay(String(campaign.delay));
        setEditDelayUnit(campaign.delay_unit);
        setEditSendMode(campaign.send_mode);
        setEditing(true);
    }

    async function handleSaveEdit(e) {
        e.preventDefault();
        if (!editName.trim() || !editMessage.trim()) return;
        setActionLoading(true);
        try {
            const body = {
                name: editName,
                message: editMessage,
                send_mode: editSendMode,
            };
            if (editSendMode === 'interval') {
                body.delay = parseInt(editDelay, 10) || 5;
                body.delay_unit = editDelayUnit;
            }
            const res = await api.put(`/campaign/${id}`, body);
            setCampaign(res.data);
            setStats(res.data.stats);
            setEditing(false);
        } catch (err) {
            alert(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleStart() {
        setActionLoading(true);
        try {
            await api.post(`/campaign/${id}/start`);
            setCampaign((prev) => prev ? { ...prev, status: 'running' } : prev);
        } catch (err) {
            alert(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleCronTrigger() {
        setActionLoading(true);
        try {
            const res = await api.get(`/campaign/${id}/trigger/${campaign.token}`);
            if (res.data.sent) {
                loadCampaign();
                fetchLogs();
            }
        } catch (err) {
            alert(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function handlePause() {
        setActionLoading(true);
        try {
            await api.post(`/campaign/${id}/pause`);
        } catch (err) {
            alert(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleResume() {
        setActionLoading(true);
        try {
            await api.post(`/campaign/${id}/resume`);
        } catch (err) {
            alert(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleStop() {
        setActionLoading(true);
        try {
            await api.post(`/campaign/${id}/stop`);
        } catch (err) {
            alert(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleRetry() {
        setActionLoading(true);
        try {
            await api.post(`/campaign/${id}/retry`);
            loadCampaign();
        } catch (err) {
            alert(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleRegenerateToken() {
        try {
            const res = await api.post(`/campaign/${id}/token/regenerate`);
            setCampaign((prev) => prev ? { ...prev, token: res.data.token } : prev);
        } catch (err) {
            alert(err.message);
        }
    }

    function handleCopyUrl() {
        const url = `${window.location.origin}/api/campaign/${id}/trigger/${campaign.token}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    function handleExport() {
        window.open(`/api/campaign/${id}/export`, '_blank');
    }

    async function handleAddContact(e) {
        e.preventDefault();
        if (!addPhone.trim()) return;
        setContactActionLoading(true);
        try {
            await api.post(`/campaign/${id}/contacts`, { phone: addPhone, name: addName || undefined });
            setAddPhone('');
            setAddName('');
            loadContacts(contactsPage);
            loadCampaign();
        } catch (err) {
            alert(err.message);
        } finally {
            setContactActionLoading(false);
        }
    }

    async function handleDeleteContact(contactId) {
        if (!window.confirm('Delete this contact?')) return;
        try {
            await api.delete(`/campaign/${id}/contacts/${contactId}`);
            loadContacts(contactsPage);
            loadCampaign();
        } catch (err) {
            alert(err.message);
        }
    }

    function startEditContact(contact) {
        setEditingContact(contact.id);
        setEditContactPhone(contact.phone);
        setEditContactName(contact.name || '');
    }

    async function handleSaveContact(contactId) {
        if (!editContactPhone.trim()) return;
        try {
            await api.put(`/campaign/${id}/contacts/${contactId}`, {
                phone: editContactPhone,
                name: editContactName || null,
            });
            setEditingContact(null);
            loadContacts(contactsPage);
        } catch (err) {
            alert(err.message);
        }
    }

    if (loading) return <div className="text-gray-400">Loading...</div>;
    if (!campaign) return null;

    const triggerUrl = `${window.location.origin}/api/campaign/${id}/trigger/${campaign.token}`;
    const delayDisplay = campaign.delay_unit === 'minutes'
        ? `${campaign.delay} min`
        : `${campaign.delay}s`;
    const modeLabel = campaign.send_mode === 'cron' ? 'Cron' : 'Interval';

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{campaign.name}</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <StatusBadge status={campaign.status} />
                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{modeLabel}</span>
                        {campaign.send_mode === 'interval' && (
                            <span className="text-sm text-gray-400">Delay: {delayDisplay}</span>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={startEdit} className="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-1.5 rounded font-medium transition-colors">
                        Edit
                    </button>
                    {stats.failed > 0 && (
                        <button
                            onClick={handleRetry}
                            disabled={actionLoading}
                            className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-xs px-3 py-1.5 rounded font-medium transition-colors"
                        >
                            Retry Failed
                        </button>
                    )}
                    <button onClick={handleExport} className="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-1.5 rounded font-medium transition-colors">
                        Export CSV
                    </button>
                </div>
            </div>

            {editing && (
                <form onSubmit={handleSaveEdit} className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-300">Edit Campaign</h3>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Name</label>
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            required
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Message</label>
                        <textarea
                            value={editMessage}
                            onChange={(e) => setEditMessage(e.target.value)}
                            required
                            rows={3}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Sending Mode</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="editMode" value="interval" checked={editSendMode === 'interval'} onChange={() => setEditSendMode('interval')} className="accent-emerald-500" />
                                <span className="text-sm text-gray-300">Interval</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="editMode" value="cron" checked={editSendMode === 'cron'} onChange={() => setEditSendMode('cron')} className="accent-emerald-500" />
                                <span className="text-sm text-gray-300">Cron</span>
                            </label>
                        </div>
                    </div>
                    {editSendMode === 'interval' && (
                        <div className="flex gap-2 items-end">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Delay</label>
                                <input
                                    type="number"
                                    value={editDelay}
                                    onChange={(e) => setEditDelay(e.target.value)}
                                    min={1}
                                    className="w-24 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Unit</label>
                                <select
                                    value={editDelayUnit}
                                    onChange={(e) => setEditDelayUnit(e.target.value)}
                                    className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                                >
                                    <option value="seconds">Seconds</option>
                                    <option value="minutes">Minutes</option>
                                </select>
                            </div>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <button type="submit" disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
                            {actionLoading ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" onClick={() => setEditing(false)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: 'Total', value: stats.total, color: 'text-gray-300' },
                    { label: 'Sent', value: stats.sent, color: 'text-green-400' },
                    { label: 'Failed', value: stats.failed, color: 'text-red-400' },
                    { label: 'Pending', value: stats.pending, color: 'text-yellow-400' },
                ].map((s) => (
                    <div key={s.label} className="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
                        <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-xs text-gray-400">{s.label}</div>
                    </div>
                ))}
            </div>

            {stats.total > 0 && <ProgressBar sent={stats.sent} total={stats.total} />}

            <div className="flex gap-2 flex-wrap">
                {campaign.send_mode === 'interval' && campaign.status === 'draft' && (
                    <button
                        onClick={handleStart}
                        disabled={actionLoading || stats.total === 0}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        {actionLoading ? 'Processing...' : 'Start Campaign'}
                    </button>
                )}
                {campaign.send_mode === 'cron' && stats.pending > 0 && (
                    <button
                        onClick={handleCronTrigger}
                        disabled={actionLoading}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        {actionLoading ? 'Sending...' : 'Send Next Message'}
                    </button>
                )}
                {campaign.status === 'running' && (
                    <>
                        <button
                            onClick={handlePause}
                            disabled={actionLoading}
                            className="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            {actionLoading ? 'Processing...' : 'Pause'}
                        </button>
                        <button
                            onClick={handleStop}
                            disabled={actionLoading}
                            className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            {actionLoading ? 'Processing...' : 'Stop'}
                        </button>
                    </>
                )}
                {campaign.status === 'paused' && (
                    <button
                        onClick={handleResume}
                        disabled={actionLoading}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        {actionLoading ? 'Processing...' : 'Resume'}
                    </button>
                )}
            </div>

            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-2">
                <div className="text-sm text-gray-400 font-medium">Trigger URL</div>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        readOnly
                        value={triggerUrl}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 font-mono"
                    />
                    <button
                        onClick={handleCopyUrl}
                        className="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-1.5 rounded font-medium transition-colors"
                    >
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                        onClick={handleRegenerateToken}
                        className="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-1.5 rounded font-medium transition-colors"
                    >
                        Regenerate
                    </button>
                </div>
                {campaign.send_mode === 'cron' && (
                    <p className="text-xs text-gray-500">
                        Each call to this URL sends <strong className="text-gray-300">1 pending message</strong>.
                        Use with cron-job.org, UptimeRobot, or a PHP script. Rate-limited to 1 call per 60s.
                    </p>
                )}
            </div>

            <div>
                <button
                    onClick={() => {
                        setShowContacts(!showContacts);
                        if (!showContacts && contacts.length === 0) loadContacts(1);
                    }}
                    className="text-sm text-gray-400 hover:text-gray-300 font-medium"
                >
                    {showContacts ? 'Hide' : 'Show'} Contacts ({stats.total})
                </button>
                {showContacts && (
                    <div className="mt-2 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                        {editing && (
                            <form onSubmit={handleAddContact} className="flex gap-2 p-3 border-b border-gray-700 bg-gray-900/50">
                                <input
                                    type="text"
                                    value={addPhone}
                                    onChange={(e) => setAddPhone(e.target.value)}
                                    placeholder="+923001234567"
                                    required
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                                />
                                <input
                                    type="text"
                                    value={addName}
                                    onChange={(e) => setAddName(e.target.value)}
                                    placeholder="Name (optional)"
                                    className="w-32 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                                />
                                <button
                                    type="submit"
                                    disabled={contactActionLoading}
                                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                >
                                    {contactActionLoading ? '...' : 'Add'}
                                </button>
                            </form>
                        )}
                        {contactsLoading ? (
                            <div className="p-4 text-sm text-gray-400">Loading...</div>
                        ) : (
                            <>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-gray-400 border-b border-gray-700">
                                            <th className="text-left py-2 px-3">Phone</th>
                                            <th className="text-left py-2 px-3">Name</th>
                                            <th className="text-left py-2 px-3">Status</th>
                                            <th className="text-right py-2 px-3">Sent At</th>
                                            {editing && <th className="text-right py-2 px-3">Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {contacts.map((c) => (
                                            <tr key={c.id} className="border-b border-gray-700/50">
                                                {editing && editingContact === c.id ? (
                                                    <>
                                                        <td className="py-1 px-3">
                                                            <input
                                                                type="text"
                                                                value={editContactPhone}
                                                                onChange={(e) => setEditContactPhone(e.target.value)}
                                                                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                                                            />
                                                        </td>
                                                        <td className="py-1 px-3">
                                                            <input
                                                                type="text"
                                                                value={editContactName}
                                                                onChange={(e) => setEditContactName(e.target.value)}
                                                                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                                                            />
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            <span className={`${c.status === 'sent' ? 'text-green-400' : c.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                                                                {c.status}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 px-3 text-right text-gray-500">{c.sent_at ? new Date(c.sent_at).toLocaleString() : '-'}</td>
                                                        <td className="py-1 px-3 text-right">
                                                            <button onClick={() => handleSaveContact(c.id)} className="text-emerald-400 hover:text-emerald-300 mr-2">Save</button>
                                                            <button onClick={() => setEditingContact(null)} className="text-gray-400 hover:text-gray-300">Cancel</button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="py-2 px-3 text-gray-300">{c.phone}</td>
                                                        <td className="py-2 px-3 text-gray-400">{c.name || '-'}</td>
                                                        <td className="py-2 px-3">
                                                            <span className={`${c.status === 'sent' ? 'text-green-400' : c.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                                                                {c.status}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 px-3 text-right text-gray-500">{c.sent_at ? new Date(c.sent_at).toLocaleString() : '-'}</td>
                                                        {editing && (
                                                            <td className="py-2 px-3 text-right">
                                                                <button onClick={() => startEditContact(c)} className="text-gray-400 hover:text-gray-200 mr-2">Edit</button>
                                                                <button onClick={() => handleDeleteContact(c.id)} className="text-red-400 hover:text-red-300">Delete</button>
                                                            </td>
                                                        )}
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {contactsPages > 1 && (
                                    <div className="flex items-center justify-center gap-2 p-2 border-t border-gray-700">
                                        <button
                                            onClick={() => loadContacts(contactsPage - 1)}
                                            disabled={contactsPage <= 1}
                                            className="text-xs text-gray-400 hover:text-gray-300 disabled:opacity-50"
                                        >
                                            Prev
                                        </button>
                                        <span className="text-xs text-gray-500">Page {contactsPage} / {contactsPages}</span>
                                        <button
                                            onClick={() => loadContacts(contactsPage + 1)}
                                            disabled={contactsPage >= contactsPages}
                                            className="text-xs text-gray-400 hover:text-gray-300 disabled:opacity-50"
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            <div>
                <h2 className="text-lg font-semibold mb-2">Live Log</h2>
                <LiveLog entries={logs} />
            </div>
        </div>
    );
}
