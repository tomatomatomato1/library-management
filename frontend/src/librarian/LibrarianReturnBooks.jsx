import { useEffect, useState, useRef } from 'react'
import { API_URL, getAuthHeaders } from './api'

export default function LibrarianReturnBooks({ onBack }) {
  const [loans, setLoans] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoanId, setActionLoanId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [stats, setStats] = useState({ total: 0, active: 0, overdue: 0 })
  const [scanMode, setScanMode] = useState(false)
  const [scannedLoan, setScannedLoan] = useState(null)
  const scanInputRef = useRef(null)

  const formatCurrency = (amount) => {
    const safeAmount = Number(amount || 0)
    return `¥${safeAmount.toFixed(2)}`
  }

  const fetchActiveLoans = async () => {
    try {
      setLoading(true)
      setError('')

      const response = await fetch(`${API_URL}/loans/records`, {
        headers: getAuthHeaders(),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || '获取借阅记录失败')
      }

      setLoans(data.loans || [])
      setStats(data.stats || { total: 0, active: 0, overdue: 0 })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReturn = async (loanId, waiveFine = false) => {
    const loan = loans.find(l => l.id === loanId)
    const confirmMsg = waiveFine && loan?.estimatedFineAmount > 0
      ? `确定接收归还并免除 ${formatCurrency(loan.estimatedFineAmount)} 的罚款吗？`
      : '确认接收该图书归还吗？'

    if (!window.confirm(confirmMsg)) {
      return
    }

    try {
      setActionLoanId(loanId)
      setError('')
      setMessage('')

      const response = await fetch(`${API_URL}/loans/return`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ loanId, waiveFine }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || '还书失败')
      }

      const returnedLoan = data.loan
      if (returnedLoan?.waiveFineApplied) {
        setMessage(
          `✅ 归还成功，逾期 ${returnedLoan.overdueDays} 天，原罚款 ${formatCurrency(returnedLoan.originalFineAmount)} 已免除`
        )
      } else if (returnedLoan) {
        const overdueText = returnedLoan.isOverdue
          ? `逾期 ${returnedLoan.overdueDays} 天，`
          : ''
        setMessage(`✅ 归还成功，${overdueText}最终罚款 ${formatCurrency(returnedLoan.fineAmount)}`)
      } else {
        setMessage(`✅ ${data.message}`)
      }
      await fetchActiveLoans()
      
      // 3秒后清除消息
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoanId(null)
    }
  }

  const scanLoan = async (isbn) => {
    setError('')
    setMessage('')
    if (!isbn.trim()) {
      setError('请扫描图书ISBN')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/loans/loans/scan?isbn=${encodeURIComponent(isbn)}`, {
        headers: getAuthHeaders(),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || '识别失败')
      }

      setScannedLoan(data.loan)
      setMessage(`✅ 成功识别借阅记录`)
    } catch (err) {
      setError(err.message)
      setScannedLoan(null)
    } finally {
      setLoading(false)
    }
  }

  const handleScanInput = (e) => {
    if (e.key === 'Enter') {
      const value = e.target.value
      if (value && value.trim()) {
        scanLoan(value)
        e.target.value = ''
      }
    }
  }

  const handleQuickReturn = async (waiveFine = false) => {
    if (!scannedLoan) return

    const loan = scannedLoan
    const confirmMsg = waiveFine && loan?.estimatedFineAmount > 0
      ? `确定接收归还并免除 ${formatCurrency(loan.estimatedFineAmount)} 的罚款吗？`
      : '确认接收该图书归还吗？'

    if (!window.confirm(confirmMsg)) {
      return
    }

    try {
      setActionLoanId(loan.id)
      setError('')
      setMessage('')

      const response = await fetch(`${API_URL}/loans/return`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ loanId: loan.id, waiveFine }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || '还书失败')
      }

      const returnedLoan = data.loan
      if (returnedLoan?.waiveFineApplied) {
        setMessage(
          `✅ 归还成功，逾期 ${returnedLoan.overdueDays} 天，原罚款 ${formatCurrency(returnedLoan.originalFineAmount)} 已免除`
        )
      } else if (returnedLoan) {
        const overdueText = returnedLoan.isOverdue
          ? `逾期 ${returnedLoan.overdueDays} 天，`
          : ''
        setMessage(`✅ 归还成功，${overdueText}最终罚款 ${formatCurrency(returnedLoan.fineAmount)}`)
      } else {
        setMessage(`✅ ${data.message}`)
      }
      
      setScannedLoan(null)
      setScanMode(false)
      await fetchActiveLoans()
      
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoanId(null)
    }
  }

  useEffect(() => {
    fetchActiveLoans()
  }, [])

  const filteredLoans = loans.filter((loan) => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return true

    return (
      String(loan.id).includes(keyword) ||
      loan.user?.name?.toLowerCase().includes(keyword) ||
      loan.user?.studentId?.toLowerCase().includes(keyword) ||
      loan.copy?.book?.title?.toLowerCase().includes(keyword) ||
      loan.copy?.barcode?.toLowerCase().includes(keyword)
    )
  })

  const activeLoans = filteredLoans.filter(l => !l.returnDate)
  const overdueLoans = activeLoans.filter(l => l.isOverdue)

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">📥 接收还书</h2>
          <p className="text-gray-500 text-sm">查看在借记录，接收归还并更新状态</p>
        </div>
        <div className="flex gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition"
            >
              ← 返回
            </button>
          )}
          <button
            onClick={fetchActiveLoans}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
            disabled={loading}
          >
            🔄 刷新
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{activeLoans.length}</div>
          <div className="text-sm text-gray-600">在借中</div>
        </div>
        <div className="bg-red-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{overdueLoans.length}</div>
          <div className="text-sm text-gray-600">已逾期</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-600">
            {activeLoans.length - overdueLoans.length}
          </div>
          <div className="text-sm text-gray-600">正常</div>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="🔍 搜索借阅ID、学生姓名、学号、书名、ISBN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-md px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <button
          onClick={() => setScanMode(!scanMode)}
          className={`px-4 py-2 rounded-lg transition ${
            scanMode 
              ? 'bg-orange-500 text-white' 
              : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
          }`}
          disabled={loading}
        >
          📱 {scanMode ? '关闭扫码' : '扫码还书'}
        </button>
      </div>

      {/* 消息 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          ❌ {error}
        </div>
      )}
      {message && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg">
          {message}
        </div>
      )}

      {/* 扫码输入区域 */}
      {scanMode && (
        <div className="mb-4 p-4 bg-orange-50 border-2 border-orange-300 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">📷</span>
              <span className="font-semibold text-orange-700">请扫描图书ISBN</span>
            </div>
          </div>
          <input
            ref={scanInputRef}
            type="text"
            onKeyDown={handleScanInput}
            className="w-full px-4 py-3 border-2 border-orange-300 rounded-lg text-lg text-center focus:outline-none focus:border-orange-500"
            placeholder="扫描ISBN后自动识别借阅记录..."
            autoFocus
          />
          <p className="text-xs text-orange-600 text-center mt-2">
            提示：扫描设备读取ISBN后会自动输入并识别
          </p>
        </div>
      )}

      {/* 扫码识别结果 */}
      {scannedLoan && (
        <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-3">📋 识别到的借阅记录</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-gray-500 text-sm">学生：</span>
              <span className="font-medium">{scannedLoan.user?.name || '-'}</span>
            </div>
            <div>
              <span className="text-gray-500 text-sm">学号：</span>
              <span>{scannedLoan.user?.studentId || '-'}</span>
            </div>
            <div>
              <span className="text-gray-500 text-sm">图书：</span>
              <span className="font-medium">{scannedLoan.copy?.book?.title || '-'}</span>
            </div>
            <div>
              <span className="text-gray-500 text-sm">条码：</span>
              <span>{scannedLoan.copy?.barcode || '-'}</span>
            </div>
            <div>
              <span className="text-gray-500 text-sm">借出日期：</span>
              <span>{new Date(scannedLoan.checkoutDate).toLocaleDateString()}</span>
            </div>
            <div>
              <span className="text-gray-500 text-sm">应还日期：</span>
              <span className={scannedLoan.isOverdue ? 'text-red-600 font-semibold' : ''}>
                {new Date(scannedLoan.dueDate).toLocaleDateString()}
              </span>
            </div>
          </div>
          {scannedLoan.isOverdue && (
            <div className="mt-3 p-2 bg-red-100 rounded-lg">
              <span className="text-red-600 text-sm">
                ⚠️ 逾期 {scannedLoan.overdueDays} 天，预计罚款 {formatCurrency(scannedLoan.estimatedFineAmount)}
              </span>
            </div>
          )}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => handleQuickReturn(false)}
              disabled={actionLoanId === scannedLoan.id}
              className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition disabled:opacity-50 font-semibold"
            >
              {actionLoanId === scannedLoan.id ? '处理中...' : '✅ 确认归还'}
            </button>
            {scannedLoan.isOverdue && scannedLoan.estimatedFineAmount > 0 && (
              <button
                onClick={() => handleQuickReturn(true)}
                disabled={actionLoanId === scannedLoan.id}
                className="flex-1 bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600 transition disabled:opacity-50 font-semibold"
              >
                免罚归还
              </button>
            )}
          </div>
        </div>
      )}

      {/* 借阅列表 */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-3 text-left">ID</th>
                <th className="px-3 py-3 text-left">学生</th>
                <th className="px-3 py-3 text-left">学号</th>
                <th className="px-3 py-3 text-left">图书</th>
                <th className="px-3 py-3 text-left">ISBN</th>
                <th className="px-3 py-3 text-left">借出日期</th>
                <th className="px-3 py-3 text-left">应还日期</th>
                <th className="px-3 py-3 text-left">状态</th>
                <th className="px-3 py-3 text-left">罚款</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredLoans.filter(l => !l.returnDate).length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center py-8 text-gray-500">
                    当前没有在借记录
                  </td>
                </tr>
              ) : (
                filteredLoans
                  .filter(l => !l.returnDate)
                  .map((loan) => {
                    const isOverdue = loan.isOverdue
                    const estimatedFine = Number(loan.estimatedFineAmount || 0)

                    return (
                      <tr key={loan.id} className={`border-b hover:bg-gray-50 ${isOverdue ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-3">{loan.id}</td>
                        <td className="px-3 py-3 font-medium">{loan.user?.name || '-'}</td>
                        <td className="px-3 py-3">{loan.user?.studentId || '-'}</td>
                        <td className="px-3 py-3">{loan.copy?.book?.title || '-'}</td>
                        <td className="px-3 py-3 text-gray-500">{loan.copy?.book?.isbn || '-'}</td>
                        <td className="px-3 py-3">{new Date(loan.checkoutDate).toLocaleDateString()}</td>
                        <td className="px-3 py-3">
                          <span className={isOverdue ? 'text-red-600 font-semibold' : ''}>
                            {new Date(loan.dueDate).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {isOverdue ? (
                            <div>
                              <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
                                逾期 {loan.overdueDays} 天
                              </span>
                              <div className="text-xs text-red-500 mt-1">
                                预计罚款 {formatCurrency(estimatedFine)}
                              </div>
                            </div>
                          ) : (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                              在借中
                            </span>
                          )}
                        </td>
                        <td className={`px-3 py-3 ${estimatedFine > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {formatCurrency(estimatedFine)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReturn(loan.id, false)}
                              disabled={actionLoanId === loan.id}
                              className="px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50 text-xs"
                            >
                              {actionLoanId === loan.id ? '处理中' : '归还'}
                            </button>
                            {isOverdue && estimatedFine > 0 && (
                              <button
                                onClick={() => handleReturn(loan.id, true)}
                                disabled={actionLoanId === loan.id}
                                className="px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition disabled:opacity-50 text-xs"
                              >
                                免罚归还
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
