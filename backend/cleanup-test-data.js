/**
 * 清理图书到期提醒相关测试数据
 * 运行: node cleanup-test-data.js
 */

require('dotenv').config();

const prisma = require('./src/lib/prisma');

const TEST_USER_EMAILS = ['hyfceshi@163.com', 'test-reminder@library.com'];
const TEST_STUDENT_IDS = ['TEST2026001', '123std'];

async function cleanupReminderTestData() {
  console.log('\n🧹 开始清理提醒功能测试数据...\n');

  const testUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { in: TEST_USER_EMAILS } },
        { studentId: { in: TEST_STUDENT_IDS } },
      ],
    },
    select: { id: true, email: true, name: true, studentId: true },
  });
  const testUserIds = testUsers.map((user) => user.id);

  const testLoans = await prisma.loan.findMany({
    where: {
      OR: [
        { barcode: { startsWith: 'LN-TEST-' } },
        ...(testUserIds.length ? [{ userId: { in: testUserIds } }] : []),
      ],
    },
    select: { id: true, barcode: true },
  });
  const testLoanIds = testLoans.map((loan) => loan.id);

  const reminderLogs = await prisma.reminderLog.deleteMany({
    where: {
      OR: [
        ...(testLoanIds.length ? [{ loanId: { in: testLoanIds } }] : []),
        ...(testUserIds.length ? [{ userId: { in: testUserIds } }] : []),
      ],
    },
  });
  console.log(`✓ 删除提醒日志: ${reminderLogs.count} 条`);

  const dueReminderLogs = await prisma.dueReminderLog.deleteMany({
    where: {
      OR: [
        ...(testLoanIds.length ? [{ loanId: { in: testLoanIds } }] : []),
        ...(testUserIds.length ? [{ userId: { in: testUserIds } }] : []),
      ],
    },
  });
  console.log(`✓ 删除到期提醒记录: ${dueReminderLogs.count} 条`);

  if (testUserIds.length > 0) {
    const messages = await prisma.message.deleteMany({
      where: {
        OR: [
          { senderId: { in: testUserIds } },
          { receiverId: { in: testUserIds } },
        ],
      },
    });
    console.log(`✓ 删除站内消息: ${messages.count} 条`);
  }

  const loans = await prisma.loan.deleteMany({
    where: {
      OR: [
        { barcode: { startsWith: 'LN-TEST-' } },
        ...(testUserIds.length ? [{ userId: { in: testUserIds } }] : []),
      ],
    },
  });
  console.log(`✓ 删除借阅记录: ${loans.count} 条`);

  const copies = await prisma.copy.deleteMany({
    where: { barcode: { startsWith: 'TEST-COPY-' } },
  });
  console.log(`✓ 删除图书副本: ${copies.count} 条`);

  const books = await prisma.book.deleteMany({
    where: { isbn: { startsWith: 'TEST-ISBN-' } },
  });
  console.log(`✓ 删除测试图书: ${books.count} 条`);

  const users = await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { in: TEST_USER_EMAILS } },
        { studentId: { in: TEST_STUDENT_IDS } },
      ],
    },
  });
  console.log(`✓ 删除测试用户: ${users.count} 条`);

  console.log('\n✅ 测试数据清理完成\n');
}

module.exports = { cleanupReminderTestData };

if (require.main === module) {
  cleanupReminderTestData()
    .catch((error) => {
      console.error('\n❌ 清理失败:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
