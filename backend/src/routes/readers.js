const express = require('express');
const bcrypt = require('bcrypt');

const prisma = require('../lib/prisma');
const {
  DEFAULT_EXPIRES_IN_SECONDS,
  signToken,
} = require('../lib/token');
const { toPublicUser } = require('../lib/user');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 6;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function buildAuthResponse(message, user) {
  const token = signToken({
    sub: user.id,
    role: user.role,
    email: user.email,
    studentId: user.studentId,
  });

  return {
    message,
    token,
    tokenType: 'Bearer',
    expiresIn: DEFAULT_EXPIRES_IN_SECONDS,
    user: toPublicUser(user),
  };
}

async function writeAuditLog(data) {
  try {
    await prisma.auditLog.create({ data });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

async function registerReader(req, res, next) {
  try {
    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const password =
      typeof req.body.password === 'string' ? req.body.password : '';
    const studentId = normalizeText(req.body.studentId);

    if (!name || !email || !password || !studentId) {
      return res.status(400).json({
        message: 'name, email, password and studentId are required.',
      });
    }

    if (!email.includes('@')) {
      return res.status(400).json({
        message: 'A valid email address is required.',
      });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { studentId }],
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(409).json({
          message: 'This email address has already been registered.',
        });
      }

      return res.status(409).json({
        message: 'This studentId has already been registered.',
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        studentId,
        role: 'STUDENT',
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: 'REGISTER',
      entity: 'User',
      entityId: user.id,
      detail: `Reader ${user.email} registered.`,
    });

    return res.status(201).json(
      buildAuthResponse('Reader registration successful.', user)
    );
  } catch (error) {
    return next(error);
  }
}

async function loginReader(req, res, next) {
  try {
    const directEmail = normalizeEmail(req.body.email);
    const account = normalizeText(req.body.account);
    const email = directEmail || (account.includes('@') ? normalizeEmail(account) : '');
    const studentId = normalizeText(
      req.body.studentId || (email ? '' : account)
    );
    const password =
      typeof req.body.password === 'string' ? req.body.password : '';

    if (!password) {
      return res.status(400).json({
        message: 'password is required.',
      });
    }

    if (!email && !studentId) {
      return res.status(400).json({
        message: 'Provide email or studentId to log in.',
      });
    }

    const user = await prisma.user.findFirst({
      where: email ? { email } : { studentId },
    });

    if (!user || user.role !== 'STUDENT') {
      return res.status(401).json({
        message: 'Invalid reader credentials.',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid reader credentials.',
      });
    }

    await writeAuditLog({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      detail: `Reader ${user.email} logged in.`,
    });

    return res.json(buildAuthResponse('Reader login successful.', user));
  } catch (error) {
    return next(error);
  }
}

function getCurrentReader(req, res) {
  if (req.user.role !== 'STUDENT') {
    return res.status(403).json({
      message: 'Only reader accounts can access this resource.',
    });
  }

  return res.json({ user: req.user });
}

// 获取所有用户列表（管理员专用）
async function getAllUsers(req, res, next) {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: '只有管理员可以访问' });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        studentId: true,
        role: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' }
    });

    res.json({ users });
  } catch (error) {
    next(error);
  }
}

// 修改用户角色（管理员专用）
async function updateUserRole(req, res, next) {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: '只有管理员可以修改角色' });
    }

    const userId = parseInt(req.params.id);
    const { role } = req.body;

    if (!role || !['STUDENT', 'LIBRARIAN', 'ADMIN'].includes(role)) {
      return res.status(400).json({ message: '无效的角色类型' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role: role },
      select: {
        id: true,
        name: true,
        email: true,
        studentId: true,
        role: true,
      }
    });

    writeAuditLog({
      userId: req.user.id,
      action: 'UPDATE_USER_ROLE',
      entity: 'User',
      entityId: userId,
      detail: `管理员将用户 ${userId} 角色更新为 ${role}`,
    });

    res.json({ message: '角色更新成功', user });
  } catch (error) {
    next(error);
  }
}

// 管理员创建用户
async function createUserByAdmin(req, res, next) {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: '只有管理员可以创建用户' });
    }

    const { name, email, studentId, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: '姓名、邮箱和密码是必填项' });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `密码长度不能少于${MIN_PASSWORD_LENGTH}位` });
    }

    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    if (existingUser) {
      return res.status(409).json({ message: '邮箱已被注册' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userRole = role && ['STUDENT', 'LIBRARIAN', 'ADMIN'].includes(role) ? role : 'STUDENT';

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        studentId: studentId || null,
        role: userRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        studentId: true,
        role: true,
        createdAt: true,
      }
    });

    await writeAuditLog({
      userId: req.user.id,
      action: 'CREATE_USER',
      entity: 'User',
      entityId: user.id,
      detail: `Admin ${req.user.email} created user ${user.email} with role ${userRole}`,
    });

    res.status(201).json({ message: '用户创建成功', user });
  } catch (error) {
    next(error);
  }
}

router.post('/register', registerReader);
router.post('/login', loginReader);
router.get('/me', requireAuth, getCurrentReader);
router.get('/all', requireAuth, getAllUsers);
router.put('/:id/role', requireAuth, updateUserRole);
router.post('/create', requireAuth, createUserByAdmin);

module.exports = router;
module.exports.registerReader = registerReader;
module.exports.loginReader = loginReader;
module.exports.getCurrentReader = getCurrentReader;