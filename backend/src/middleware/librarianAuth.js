const prisma = require('../lib/prisma');
const { verifyLibrarianToken } = require('../lib/librarianToken');

// 删除 normalizeQueryResult 和 findLibrarianById 函数（不再需要）

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token.trim();
}

async function requireLibrarianAuth(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({
      error: 'Missing or invalid Authorization header',
    });
  }

  try {
    const payload = verifyLibrarianToken(token);
    const userId = Number(payload.id);

    if (!userId) {
      return res.status(401).json({ error: 'Token payload is invalid' });
    }

    // 改为查询 User 表，role='LIBRARIAN'
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        role: 'LIBRARIAN'
      },
      select: {
        id: true,
        employeeId: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Librarian no longer exists' });
    }

    // 将 user 信息附加到 req.user（统一使用 req.user）
    req.user = user;
    req.librarianAuth = payload;
    return next();
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid or expired librarian token',
    });
  }
}

module.exports = {
  requireLibrarianAuth,
};