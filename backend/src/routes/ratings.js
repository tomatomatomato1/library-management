const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function writeAuditLog(data) {
  try {
    await prisma.auditLog.create({ data });
  } catch (error) {
    console.warn('Failed to write audit log:', error.message);
  }
}

async function calculateAverageRating(bookId) {
  const result = await prisma.rating.aggregate({
    where: { bookId },
    _avg: { stars: true },
    _count: { stars: true }
  });
  const avg = result._avg.stars;
  return {
    averageRating: avg ? Math.round(avg * 10) / 10 : 0,
    totalRatings: result._count.stars
  };
}

router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { bookId, stars, review } = req.body;

    if (!bookId || !stars) {
      return res.status(400).json({ success: false, message: '书ID和评分是必填项' });
    }

    if (stars < 1 || stars > 5) {
      return res.status(400).json({ success: false, message: '评分必须在1-5之间' });
    }

    const book = await prisma.book.findUnique({ where: { id: parseInt(bookId) } });
    if (!book) {
      return res.status(404).json({ success: false, message: '书籍不存在' });
    }

    const hasReturnedBook = await prisma.loan.findFirst({
      where: {
        userId,
        copy: { bookId: parseInt(bookId) },
        returnDate: { not: null }
      }
    });

    if (!hasReturnedBook) {
      return res.status(403).json({ success: false, message: '只有已阅读的书籍才能评分' });
    }

    const existingRating = await prisma.rating.findUnique({
      where: {
        bookId_userId: {
          bookId: parseInt(bookId),
          userId
        }
      }
    });

    let rating;
    if (existingRating) {
      rating = await prisma.rating.update({
        where: { id: existingRating.id },
        data: {
          stars: parseInt(stars),
          review: review || null
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, studentId: true }
          }
        }
      });
    } else {
      rating = await prisma.rating.create({
        data: {
          bookId: parseInt(bookId),
          userId,
          stars: parseInt(stars),
          review: review || null
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, studentId: true }
          }
        }
      });
    }

    const avgRating = await calculateAverageRating(parseInt(bookId));

    writeAuditLog({
      userId,
      action: existingRating ? 'UPDATE_RATING' : 'RATING_BOOK',
      entity: 'Rating',
      entityId: rating.id,
      detail: `用户 ${req.user.email} 对图书 ${bookId} 评分 ${stars} 星`,
    });

    res.json({
      success: true,
      message: existingRating ? '评价已更新' : '评价已提交',
      rating,
      averageRating: avgRating.averageRating,
      totalRatings: avgRating.totalRatings
    });
  } catch (error) {
    console.error('Rating error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/book/:bookId', async (req, res) => {
  try {
    const bookId = parseInt(req.params.bookId);
    const ratings = await prisma.rating.findMany({
      where: { bookId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, studentId: true }
        }
      }
    });

    const avgRating = await calculateAverageRating(bookId);

    res.json({
      success: true,
      ratings,
      averageRating: avgRating.averageRating,
      totalRatings: avgRating.totalRatings
    });
  } catch (error) {
    console.error('Get ratings error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/user/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const ratings = await prisma.rating.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        book: {
          select: { id: true, title: true, author: true, isbn: true }
        }
      }
    });

    res.json({ success: true, ratings });
  } catch (error) {
    console.error('Get user ratings error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/book/:bookId/user/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const bookId = parseInt(req.params.bookId);

    const rating = await prisma.rating.findUnique({
      where: {
        bookId_userId: { bookId, userId }
      }
    });

    res.json({ success: true, rating });
  } catch (error) {
    console.error('Get user rating error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/:ratingId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const ratingId = parseInt(req.params.ratingId);

    const rating = await prisma.rating.findUnique({ where: { id: ratingId } });
    if (!rating) {
      return res.status(404).json({ success: false, message: '评价不存在' });
    }

    if (rating.userId !== userId) {
      return res.status(403).json({ success: false, message: '无权删除此评价' });
    }

    await prisma.rating.delete({ where: { id: ratingId } });

    writeAuditLog({
      userId,
      action: 'DELETE_RATING',
      entity: 'Rating',
      entityId: ratingId,
      detail: `用户 ${req.user.email} 删除了对图书 ${rating.bookId} 的评分`,
    });

    const avgRating = await calculateAverageRating(rating.bookId);

    res.json({
      success: true,
      message: '评价已删除',
      averageRating: avgRating.averageRating,
      totalRatings: avgRating.totalRatings
    });
  } catch (error) {
    console.error('Delete rating error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;