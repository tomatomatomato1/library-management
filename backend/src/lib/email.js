/**
 * 邮件服务模块
 * 用于配置和发送各类邮件通知
 */

const nodemailer = require('nodemailer');

// 邮件传输器配置
let transporter = null;

/**
 * 初始化邮件服务
 * @returns {Promise<Object>} 邮件传输器实例
 */
async function initEmailService() {
  // 从环境变量读取邮件配置
  const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.163.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true' || false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  };

  // 检查必要的邮件配置
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    console.warn('⚠️ 邮件服务配置不完整，请检查 EMAIL_USER 和 EMAIL_PASSWORD 环境变量');
    return null;
  }

  // 创建邮件传输器
  transporter = nodemailer.createTransport(emailConfig);

  // 验证连接
  try {
    await transporter.verify();
    console.log('✅ 邮件服务初始化成功，已验证SMTP连接');
  } catch (error) {
    console.error('❌ 邮件服务初始化失败:', error.message);
    transporter = null;
  }

  return transporter;
}

/**
 * 发送图书到期提醒邮件
 * @param {Object} options - 邮件选项
 * @param {string} options.email - 收件人邮箱
 * @param {string} options.readerName - 读者名称
 * @param {string} options.bookTitle - 图书名称
 * @param {string} options.dueDate - 到期日期
 * @returns {Promise<Object>} 发送结果
 */
async function sendDueReminderEmail({
  email,
  readerName,
  bookTitle,
  dueDate,
}) {
  // 如果邮件服务未初始化，返回失败
  if (!transporter) {
    return {
      success: false,
      error: '邮件服务未初始化',
    };
  }

  try {
    // 格式化到期日期
    const dueDateFormatted = new Date(dueDate).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // 邮件内容
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `📚 图书即将到期提醒 - ${bookTitle}`,
      html: generateEmailHTML({
        readerName,
        bookTitle,
        dueDateFormatted,
        dueDate,
      }),
    };

    // 发送邮件
    const result = await transporter.sendMail(mailOptions);

    console.log(`✅ 到期提醒邮件已发送给 ${email}: ${bookTitle}`);

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error(`❌ 邮件发送失败 (${email}):`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 生成邮件HTML内容
 * @param {Object} data - 邮件数据
 * @returns {string} HTML内容
 */
function generateEmailHTML({ readerName, bookTitle, dueDateFormatted, dueDate }) {
  const today = new Date();
  const due = new Date(dueDate);
  const daysLeft = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f5f5f5;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #ffffff;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          color: #2c3e50;
          margin-bottom: 30px;
          border-bottom: 3px solid #3498db;
          padding-bottom: 20px;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
          color: #3498db;
        }
        .content {
          color: #555;
          line-height: 1.8;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .book-info {
          background-color: #ecf0f1;
          padding: 20px;
          border-left: 4px solid #e74c3c;
          margin: 20px 0;
          border-radius: 4px;
        }
        .book-info p {
          margin: 10px 0;
          font-size: 15px;
        }
        .info-label {
          font-weight: bold;
          color: #2c3e50;
          display: inline-block;
          width: 100px;
        }
        .info-value {
          color: #e74c3c;
          font-weight: bold;
        }
        .days-warning {
          background-color: #fff3cd;
          border: 1px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
          color: #856404;
        }
        .action-tip {
          background-color: #d4edda;
          border: 1px solid #28a745;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
          color: #155724;
        }
        .footer {
          text-align: center;
          color: #999;
          font-size: 12px;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }
        .footer p {
          margin: 5px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📚 图书即将到期提醒</h1>
        </div>
        
        <div class="content">
          <div class="greeting">
            尊敬的 ${readerName} 同学：
          </div>
          
          <p>您在我馆借阅的图书即将到期，请及时办理续借或归还手续。</p>
          
          <div class="book-info">
            <p>
              <span class="info-label">📖 图书名称：</span>
              <span class="info-value">${bookTitle}</span>
            </p>
            <p>
              <span class="info-label">📅 到期日期：</span>
              <span class="info-value">${dueDateFormatted}</span>
            </p>
          </div>
          
          ${daysLeft > 0 ? `
          <div class="days-warning">
            <strong>⏰ 提醒：</strong> 您还有 <strong>${daysLeft}</strong> 天时间处理此图书
          </div>
          ` : `
          <div class="days-warning">
            <strong>⚠️ 紧急：</strong> 此图书已逾期，请立即归还或联系图书馆
          </div>
          `}
          
          <div class="action-tip">
            <strong>💡 您可以：</strong>
            <ul>
              <li>登录图书馆系统进行图书续借</li>
              <li>前往图书馆服务台进行借阅续期处理</li>
              <li>若有疑问，请联系图书馆咨询台</li>
            </ul>
          </div>
          
          <p style="color: #666; margin-top: 20px;">
            此邮件由图书馆自动发送系统生成，请勿直接回复。如有问题，请拨打图书馆咨询电话或访问图书馆官网。
          </p>
        </div>
        
        <div class="footer">
          <p>图书管理系统 - 自动提醒服务</p>
          <p>发送时间: ${new Date().toLocaleString('zh-CN')}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  initEmailService,
  sendDueReminderEmail,
};
