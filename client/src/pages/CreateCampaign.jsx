import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const DELAY_PRESETS = [
    { label: '15s', delay: 15, unit: 'seconds' },
    { label: '30s', delay: 30, unit: 'seconds' },
    { label: '1 min', delay: 1, unit: 'minutes' },
    { label: '2 min', delay: 2, unit: 'minutes' },
    { label: '5 min', delay: 5, unit: 'minutes' },
    { label: '10 min', delay: 10, unit: 'minutes' },
    { label: '15 min', delay: 15, unit: 'minutes' },
];

export default function CreateCampaign() {
    const navigate = useNavigate();
    const [step, setStep] = useState('form');
    const [campaignId, setCampaignId] = useState(null);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [sendMode, setSendMode] = useState('interval');
    const [delayPreset, setDelayPreset] = useState('30s');
    const [customDelay, setCustomDelay] = useState('');
    const [customUnit, setCustomUnit] = useState('minutes');
    const [creating, setCreating] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);

    const selectedPreset = DELAY_PRESETS.find((p) => p.label === delayPreset);
    const isCustom = delayPreset === 'custom';

    function getDelayValue() {
        if (isCustom) {
            const val = parseInt(customDelay, 10);
            return { delay: val || 5, unit: val ? customUnit : 'minutes' };
        }
        return { delay: selectedPreset.delay, unit: selectedPreset.unit };
    }

    async function handleCreate(e) {
        e.preventDefault();
        if (!name.trim() || !message.trim()) return;
        setCreating(true);
        const { delay, unit } = getDelayValue();
        try {
            const res = await api.post('/campaign', {
                name,
                message,
                delay,
                delay_unit: unit,
                send_mode: sendMode,
            });
            setCampaignId(res.data.id);
            setStep('upload');
        } catch (err) {
            alert(err.message);
        } finally {
            setCreating(false);
        }
    }

    async function handleUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('contacts', file);
        try {
            const res = await api.post(`/campaign/${campaignId}/upload-csv`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setUploadResult(res.data);
        } catch (err) {
            alert(err.message);
        } finally {
            setUploading(false);
        }
    }

    function handleDone() {
        navigate(`/campaigns/${campaignId}`);
    }

    const previewMessage = message.replace(/\{\{name\}\}/g, 'John Doe');

    if (step === 'form') {
        return (
            <div className="max-w-lg mx-auto space-y-6">
                <h1 className="text-2xl font-bold">Create Campaign</h1>
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Campaign Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                            placeholder="e.g., Promo July 2025"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Message <span className="text-gray-600">(use {'{{name}}'} for contact name)</span>
                        </label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            required
                            rows={5}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                            placeholder="Hi {{name}}, check out our offer!"
                        />
                        {message && (
                            <div className="mt-1 text-xs text-gray-500 bg-gray-900 rounded p-2 border border-gray-700">
                                Preview: {previewMessage}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Sending Mode</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="sendMode"
                                    value="interval"
                                    checked={sendMode === 'interval'}
                                    onChange={() => setSendMode('interval')}
                                    className="accent-emerald-500"
                                />
                                <span className="text-sm text-gray-300">Auto (Interval)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="sendMode"
                                    value="cron"
                                    checked={sendMode === 'cron'}
                                    onChange={() => setSendMode('cron')}
                                    className="accent-emerald-500"
                                />
                                <span className="text-sm text-gray-300">Cron (1 per trigger)</span>
                            </label>
                        </div>
                    </div>

                    {sendMode === 'interval' && (
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Delay Between Messages</label>
                            <div className="flex flex-wrap gap-2">
                                {DELAY_PRESETS.map((p) => (
                                    <button
                                        key={p.label}
                                        type="button"
                                        onClick={() => setDelayPreset(p.label)}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                            delayPreset === p.label
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setDelayPreset('custom')}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                        isCustom
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                                >
                                    Custom
                                </button>
                            </div>
                            {isCustom && (
                                <div className="flex gap-2 mt-2">
                                    <input
                                        type="number"
                                        value={customDelay}
                                        onChange={(e) => setCustomDelay(e.target.value)}
                                        min={1}
                                        placeholder="5"
                                        className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                    />
                                    <select
                                        value={customUnit}
                                        onChange={(e) => setCustomUnit(e.target.value)}
                                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value="seconds">Seconds</option>
                                        <option value="minutes">Minutes</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {sendMode === 'cron' && (
                        <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 text-sm text-gray-400">
                            Each trigger sends <strong className="text-gray-200">1 message</strong> at a time.
                            Use the trigger URL (shown after creation) with cron-job.org, UptimeRobot, or your own scheduler.
                            No delay setting needed.
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={creating}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2 rounded-lg font-medium transition-colors"
                    >
                        {creating ? 'Creating...' : 'Create Campaign'}
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="max-w-lg mx-auto space-y-6">
            <h1 className="text-2xl font-bold">Upload Contacts</h1>
            <p className="text-sm text-gray-400">Campaign created! Now upload your contact list (CSV).</p>

            {!uploadResult && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <label className="block text-sm text-gray-400 mb-2">CSV File (field name: contacts)</label>
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleUpload}
                        disabled={uploading}
                        className="block w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600"
                    />
                    {uploading && <div className="text-gray-400 mt-2">Uploading and processing...</div>}
                </div>
            )}

            {uploadResult && (
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-2">
                    <div className="text-green-400 font-medium">Import complete</div>
                    <div className="text-sm space-y-1">
                        <p>Imported: <span className="text-white">{uploadResult.imported}</span></p>
                        <p>Skipped invalid: <span className="text-red-400">{uploadResult.skipped_invalid}</span></p>
                    </div>
                    {uploadResult.invalid_samples?.length > 0 && (
                        <div className="text-xs text-gray-500">
                            Invalid samples: {uploadResult.invalid_samples.join(', ')}
                        </div>
                    )}
                    <button
                        onClick={handleDone}
                        className="mt-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        Go to Campaign
                    </button>
                </div>
            )}
        </div>
    );
}
