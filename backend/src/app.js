const express = require('express');
const cors = require('cors');

// 导入所有路由
const readersRouter = require('./routes/readers');
const authRouter = require('./routes/auth');
const loansRouter = require('./routes/loans');
const booksRouter = require('./routes/books');
const announcementsRouter = require('./routes/announcements');
const messagesRouter = require('./routes/messages');
const ratingsRouter = require('./routes/ratings');
const readerBorrowRouter = require('./routes/reader-borrow');
const librarianSearchBorrowHistory = require('./routes/LibrarianSearchBorrowHistory');
const configRouter = require('./routes/config');

const app = express();

// CORS 配置（使用组长的配置，支持多个前端地址）
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json());

// 健康检查（使用组长的详细版本）
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Library API is running',
    timestamp: new Date().toISOString()
  });
});

// API 路由挂载（整合两个版本）
app.use('/api/readers', readersRouter);
app.use('/api/auth', authRouter);
app.use('/api/books', booksRouter);
app.use('/api/loans', loansRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/messages', messagesRouter);                                    // 你的：消息路由
app.use('/api/ratings', ratingsRouter);                                      // 你的：评分路由
app.use('/api/reader', readerBorrowRouter);                                  // 你的：读者借阅路由
app.use('/api/librarian/search-history', librarianSearchBorrowHistory);      // 你的：馆员搜索历史
app.use('/api/config', configRouter);                                        // 系统配置

// 404 处理（使用组长的详细版本）
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: `Route ${req.method} ${req.path} not found` 
  });
});

// 全局错误处理（使用组长的完整版本）
app.use((error, req, res, next) => {
  // Prisma 唯一约束冲突
  if (error && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.join(', ')
      : 'field';

    return res.status(409).json({
      success: false,
      message: `A record with that ${target} already exists.`,
      error: error.code
    });
  }

  // Prisma 记录不存在
  if (error && error.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found',
      error: error.code
    });
  }

  // JWT 错误
  if (error && error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }

  if (error && error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
    });
  }

  console.error('Unhandled error:', error);

  res.status(error?.statusCode || 500).json({
    success: false,
    message: error?.message || 'Internal server error',
  });
});

module.exports = app;