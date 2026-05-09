const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createOverdueLoan() {
  try {
    // 1. 找一个用户
    const user = await prisma.user.findFirst();
    if (!user) {
      console.log('❌ 没有找到用户');
      return;
    }
    console.log('✅ 找到用户:', user.name || user.email);

    // 2. 找一本可借的书
    const copy = await prisma.copy.findFirst({ 
      where: { status: 'AVAILABLE' },
      include: { book: true }
    });
    
    if (!copy) {
      console.log('❌ 没有找到可借的图书副本');
      return;
    }
    console.log('✅ 找到可借图书:', copy.book.title, '条码:', copy.barcode);
    
    // 3. 创建逾期借阅记录（没有 status 字段）
    const checkoutDate = new Date('2026-04-28');  // 借出日期
    const dueDate = new Date('2026-05-01');       // 应还日期（已过期）
    
    const overdueLoan = await prisma.loan.create({
      data: {
        userId: user.id,
        copyId: copy.id,
        checkoutDate: checkoutDate,
        dueDate: dueDate,
        // 不设置 returnDate，表示未归还
        // 不设置 status，表中没有这个字段
      }
    });
    
    // 4. 更新副本状态为已借出
    await prisma.copy.update({
      where: { id: copy.id },
      data: { status: 'BORROWED' }
    });
    
    console.log('\n✅ 创建逾期借阅记录成功!');
    console.log('借阅ID:', overdueLoan.id);
    console.log('用户:', user.name || user.email);
    console.log('图书:', copy.book.title);
    console.log('借出日期:', checkoutDate.toLocaleDateString());
    console.log('应还日期:', dueDate.toLocaleDateString());
    console.log('当前日期:', new Date().toLocaleDateString());
    
    const overdueDays = Math.floor((new Date() - dueDate) / (1000 * 60 * 60 * 24));
    console.log('逾期天数:', overdueDays > 0 ? overdueDays : 0, '天');
    
  } catch (error) {
    console.error('❌ 创建失败:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createOverdueLoan();