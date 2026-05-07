import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function AdminDashboard() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState({});

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setAdminUser(user);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('librarianToken');
    localStorage.removeItem('librarianInfo');
    navigate('/login');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  };

  const menuItems = [
    {
      title: '系统日志',
      description: '查看系统操作日志',
      href: '/admin-logs',
      icon: '📋'
    },
    {
      title: '用户管理',
      description: '管理用户和权限',
      href: '/admin/users',
      icon: '👥'
    },
    {
      title: '公告查看',
      description: '查看所有公告',
      href: '/announcements',
      icon: '📢'
    },
    {
      title: '公告管理',
      description: '发布和管理公告',
      href: '/admin/announcements',
      icon: '📝'
    },
    {
    title: '系统配置',
    description: '配置借阅规则、逾期罚款等全局参数',
    href: '/admin/config',
    icon: '⚙️'
    }

  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="text-2xl">📚</div>
            <h1 className="text-xl font-bold text-gray-800">图书馆管理系统</h1>
            <span className="bg-purple-100 text-purple-600 text-xs px-2 py-1 rounded-full">管理员</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-500">{getGreeting()}</p>
              <p className="font-semibold text-gray-800">{adminUser.name || '管理员'}</p>
              <p className="text-xs text-gray-400">{adminUser.email || ''}</p>
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition text-sm"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg shadow-lg p-6 mb-8 text-white">
          <h2 className="text-2xl font-bold mb-2">{getGreeting()}，{adminUser.name || '管理员'}！</h2>
          <p className="opacity-90">欢迎回来，这里是系统管理控制台。</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {menuItems.map((item, index) => (
            <a
              key={index}
              href={item.href}
              className="bg-white p-6 rounded-lg shadow-lg hover:shadow-xl transition cursor-pointer block"
            >
              <div className="text-4xl mb-4">{item.icon}</div>
              <h2 className="text-xl font-bold mb-2">{item.title}</h2>
              <p className="text-gray-500 text-sm mb-4">{item.description}</p>
              <button className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition">
                进入 →
              </button>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}

export default AdminDashboard;
