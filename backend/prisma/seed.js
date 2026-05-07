const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  // 只清空书籍相关的记录（注意顺序：先删除依赖表）
  await prisma.loan.deleteMany();
  await prisma.copy.deleteMany();
  await prisma.hold.deleteMany();
  await prisma.wishlist.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.book.deleteMany();
  await prisma.config.deleteMany(); 

  
  // 图书数据
  const booksData = [
    { title: 'The Pragmatic Programmer', author: 'David Thomas', genre: 'Technology' },
    { title: 'Clean Code', author: 'Robert C. Martin', genre: 'Technology' },
    { title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', genre: 'Technology' },
    { title: "You Don't Know JS", author: 'Kyle Simpson', genre: 'Technology' },
    { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', genre: 'Fiction' },
    { title: 'To Kill a Mockingbird', author: 'Harper Lee', genre: 'Fiction' },
    { title: '1984', author: 'George Orwell', genre: 'Fiction' },
    { title: 'Pride and Prejudice', author: 'Jane Austen', genre: 'Fiction' },
    { title: 'A Brief History of Time', author: 'Stephen Hawking', genre: 'Science' },
    { title: 'The Selfish Gene', author: 'Richard Dawkins', genre: 'Science' },
    { title: 'Cosmos', author: 'Carl Sagan', genre: 'Science' },
    { title: 'The Double Helix', author: 'James Watson', genre: 'Science' },
    { title: 'Sapiens', author: 'Yuval Noah Harari', genre: 'History' },
    { title: 'Guns, Germs, and Steel', author: 'Jared Diamond', genre: 'History' },
    { title: 'The Silk Roads', author: 'Peter Frankopan', genre: 'History' },
    { title: "A People's History of the United States", author: 'Howard Zinn', genre: 'History' },
    { title: 'The Lean Startup', author: 'Eric Ries', genre: 'Management' },
    { title: 'Good to Great', author: 'Jim Collins', genre: 'Management' },
    { title: 'Drive', author: 'Daniel H. Pink', genre: 'Management' },
    { title: 'The Five Dysfunctions of a Team', author: 'Patrick Lencioni', genre: 'Management' },
  ];

  const locationByGenre = {
    Technology: { floor: 3, libraryArea: 'Tech Stack', shelfPrefix: 'T' },
    Fiction: { floor: 2, libraryArea: 'Literature Hall', shelfPrefix: 'F' },
    Science: { floor: 4, libraryArea: 'Science Archive', shelfPrefix: 'S' },
    History: { floor: 5, libraryArea: 'History Collection', shelfPrefix: 'H' },
    Management: { floor: 6, libraryArea: 'Business Corner', shelfPrefix: 'M' },
  };

  for (const [index, book] of booksData.entries()) {
    const locationMeta = locationByGenre[book.genre];
    const shelfNo = `${locationMeta.shelfPrefix}-${String((index % 8) + 1).padStart(2, '0')}`;
    
    // 创建图书
    const createdBook = await prisma.book.create({
      data: {
        title: book.title,
        author: book.author,
        isbn: `ISBN-${Math.random().toString(36).substring(2, 10)}`,
        genre: book.genre,
        description: `${book.title} is a great read.`,
        language: 'English',
      },
    });

    // 为每本书创建3个副本
    for (let copyNum = 1; copyNum <= 3; copyNum++) {
      const barcode = `${createdBook.isbn.substring(0, 8)}-${copyNum.toString().padStart(2, '0')}`;
      const shelfLevel = copyNum;
      
      // 设置部分副本为已借出（用于测试）
      let status = 'AVAILABLE';
      if (copyNum === 2 && book.title === 'Clean Code') {
        status = 'BORROWED';
      }
      if (copyNum === 3 && book.title === '1984') {
        status = 'BORROWED';
      }

      await prisma.copy.create({
        data: {
          bookId: createdBook.id,
          barcode: barcode,
          floor: locationMeta.floor,
          libraryArea: locationMeta.libraryArea,
          shelfNo: shelfNo,
          shelfLevel: shelfLevel,
          status: status,
        },
      });
      
      console.log(`创建副本: ${book.title} - 条码 ${barcode} - 状态 ${status}`);
    }
  }

  // 添加配置项
await prisma.config.upsert({
  where: { key: 'FINE_RATE_PER_DAY' },
  update: {}, // 如果已存在，不做任何更新（或可改为 update: { value: '0.5' }）
  create: {
    key: 'FINE_RATE_PER_DAY',
    value: '0.5',
  },
});

  console.log('Seed data inserted successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });