const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');

// 备份存储目录（相对于项目根）
const BACKUP_DIR = path.resolve(__dirname, '../../backups');
// 数据库文件路径（根据 schema 中 datasource url 解析）
const DB_PATH = path.resolve(__dirname, '../../prisma/prisma/dev.db');
// 默认最大备份保留数
const MAX_BACKUPS = 10;

// 状态/类型常量，避免魔数字符串
const STATUS = { COMPLETED: 'completed', FAILED: 'failed', RESTORED: 'restored' };
const TYPE = { MANUAL: 'manual', SCHEDULED: 'scheduled' };

/**
 * 创建数据库备份
 * @param {Object} options
 * @param {string} options.type - 'manual' | 'scheduled'
 * @param {number|null} options.userId - 操作的管理员ID
 * @param {boolean} options.skipCleanup - 跳过清理旧备份（恢复前的安全备份使用）
 */
async function createBackup({ type = TYPE.MANUAL, userId = null, skipCleanup = false } = {}) {
  // mkdirSync recursive 对已存在的目录不会报错，省略 existsSync 检查
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.db`;
  const filepath = path.join(BACKUP_DIR, filename);

  try {
    fs.copyFileSync(DB_PATH, filepath);
    const stats = fs.statSync(filepath);

    const log = await prisma.backupLog.create({
      data: {
        filename,
        filepath,
        sizeBytes: stats.size,
        status: STATUS.COMPLETED,
        type,
        note: type === TYPE.MANUAL ? '管理员手动备份' : '系统定时备份',
        createdBy: userId,
      },
    });

    if (!skipCleanup) {
      // 后台异步清理，不阻塞响应
      cleanOldBackups().catch((err) =>
        console.warn('清理旧备份失败:', err.message)
      );
    }

    return log;
  } catch (error) {
    await prisma.backupLog.create({
      data: {
        filename,
        filepath,
        sizeBytes: 0n,
        status: STATUS.FAILED,
        type,
        note: `备份失败: ${error.message}`,
        createdBy: userId,
      },
    }).catch((logErr) => console.warn('记录备份失败日志出错:', logErr.message));

    throw error;
  }
}

/**
 * 从指定备份文件恢复数据库
 * @param {number} backupId
 * @param {number} userId
 */
async function restoreBackup(backupId, userId) {
  const backup = await prisma.backupLog.findUnique({
    where: { id: backupId },
  });

  if (!backup) throw new Error('备份记录不存在');
  if (backup.status !== STATUS.COMPLETED) {
    throw new Error(`备份状态为 "${backup.status}"，无法恢复`);
  }
  if (!fs.existsSync(backup.filepath)) {
    throw new Error('备份文件不存在，无法恢复');
  }

  // 先备份当前数据库（恢复前安全备份，跳过清理因为旧数据将被覆盖）
  const safetyBackup = await createBackup({
    type: TYPE.MANUAL,
    userId,
    skipCleanup: true,
  });

  let copySucceeded = false;
  try {
    await prisma.$disconnect();
    fs.copyFileSync(backup.filepath, DB_PATH);
    copySucceeded = true;
    await prisma.$connect();

    // 备份文件在写入 BackupLog 之前生成，恢复后的库中可能没有对应 ID
    const restoredAt = new Date();
    const { count } = await prisma.backupLog.updateMany({
      where: { id: backupId },
      data: { restoredAt },
    });
    if (count === 0) {
      await prisma.backupLog.create({
        data: {
          filename: backup.filename,
          filepath: backup.filepath,
          sizeBytes: backup.sizeBytes,
          status: STATUS.COMPLETED,
          type: backup.type,
          note: '已从该备份恢复数据库',
          restoredAt,
          createdBy: userId,
        },
      });
    }

    return {
      message: '数据库恢复成功',
      restoredFrom: backup.filename,
      safetyBackupId: safetyBackup.id,
    };
  } catch (error) {
    await prisma.$connect().catch((connErr) => {
      console.error('恢复后数据库重连失败:', connErr.message);
    });
    if (copySucceeded) {
      throw new Error(`数据库已恢复，但记录恢复元数据失败: ${error.message}`);
    }
    throw new Error(`恢复失败: ${error.message}`);
  }
}

/**
 * 获取备份列表
 */
async function listBackups() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const logs = await prisma.backupLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return logs.map((log) => ({
    id: log.id,
    filename: log.filename,
    filepath: log.filepath,
    status: log.status,
    type: log.type,
    note: log.note,
    createdAt: log.createdAt,
    restoredAt: log.restoredAt,
    createdBy: log.createdBy,
    fileExists: fs.existsSync(log.filepath),
    sizeBytes: log.sizeBytes.toString(),
  }));
}

/**
 * 删除备份
 */
async function deleteBackup(backupId) {
  const backup = await prisma.backupLog.findUnique({
    where: { id: backupId },
  });

  if (!backup) throw new Error('备份记录不存在');

  try {
    fs.unlinkSync(backup.filepath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('删除备份文件失败:', error.message);
    }
  }

  await prisma.backupLog.delete({ where: { id: backupId } });

  return { message: '备份已删除' };
}

/**
 * 清理超过保留数量的旧备份
 */
async function cleanOldBackups() {
  const completedBackups = await prisma.backupLog.findMany({
    where: { status: STATUS.COMPLETED },
    orderBy: { createdAt: 'desc' },
    skip: MAX_BACKUPS,
    take: 50, // 单次最多清理 50 个，防止一次性删除过多
  });

  if (completedBackups.length === 0) return;

  const deleteOps = completedBackups.map((backup) => {
    try {
      fs.unlinkSync(backup.filepath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('清理旧备份文件失败:', error.message);
      }
    }
    return prisma.backupLog.delete({ where: { id: backup.id } });
  });

  await Promise.allSettled(deleteOps);
}

/**
 * 获取备份状态信息
 */
async function getBackupStatus() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const [totalBackups, completedBackups, latestBackup, sizeAgg] = await Promise.all([
    prisma.backupLog.count(),
    prisma.backupLog.count({ where: { status: STATUS.COMPLETED } }),
    prisma.backupLog.findFirst({
      where: { status: STATUS.COMPLETED },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.backupLog.aggregate({
      where: { status: STATUS.COMPLETED },
      _sum: { sizeBytes: true },
    }),
  ]);

  const totalSize = sizeAgg._sum.sizeBytes ?? 0n;

  return {
    backupDir: BACKUP_DIR,
    dbPath: DB_PATH,
    totalBackups,
    completedBackups,
    latestBackup: latestBackup
      ? {
          id: latestBackup.id,
          filename: latestBackup.filename,
          createdAt: latestBackup.createdAt,
          sizeBytes: latestBackup.sizeBytes.toString(),
          type: latestBackup.type,
        }
      : null,
    totalSizeBytes: totalSize.toString(),
    maxBackups: MAX_BACKUPS,
  };
}

module.exports = {
  createBackup,
  restoreBackup,
  listBackups,
  deleteBackup,
  getBackupStatus,
};
