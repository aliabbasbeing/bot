import { useState, useEffect } from 'react';
import api from '../lib/api';
import { connectSocket } from '../lib/socket';
import QRCodeDisplay from '../components/QRCodeDisplay';
import StatusBadge from '../components/StatusBadge';

export default function ConnectPage() {
    const [qr, setQr] = useState(null);
    const [status, setStatus] = useState('loading');
    const [debug, setDebug] = useState([]);
    const [testPhone, setTestPhone] = useState('');
    const [testMessage, setTestMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState(null);

    function addDebug(msg) {
        console.log('[WA]', msg);
        setDebug((prev) => [...prev.slice(-9), `${new Date().toLocaleTimeString()} ${msg}`]);
    }

    useEffect(() => {
        addDebug('Page loaded - waiting for connection status...');
        const socket = connectSocket();

        socket.on('connect', () => addDebug(`Socket connected: ${socket.id}`));
        socket.on('disconnect', (r) => addDebug(`Socket disconnected: ${r}`));

        socket.on('whatsapp:qr', (qrData) => {
            addDebug('QR code received');
            setQr(qrData);
        });

        socket.on('whatsapp:status', (s) => {
            addDebug(`Status: ${s}`);
            setStatus(s);
            if (s === 'connected') setQr(null);
        });

        api.get('/whatsapp/status').then((res) => {
            const s = res.data.status;
            addDebug(`Server status: ${s}`);
            setStatus(s);
        }).catch((err) => {
            addDebug(`Status error: ${err.message}`);
            setStatus('disconnected');
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('whatsapp:qr');
            socket.off('whatsapp:status');
        };
    }, []);

    async function handleSendTest(e) {
        e.preventDefault();
        if (!testPhone.trim() || !testMessage.trim()) return;
        setSending(true);
        setSendResult(null);
        try {
            const res = await api.post('/whatsapp/send-test', { phone: testPhone, message: testMessage });
            setSendResult({ type: 'success', text: `Sent! ID: ${res.data.id}` });
            addDebug(`Test message sent: ${res.data.id}`);
        } catch (err) {
            setSendResult({ type: 'error', text: err.message });
            addDebug(`Send error: ${err.message}`);
        } finally {
            setSending(false);
        }
    }

    async function handleReconnect() {
        setQr(null);
        addDebug('Manual reconnect requested');
        try {
            const r = await api.post('/whatsapp/connect');
            addDebug(`Reconnect: ${r.data.message}`);
        } catch (err) {
            addDebug(`Reconnect error: ${err.message}`);
        }
    }

    return (
        <div className="max-w-md mx-auto space-y-6">
            <h1 className="text-2xl font-bold">WhatsApp Connection</h1>

            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Status</span>
                    <StatusBadge status={status === 'loading' ? 'disconnected' : status} />
                </div>
                {status === 'connected' ? (
                    <div className="text-green-400 text-sm font-medium flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full inline-block" />
                        WhatsApp connected — ready to send messages
                    </div>
                ) : status === 'connecting' ? (
                    <div className="text-yellow-400 text-sm">Connecting... scan the QR code below</div>
                ) : (
                    <div className="text-gray-400 text-sm">
                        {status === 'loading' ? 'Checking connection...' : 'Not connected'}
                    </div>
                )}
            </div>

            {qr && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center space-y-3">
                    <p className="text-sm text-gray-400">Scan this QR code with WhatsApp</p>
                    <QRCodeDisplay qr={qr} />
                    <p className="text-xs text-gray-500">Open WhatsApp → Menu → Linked Devices → Link a Device</p>
                </div>
            )}

            {status === 'disconnected' && (
                <button
                    onClick={handleReconnect}
                    className="w-full py-2 px-4 rounded-lg font-medium transition-colors bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                    Reconnect WhatsApp
                </button>
            )}

            {status === 'connected' && (
                <>
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <h2 className="text-lg font-semibold mb-3">Send Test Message</h2>
                        <form onSubmit={handleSendTest} className="space-y-3">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Phone Number</label>
                                <input
                                    type="text"
                                    value={testPhone}
                                    onChange={(e) => setTestPhone(e.target.value)}
                                    required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                    placeholder="+1234567890 or 1234567890@c.us"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Message</label>
                                <textarea
                                    value={testMessage}
                                    onChange={(e) => setTestMessage(e.target.value)}
                                    required
                                    rows={3}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                    placeholder="Type your test message..."
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={sending}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2 rounded-lg font-medium transition-colors"
                            >
                                {sending ? 'Sending...' : 'Send'}
                            </button>
                            {sendResult && (
                                <div className={`text-sm ${sendResult.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                                    {sendResult.text}
                                </div>
                            )}
                        </form>
                    </div>

                    <details className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
                            CSV Format for Campaigns
                        </summary>
                        <div className="mt-3 text-xs text-gray-500 space-y-2">
                            <p>Upload a CSV file with these columns:</p>
                            <pre className="bg-gray-950 p-2 rounded text-gray-300 overflow-x-auto">
phone,name{'\n'}
+1234567890,John Doe{'\n'}
+1987654321,Jane Smith
                            </pre>
                            <p>The <code className="text-gray-300">name</code> column is optional — use {'{{name}}'} in your message template to insert it.</p>
                            <p className="text-yellow-400">⚠ Do NOT open the CSV in Excel — it will corrupt phone numbers. Use Notepad or VS Code.</p>
                        </div>
                    </details>
                </>
            )}

            {debug.length > 0 && (
                <div className="bg-gray-950 rounded-lg p-3 border border-gray-700">
                    <div className="text-xs text-gray-500 font-mono mb-1">Debug Log</div>
                    <div className="text-xs text-gray-400 font-mono space-y-0.5 max-h-40 overflow-y-auto">
                        {debug.map((line, i) => (
                            <div key={i}>{line}</div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
