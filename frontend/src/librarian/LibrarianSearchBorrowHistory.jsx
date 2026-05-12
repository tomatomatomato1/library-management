// LibrarianSearchBorrowHistory.jsx
import { useState } from 'react'
import IsbnBarcode from '../components/IsbnBarcode'
import { API_URL, getAuthHeaders } from './api' 
export default function LibrarianSearchBorrowHistory({ onBack }) {
  const [searchType, setSearchType] = useState('username') // 'username' 或 'studentId'
  const [searchValue, setSearchValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [error, setError] = useState('')
  const [searchPerformed, setSearchPerformed] = useState(false)

  const formatCurrency = (amount) => {
    const safeAmount = Number(amount || 0)
    return `¥${safeAmount.toFixed(2)}`
  }

  const formatFineDisplay = (record) => {
    if (record.fineForgiven) {
      return '已免罚'
    }
    return formatCurrency(record.estimatedFineAmount)
  }

  // 查询借阅历史
const searchBorrowHistory = async () => {
  if (!searchValue.trim()) {
    setError('请输入用户名或学号')
    return
  }

  setLoading(true)
  setError('')
  setSearchPerformed(true)

  try {
    // 根据搜索类型调用不同的API
    const endpoint = searchType === 'username' 
      ? `${API_URL}/librarian/search-history/by-name?name=${encodeURIComponent(searchValue)}`
      : `${API_URL}/librarian/search-history/by-studentId?studentId=${encodeURIComponent(searchValue)}`

    const response = await fetch(endpoint, {
      headers: getAuthHeaders(),
    })

    const data = await response.json()

    if (response.ok && data.success) {
      const results = data.users || []
      setSearchResults(results)
      if (results.length === 0) {
        setError('未找到该用户或该用户暂无借阅记录')
      }
    } else {
      setError(data.message || '未找到该用户或查询失败')
      setSearchResults([])
    }
  } catch (error) {
    console.error('查询借阅历史失败:', error)
    setError('网络错误，请稍后重试')
    setSearchResults([])
  } finally {
    setLoading(false)
  }
}

  // 获取状态对应的样式和文本
  const getStatusInfo = (status) => {
    switch(status) {
      case 'borrowed':
        return { text: '借出中', color: 'text-blue-600', bg: 'bg-blue-100', icon: '📘' }
      case 'returned':
        return { text: '已归还', color: 'text-green-600', bg: 'bg-green-100', icon: '✅' }
      case 'overdue':
        return { text: '已逾期', color: 'text-red-600', bg: 'bg-red-100', icon: '⚠️' }
      default:
        return { text: '未知', color: 'text-gray-600', bg: 'bg-gray-100', icon: '❓' }
    }
  }

  // 格式化日期
  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="mb-4 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition flex items-center gap-2"
      >
        <span>←</span> 返回
      </button>

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {/* 标题栏 */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>📜</span> 用户借阅历史查询
          </h2>
          <p className="text-purple-100 text-sm mt-1">通过用户名或学号查询用户的完整借阅记录</p>
        </div>

        {/* 搜索表单 */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            {/* 搜索类型选择 */}
            <div className="flex gap-2">
              <button
                onClick={() => setSearchType('username')}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  searchType === 'username'
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                按用户名
              </button>
              <button
                onClick={() => setSearchType('studentId')}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  searchType === 'studentId'
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                按学号
              </button>
            </div>

            {/* 搜索输入框 */}
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchBorrowHistory()}
                placeholder={searchType === 'username' ? '请输入用户名' : '请输入学号'}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <button
                onClick={searchBorrowHistory}
                disabled={loading}
                className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    查询中...
                  </>
                ) : (
                  <>
                    🔍 查询
                  </>
                )}
              </button>
            </div>
          </div>

          {error && !loading && (
            <div className={`mt-4 p-3 rounded-lg ${searchPerformed && searchResults.length === 0 && !error.includes('暂无') ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-600'}`}>
              {error}
            </div>
          )}
        </div>

        {/* 查询结果 */}
        {searchResults.length > 0 && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <span>📋</span> 搜索结果
                </h3>
                <p className="text-sm text-gray-500">已匹配 {searchResults.length} 位用户</p>
              </div>
            </div>

            {searchResults.map((result, userIndex) => (
              <div key={result.userInfo.id || userIndex} className="mb-10 border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 border-b border-blue-200">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-800">用户 {userIndex + 1}</h4>
                      <p className="text-sm text-gray-500">{result.userInfo.name || '-'} · {result.userInfo.email || '-'} · 学号 {result.userInfo.studentId || '-'}</p>
                    </div>
                    <div className="text-sm text-gray-500">
                      当前在借：<span className="font-semibold text-blue-600">{result.userInfo.currentBorrowCount || 0}</span> 本
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">序号</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">图书名称</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">条形码</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">借书时间</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">应还时间</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">还书时间</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">状态</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">罚款</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {result.borrowHistory.map((record, index) => {
                          const statusInfo = getStatusInfo(record.status)
                          const overdueDays = Number(record.overdueDays || 0)

                          return (
                            <tr key={record.id || index} className="hover:bg-gray-50 transition">
                              <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-800">{record.bookName}</div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                {record.bookCode ? (
                                  <div className="max-w-[180px]">
                                    <IsbnBarcode isbn={record.bookCode} height={48} />
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-sm">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">{formatDate(record.borrowDate)}</td>
                              <td className="px-4 py-3">
                                <div className="text-sm text-gray-600">{formatDate(record.dueDate)}</div>
                                {record.status !== 'returned' && overdueDays > 0 && (
                                  <div className="text-xs text-red-500 mt-1">逾期 {overdueDays} 天</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {record.returnDate ? formatDate(record.returnDate) : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${statusInfo.bg} ${statusInfo.color}`}>
                                  <span>{statusInfo.icon}</span>
                                  <span>{statusInfo.text}</span>
                                </span>
                              </td>
                              <td className={`px-4 py-3 text-sm ${record.estimatedFineAmount > 0 || record.fineForgiven ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                                {formatFineDisplay(record)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {result.borrowHistory.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 rounded-lg">
                      <div className="text-6xl mb-4">📭</div>
                      <p className="text-gray-500">该用户暂无借阅记录</p>
                    </div>
                  )}

                  {result.borrowHistory.length > 0 && (
                    <div className="mt-6 bg-gray-50 rounded-lg p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-blue-600">
                            {result.borrowHistory.filter(r => r.status === 'returned').length}
                          </p>
                          <p className="text-sm text-gray-500">已归还</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-blue-600">
                            {result.borrowHistory.filter(r => r.status === 'borrowed').length}
                          </p>
                          <p className="text-sm text-gray-500">借出中</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-red-600">
                            {result.borrowHistory.filter(r => r.status === 'overdue').length}
                          </p>
                          <p className="text-sm text-gray-500">已逾期</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-purple-600">
                            {result.borrowHistory.length}
                          </p>
                          <p className="text-sm text-gray-500">总借阅次数</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 未搜索时的提示 */}
        {!searchPerformed && searchResults.length === 0 && !loading && (
          <div className="p-12 text-center">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-gray-500">请输入用户名或学号查询用户借阅历史</p>
            <p className="text-gray-400 text-sm mt-2">支持按用户名或学号检索</p>
          </div>
        )}
      </div>
    </div>
  )
}
