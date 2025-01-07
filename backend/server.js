const express = require('express'); // 引入 Express 框架
const mysql = require('mysql2');    // 引入 MySQL 数据库驱动
const dotenv = require('dotenv');   // 引入 dotenv 以读取环境变量

dotenv.config(); // 加载环境变量
const app = express(); // 创建 Express 应用实例

const PORT = process.env.PORT || 3000; // 设置服务器监听的端口

// 配置解析 JSON 数据（中间件）
app.use(express.json());

// 数据库连接配置
const db = mysql.createConnection({
  host: process.env.DB_HOST,       // 数据库主机名（阿里云 RDS 地址）
  user: process.env.DB_USER,       // 数据库用户名
  password: process.env.DB_PASSWORD, // 数据库密码
  database: process.env.DB_NAME    // 数据库名
});

// 连接数据库
db.connect((err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('数据库连接成功！');
  }
});

// 基础路由
app.get('/', (req, res) => {
  res.send('后端服务器启动成功！');
});

// 示例 API 路由：查询所有用户数据
app.get('/api/users', (req, res) => {
  const sql = 'SELECT * FROM users'; // SQL 查询语句

  db.query(sql, (err, results) => {
    if (err) {
      console.error('查询失败:', err.message);
      res.status(500).json({ message: '服务器错误' });
    } else {
      res.status(200).json({ users: results });
    }
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器已启动，监听端口：http://localhost:${PORT}`);
});
