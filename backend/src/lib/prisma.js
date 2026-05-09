const { PrismaClient } = require('@prisma/client');

// 根据环境配置日志级别
const logLevels = process.env.NODE_ENV === 'development' 
  ? ['query', 'info', 'warn', 'error'] 
  : ['error'];

const prisma = new PrismaClient({
  log: logLevels,
});

module.exports = prisma;