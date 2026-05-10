const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

async function writeAuditLog(data) {
  try {
    await prisma.auditLog.create({ data });
  } catch (error) {
    console.warn('Failed to write audit log:', error.message);
  }
}
const {
  getFineRatePerDay,
  startOfLocalDay,
  decorateLoanWithFine,
  buildReturnSummary,
} = require('../lib/fines');

const router = express.Router();

const LOAN_DURATION_DAYS = 30;

function checkLibrarianOrAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: '未认证' });
  }
  if (req.user.role !== 'LIBRARIAN' && req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: '权限不足，需要馆员或管理员权限' });
  }
  next();
}

async function calculateDueDate(checkoutDate) {
  const dueDate = new Date(checkoutDate);
  dueDate.setDate(dueDate.getDate() + LOAN_DURATION_DAYS);
  return dueDate;
}

// ==================== 你的独有功能（保留） ====================

// 按姓名查询借阅历史
router.get('/by-name', requireAuth, checkLibrarianOrAdmin, async (req, res) => {
  try {
    const { name } = req.query;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: '姓名不能为空' });
    }

    const user = await prisma.user.findFirst({
      where: { name: name.trim() },
      include: {
        loans: {
          orderBy: { checkoutDate: 'desc' },
          include: {
            copy: { include: { book: true } }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: '未找到该用户' });
    }

    const fineRatePerDay = await getFineRatePerDay();
    const decoratedLoans = user.loans.map((loan) => decorateLoanWithFine(loan, fineRatePerDay));

    res.json({
      success: true,
      userInfo: {
        id: user.id,
        name: user.name,
        studentId: user.studentId,
        email: user.email,
        role: user.role,
        currentBorrowCount: decoratedLoans.filter((loan) => !loan.returnDate).length,
      },
      borrowHistory: decoratedLoans.map((loan) => ({
        id: loan.id,
        bookName: loan.copy?.book?.title || '未知图书',
        bookCode: loan.copy?.barcode || '',
        borrowDate: loan.checkoutDate,
        dueDate: loan.dueDate,
        returnDate: loan.returnDate,
        status: loan.returnDate ? 'returned' : (loan.isOverdue ? 'overdue' : 'borrowed'),
        isOverdue: loan.isOverdue,
        overdueDays: loan.overdueDays,
        estimatedFineAmount: loan.estimatedFineAmount,
        fineAmount: Number(loan.fineAmount ?? 0),
        fineForgiven: Boolean(loan.fineForgiven),
      }))
    });
  } catch (error) {
    console.error('查询借阅历史失败:', error);
    res.status(500).json({ success: false, message: '服务器错误', error: error.message });
  }
});

// 按学号查询借阅历史
router.get('/by-studentId', requireAuth, checkLibrarianOrAdmin, async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId || studentId.trim() === '') {
      return res.status(400).json({ success: false, message: '学号不能为空' });
    }

    const user = await prisma.user.findUnique({
      where: { studentId: studentId.trim() },
      include: {
        loans: {
          orderBy: { checkoutDate: 'desc' },
          include: {
            copy: { include: { book: true } }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: '未找到该用户' });
    }

    const fineRatePerDay = await getFineRatePerDay();
    const decoratedLoans = user.loans.map((loan) => decorateLoanWithFine(loan, fineRatePerDay));

    res.json({
      success: true,
      userInfo: {
        id: user.id,
        name: user.name,
        studentId: user.studentId,
        email: user.email,
        role: user.role,
        currentBorrowCount: decoratedLoans.filter((loan) => !loan.returnDate).length,
      },
      borrowHistory: decoratedLoans.map((loan) => ({
        id: loan.id,
        bookName: loan.copy?.book?.title || '未知图书',
        bookCode: loan.copy?.barcode || '',
        borrowDate: loan.checkoutDate,
        dueDate: loan.dueDate,
        returnDate: loan.returnDate,
        status: loan.returnDate ? 'returned' : (loan.isOverdue ? 'overdue' : 'borrowed'),
        isOverdue: loan.isOverdue,
        overdueDays: loan.overdueDays,
        estimatedFineAmount: loan.estimatedFineAmount,
        fineAmount: Number(loan.fineAmount ?? 0),
        fineForgiven: Boolean(loan.fineForgiven),
      }))
    });
  } catch (error) {
    console.error('查询借阅历史失败:', error);
    res.status(500).json({ success: false, message: '服务器错误', error: error.message });
  }
});

// ==================== 组长版本的核心功能 ====================

// 搜索学生
router.get('/users/search', requireAuth, checkLibrarianOrAdmin, async (req, res) => {
  try {
    const keyword = (req.query.keyword || '').trim();
    if (!keyword) {
      return res.status(400).json({ message: '请输入搜索关键词' });
    }

    const students = await prisma.user.findMany({
      where: {
        role: 'STUDENT',
        OR: [
          { studentId: { contains: keyword } },
          { email: { contains: keyword } },
          { name: { contains: keyword } }
        ]
      },
      select: { id: true, name: true, email: true, studentId: true, role: true }
    });

    const usersWithStats = await Promise.all(students.map(async (student) => {
      const currentBorrowCount = await prisma.loan.count({
        where: { userId: student.id, returnDate: null }
      });
      const overdueLoans = await prisma.loan.count({
        where: {
          userId: student.id,
          returnDate: null,
          dueDate: { lt: startOfLocalDay() }
        }
      });

      return {
        ...student,
        stats: {
          currentBorrowCount,
          hasOverdue: overdueLoans > 0,
        },
      };
    }));

    res.json({ success: true, users: usersWithStats });
  } catch (error) {
    console.error('Search students error:', error);
    res.status(500).json({ message: '搜索学生失败' });
  }
});

// 搜索图书
router.get('/books/search', requireAuth, checkLibrarianOrAdmin, async (req, res) => {
  try {
    const keyword = (req.query.keyword || '').trim();
    if (!keyword) {
      return res.status(400).json({ message: '请输入搜索关键词' });
    }

    const books = await prisma.book.findMany({
      where: {
        OR: [
          { title: { contains: keyword } },
          { isbn: { contains: keyword } },
          { author: { contains: keyword } }
        ]
      },
      include: { copies: { select: { id: true, barcode: true, status: true } } }
    });

    const booksWithAvailability = books.map((book) => {
      const availableCopies = book.copies.filter((copy) => copy.status === 'AVAILABLE').length;
      return {
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        genre: book.genre,
        availableCopies,
        totalCopies: book.copies.length,
      };
    });

    res.json({ success: true, books: booksWithAvailability });
  } catch (error) {
    console.error('Search books error:', error);
    res.status(500).json({ message: '搜索图书失败' });
  }
});

// 扫描学生
router.get('/users/scan', requireAuth, checkLibrarianOrAdmin, async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId || !studentId.trim()) {
      return res.status(400).json({ success: false, message: '请提供学号' });
    }

    const student = await prisma.user.findUnique({
      where: { studentId: studentId.trim() },
      select: { id: true, name: true, email: true, studentId: true, role: true }
    });

    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ success: false, message: '未找到该学生' });
    }

    const currentBorrowCount = await prisma.loan.count({
      where: { userId: student.id, returnDate: null }
    });
    const overdueLoans = await prisma.loan.count({
      where: {
        userId: student.id,
        returnDate: null,
        dueDate: { lt: startOfLocalDay() }
      }
    });

    res.json({
      success: true,
      user: {
        ...student,
        stats: {
          currentBorrowCount,
          hasOverdue: overdueLoans > 0,
        },
      }
    });
  } catch (error) {
    console.error('Scan student error:', error);
    res.status(500).json({ success: false, message: '识别学生失败' });
  }
});

// 扫描图书
router.get('/books/scan', requireAuth, checkLibrarianOrAdmin, async (req, res) => {
  try {
    const { isbn } = req.query;
    if (!isbn || !isbn.trim()) {
      return res.status(400).json({ success: false, message: '请提供图书ISBN' });
    }

    const book = await prisma.book.findUnique({
      where: { isbn: isbn.trim() },
      include: { copies: { select: { id: true, barcode: true, status: true } } }
    });

    if (!book) {
      return res.status(404).json({ success: false, message: '未找到该图书' });
    }

    const availableCopies = book.copies.filter((copy) => copy.status === 'AVAILABLE').length;

    res.json({
      success: true,
      book: {
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        genre: book.genre,
        availableCopies,
        totalCopies: book.copies.length,
      },
    });
  } catch (error) {
    console.error('Scan book error:', error);
    res.status(500).json({ success: false, message: '识别图书失败' });
  }
});

// 扫描借阅记录
router.get('/loans/scan', requireAuth, checkLibrarianOrAdmin, async (req, res) => {
  try {
    const { isbn } = req.query;
    if (!isbn || !isbn.trim()) {
      return res.status(400).json({ success: false, message: '请提供图书ISBN' });
    }

    const book = await prisma.book.findUnique({
      where: { isbn: isbn.trim() },
      include: { copies: { select: { id: true, barcode: true } } }
    });

    if (!book) {
      return res.status(404).json({ success: false, message: '未找到该图书' });
    }

    const copyIds = book.copies.map(copy => copy.id);
    const loan = await prisma.loan.findFirst({
      where: {
        copyId: { in: copyIds },
        returnDate: null
      },
      include: {
        user: { select: { id: true, name: true, studentId: true } },
        copy: { include: { book: { select: { id: true, title: true, isbn: true } } } }
      }
    });

    if (!loan) {
      return res.status(404).json({ success: false, message: '该图书当前没有借出记录' });
    }

    const fineRatePerDay = await getFineRatePerDay();
    const decoratedLoan = decorateLoanWithFine(loan, fineRatePerDay);

    res.json({
      success: true,
      loan: {
        ...decoratedLoan,
        status: decoratedLoan.isOverdue ? 'overdue' : 'active'
      }
    });
  } catch (error) {
    console.error('Scan loan error:', error);
    res.status(500).json({ success: false, message: '识别借阅记录失败' });
  }
});

// 借书
router.post('/lend', requireAuth, checkLibrarianOrAdmin, async (req, res) => {
  try {
    const { userId, bookId } = req.body;
    if (!userId || !bookId) {
      return res.status(400).json({ success: false, message: '请选择学生和图书' });
    }

    const student = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ success: false, message: '学生不存在' });
    }

    const book = await prisma.book.findUnique({
      where: { id: Number(bookId) },
      include: { copies: { where: { status: 'AVAILABLE' }, take: 1 } }
    });

    if (!book) {
      return res.status(404).json({ success: false, message: '图书不存在' });
    }

    if (book.copies.length === 0) {
      return res.status(400).json({ success: false, message: '该图书没有可用副本' });
    }

    const existingLoan = await prisma.loan.findFirst({
      where: {
        userId: Number(userId),
        copy: { bookId: Number(bookId) },
        returnDate: null
      }
    });

    if (existingLoan) {
      return res.status(400).json({ success: false, message: '该学生已经借阅了这本书' });
    }

    const selectedCopy = book.copies[0];
    const checkoutDate = new Date();
    const dueDate = await calculateDueDate(checkoutDate);

    const loan = await prisma.loan.create({
      data: {
        userId: Number(userId),
        copyId: selectedCopy.id,
        checkoutDate,
        dueDate,
        fineAmount: 0,
        finePaid: false,
        fineForgiven: false,
        renewCount: 0
      }
    });

    await prisma.copy.update({
      where: { id: selectedCopy.id },
      data: { status: 'BORROWED' }
    });

    writeAuditLog({
      userId: req.user.id,
      action: 'LEND_BOOK',
      entity: 'Loan',
      entityId: loan.id,
      detail: `馆员将《${book.title}》借给学生 ${student.name}`,
    });

    res.status(201).json({
      success: true,
      message: `借书成功！《${book.title}》已借给 ${student.name}`,
      loan: { id: loan.id, bookTitle: book.title, checkoutDate, dueDate }
    });
  } catch (error) {
    console.error('Lend book error:', error);
    res.status(500).json({ success: false, message: '借书失败' });
  }
});

// 获取所有当前借阅记录
router.get('/records', requireAuth, checkLibrarianOrAdmin, async (req, res) => {
  try {
    const fineRatePerDay = await getFineRatePerDay();
    const loans = await prisma.loan.findMany({
      where: { returnDate: null },
      include: {
        user: { select: { id: true, name: true, studentId: true } },
        copy: { include: { book: { select: { id: true, title: true, isbn: true } } } }
      },
      orderBy: { checkoutDate: 'desc' }
    });

    const decoratedLoans = loans.map((loan) => {
      const decoratedLoan = decorateLoanWithFine(loan, fineRatePerDay);
      return {
        ...decoratedLoan,
        status: decoratedLoan.isOverdue ? 'overdue' : 'active'
      };
    });

    res.json({
      success: true,
      loans: decoratedLoans,
      stats: {
        total: decoratedLoans.length,
        active: decoratedLoans.filter((loan) => !loan.isOverdue).length,
        overdue: decoratedLoans.filter((loan) => loan.isOverdue).length,
      }
    });
  } catch (error) {
    console.error('Fetch loan records error:', error);
    res.status(500).json({ message: '获取借阅记录失败' });
  }
});

// 还书
router.post('/return', requireAuth, checkLibrarianOrAdmin, async (req, res) => {
  try {
    const { loanId, waiveFine } = req.body;
    if (!loanId) {
      return res.status(400).json({ success: false, message: '请选择要归还的借阅记录' });
    }

    const loan = await prisma.loan.findUnique({
      where: { id: Number(loanId) },
      include: {
        copy: { include: { book: true } },
        user: true
      }
    });

    if (!loan) {
      return res.status(404).json({ success: false, message: '借阅记录不存在' });
    }

    if (loan.returnDate) {
      return res.status(400).json({ success: false, message: '该图书已经归还过了' });
    }

    const fineRatePerDay = await getFineRatePerDay();
    const returnDate = new Date();
    const returnSummary = buildReturnSummary(loan, returnDate, fineRatePerDay, {
      waiveFine: Boolean(waiveFine)
    });

    const updatedLoan = await prisma.loan.update({
      where: { id: Number(loanId) },
      data: {
        returnDate,
        fineAmount: returnSummary.fineAmount,
        finePaid: returnSummary.fineAmount > 0 ? false : loan.finePaid,
        fineForgiven: returnSummary.fineForgiven,
      }
    });

    await prisma.copy.update({
      where: { id: loan.copyId },
      data: { status: 'AVAILABLE' }
    });

    let message = `《${loan.copy.book.title}》已成功归还`;
    if (returnSummary.waiveFineApplied) {
      message += `，原罚款 ¥${returnSummary.originalFineAmount.toFixed(2)} 已免除`;
    } else if (returnSummary.fineAmount > 0) {
      message += `，逾期罚款 ¥${returnSummary.fineAmount.toFixed(2)}`;
    }

    writeAuditLog({
      userId: req.user.id,
      action: 'RETURN_BOOK',
      entity: 'Loan',
      entityId: Number(loanId),
      detail: `馆员还书《${loan.copy.book.title}》，罚款 ¥${returnSummary.fineAmount.toFixed(2)}（${returnSummary.waiveFineApplied ? '已免除' : '已收取'}）`,
    });

    res.json({
      success: true,
      message,
      loan: {
        ...returnSummary,
        id: updatedLoan.id,
        returnDate: updatedLoan.returnDate,
        fineAmount: Number(updatedLoan.fineAmount ?? 0),
        fineForgiven: Boolean(updatedLoan.fineForgiven),
      }
    });
  } catch (error) {
    console.error('Return book error:', error);
    res.status(500).json({ success: false, message: '还书失败' });
  }
});

// 我借的书（个人借阅历史）
router.get('/me', requireAuth, async (req, res) => {
  try {
    const fineRatePerDay = await getFineRatePerDay();
    const loans = await prisma.loan.findMany({
      where: { userId: req.user.id },
      include: {
        copy: {
          include: {
            book: { select: { id: true, title: true } }
          }
        }
      },
      orderBy: { checkoutDate: 'desc' }
    });

    res.json({
      success: true,
      loans: loans.map((loan) => decorateLoanWithFine(loan, fineRatePerDay))
    });
  } catch (error) {
    res.status(500).json({ message: '获取借阅记录失败' });
  }
});

// 测试接口
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'loans路由工作正常！', timestamp: new Date().toISOString() });
});

module.exports = router;