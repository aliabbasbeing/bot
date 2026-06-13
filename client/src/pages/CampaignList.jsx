import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import StatusBadge from '../components/StatusBadge';

export default function CampaignList() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCampaigns();
    }, []);

    function loadCampaigns() {
        api.get('/campaign')
            .then((res) => setCampaigns(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }

    async function handleDelete(id, name) {
        if (!window.confirm(`Delete campaign "${name}"? This cannot be undone.`)) return;
        try {
            await api.delete(`/campaign/${id}`);
            loadCampaigns();
        } catch (err) {
            alert(err.message);
        }
    }

    async function handleDuplicate(id) {
        try {
            await api.post(`/campaign/${id}/duplicate`);
            loadCampaigns();
        } catch (err) {
            alert(err.message);
        }
    }

    if (loading) return <div className="text-gray-400">Loading...</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Campaigns</h1>
                <Link
                    to="/campaigns/new"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    Create Campaign
                </Link>
            </div>

            {campaigns.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-500 border border-gray-700">
                    No campaigns yet.{' '}
                    <Link to="/campaigns/new" className="text-emerald-400 hover:underline">
                        Create your first campaign
                    </Link>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-gray-400 border-b border-gray-700">
                                <th className="text-left py-3 px-2">Name</th>
                                <th className="text-left py-3 px-2">Status</th>
                                <th className="text-left py-3 px-2">Mode</th>
                                <th className="text-right py-3 px-2">Sent/Total</th>
                                <th className="text-right py-3 px-2">Created</th>
                                <th className="text-right py-3 px-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {campaigns.map((c) => (
                                <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                    <td className="py-3 px-2">
                                        <Link to={`/campaigns/${c.id}`} className="text-emerald-400 hover:underline">
                                            {c.name}
                                        </Link>
                                    </td>
                                    <td className="py-3 px-2">
                                        <StatusBadge status={c.status} />
                                    </td>
                                    <td className="py-3 px-2">
                                        <span className={`text-xs px-2 py-0.5 rounded ${c.send_mode === 'cron' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'}`}>
                                            {c.send_mode === 'cron' ? 'Cron' : 'Interval'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-2 text-right text-gray-300">
                                        {c.stats?.sent || 0} / {c.stats?.total || 0}
                                    </td>
                                    <td className="py-3 px-2 text-right text-gray-400">
                                        {new Date(c.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="py-3 px-2 text-right space-x-2">
                                        <button
                                            onClick={() => handleDuplicate(c.id)}
                                            className="text-gray-400 hover:text-gray-200 text-xs"
                                        >
                                            Duplicate
                                        </button>
                                        <button
                                            onClick={() => handleDelete(c.id, c.name)}
                                            className="text-red-400 hover:text-red-300 text-xs"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
