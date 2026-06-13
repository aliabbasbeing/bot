const statusStyles = {
    connected: 'bg-green-900 text-green-300',
    connecting: 'bg-yellow-900 text-yellow-300',
    disconnected: 'bg-red-900 text-red-300',
    draft: 'bg-gray-700 text-gray-300',
    running: 'bg-blue-900 text-blue-300',
    paused: 'bg-yellow-900 text-yellow-300',
    completed: 'bg-green-900 text-green-300',
    failed: 'bg-red-900 text-red-300',
    sent: 'bg-green-900 text-green-300',
    pending: 'bg-gray-700 text-gray-300',
};

export default function StatusBadge({ status }) {
    const style = statusStyles[status] || 'bg-gray-700 text-gray-300';
    return (
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${style}`}>
            {status}
        </span>
    );
}
