const express = require('express');

const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function writeAuditLog(data) {
  try {
    await prisma.auditLog.create({ data });
  } catch (error) {
    console.warn('Failed to write audit log:', error.message);
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({
      message: 'Only administrators can perform this action.',
    });
  }
  return next();
}

async function getAllConfigs(req, res, next) {
  try {
    const configs = await prisma.config.findMany();
    const result = {};
    for (const c of configs) {
      result[c.key] = c.value;
    }
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function getConfigByKey(req, res, next) {
  try {
    const key = req.params.key;
    const config = await prisma.config.findUnique({ where: { key } });

    if (!config) {
      return res.status(404).json({
        message: `Config '${key}' not found.`,
      });
    }

    return res.json({ key: config.key, value: config.value });
  } catch (error) {
    return next(error);
  }
}

async function updateConfig(req, res, next) {
  try {
    const key = normalizeText(req.params.key);
    const value = req.body.value !== undefined ? String(req.body.value) : undefined;

    if (!key) {
      return res.status(400).json({ message: 'Config key is required.' });
    }

    if (value === undefined) {
      return res.status(400).json({ message: 'value is required.' });
    }

    const config = await prisma.config.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    writeAuditLog({
      userId: req.user.id,
      action: 'UPDATE_CONFIG',
      entity: 'Config',
      entityId: key,
      detail: `管理员 ${req.user.email} 将配置 ${key} 更新为 ${value}`,
    });

    return res.json({
      message: 'Config updated successfully.',
      config,
    });
  } catch (error) {
    return next(error);
  }
}

router.get('/', getAllConfigs);
router.get('/:key', getConfigByKey);
router.put('/:key', requireAuth, requireAdmin, updateConfig);

module.exports = router;
