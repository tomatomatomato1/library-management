import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DueReminderBanner from '../components/DueReminderBanner';

function MyHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [userRatings, setUserRatings] = useState({});
  const [submitting, setSubmitting] = useState(false);
  // 支付相关状态
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('wechat');
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error('Failed to parse user data');
      }
    }
    fetchHistory();
    fetchUserRatings();
  }, []);

  const fetchHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await fetch('http://localhost:3001/api/reader/my-borrows', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setHistory(data.loans || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserRatings = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch('http://localhost:3001/api/ratings/user/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const ratingsMap = {};
        data.ratings.forEach(r => {
          ratingsMap[r.bookId] = r;
        });
        setUserRatings(ratingsMap);
      }
    } catch (error) {
      console.error('Failed to fetch user ratings:', error);
    }
  };

  const handleRenew = async (copyId) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch('http://localhost:3001/api/reader/renew', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ copyId: copyId })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setMessage('续借成功！新截止日期: ' + new Date(data.newDueDate).toLocaleDateString());
        fetchHistory();
      } else {
        setMessage(data.message || '续借失败');
      }
    } catch (error) {
      setMessage('续借失败');
    }
    setTimeout(() => setMessage(''), 3000);
  };

  // 检查图书是否逾期（使用后端返回的数据）
  const isOverdue = (loan) => {
    return loan.isOverdue || false;
  };

  // 判断是否需要显示归还并支付罚款按钮
  const needsFinePayment = (loan) => {
    // 图书未归还且已逾期
    return !loan.returnDate && loan.isOverdue && loan.estimatedFineAmount > 0;
  };

  // 获取预计罚款金额（使用后端返回的数据）
  const getEstimatedFine = (loan) => {
    return loan.estimatedFineAmount || 0;
  };

  const handleReturn = async (loanId) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`http://localhost:3001/api/reader/return/${loanId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        // 如果有罚款，弹出支付窗口
        if (data.loan && data.loan.fineAmount > 0 && !data.loan.finePaid) {
          setSelectedLoan(data.loan);
          setPaymentAmount(data.loan.fineAmount);
          setPaymentMethod('wechat');
          setPaymentSuccess(false);
          setShowPaymentModal(true);
        } else {
          setMessage(data.message || '归还成功！');
          fetchHistory();
        }
      } else {
        setMessage(data.message || '归还失败');
      }
    } catch (error) {
      setMessage('归还失败');
    }
    setTimeout(() => setMessage(''), 3000);
  };

  // 确认支付
  const handleConfirmPayment = async () => {
    if (!selectedLoan) return;
    
    setPaymentProcessing(true);
    const token = localStorage.getItem('token');
    
    try {
      const response = await fetch(`http://localhost:3001/api/reader/pay-fine/${selectedLoan.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ paymentMethod })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        setPaymentSuccess(true);
        setMessage(`支付成功！已支付罚款 ¥${paymentAmount.toFixed(2)}`);
        setTimeout(() => {
          setShowPaymentModal(false);
          fetchHistory(); // 刷新借阅记录
        }, 2000);
      } else {
        setMessage(data.message || '支付失败');
      }
    } catch (error) {
      setMessage('支付失败，请稍后重试');
    }
    setPaymentProcessing(false);
  };

  // 关闭支付弹窗
  const closePaymentModal = () => {
    setShowPaymentModal(false);
  };

  const openRatingModal = (loan) => {
    const bookId = loan.copy?.book?.id;
    const existingRating = userRatings[bookId];
    setSelectedBook(loan);
    setRating(existingRating ? existingRating.stars : 0);
    setReview(existingRating ? existingRating.review || '' : '');
    setShowRatingModal(true);
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      setMessage('请选择评分');
      return;
    }

    const token = localStorage.getItem('token');
    setSubmitting(true);

    try {
      const bookId = selectedBook.copy?.book?.id;
      const response = await fetch('http://localhost:3001/api/ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bookId,
          stars: rating,
          review: review.trim() || null
        })
      });

      const data = await response.json();
      if (data.success) {
        setMessage(userRatings[bookId] ? '评价已更新！' : '评价已提交！');
        setShowRatingModal(false);
        fetchUserRatings();
      } else {
        setMessage(data.message || '评价失败');
      }
    } catch (error) {
      setMessage('评价失败');
    }
    setSubmitting(false);
    setTimeout(() => setMessage(''), 3000);
  };

  // 检查是否有罚款需要支付
  const hasFineToPay = (loan) => {
    return loan.fineAmount && loan.fineAmount > 0 && !loan.finePaid;
  };

  const handleDeleteRating = async (bookId) => {
    const token = localStorage.getItem('token');
    const ratingId = userRatings[bookId]?.id;
    if (!ratingId) return;

    try {
      const response = await fetch(`http://localhost:3001/api/ratings/${ratingId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setMessage('评价已删除');
        fetchUserRatings();
      } else {
        setMessage(data.message || '删除失败');
      }
    } catch (error) {
      setMessage('删除失败');
    }
    setTimeout(() => setMessage(''), 3000);
  };

  const getStatusText = (loan) => {
    if (loan.returnDate) return '已归还';
    const dueDate = new Date(loan.dueDate);
    if (dueDate < new Date()) return '已逾期';
    return '借阅中';
  };

  const getStatusColor = (loan) => {
    if (loan.returnDate) return 'bg-green-500';
    const dueDate = new Date(loan.dueDate);
    if (dueDate < new Date()) return 'bg-red-500';
    return 'bg-blue-500';
  };

  const canRenew = (loan) => {
    if (loan.returnDate) return false;
    const dueDate = new Date(loan.dueDate);
    if (dueDate < new Date()) return false;
    return (loan.renewCount || 0) < 2;
  };

  const canRate = (loan) => {
    if (!loan.returnDate) return false;
    const bookId = loan.copy?.book?.id;
    return !!bookId;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  };

  const StarRating = ({ value, onChange, interactive = false, size = 'md' }) => {
    const sizeClass = size === 'sm' ? 'text-lg' : 'text-2xl';
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            onClick={() => interactive && onChange && onChange(star)}
            className={`${sizeClass} cursor-pointer transition-colors ${
              star <= value ? 'text-yellow-400' : 'text-gray-300'
            } ${interactive ? 'hover:text-yellow-300' : ''}`}
          >
            ★
          </span>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (error) return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="text-2xl">📚</div>
            <h1 className="text-xl font-bold text-gray-800">图书馆管理系统</h1>
            <span className="bg-green-100 text-green-600 text-xs px-2 py-1 rounded-full">读者</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleLogout} className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition text-sm">
              退出登录
            </button>
          </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
          错误: {error}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="text-2xl">📚</div>
            <h1 className="text-xl font-bold text-gray-800">图书馆管理系统</h1>
            <span className="bg-green-100 text-green-600 text-xs px-2 py-1 rounded-full">读者</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-500">{getGreeting()}</p>
              <p className="font-semibold text-gray-800">{user?.name || '读者'}</p>
              <p className="text-xs text-gray-400">{user?.email || ''}</p>
            </div>
            <button onClick={handleLogout} className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition text-sm">
              退出登录
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <DueReminderBanner />

        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg p-6 mb-8 text-white">
          <h2 className="text-2xl font-bold mb-2">{getGreeting()}，{user?.name || '读者'}！</h2>
          <p className="opacity-90">在这里您可以查看和管理您的借阅记录。</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div
            onClick={() => navigate('/')}
            className="bg-white p-6 rounded-lg shadow-lg hover:shadow-xl transition cursor-pointer"
          >
            <div className="text-4xl mb-4">🔍</div>
            <h2 className="text-xl font-bold mb-2">图书搜索</h2>
            <p className="text-gray-500 text-sm mb-4">搜索并浏览图书</p>
            <button className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition">
              进入 →
            </button>
          </div>

          <div
            onClick={() => navigate('/history')}
            className={`bg-white p-6 rounded-lg shadow-lg hover:shadow-xl transition cursor-pointer ${true ? 'ring-2 ring-blue-500' : ''}`}
          >
            <div className="text-4xl mb-4">📋</div>
            <h2 className="text-xl font-bold mb-2">借阅记录</h2>
            <p className="text-gray-500 text-sm mb-4">查看我的借阅历史</p>
            <button className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition">
              进入 →
            </button>
          </div>

          <div
            onClick={() => navigate('/announcements')}
            className="bg-white p-6 rounded-lg shadow-lg hover:shadow-xl transition cursor-pointer"
          >
            <div className="text-4xl mb-4">📢</div>
            <h2 className="text-xl font-bold mb-2">公告通知</h2>
            <p className="text-gray-500 text-sm mb-4">查看图书馆公告</p>
            <button className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition">
              进入 →
            </button>
          </div>
        </div>

        {message && (
          <div className={`p-4 mb-6 rounded-lg ${message.includes('成功') || message.includes('已') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {message}
          </div>
        )}

        {history.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            暂无借阅记录
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">书名</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">作者</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">借阅日期</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">截止日期</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">归还日期</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history.map((loan) => {
                    const bookId = loan.copy?.book?.id;
                    const existingRating = userRatings[bookId];
                    return (
                      <tr key={loan.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{loan.copy?.book?.title || 'Unknown'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{loan.copy?.book?.author || 'Unknown'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(loan.checkoutDate).toLocaleDateString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(loan.dueDate).toLocaleDateString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{loan.returnDate ? new Date(loan.returnDate).toLocaleDateString() : '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium text-white rounded-full ${getStatusColor(loan)}`}>
                            {getStatusText(loan)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {loan.returnDate ? (
                            <div className="flex flex-col gap-1">
                              {existingRating ? (
                                <div className="flex items-center gap-2">
                                  <StarRating value={existingRating.stars} size="sm" />
                                  <button
                                    onClick={() => openRatingModal(loan)}
                                    className="text-xs text-blue-500 hover:text-blue-700"
                                  >
                                    编辑
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRating(bookId)}
                                    className="text-xs text-red-500 hover:text-red-700"
                                  >
                                    删除
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => openRatingModal(loan)}
                                  className="px-2 py-1 bg-yellow-400 text-white text-xs rounded hover:bg-yellow-500 transition"
                                >
                                  ⭐ 评分与评价
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              {canRenew(loan) && (
                                <button
                                  onClick={() => handleRenew(loan.copyId)}
                                  className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition"
                                >
                                  续借
                                </button>
                              )}
                              <button
                                onClick={() => handleReturn(loan.id)}
                                className={`px-2 py-1 text-xs rounded hover:opacity-80 transition ${
                                  needsFinePayment(loan)
                                    ? 'bg-orange-500 text-white hover:bg-orange-600' 
                                    : 'bg-red-500 text-white hover:bg-red-600'
                                }`}
                              >
                                {needsFinePayment(loan)
                                  ? `归还并支付 ¥${getEstimatedFine(loan).toFixed(2)} 罚款` 
                                  : '归还'
                                }
                              </button>

                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {showRatingModal && selectedBook && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4">评分与评价</h2>
            <p className="text-gray-600 mb-2">
              <strong>书籍：</strong>{selectedBook.copy?.book?.title}
            </p>
            <p className="text-gray-600 mb-4">
              <strong>作者：</strong>{selectedBook.copy?.book?.author}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">评分（1-5星）</label>
              <StarRating value={rating} onChange={setRating} interactive size="lg" />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">评价（可选）</label>
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="分享您的阅读心得..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 resize-none"
                rows={4}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRatingModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
                disabled={submitting}
              >
                取消
              </button>
              <button
                onClick={handleSubmitRating}
                disabled={submitting || rating === 0}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '提交中...' : '提交评价'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 支付弹窗 */}
      {showPaymentModal && selectedLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4">支付罚款</h2>
            
            {/* 支付信息 */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>书籍：</strong>{selectedLoan.bookTitle}
              </p>
              <p className="text-lg font-bold text-red-600 mt-2">
                罚款金额：¥{paymentAmount.toFixed(2)}
              </p>
            </div>

            {/* 支付方式选择 */}
            {!paymentSuccess && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">选择支付方式</label>
                <div className="flex gap-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="wechat"
                      checked={paymentMethod === 'wechat'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="sr-only"
                    />
                    <div className={`flex items-center gap-2 px-4 py-2 border-2 rounded-lg transition ${
                      paymentMethod === 'wechat' ? 'border-green-500 bg-green-50' : 'border-gray-300'
                    }`}>
                      <span className="text-2xl">💚</span>
                      <span>微信支付</span>
                    </div>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="alipay"
                      checked={paymentMethod === 'alipay'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="sr-only"
                    />
                    <div className={`flex items-center gap-2 px-4 py-2 border-2 rounded-lg transition ${
                      paymentMethod === 'alipay' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                    }`}>
                      <span className="text-2xl">💙</span>
                      <span>支付宝</span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* 支付成功 */}
            {paymentSuccess && (
              <div className="mb-4 text-center">
                <div className="text-green-500 text-4xl mb-4">✓</div>
                <p className="text-green-600 font-medium">支付成功！</p>
                <p className="text-sm text-gray-500 mt-2">罚款已成功支付，页面将自动关闭</p>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              {!paymentSuccess && (
                <>
                  <button
                    onClick={closePaymentModal}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
                    disabled={paymentProcessing}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmPayment}
                    disabled={paymentProcessing}
                    className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {paymentProcessing ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        支付中...
                      </>
                    ) : (
                      `确认支付 ¥${paymentAmount.toFixed(2)}`
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyHistory;