const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const { verifyToken } = require('../lib/token');
const { verifyLibrarianToken } = require('../lib/librarianToken');

async function writeAuditLog(data) {
  try {
    await prisma.auditLog.create({ data });
  } catch (error) {
    console.warn('Failed to write audit log:', error.message);
  }
}

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

async function requireMessageAuth(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
  }

  // 先按普通用户 token 验证（读者/管理员）
  try {
    const payload = verifyToken(token);
    const userId = Number(payload.sub);

    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        req.user = user;
        return next();
      }
    }
  } catch (error) {
    // continue
  }

  // 再按馆员 token 验证（Librarian 表）
  try {
    const payload = verifyLibrarianToken(token);
    const librarianId = Number(payload.id);

    if (!librarianId) {
      return res.status(401).json({ error: 'Invalid token payload.' });
    }

    const librarian = await prisma.librarian.findUnique({
      where: { id: librarianId },
      select: {
        id: true,
        employeeId: true,
        name: true,
      },
    });

    if (!librarian) {
      return res.status(401).json({ error: 'Librarian no longer exists.' });
    }

    // 消息表关联 User：为每个馆员自动绑定一个稳定的 LIBRARIAN 用户账号
    const bindingEmail = `librarian.${librarian.employeeId}@library.local`;

    let user = await prisma.user.findUnique({
      where: { email: bindingEmail },
    });

    if (!user) {
      const fallbackUser = await prisma.user.findFirst({
        where: {
          role: 'LIBRARIAN',
          name: librarian.name,
        },
      });

      if (fallbackUser) {
        user = await prisma.user.update({
          where: { id: fallbackUser.id },
          data: {
            email: bindingEmail,
            role: 'LIBRARIAN',
          },
        });
      } else {
        const passwordHash = await bcrypt.hash(`librarian-${librarian.employeeId}-placeholder`, 10);
        user = await prisma.user.create({
          data: {
            name: librarian.name,
            email: bindingEmail,
            passwordHash,
            role: 'LIBRARIAN',
          },
        });
      }
    } else if (user.role !== 'LIBRARIAN' || user.name !== librarian.name) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          role: 'LIBRARIAN',
          name: librarian.name,
        },
      });
    }

    req.user = user;
    req.librarian = librarian;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// 发送消息
router.post('/send', requireMessageAuth, async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    const senderId = req.user.id;

    if (!receiverId || !content) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 验证接收者是否存在
    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
      return res.status(404).json({ error: '接收者不存在' });
    }

    const message = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        content
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        receiver: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      }
    });

    writeAuditLog({
      userId: senderId,
      action: 'SEND_MESSAGE',
      entity: 'Message',
      entityId: message.id,
      detail: `用户 ${senderId} 向用户 ${receiverId} 发送消息`,
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('发送消息错误:', error);
    res.status(500).json({ error: '发送消息失败' });
  }
});

// 获取用户的消息列表（按对话分组）
router.get('/conversations', requireMessageAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 获取与当前用户相关的所有消息
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        receiver: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // 按对话对方分组
    const conversations = {};
    messages.forEach(message => {
      const otherUserId = message.senderId === userId ? message.receiverId : message.senderId;
      if (!conversations[otherUserId]) {
        conversations[otherUserId] = {
          userId: otherUserId,
          userName: message.senderId === userId ? message.receiver.name : message.sender.name,
          userRole: message.senderId === userId ? message.receiver.role : message.sender.role,
          lastMessage: message,
          unreadCount: 0
        };
      }
    });

    // 计算未读消息数
    const unreadCounts = await prisma.message.groupBy({
      by: ['senderId'],
      where: {
        receiverId: userId,
        isRead: false
      },
      _count: {
        id: true
      }
    });

    unreadCounts.forEach(item => {
      if (conversations[item.senderId]) {
        conversations[item.senderId].unreadCount = item._count.id;
      }
    });

    res.json(Object.values(conversations));
  } catch (error) {
    console.error('获取消息列表错误:', error);
    res.status(500).json({ error: '获取消息列表失败' });
  }
});

// 获取与特定用户的聊天记录
router.get('/conversation/:userId', requireMessageAuth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = parseInt(req.params.userId);

    if (isNaN(otherUserId)) {
      return res.status(400).json({ error: '无效的用户ID' });
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId }
        ]
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        receiver: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // 标记对方发送的消息为已读
    await prisma.message.updateMany({
      where: {
        senderId: otherUserId,
        receiverId: currentUserId,
        isRead: false
      },
      data: {
        isRead: true
      }
    });

    res.json(messages);
  } catch (error) {
    console.error('获取聊天记录错误:', error);
    res.status(500).json({ error: '获取聊天记录失败' });
  }
});

// 获取未读消息数量（按用户分组）
router.get('/unread', requireMessageAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const unreadMessages = await prisma.message.groupBy({
      by: ['senderId'],
      where: {
        receiverId: userId,
        isRead: false
      },
      _count: {
        id: true
      }
    });

    // 转换为对象格式，键是senderId，值是未读消息数量
    const unreadCounts = {};
    unreadMessages.forEach(message => {
      unreadCounts[message.senderId] = message._count.id;
    });

    res.json(unreadCounts);
  } catch (error) {
    console.error('获取未读消息数量错误:', error);
    res.status(500).json({ error: '获取未读消息数量失败' });
  }
});

// 标记消息为已读
router.put('/read/:messageId', requireMessageAuth, async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    const userId = req.user.id;

    if (isNaN(messageId)) {
      return res.status(400).json({ error: '无效的消息ID' });
    }

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) {
      return res.status(404).json({ error: '消息不存在' });
    }

    if (message.receiverId !== userId) {
      return res.status(403).json({ error: '无权操作此消息' });
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { isRead: true },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        receiver: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      }
    });

    res.json(updatedMessage);
  } catch (error) {
    console.error('标记消息已读错误:', error);
    res.status(500).json({ error: '标记消息已读失败' });
  }
});

// 删除消息
router.delete('/:messageId', requireMessageAuth, async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    const userId = req.user.id;

    if (isNaN(messageId)) {
      return res.status(400).json({ error: '无效的消息ID' });
    }

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) {
      return res.status(404).json({ error: '消息不存在' });
    }

    if (message.senderId !== userId && message.receiverId !== userId) {
      return res.status(403).json({ error: '无权操作此消息' });
    }

    await prisma.message.delete({ where: { id: messageId } });

    writeAuditLog({
      userId,
      action: 'DELETE_MESSAGE',
      entity: 'Message',
      entityId: messageId,
      detail: `用户 ${userId} 删除了消息 ${messageId}`,
    });

    res.json({ success: true, message: '消息已删除' });
  } catch (error) {
    console.error('删除消息错误:', error);
    res.status(500).json({ error: '删除消息失败' });
  }
});

// 获取图书馆工作人员列表
router.get('/staff', requireMessageAuth, async (req, res) => {
  try {
    const staff = await prisma.user.findMany({
      where: {
        role: 'LIBRARIAN'
      },
      select: {
        id: true,
        name: true,
        role: true,
        email: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    res.json(staff);
  } catch (error) {
    console.error('获取工作人员列表错误:', error);
    res.status(500).json({ error: '获取工作人员列表失败' });
  }
});

module.exports = router;