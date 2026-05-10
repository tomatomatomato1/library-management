import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import BookSearch from './pages/BookSearch';
import MyHistory from './reader/MyHistory';
import UnifiedLogin from './pages/UnifiedLogin';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import SystemLogs from './adminLogs/SystemLogs';
import LibrarianApp from './librarian/LibrarianApp';
import Announcements from './pages/Announcements';
import AdminAnnouncements from './pages/AdminAnnouncements';
import UserManagement from './pages/UserManagement';
import Messages from './pages/Messages';
import SystemConfig from './pages/SystemConfig';


function App() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('search');

  useEffect(() => {
    const token = localStorage.getItem('token') || localStorage.getItem('librarianToken');
    if (token) {
      setIsLoggedIn(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('librarianToken');
    localStorage.removeItem('librarianInfo');
    setIsLoggedIn(false);
    setActiveTab('search');
    navigate('/login');
  };

  if (loading) return <div>Loading...</div>;

  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<UnifiedLogin />} />
      <Route path="/librarian-login" element={<LibrarianApp />} />
      <Route path="/admin-dashboard" element={<AdminDashboard />} />
      <Route path="/admin-logs" element={<SystemLogs />} />
      <Route path="/admin/users" element={<UserManagement />} />
      <Route path="/announcements" element={<Announcements />} />
      <Route path="/admin/announcements" element={<AdminAnnouncements />} />
      <Route path="/history" element={<MyHistory />} />
      <Route path="/" element={
        isLoggedIn ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', background: '#3b82f6', color: 'white' }}>
              <h2>Library System</h2>
              <div style={{ display: 'flex', gap: '20px' }}>
                <button onClick={() => setActiveTab('search')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', borderBottom: activeTab === 'search' ? '2px solid white' : 'none' }}>Search Books</button>
                <button onClick={() => setActiveTab('history')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid white' : 'none' }}>My History</button>
                <button onClick={() => setActiveTab('messages')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', borderBottom: activeTab === 'messages' ? '2px solid white' : 'none' }}>Messages</button>
                <button onClick={handleLogout} style={{ padding: '5px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Logout</button>
              </div>
            </div>
            <div style={{ padding: '20px' }}>
              {activeTab === 'search' ? <BookSearch /> : activeTab === 'history' ? <MyHistory /> : <Messages />}
            </div>
          </div>
        ) : (
          <UnifiedLogin />
        )
      } />
      <Route path="/admin/config" element={<SystemConfig />} />
    </Routes>
  );
}

export default App;