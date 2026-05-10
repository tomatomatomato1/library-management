const express = require('express');
const bcrypt = require('bcrypt');
const { signToken } = require('../lib/token');
const { signLibrarianToken } = require('../lib/librarianToken');
const prisma = require('../lib/prisma');

const router = express.Router();

async function writeAuditLog(data) {
  try {
    await prisma.auditLog.create({ data });
  } catch (error) {
    console.warn('Failed to write audit log:', error.message);
  }
}

// --- 统一登录接口 (处理学生、图书馆员、管理员) ---
router.post('/login', async (req, res) => {
  const { email, password, type } = req.body;

  try {
    // 学生登录
    if (type === 'student' || !type) {
      const user = await prisma.user.findUnique({
        where: { email: email }
      });

      if (!user) {
        return res.status(401).json({ error: '用户不存在', type: 'student' });
      }

      if (user.role === 'LIBRARIAN' || user.role === 'ADMIN') {
        return res.status(401).json({ error: '请使用对应的管理员入口登录', type: user.role.toLowerCase() });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: '密码错误', type: 'student' });
      }

      const token = signToken({
        sub: String(user.id),
        id: user.id,
        role: user.role
      });

      writeAuditLog({
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        detail: `学生 ${user.email} 登录`,
      });

      return res.json({
        message: '学生登录成功',
        token: token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    }

    // 图书馆员登录（改为从 User 表查询）
    if (type === 'librarian') {
      const librarian = await prisma.user.findFirst({
        where: {
          OR: [
            { employeeId: email },
            { email: email }
          ],
          role: 'LIBRARIAN'
        }
      });

      if (!librarian) {
        return res.status(401).json({ error: '工号不存在', type: 'librarian' });
      }

      const isValid = await bcrypt.compare(password, librarian.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: '密码错误', type: 'librarian' });
      }

      const token = signToken({
        sub: String(librarian.id),
        id: librarian.id,
        role: librarian.role,
        employeeId: librarian.employeeId
      });

      writeAuditLog({
        userId: librarian.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: librarian.id,
        detail: `馆员 ${librarian.employeeId} 登录`,
      });

      return res.json({
        message: '图书馆员登录成功',
        token: token,
        librarian: {
          id: librarian.id,
          name: librarian.name,
          employeeId: librarian.employeeId,
          email: librarian.email,
          role: librarian.role
        }
      });
    }

    // 管理员登录
    if (type === 'admin') {
      const user = await prisma.user.findUnique({
        where: { email: email }
      });

      if (!user) {
        return res.status(401).json({ error: '用户不存在', type: 'admin' });
      }

      if (user.role !== 'ADMIN') {
        return res.status(401).json({ error: '非管理员账号', type: 'admin' });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: '密码错误', type: 'admin' });
      }

      const token = signToken({
        sub: String(user.id),
        id: user.id,
        role: user.role
      });

      writeAuditLog({
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        detail: `管理员 ${user.email} 登录`,
      });

      return res.json({
        message: '管理员登录成功',
        token: token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    }

    return res.status(400).json({ error: '无效的登录类型' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '登录过程中发生错误' });
  }
});

// --- 学生登录接口 ---
router.post('/login-student', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email: email }
    });

    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: '密码错误' });
    }

    const token = signToken({
      sub: String(user.id),
      id: user.id,
      role: user.role
    });

    writeAuditLog({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      detail: `学生 ${user.email} 登录（旧接口）`,
    });

    res.json({
      message: '学生登录成功',
      token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '登录过程中发生错误' });
  }
});

// --- 图书馆员注册接口 ---
router.post('/register', async (req, res) => {
  const { employeeId, name, password } = req.body;

  if (!employeeId || !name || !password) {
    return res.status(400).json({ error: '请填写完整信息' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码长度不能少于6位' });
  }

  try {
    const existing = await prisma.user.findFirst({
      where: { employeeId: employeeId }
    });
    if (existing) {
      return res.status(400).json({ error: '工号已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const librarian = await prisma.user.create({
      data: {
        employeeId: employeeId,
        name: name,
        passwordHash: hashedPassword,
        email: `${employeeId}@librarian.com`,
        role: 'LIBRARIAN'
      }
    });

    writeAuditLog({
      userId: librarian.id,
      action: 'REGISTER',
      entity: 'User',
      entityId: librarian.id,
      detail: `馆员 ${name}(工号:${employeeId}) 注册`,
    });

    res.status(201).json({
      message: '注册成功',
      librarian: {
        id: librarian.id,
        employeeId: librarian.employeeId,
        name: librarian.name,
        email: librarian.email,
        role: librarian.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '注册失败' });
  }
});

// --- 图书馆员登录接口 ---
router.post('/login-librarian', async (req, res) => {
  const { employeeId, password } = req.body;

  try {
    const librarian = await prisma.user.findFirst({
      where: {
        OR: [
          { employeeId: employeeId },
          { email: employeeId }
        ],
        role: 'LIBRARIAN'
      }
    });

    if (!librarian) {
      return res.status(401).json({ error: '工号不存在' });
    }

    const isValid = await bcrypt.compare(password, librarian.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: '密码错误' });
    }

    const token = signToken({
      sub: String(librarian.id),
      id: librarian.id,
      role: librarian.role,
      employeeId: librarian.employeeId
    });

    writeAuditLog({
      userId: librarian.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: librarian.id,
      detail: `馆员 ${employeeId} 登录（旧接口）`,
    });

    res.json({
      message: '图书馆员登录成功',
      token: token,
      librarian: {
        id: librarian.id,
        name: librarian.name,
        employeeId: librarian.employeeId,
        email: librarian.email,
        role: librarian.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '登录过程中发生错误' });
  }
});

// --- 管理员登录接口 ---
router.post('/login-admin', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email: email }
    });

    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    if (user.role !== 'ADMIN') {
      return res.status(401).json({ error: '非管理员账号' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: '密码错误' });
    }

    const token = signToken({
      sub: String(user.id),
      id: user.id,
      role: user.role
    });

    writeAuditLog({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      detail: `管理员 ${user.email} 登录（旧接口）`,
    });

    res.json({
      message: '管理员登录成功',
      token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '登录过程中发生错误' });
  }
});

module.exports = router;
