import { Link, useLocation } from 'react-router-dom';

const links = [
    { to: '/', label: 'Dashboard' },
    { to: '/connect', label: 'Connect' },
    { to: '/campaigns', label: 'Campaigns' },
    { to: '/logs', label: 'Logs' },
];

export default function Navbar() {
    const location = useLocation();

    return (
        <nav className="bg-gray-800 border-b border-gray-700">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-center justify-between h-14">
                    <Link to="/" className="text-lg font-bold text-emerald-400">
                        WA Marketing
                    </Link>
                    <div className="flex gap-1">
                        {links.map((link) => (
                            <Link
                                key={link.to}
                                to={link.to}
                                className={`px-3 py-2 rounded text-sm transition-colors ${
                                    location.pathname === link.to
                                        ? 'bg-gray-700 text-white'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                }`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </nav>
    );
}
