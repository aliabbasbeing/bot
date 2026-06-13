import { useState, useEffect } from 'react';
import api from '../lib/api';

export default function LogsViewer() {
    const [campaigns, setCampaigns] = useState([]);
    const [selectedId, setSelectedId] = useState('app');
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/campaign')
            .then((res) => setCampaigns(res.data))
            .catch(() => {});
    }, []);

    useEffect(() => {
        setLoading(true);
        const endpoint = selectedId === 'app'
            ? '/campaign/logs/app'
            : `/campaign/${selectedId}/logs`;

        api.get(endpoint)
            .then((res) => setLogs(res.data))
            .catch(() => setLogs([]))
            .finally(() => setLoading(false));
    }, [selectedId]);

    useEffect(() => {
        const interval = setInterval(() => {
            const endpoint = selectedId === 'app'
                ? '/campaign/logs/app'
                : `/campaign/${selectedId}/logs`;

            api.get(endpoint)
                .then((res) => setLogs(res.data))
                .catch(() => {});
        }, 10000);

        return () => clearInterval(interval);
    }, [selectedId]);

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold">Logs Viewer</h1>

            <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
            >
                <option value="app">App Log</option>
                {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.name}
                    </option>
                ))}
            </select>

            {loading ? (
                <div className="text-gray-400">Loading...</div>
            ) : logs.length === 0 ? (
                <div className="text-gray-500 text-sm italic">No log entries found.</div>
            ) : (
                <div className="bg-gray-950 rounded-lg p-4 max-h-[70vh] overflow-y-auto font-mono text-xs">
                    <pre className="text-gray-300 whitespace-pre-wrap">
                        {logs.join('\n')}
                    </pre>
                </div>
            )}
        </div>
    );
}
