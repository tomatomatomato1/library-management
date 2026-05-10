const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { DEFAULT_FINE_RATE_PER_DAY, calculateOverdueSummary } = require('../src/lib/fines');

const prisma = new PrismaClient();

// 配置常量
const CONFIG = {
  PASSWORD_HASH_ROUNDS: 10,
  DEFAULT_PASSWORD: 'password123',
  ADMIN_PASSWORD: 'admin123',
  LIBRARIAN_PASSWORD: 'lib123',
  STUDENT_PASSWORD: 'student123',
};

// 预定义的测试账号
const TEST_ACCOUNTS = {
  admin: {
    email: 'admin@library.com',
    password: CONFIG.ADMIN_PASSWORD,
    name: '系统管理员',
  },
  librarians: [
    {
      employeeId: 'LIB001',
      password: CONFIG.LIBRARIAN_PASSWORD,
      name: '张明',
    },
    {
      employeeId: 'LIB002',
      password: CONFIG.LIBRARIAN_PASSWORD,
      name: '李华',
    },
    {
      employeeId: 'LIB003',
      password: CONFIG.LIBRARIAN_PASSWORD,
      name: '王芳',
    },
  ],
  students: [
    {
      studentId: 'S2021001',
      email: 'student1@university.edu',
      password: CONFIG.STUDENT_PASSWORD,
      name: '张三',
    },
    {
      studentId: 'S2021002',
      email: 'student2@university.edu',
      password: CONFIG.STUDENT_PASSWORD,
      name: '李四',
    },
    {
      studentId: 'S2021003',
      email: 'student3@university.edu',
      password: CONFIG.STUDENT_PASSWORD,
      name: '王五',
    },
    {
      studentId: 'S2021004',
      email: 'student4@university.edu',
      password: CONFIG.STUDENT_PASSWORD,
      name: '赵六',
    },
    {
      studentId: 'S2021005',
      email: 'student5@university.edu',
      password: CONFIG.STUDENT_PASSWORD,
      name: '孙七',
    },
  ],
};

// 图书数据
const BOOKS_DATA = [
  // Technology
  {
    title: 'The Pragmatic Programmer',
    author: 'David Thomas & Andrew Hunt',
    isbn: '978-0201616224',
    genre: 'Technology',
    description: 'A must-read for any programmer, filled with practical advice.',
    language: 'English',
  },
  {
    title: 'Clean Code',
    author: 'Robert C. Martin',
    isbn: '978-0132350884',
    genre: 'Technology',
    description: 'A handbook of agile software craftsmanship.',
    language: 'English',
  },
  {
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    isbn: '978-1449373320',
    genre: 'Technology',
    description: 'The big ideas behind reliable, scalable, and maintainable systems.',
    language: 'English',
  },
  {
    title: "You Don't Know JS",
    author: 'Kyle Simpson',
    isbn: '978-1491904244',
    genre: 'Technology',
    description: 'Deep dive into JavaScript language features.',
    language: 'English',
  },
  // Fiction
  {
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    isbn: '978-0743273565',
    genre: 'Fiction',
    description: 'A story of decadence and excess in Jazz Age America.',
    language: 'English',
  },
  {
    title: 'To Kill a Mockingbird',
    author: 'Harper Lee',
    isbn: '978-0446310789',
    genre: 'Fiction',
    description: 'A powerful story of racial injustice.',
    language: 'English',
  },
  {
    title: '1984',
    author: 'George Orwell',
    isbn: '978-0451524935',
    genre: 'Fiction',
    description: 'A dystopian novel about totalitarianism and surveillance.',
    language: 'English',
  },
  {
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    isbn: '978-0141439518',
    genre: 'Fiction',
    description: 'A classic romance novel about manners and marriage.',
    language: 'English',
  },
  // Science
  {
    title: 'A Brief History of Time',
    author: 'Stephen Hawking',
    isbn: '978-0553380163',
    genre: 'Science',
    description: 'From the Big Bang to black holes.',
    language: 'English',
  },
  {
    title: 'The Selfish Gene',
    author: 'Richard Dawkins',
    isbn: '978-0199291151',
    genre: 'Science',
    description: 'A gene-centered view of evolution.',
    language: 'English',
  },
  {
    title: 'Cosmos',
    author: 'Carl Sagan',
    isbn: '978-0345539434',
    genre: 'Science',
    description: 'A journey through space and time.',
    language: 'English',
  },
  {
    title: 'The Double Helix',
    author: 'James Watson',
    isbn: '978-0743216302',
    genre: 'Science',
    description: 'The story of the discovery of DNA structure.',
    language: 'English',
  },
  // History
  {
    title: 'Sapiens',
    author: 'Yuval Noah Harari',
    isbn: '978-0062316097',
    genre: 'History',
    description: 'A brief history of humankind.',
    language: 'English',
  },
  {
    title: 'Guns, Germs, and Steel',
    author: 'Jared Diamond',
    isbn: '978-0393317558',
    genre: 'History',
    description: 'The fates of human societies.',
    language: 'English',
  },
  {
    title: 'The Silk Roads',
    author: 'Peter Frankopan',
    isbn: '978-1101912379',
    genre: 'History',
    description: 'A new history of the world.',
    language: 'English',
  },
  // Management
  {
    title: 'The Lean Startup',
    author: 'Eric Ries',
    isbn: '978-0307887894',
    genre: 'Management',
    description: 'How today\'s entrepreneurs use continuous innovation.',
    language: 'English',
  },
  {
    title: 'Good to Great',
    author: 'Jim Collins',
    isbn: '978-0066620992',
    genre: 'Management',
    description: 'Why some companies make the leap.',
    language: 'English',
  },
  {
    title: 'Drive',
    author: 'Daniel H. Pink',
    isbn: '978-1594484803',
    genre: 'Management',
    description: 'The surprising truth about what motivates us.',
    language: 'English',
  },
  // Chinese Books
  {
    title: '三体',
    author: '刘慈欣',
    isbn: '978-7536692930',
    genre: 'Science Fiction',
    description: '中国科幻文学的里程碑之作。',
    language: 'Chinese',
  },
  {
    title: '活着',
    author: '余华',
    isbn: '978-7506365437',
    genre: 'Fiction',
    description: '讲述了一个人历尽世间沧桑和磨难的一生。',
    language: 'Chinese',
  },
];

// 系统配置
const SYSTEM_CONFIGS = [
  { key: 'FINE_RATE_PER_DAY', value: '0.50' },
  { key: 'MAX_BORROW_STUDENT', value: '3' },
  { key: 'LOAN_DURATION_DAYS', value: '30' },
  { key: 'MAX_RENEW_TIMES', value: '2' },
  { key: 'RENEW_DURATION_DAYS', value: '15' },
  { key: 'LIBRARY_NAME', value: '大学图书馆管理系统' },
  { key: 'LIBRARY_HOURS', value: '周一至周五 8:00-22:00，周末 9:00-21:00' },
  { key: 'CONTACT_EMAIL', value: 'library@university.edu' },
  { key: 'CONTACT_PHONE', value: '123-4567-8901' },
];

// 公告数据
const ANNOUNCEMENTS_DATA = [
  {
    title: '📢 图书馆开放时间调整通知',
    content: '自2026年6月1日起，图书馆开放时间调整为：周一至周五 8:00-22:00，周末 9:00-21:00。节假日开放时间另行通知。',
    isPinned: true,
    publishDate: new Date(),
    expiryDate: new Date(new Date().setMonth(new Date().getMonth() + 3)),
  },
  {
    title: '📚 新书上架通知',
    content: '本周新上架计算机科学类图书50册，文学类图书30册，欢迎借阅！',
    isPinned: false,
    publishDate: new Date(new Date().setDate(new Date().getDate() - 3)),
    expiryDate: new Date(new Date().setDate(new Date().getDate() + 27)),
  },
  {
    title: '🎉 世界读书日活动预告',
    content: '4月23日世界读书日，图书馆将举办"阅读马拉松"活动，参与者可获得精美礼品，欢迎报名！',
    isPinned: false,
    publishDate: new Date(new Date().setDate(new Date().getDate() - 10)),
    expiryDate: new Date(new Date().setDate(new Date().getDate() + 20)),
  },
  {
    title: '⚠️ 系统维护通知',
    content: '本周六 22:00 - 周日 02:00 进行系统升级维护，届时借还书服务可能短暂中断，敬请谅解。',
    isPinned: false,
    publishDate: new Date(new Date().setDate(new Date().getDate() - 1)),
    expiryDate: new Date(new Date().setDate(new Date().getDate() + 7)),
  },
  {
    title: '✨ 逾期图书归还提醒',
    content: '请各位读者及时归还已到期图书，避免产生逾期费用。如有疑问请联系图书馆服务台。',
    isPinned: false,
    publishDate: new Date(new Date().setDate(new Date().getDate() - 5)),
    expiryDate: new Date(new Date().setDate(new Date().getDate() + 25)),
  },
];

// 辅助函数
function generateBarcode(bookId, copyNumber) {
  return `BC-${String(bookId).padStart(6, '0')}-${String(copyNumber).padStart(3, '0')}`;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

const areaOptions = {
  'Technology': '科技图书区',
  'Fiction': '文学小说区',
  'Science': '自然科学区',
  'History': '历史地理区',
  'Management': '管理科学区',
  'Science Fiction': '科幻小说区',
};
const shelfOptions = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const floorOptions = [1, 2, 3, 4, 5];

// 主函数
async function main() {
  console.log('🚀 开始初始化数据库...\n');

  // ==================== 清空现有数据 ====================
  console.log('📦 清空现有数据...');
  
  const deleteOrder = [
    { name: '审计日志', model: prisma.auditLog },
    { name: '公告发布者', model: prisma.announcementPublisher },
    { name: '公告', model: prisma.announcement },
    { name: '消息', model: prisma.message },
    { name: '预约', model: prisma.hold },
    { name: '心愿单', model: prisma.wishlist },
    { name: '评分', model: prisma.rating },
    { name: '借阅记录', model: prisma.loan },
    { name: '副本', model: prisma.copy },
    { name: '图书', model: prisma.book },
    { name: '用户', model: prisma.user },
    { name: '配置', model: prisma.config },
  ];

  for (const op of deleteOrder) {
    try {
      await op.model.deleteMany();
      console.log(`  ✓ 清空${op.name}`);
    } catch (error) {
      // 忽略不存在的表
    }
  }

  console.log('\n✅ 数据清空完成\n');

    // 声明所有计数器（顶层）
    let bookCount = 0;
    let copyCount = 0;
    let actualLoanCount = 0;
    let ratingCount = 0;
    let holdCount = 0;
    let wishlistCount = 0;

  // ==================== 创建用户 ====================
  console.log('👥 创建用户账号...');

  // 创建管理员
  const adminPasswordHash = await bcrypt.hash(TEST_ACCOUNTS.admin.password, CONFIG.PASSWORD_HASH_ROUNDS);
  const admin = await prisma.user.create({
    data: {
      name: TEST_ACCOUNTS.admin.name,
      email: TEST_ACCOUNTS.admin.email,
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
    },
  });
  console.log(`  ✓ 管理员: ${admin.email} / ${TEST_ACCOUNTS.admin.password}`);

  // 创建学生
  const students = [];
  const studentPasswordHash = await bcrypt.hash(CONFIG.STUDENT_PASSWORD, CONFIG.PASSWORD_HASH_ROUNDS);
  
  for (const studentData of TEST_ACCOUNTS.students) {
    const student = await prisma.user.create({
      data: {
        name: studentData.name,
        email: studentData.email,
        studentId: studentData.studentId,
        passwordHash: studentPasswordHash,
        role: 'STUDENT',
      },
    });
    students.push(student);
    console.log(`  ✓ 学生: ${student.studentId} - ${student.name}`);
  }

  // 创建馆员（使用 User 表，role='LIBRARIAN'，增加 employeeId）
  const librarianPasswordHash = await bcrypt.hash(CONFIG.LIBRARIAN_PASSWORD, CONFIG.PASSWORD_HASH_ROUNDS);
  const librarians = [];

  for (const librarianData of TEST_ACCOUNTS.librarians) {
    const librarian = await prisma.user.create({
      data: {
        email: `${librarianData.employeeId.toLowerCase()}@library.com`,
        name: librarianData.name,
        employeeId: librarianData.employeeId,
        passwordHash: librarianPasswordHash,
        role: 'LIBRARIAN',
      },
    });
    librarians.push(librarian);
    console.log(`  ✓ 馆员: ${librarian.employeeId} - ${librarian.name}`);
  }

  console.log('\n✅ 用户创建完成\n');

  // ==================== 创建系统配置 ====================
  console.log('⚙️  创建系统配置...');
  
  for (const config of SYSTEM_CONFIGS) {
    await prisma.config.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: { key: config.key, value: config.value },
    });
    console.log(`  ✓ ${config.key} = ${config.value}`);
  }

  console.log('\n✅ 系统配置创建完成\n');

  // ==================== 创建图书和副本 ====================
  console.log('📚 创建图书和副本...');

  for (const bookData of BOOKS_DATA) {
    const book = await prisma.book.create({
      data: {
        title: bookData.title,
        author: bookData.author,
        isbn: bookData.isbn,
        genre: bookData.genre,
        description: bookData.description,
        language: bookData.language,
      },
    });

    // 每本书 1-5 个副本
    const numberOfCopies = getRandomInt(1, 5);
    const floor = getRandomElement(floorOptions);
    const area = areaOptions[bookData.genre] || '综合图书区';
    const shelf = getRandomElement(shelfOptions);

    for (let i = 0; i < numberOfCopies; i++) {
      const status = Math.random() > 0.3 ? 'AVAILABLE' : 'BORROWED';
      
      await prisma.copy.create({
        data: {
          bookId: book.id,
          barcode: generateBarcode(book.id, i + 1),
          floor: floor,
          libraryArea: area,
          shelfNo: shelf,
          shelfLevel: getRandomInt(1, 5),
          status: status,
        },
      });
      copyCount++;
    }
    bookCount++;
  }

  console.log(`  ✓ 创建了 ${bookCount} 本图书，共 ${copyCount} 个副本`);
  console.log('\n✅ 图书创建完成\n');

  // ==================== 创建示例借阅记录 ====================
  console.log('📋 创建示例借阅记录...');
  
  if (students.length > 0) {
    const allCopies = await prisma.copy.findMany({
      where: { status: 'AVAILABLE' },
      take: 10,
    });

    const loanCount = Math.min(5, allCopies.length);
    
    for (let i = 0; i < loanCount; i++) {
      const student = students[i % students.length];
      const copy = allCopies[i];
      
      const checkoutDate = new Date();
      checkoutDate.setDate(checkoutDate.getDate() - getRandomInt(1, 60));
      
      const dueDate = new Date(checkoutDate);
      dueDate.setDate(dueDate.getDate() + 30);
      
      const isReturned = Math.random() > 0.5;
      const returnDate = isReturned ? new Date(dueDate.getTime() + getRandomInt(-5, 10) * 24 * 60 * 60 * 1000) : null;
      
      const fineAmount = returnDate && returnDate > dueDate
        ? Math.ceil((returnDate - dueDate) / (1000 * 60 * 60 * 24)) * 0.5
        : 0;

      await prisma.loan.create({
        data: {
          copyId: copy.id,
          userId: student.id,
          checkoutDate: checkoutDate,
          dueDate: dueDate,
          returnDate: returnDate,
          fineAmount: fineAmount,
          finePaid: fineAmount > 0 && Math.random() > 0.5,
          renewCount: getRandomInt(0, 2),
        },
      });

      await prisma.copy.update({
        where: { id: copy.id },
        data: { status: isReturned ? 'AVAILABLE' : 'BORROWED' },
      });
      actualLoanCount++;
    }
    
    console.log(`  ✓ 创建了 ${actualLoanCount} 条借阅记录`);
  }

  console.log('\n✅ 借阅记录创建完成\n');

  // ==================== 创建示例评分（含 review 字段）====================
  console.log('⭐ 创建示例评分...');
  
  const allBooks = await prisma.book.findMany({ take: 10 });
  
  for (const book of allBooks) {
    if (students.length > 0 && Math.random() > 0.5) {
      const ratingStudents = students.slice(0, getRandomInt(1, 3));
      
      for (const student of ratingStudents) {
        try {
          await prisma.rating.create({
            data: {
              bookId: book.id,
              userId: student.id,
              stars: getRandomInt(3, 5),
              review: `这本书《${book.title}》非常精彩，强烈推荐！`,
            },
          });
          ratingCount++;
        } catch (error) {
          // 忽略重复评分
        }
      }
    }
  }
  
  console.log(`  ✓ 创建了 ${ratingCount} 条评分`);

  console.log('\n✅ 评分创建完成\n');

  // ==================== 创建预约 (Hold) ====================
  console.log('📌 创建预约记录...');

  const booksForHold = await prisma.book.findMany({ take: 8 });
  
  for (let i = 0; i < booksForHold.length && i < students.length * 2; i++) {
    const book = booksForHold[i];
    const student = students[i % students.length];
    const statuses = ['WAITING', 'READY', 'CANCELLED'];
    const status = statuses[getRandomInt(0, 2)];
    const createdAt = new Date(new Date().setDate(new Date().getDate() - getRandomInt(1, 15)));
    
    try {
      await prisma.hold.create({
        data: {
          bookId: book.id,
          userId: student.id,
          status: status,
          createdAt: createdAt,
        },
      });
      holdCount++;
    } catch (error) {
      // 忽略重复预约
    }
  }
  
  console.log(`  ✓ 创建了 ${holdCount} 条预约记录`);

  console.log('\n✅ 预约创建完成\n');

  // ==================== 创建心愿单 (Wishlist) ====================
  console.log('❤️  创建心愿单记录...');

  const booksForWishlist = await prisma.book.findMany({ skip: 5, take: 10 });
  
  for (let i = 0; i < booksForWishlist.length && i < students.length * 2; i++) {
    const book = booksForWishlist[i];
    const student = students[i % students.length];
    
    try {
      await prisma.wishlist.create({
        data: {
          bookId: book.id,
          userId: student.id,
          createdAt: new Date(new Date().setDate(new Date().getDate() - getRandomInt(1, 30))),
        },
      });
      wishlistCount++;
    } catch (error) {
      // 忽略重复心愿单
    }
  }
  
  console.log(`  ✓ 创建了 ${wishlistCount} 条心愿单记录`);

  console.log('\n✅ 心愿单创建完成\n');

  // ==================== 创建公告 (Announcement) ====================
  console.log('📢 创建公告...');
  
  for (const announcementData of ANNOUNCEMENTS_DATA) {
    const announcement = await prisma.announcement.create({
      data: {
        title: announcementData.title,
        content: announcementData.content,
        isPinned: announcementData.isPinned,
        publishDate: announcementData.publishDate,
        expiryDate: announcementData.expiryDate,
      },
    });
    
    // 为每个公告添加发布者（管理员）
    await prisma.announcementPublisher.create({
      data: {
        userId: admin.id,
        announcementId: announcement.id,
      },
    });
  }
  
  console.log(`  ✓ 创建了 ${ANNOUNCEMENTS_DATA.length} 条公告`);

  console.log('\n✅ 公告创建完成\n');

  // ==================== 创建示例消息 ====================
  console.log('💬 创建示例消息...');
  
  if (students.length > 0 && librarians.length > 0) {
    for (let i = 0; i < 3; i++) {
      const student = students[i % students.length];
      const librarian = librarians[i % librarians.length];
      
      await prisma.message.create({
        data: {
          senderId: student.id,
          receiverId: librarian.id,
          content: `请问《${allBooks[i]?.title || '图书'}》还有副本吗？我想借阅。`,
          isRead: Math.random() > 0.5,
        },
      });
    }
    console.log('  ✓ 创建了 3 条示例消息');
  }

  console.log('\n✅ 消息创建完成\n');

  // ==================== 创建审计日志 ====================
  console.log('📝 创建审计日志...');
  
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'SYSTEM_INIT',
      entity: 'System',
      detail: '系统初始化完成，种子数据已加载（包含公告、预约、心愿单）',
    },
  });
  
  console.log('  ✓ 审计日志创建完成');

  // ==================== 输出统计信息 ====================
  console.log('\n' + '='.repeat(60));
  console.log('🎉 数据库初始化完成！');
  console.log('='.repeat(60));
  
  console.log('\n📋 测试账号信息：');
  console.log('-'.repeat(40));
  
  console.log(`\n👑 管理员: ${TEST_ACCOUNTS.admin.email} / ${TEST_ACCOUNTS.admin.password}`);
  
  console.log('\n📚 馆员 (使用工号登录):');
  TEST_ACCOUNTS.librarians.forEach((lib, idx) => {
    console.log(`   ${idx + 1}. 工号: ${lib.employeeId} / 密码: ${lib.password} (${lib.name})`);
  });
  
  console.log('\n🎓 学生 (使用邮箱登录):');
  TEST_ACCOUNTS.students.slice(0, 3).forEach((student, idx) => {
    console.log(`   ${idx + 1}. 学号: ${student.studentId} / 密码: ${student.password} (${student.name})`);
  });
  
  console.log('\n📊 统计：');
  console.log(`   图书: ${bookCount} 本`);
  console.log(`   副本: ${copyCount} 个`);
  console.log(`   借阅: ${actualLoanCount || 0} 条`);
  console.log(`   评分: ${ratingCount} 条`);
  console.log(`   预约: ${holdCount} 条`);
  console.log(`   心愿单: ${wishlistCount} 条`);
  console.log(`   公告: ${ANNOUNCEMENTS_DATA.length} 条`);
  console.log(`   消息: 3 条`);
  console.log(`   用户: 1 管理员 + ${TEST_ACCOUNTS.librarians.length} 馆员 + ${students.length} 学生`);
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// 执行
main()
  .catch((e) => {
    console.error('\n❌ 种子数据初始化失败:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });