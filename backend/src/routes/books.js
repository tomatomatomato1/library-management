const express = require('express');

const prisma = require('../lib/prisma');
const { requireAuth, requireLibrarian } = require('../middleware/auth');

const router = express.Router();
const LOOKUP_TIMEOUT_MS = 7000;

const BOOK_SELECT = {
  id: true,
  title: true,
  author: true,
  isbn: true,
  genre: true,
  description: true,
  language: true,
  createdAt: true,
  updatedAt: true,
};

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIsbn(value) {
  const normalizedCharacters = normalizeText(value)
    .normalize('NFKC')
    .toUpperCase()
    .replace(/^ISBN(?:-1[03])?[：:]?/, '');
  return normalizedCharacters.replace(/[^0-9X]/g, '');
}

function isLookupIsbn(value) {
  return /^(?:\d{10}|\d{9}X|\d{13})$/.test(value);
}

function inferLanguageFromIsbn(isbn) {
  if (/^97[89][01]/.test(isbn) || /^[01]/.test(isbn)) {
    return 'English';
  }

  if (/^9787/.test(isbn) || /^7/.test(isbn)) {
    return 'Chinese';
  }

  return '';
}

function normalizeLanguageName(value, fallback = 'English') {
  const language = normalizeText(value).toLowerCase();

  if (!language) {
    return fallback;
  }

  const languageMap = {
    en: 'English',
    eng: 'English',
    english: 'English',
    zh: 'Chinese',
    zho: 'Chinese',
    chi: 'Chinese',
    cn: 'Chinese',
    chinese: 'Chinese',
    ja: 'Japanese',
    jpn: 'Japanese',
    japanese: 'Japanese',
    fr: 'French',
    fre: 'French',
    fra: 'French',
    french: 'French',
    de: 'German',
    deu: 'German',
    ger: 'German',
    german: 'German',
    es: 'Spanish',
    spa: 'Spanish',
    spanish: 'Spanish',
  };

  return languageMap[language] || value;
}

function pickFirstText(values) {
  if (!Array.isArray(values)) {
    return '';
  }
  return normalizeText(values.find((value) => normalizeText(value)));
}

function extractDescription(description) {
  if (typeof description === 'string') {
    return normalizeText(description);
  }
  if (description && typeof description.value === 'string') {
    return normalizeText(description.value);
  }
  return '';
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Remote lookup failed with status ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (response.status === 404) {
      return '';
    }

    if (!response.ok) {
      throw new Error(`Remote lookup failed with status ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function decodeHtmlEntities(value) {
  return normalizeText(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value) {
  return decodeHtmlEntities(
    normalizeText(value)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  );
}

function matchFirst(value, pattern) {
  const match = value.match(pattern);
  return match ? decodeHtmlEntities(match[1]) : '';
}

function joinNames(items) {
  if (!Array.isArray(items)) {
    return '';
  }
  return items
    .map((item) => normalizeText(item?.name || item))
    .filter(Boolean)
    .join(', ');
}

function joinTexts(items) {
  if (!Array.isArray(items)) {
    return '';
  }
  return items
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join(', ');
}

async function fetchOpenLibraryAuthorName(authorReference) {
  const authorKey = authorReference?.author?.key || authorReference?.key;

  if (!authorKey) {
    return '';
  }

  const author = await fetchJson(`https://openlibrary.org${authorKey}.json`);
  return normalizeText(author?.name);
}

async function lookupOpenLibraryBook(isbn) {
  const book = await fetchJson(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);

  if (!book) {
    return null;
  }

  const authorNames = await Promise.all(
    (book.authors || []).slice(0, 3).map(async (author) => {
      try {
        return await fetchOpenLibraryAuthorName(author);
      } catch (error) {
        return '';
      }
    })
  );
  const languageCode = normalizeText(book.languages?.[0]?.key).split('/').pop();

  return {
    title: normalizeText(book.title),
    author: authorNames.filter(Boolean).join(', ') || normalizeText(book.by_statement),
    isbn,
    genre: pickFirstText(book.subjects) || 'Uncategorized',
    description: extractDescription(book.description),
    language: normalizeLanguageName(languageCode, inferLanguageFromIsbn(isbn) || 'English'),
  };
}

async function lookupOpenLibraryBooksApi(isbn) {
  const params = new URLSearchParams({
    bibkeys: `ISBN:${isbn}`,
    jscmd: 'data',
    format: 'json',
  });
  const result = await fetchJson(`https://openlibrary.org/api/books?${params}`);
  const book = result?.[`ISBN:${isbn}`];

  if (!book) {
    return null;
  }

  return {
    title: normalizeText(book.title),
    author: joinNames(book.authors),
    isbn,
    genre: pickFirstText(book.subjects?.map((subject) => subject?.name)) || 'Uncategorized',
    description: normalizeText(book.notes) || normalizeText(book.excerpts?.[0]?.text),
    language: inferLanguageFromIsbn(isbn) || 'English',
  };
}

async function lookupOpenLibrarySearch(isbn) {
  const params = new URLSearchParams({
    isbn,
    fields: 'title,author_name,subject,language,isbn',
    limit: '1',
  });
  const result = await fetchJson(`https://openlibrary.org/search.json?${params}`);
  const book = result?.docs?.[0];

  if (!book) {
    return null;
  }

  return {
    title: normalizeText(book.title),
    author: joinTexts(book.author_name),
    isbn,
    genre: pickFirstText(book.subject) || 'Uncategorized',
    description: '',
    language: normalizeLanguageName(book.language?.[0], inferLanguageFromIsbn(isbn) || 'English'),
  };
}

async function lookupGoogleBooksBook(isbn) {
  const params = new URLSearchParams({
    q: `isbn:${isbn}`,
    maxResults: '1',
  });
  const result = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params}`);
  const volume = result?.items?.[0]?.volumeInfo;

  if (!volume) {
    return null;
  }

  return {
    title: normalizeText(volume.title),
    author: Array.isArray(volume.authors) ? volume.authors.join(', ') : '',
    isbn,
    genre: pickFirstText(volume.categories) || 'Uncategorized',
    description: normalizeText(volume.description),
    language: normalizeLanguageName(volume.language, inferLanguageFromIsbn(isbn) || 'English'),
  };
}

function parseDoubanInfoField(html, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<span\\s+class=["']pl["']>\\s*${escapedLabel}\\s*:?\\s*<\\/span>\\s*:?\\s*([\\s\\S]*?)<br\\s*\\/?\\s*>`,
    'i'
  );
  return stripHtml(matchFirst(html, pattern));
}

function parseDoubanAuthor(html) {
  const authorBlock = matchFirst(
    html,
    /<span>\s*<span\s+class=["']pl["']>\s*作者\s*<\/span>\s*:?\s*([\s\S]*?)<\/span>\s*<br\s*\/?\s*>/i
  );
  return stripHtml(authorBlock).replace(/\s*\/\s*/g, ', ');
}

function parseDoubanDescription(html) {
  const fullDescription = matchFirst(
    html,
    /<span\s+class=["']all hidden["']>[\s\S]*?<div\s+class=["']intro["']>([\s\S]*?)<\/div>/i
  );
  const shortDescription = matchFirst(
    html,
    /<span\s+class=["']short["']>[\s\S]*?<div\s+class=["']intro["']>([\s\S]*?)<\/div>/i
  );
  return stripHtml(fullDescription || shortDescription);
}

async function lookupDoubanBook(isbn) {
  const html = await fetchText(`https://book.douban.com/isbn/${encodeURIComponent(isbn)}/`);

  if (!html) {
    return null;
  }

  const jsonLd = matchFirst(
    html,
    /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i
  );
  let structuredBook = null;

  if (jsonLd) {
    try {
      structuredBook = JSON.parse(jsonLd);
    } catch (error) {
      structuredBook = null;
    }
  }

  const title =
    normalizeText(structuredBook?.name) ||
    matchFirst(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
    matchFirst(html, /<title>\s*([\s\S]*?)\s*\(豆瓣\)\s*<\/title>/i);

  if (!title) {
    return null;
  }

  const author =
    joinNames(structuredBook?.author) ||
    matchFirst(html, /<meta\s+property=["']book:author["']\s+content=["']([^"']+)["']/i) ||
    parseDoubanAuthor(html);
  const publisher = parseDoubanInfoField(html, '出版社');
  const publishYear = parseDoubanInfoField(html, '出版年');
  const language = parseDoubanInfoField(html, '语言');
  const inferredLanguage = inferLanguageFromIsbn(isbn);
  const displayLanguage = normalizeLanguageName(language, inferredLanguage || 'Chinese');
  const defaultGenre = displayLanguage === 'Chinese' ? '中文图书' : 'English Book';
  const publicationLabel = displayLanguage === 'Chinese' ? '出版' : 'Publication';
  const description =
    parseDoubanDescription(html) ||
    matchFirst(html, /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
    matchFirst(html, /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);

  return {
    title,
    author,
    isbn,
    genre: defaultGenre,
    description: [
      publisher && `${publicationLabel}：${publisher}`,
      publishYear && `${displayLanguage === 'Chinese' ? '出版年' : 'Publication year'}：${publishYear}`,
      description,
    ].filter(Boolean).join('\n\n'),
    language: displayLanguage,
  };
}

async function lookupBookByIsbn(isbn) {
  const providers = [
    lookupDoubanBook,
    lookupOpenLibraryBooksApi,
    lookupOpenLibrarySearch,
    lookupOpenLibraryBook,
    lookupGoogleBooksBook,
  ];

  const providerResults = await Promise.all(
    providers.map(async (provider) => {
      try {
        const result = await provider(isbn);
        return { result, error: null };
      } catch (error) {
        return { result: null, error };
      }
    })
  );

  for (const { result } of providerResults) {
    if (result?.title) {
      return {
        ...result,
        author: result.author || 'Unknown',
        genre: result.genre || 'Uncategorized',
        language: normalizeLanguageName(result.language, inferLanguageFromIsbn(isbn) || 'English'),
      };
    }
  }

  for (const { error } of providerResults) {
    if (error) {
      console.warn('ISBN lookup provider failed:', error.message);
    }
  }

  return null;
}

// ==================== 公开接口（无需认证） ====================

// 获取所有图书
router.get('/', async (req, res) => {
  try {
    const books = await prisma.book.findMany({
      orderBy: { id: 'asc' },
      include: {
        copies: {
          select: {
            id: true,
            barcode: true,
            status: true,
            floor: true,
            libraryArea: true,
            shelfNo: true,
            shelfLevel: true,
          }
        }
      }
    });

    const booksWithCount = books.map(book => {
      const availableCopies = book.copies.filter(c => c.status === 'AVAILABLE').length;
      const firstCopy = book.copies[0] || {};
      return {
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        genre: book.genre,
        description: book.description,
        language: book.language,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
        availableCopies: availableCopies,
        totalCopies: book.copies.length,
        floor: firstCopy.floor || 1,
        libraryArea: firstCopy.libraryArea || '',
        shelfNo: firstCopy.shelfNo || 'A',
        shelfLevel: firstCopy.shelfLevel || 1,
        copies: book.copies
      };
    });

    res.json({ data: booksWithCount });
  } catch (error) {
    console.error('Failed to fetch books:', error);
    res.status(500).json({ error: 'Failed to fetch books', detail: error.message });
  }
});

// 图书搜索功能
router.get('/search', async (req, res) => {
  try {
    const { title, author, keyword } = req.query;
    const whereCondition = {};
    
    if (title || author || keyword) {
      whereCondition.OR = [];
      if (title) whereCondition.OR.push({ title: { contains: title } });
      if (author) whereCondition.OR.push({ author: { contains: author } });
      if (keyword) {
        whereCondition.OR.push(
          { title: { contains: keyword } },
          { author: { contains: keyword } },
          { isbn: { contains: keyword } }
        );
      }
    }
    
    const books = await prisma.book.findMany({
      where: whereCondition,
      orderBy: { id: 'asc' },
      include: {
        copies: {
          select: { status: true }
        }
      }
    });
    
    const booksWithCount = books.map(book => {
      const availableCopies = book.copies.filter(c => c.status === 'AVAILABLE').length;
      return {
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        genre: book.genre,
        description: book.description,
        language: book.language,
        createdAt: book.createdAt,
        availableCopies: availableCopies,
        totalCopies: book.copies.length
      };
    });
    
    res.json({ success: true, data: booksWithCount, count: booksWithCount.length });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to search books', detail: error.message });
  }
});

// 通过 ISBN 联网获取图书信息
router.get('/lookup', async (req, res) => {
  const isbn = normalizeIsbn(req.query.isbn);

  if (!isLookupIsbn(isbn)) {
    return res.status(400).json({
      success: false,
      error: 'Please provide a valid ISBN-10 or ISBN-13',
    });
  }

  try {
    const book = await lookupBookByIsbn(isbn);

    if (!book) {
      return res.status(404).json({
        success: false,
        error: 'No online book information found for this ISBN.',
      });
    }

    return res.json({
      success: true,
      data: {
        ...book,
        isbnBarcode: isbn,
      },
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: 'Failed to fetch online book information',
      detail: error.message,
    });
  }
});

// 获取单本图书详情
router.get('/:id', async (req, res) => {
  const bookId = Number(req.params.id);
  if (isNaN(bookId)) {
    return res.status(400).json({ error: 'Invalid book id' });
  }

  try {
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      include: {
        copies: {
          select: { id: true, barcode: true, floor: true, libraryArea: true, shelfNo: true, shelfLevel: true, status: true }
        },
        ratings: {
          include: { user: { select: { id: true, name: true } } }
        }
      }
    });

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const availableCopies = book.copies.filter(c => c.status === 'AVAILABLE').length;

    res.json({
      success: true,
      data: {
        ...book,
        availableCopies: availableCopies,
        totalCopies: book.copies.length,
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch book detail', detail: error.message });
  }
});

// ==================== 馆员/管理员接口（需要认证） ====================

// 添加图书
router.post('/', requireAuth, requireLibrarian, async (req, res) => {
  try {
    const { 
      title, author, isbn, genre, description, language,
      floor, libraryArea, shelfNo, shelfLevel 
    } = req.body;

    if (!title || !author || !isbn || !genre) {
      return res.status(400).json({ error: '书名、作者、ISBN和分类是必填项' });
    }

    const normalizedIsbn = normalizeIsbn(isbn);

    if (!isLookupIsbn(normalizedIsbn)) {
      return res.status(400).json({ error: '请输入有效的 ISBN-10 或 ISBN-13' });
    }

    const existingBook = await prisma.book.findUnique({ where: { isbn: normalizedIsbn } });
    if (existingBook) {
      return res.status(409).json({ error: '该 ISBN 已存在' });
    }

    const book = await prisma.book.create({
      data: {
        title: title.trim(),
        author: author.trim(),
        isbn: normalizedIsbn,
        genre: genre.trim(),
        description: description?.trim() || null,
        language: language?.trim() || 'English',
      },
      select: BOOK_SELECT,
    });

    await prisma.copy.create({
      data: {
        bookId: book.id,
        barcode: `BC-${book.id}-1`,
        floor: floor || 1,
        libraryArea: libraryArea || `${genre}区`,
        shelfNo: shelfNo || 'A',
        shelfLevel: shelfLevel || 1,
        status: 'AVAILABLE'
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'CREATE_BOOK',
        entity: 'Book',
        entityId: book.id,
        detail: `${req.user.role === 'LIBRARIAN' ? '馆员' : '管理员'} ${req.user.name || req.user.email} 添加了图书《${book.title}》`
      }
    });

    const fullBook = await prisma.book.findUnique({
      where: { id: book.id },
      include: {
        copies: {
          select: { id: true, barcode: true, status: true, floor: true, libraryArea: true, shelfNo: true, shelfLevel: true }
        }
      }
    });

    const availableCopies = fullBook.copies.filter(c => c.status === 'AVAILABLE').length;
    const firstCopy = fullBook.copies[0] || {};

    res.status(201).json({
      success: true,
      message: '图书添加成功',
      book: {
        ...fullBook,
        availableCopies,
        totalCopies: fullBook.copies.length,
        floor: firstCopy.floor,
        libraryArea: firstCopy.libraryArea,
        shelfNo: firstCopy.shelfNo,
        shelfLevel: firstCopy.shelfLevel,
      }
    });
  } catch (error) {
    console.error('Create book error:', error);
    res.status(500).json({ error: '添加图书失败' });
  }
});

// 更新图书信息
router.put('/:id', requireAuth, requireLibrarian, async (req, res) => {
  try {
    const bookId = Number(req.params.id);
    const { 
      title, author, isbn, genre, description, language,
      floor, libraryArea, shelfNo, shelfLevel,
      totalCopies
    } = req.body;

    if (Number.isNaN(bookId)) {
      return res.status(400).json({ error: '无效的图书ID' });
    }

    if (!title || !author || !isbn || !genre) {
      return res.status(400).json({ error: '书名、作者、ISBN和分类是必填项' });
    }

    const normalizedIsbn = normalizeIsbn(isbn);

    if (!isLookupIsbn(normalizedIsbn)) {
      return res.status(400).json({ error: '请输入有效的 ISBN-10 或 ISBN-13' });
    }

    const existingBook = await prisma.book.findUnique({ where: { id: bookId } });
    if (!existingBook) {
      return res.status(404).json({ error: '图书不存在' });
    }

    if (normalizedIsbn !== existingBook.isbn) {
      const isbnConflict = await prisma.book.findUnique({ where: { isbn: normalizedIsbn } });
      if (isbnConflict) {
        return res.status(409).json({ error: '该 ISBN 已被其他图书使用' });
      }
    }

    await prisma.book.update({
      where: { id: bookId },
      data: {
        title: title.trim(),
        author: author.trim(),
        isbn: normalizedIsbn,
        genre: genre.trim(),
        description: description?.trim() || null,
        language: language?.trim() || 'English',
      }
    });

    if (totalCopies !== undefined) {
      const currentCopies = await prisma.copy.findMany({ where: { bookId: bookId } });
      const currentCount = currentCopies.length;
      const targetCount = Number(totalCopies);
      
      if (targetCount > currentCount) {
        const firstCopy = currentCopies[0] || {
          floor: floor || 1,
          libraryArea: libraryArea || '',
          shelfNo: shelfNo || 'A',
          shelfLevel: shelfLevel || 1
        };
        
        for (let i = currentCount + 1; i <= targetCount; i++) {
          await prisma.copy.create({
            data: {
              bookId: bookId,
              barcode: `BC-${bookId}-${i}`,
              floor: floor !== undefined ? floor : firstCopy.floor,
              libraryArea: libraryArea !== undefined ? libraryArea : firstCopy.libraryArea,
              shelfNo: shelfNo !== undefined ? shelfNo : firstCopy.shelfNo,
              shelfLevel: shelfLevel !== undefined ? shelfLevel : firstCopy.shelfLevel,
              status: 'AVAILABLE'
            }
          });
        }
      } else if (targetCount < currentCount) {
        const toDeleteCount = currentCount - targetCount;
        let deletedCount = 0;
        
        for (const copy of currentCopies) {
          if (deletedCount >= toDeleteCount) break;
          
          if (copy.status === 'AVAILABLE') {
            const activeLoan = await prisma.loan.findFirst({
              where: { copyId: copy.id, returnDate: null }
            });
            
            if (!activeLoan) {
              await prisma.copy.delete({ where: { id: copy.id } });
              deletedCount++;
            }
          }
        }
        
        if (deletedCount < toDeleteCount) {
          return res.status(400).json({ 
            error: `无法减少副本数量，只有 ${deletedCount} 个副本可以删除` 
          });
        }
      }
    }

    if (floor !== undefined || libraryArea !== undefined || shelfNo !== undefined || shelfLevel !== undefined) {
      const allCopies = await prisma.copy.findMany({ where: { bookId: bookId } });
      for (const copy of allCopies) {
        await prisma.copy.update({
          where: { id: copy.id },
          data: {
            floor: floor !== undefined ? floor : copy.floor,
            libraryArea: libraryArea !== undefined ? libraryArea : copy.libraryArea,
            shelfNo: shelfNo !== undefined ? shelfNo : copy.shelfNo,
            shelfLevel: shelfLevel !== undefined ? shelfLevel : copy.shelfLevel,
          }
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'UPDATE_BOOK',
        entity: 'Book',
        entityId: bookId,
        detail: `${req.user.role === 'LIBRARIAN' ? '馆员' : '管理员'} ${req.user.name || req.user.email} 更新了图书《${title}》`
      }
    });

    const fullBook = await prisma.book.findUnique({
      where: { id: bookId },
      include: {
        copies: {
          select: { id: true, barcode: true, status: true, floor: true, libraryArea: true, shelfNo: true, shelfLevel: true }
        }
      }
    });

    const availableCopies = fullBook.copies.filter(c => c.status === 'AVAILABLE').length;
    const firstCopy = fullBook.copies[0] || {};

    res.json({
      success: true,
      message: '图书更新成功',
      book: {
        ...fullBook,
        availableCopies: availableCopies,
        totalCopies: fullBook.copies.length,
        floor: firstCopy.floor || 1,
        libraryArea: firstCopy.libraryArea || '',
        shelfNo: firstCopy.shelfNo || 'A',
        shelfLevel: firstCopy.shelfLevel || 1,
      }
    });
  } catch (error) {
    console.error('Update book error:', error);
    res.status(500).json({ error: '更新图书失败: ' + error.message });
  }
});

// 删除图书
router.delete('/:id', requireAuth, requireLibrarian, async (req, res) => {
  const bookId = Number(req.params.id);
  if (isNaN(bookId)) {
    return res.status(400).json({ error: '无效的图书ID' });
  }

  try {
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      include: {
        copies: {
          include: {
            loans: { where: { returnDate: null } }
          }
        }
      }
    });

    if (!book) {
      return res.status(404).json({ error: '图书不存在' });
    }

    const hasActiveLoans = book.copies.some(copy => copy.loans.length > 0);
    if (hasActiveLoans) {
      return res.status(400).json({ error: '该图书有未归还的借阅记录，无法删除' });
    }

    await prisma.book.delete({ where: { id: bookId } });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'DELETE_BOOK',
        entity: 'Book',
        entityId: bookId,
        detail: `${req.user.role === 'LIBRARIAN' ? '馆员' : '管理员'} ${req.user.name || req.user.email} 删除了图书《${book.title}》`
      }
    });

    res.json({ success: true, message: '图书删除成功' });
  } catch (error) {
    console.error('Delete book error:', error);
    res.status(500).json({ error: '删除图书失败' });
  }
});

module.exports = router;