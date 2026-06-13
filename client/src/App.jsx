import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import ConnectPage from './pages/ConnectPage';
import CampaignList from './pages/CampaignList';
import CreateCampaign from './pages/CreateCampaign';
import CampaignDetail from './pages/CampaignDetail';
import LogsViewer from './pages/LogsViewer';

export default function App() {
    return (
        <div className="min-h-screen bg-gray-900">
            <Navbar />
            <main className="max-w-7xl mx-auto px-4 py-6">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/connect" element={<ConnectPage />} />
                    <Route path="/campaigns" element={<CampaignList />} />
                    <Route path="/campaigns/new" element={<CreateCampaign />} />
                    <Route path="/campaigns/:id" element={<CampaignDetail />} />
                    <Route path="/logs" element={<LogsViewer />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
        </div>
    );
}
