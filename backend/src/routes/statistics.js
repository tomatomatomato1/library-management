const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// 今日借阅数量
router.get('/today-loans', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const count = await prisma.loan.count({
      where: {
        checkoutDate: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    res.json({
      success: true,
      todayLoans: count,
    });
  } catch (error) {
    console.error('今日借阅统计失败:', error);
    res.status(500).json({ success: false, error: '统计失败' });
  }
});

// 可选：总图书统计
router.get('/total-books', async (req, res) => {
  try {
    const count = await prisma.book.count();
    res.json({ success: true, totalBooks: count });
  } catch (error) {
    res.status(500).json({ success: false, error: '统计失败' });
  }
});

// 可选：在借图书数量
router.get('/active-loans', async (req, res) => {
  try {
    const count = await prisma.loan.count({
      where: {
        returnDate: null,  // 未归还
      },
    });
    res.json({ success: true, activeLoans: count });
  } catch (error) {
    res.status(500).json({ success: false, error: '统计失败' });
  }
});

// 可选：逾期图书数量
router.get('/overdue-loans', async (req, res) => {
  try {
    const now = new Date();
    const count = await prisma.loan.count({
      where: {
        returnDate: null,
        dueDate: {
          lt: now,  // 应还日期小于当前日期
        },
      },
    });
    res.json({ success: true, overdueLoans: count });
  } catch (error) {
    res.status(500).json({ success: false, error: '统计失败' });
  }
});

module.exports = router;