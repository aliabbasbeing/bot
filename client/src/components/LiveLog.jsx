import { useEffect, useRef } from 'react';

export default function LiveLog({ entries }) {
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [entries]);

    if (!entries || entries.length === 0) {
        return <div className="text-gray-500 text-sm italic">No log entries yet...</div>;
    }

    return (
        <div className="bg-gray-950 rounded-lg p-3 max-h-80 overflow-y-auto font-mono text-xs space-y-1">
            {entries.map((entry, i) => (
                <div
                    key={i}
                    className={
                        entry.event === 'sent'
                            ? 'text-green-400'
                            : entry.event === 'failed'
                                ? 'text-red-400'
                                : 'text-gray-400'
                    }
                >
                    <span className="text-gray-600">{entry.timestamp || ''}</span>{' '}
                    {entry.event === 'sent' ? '✓' : entry.event === 'failed' ? '✗' : '•'}{' '}
                    {entry.phone && <span className="text-gray-300">{entry.phone}</span>}
                    {entry.message && <span className="ml-1">— {entry.message}</span>}
                </div>
            ))}
            <div ref={bottomRef} />
        </div>
    );
}
