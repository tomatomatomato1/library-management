const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { getFineRatePerDay, decorateLoanWithFine } = require('../lib/fines');

function toBorrowHistoryRecord(loan) {
  let status = 'borrowed';

  if (loan.returnDate) {
    status = 'returned';
  } else if (loan.isOverdue) {
    status = 'overdue';
  }

  return {
    id: loan.id,
    bookName: loan.copy?.book?.title || '未知图书',
    bookCode: loan.copy?.barcode || '',
    borrowDate: loan.checkoutDate,
    dueDate: loan.dueDate,
    returnDate: loan.returnDate,
    status,
    isOverdue: loan.isOverdue,
    overdueDays: loan.overdueDays,
    estimatedFineAmount: loan.estimatedFineAmount,
    fineAmount: Number(loan.fineAmount ?? 0),
    fineForgiven: Boolean(loan.fineForgiven),
  };
}

async function buildBorrowHistoryResponse(user) {
  const fineRatePerDay = await getFineRatePerDay();
  const decoratedLoans = user.loans.map((loan) => decorateLoanWithFine(loan, fineRatePerDay));

  return {
    userInfo: {
      id: user.id,
      name: user.name,
      studentId: user.studentId,
      email: user.email,
      role: user.role,
      currentBorrowCount: decoratedLoans.filter((loan) => !loan.returnDate).length,
    },
    borrowHistory: decoratedLoans.map(toBorrowHistoryRecord),
  };
}

router.get('/by-name', async (req, res) => {
  try {
    const { name } = req.query;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: '姓名不能为空'
      });
    }

    const users = await prisma.user.findMany({
      where: {
        name: {
          contains: name.trim()
        }
      },
      include: {
        loans: {
          orderBy: { checkoutDate: 'desc' },
          include: {
            copy: {
              include: {
                book: true
              }
            }
          }
        }
      }
    });

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到该用户'
      });
    }

    const results = await Promise.all(users.map(buildBorrowHistoryResponse));
    res.json({
      success: true,
      users: results
    });
  } catch (error) {
    console.error('查询借阅历史失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误',
      error: error.message
    });
  }
});

router.get('/by-studentId', async (req, res) => {
  try {
    const { studentId } = req.query;

    if (!studentId || studentId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: '学号不能为空'
      });
    }

    const users = await prisma.user.findMany({
      where: {
        studentId: {
          contains: studentId.trim()
        }
      },
      include: {
        loans: {
          orderBy: { checkoutDate: 'desc' },
          include: {
            copy: {
              include: {
                book: true
              }
            }
          }
        }
      }
    });

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到该用户'
      });
    }

    const results = await Promise.all(users.map(buildBorrowHistoryResponse));
    res.json({
      success: true,
      users: results
    });
  } catch (error) {
    console.error('查询借阅历史失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误',
      error: error.message
    });
  }
});

router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '路由工作正常！',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
