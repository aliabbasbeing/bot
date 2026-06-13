export default function ProgressBar({ sent = 0, total = 0 }) {
    const pct = total > 0 ? Math.round((sent / total) * 100) : 0;

    return (
        <div className="w-full">
            <div className="flex justify-between text-sm text-gray-400 mb-1">
                <span>{sent} / {total} sent</span>
                <span>{pct}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}
