import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { connectSocket } from '../lib/socket';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard() {
    const [campaigns, setCampaigns] = useState([]);
    const [waStatus, setWaStatus] = useState('disconnected');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const socket = connectSocket();

        socket.on('whatsapp:status', (status) => setWaStatus(status));

        api.get('/whatsapp/status')
            .then((res) => setWaStatus(res.data.status))
            .catch(() => {});

        api.get('/campaign')
            .then((res) => setCampaigns(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));

        return () => {
            socket.off('whatsapp:status');
        };
    }, []);

    const activeCount = campaigns.filter((c) => c.status === 'running').length;
    const recent = campaigns.slice(0, 5);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="text-sm text-gray-400">Total Campaigns</div>
                    <div className="text-3xl font-bold mt-1">{campaigns.length}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="text-sm text-gray-400">Active Campaigns</div>
                    <div className="text-3xl font-bold mt-1">{activeCount}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="text-sm text-gray-400">WhatsApp Status</div>
                    <div className="flex items-center gap-2 mt-2">
                        <span
                            className={`w-3 h-3 rounded-full ${
                                waStatus === 'connected'
                                    ? 'bg-green-500'
                                    : waStatus === 'connecting'
                                        ? 'bg-yellow-500'
                                        : 'bg-red-500'
                            }`}
                        />
                        <StatusBadge status={waStatus} />
                    </div>
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">Recent Campaigns</h2>
                    <Link to="/campaigns" className="text-sm text-emerald-400 hover:underline">
                        View all
                    </Link>
                </div>

                {loading ? (
                    <div className="text-gray-400">Loading...</div>
                ) : recent.length === 0 ? (
                    <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-500 border border-gray-700">
                        No campaigns yet.{' '}
                        <Link to="/campaigns/new" className="text-emerald-400 hover:underline">
                            Create one
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {recent.map((c) => (
                            <Link
                                key={c.id}
                                to={`/campaigns/${c.id}`}
                                className="block bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-600 transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">{c.name}</span>
                                    <StatusBadge status={c.status} />
                                </div>
                                <div className="text-sm text-gray-400 mt-1">
                                    {c.stats?.sent || 0} / {c.stats?.total || 0} sent
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
