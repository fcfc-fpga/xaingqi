/*
 * 简单的中国象棋局域网服务器
 *
 * 该服务器同时提供静态文件服务（用于访问 xiangqi_lan.html）
 * 并通过 WebSocket 进行实时棋局同步。玩家访问 http://localhost:8080 即可
 * 打开客户端界面，连接后服务器会在前两名连接者之间分配红黑方，
 * 之后的连接者为观战者只能观看。
 *
 * 注意：此代码依赖 `ws` 模块，请先执行 `npm install ws`。
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// 初始化棋盘状态，10 行 9 列
function initBoard() {
  const ROWS = 10;
  const COLS = 9;
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  function createPiece(type, color) {
    return { type, color };
  }
  // 黑棋
  board[0][0] = createPiece('R', 'black');
  board[0][1] = createPiece('N', 'black');
  board[0][2] = createPiece('B', 'black');
  board[0][3] = createPiece('A', 'black');
  board[0][4] = createPiece('K', 'black');
  board[0][5] = createPiece('A', 'black');
  board[0][6] = createPiece('B', 'black');
  board[0][7] = createPiece('N', 'black');
  board[0][8] = createPiece('R', 'black');
  board[2][1] = createPiece('C', 'black');
  board[2][7] = createPiece('C', 'black');
  board[3][0] = createPiece('P', 'black');
  board[3][2] = createPiece('P', 'black');
  board[3][4] = createPiece('P', 'black');
  board[3][6] = createPiece('P', 'black');
  board[3][8] = createPiece('P', 'black');
  // 红棋
  board[9][0] = createPiece('R', 'red');
  board[9][1] = createPiece('N', 'red');
  board[9][2] = createPiece('B', 'red');
  board[9][3] = createPiece('A', 'red');
  board[9][4] = createPiece('K', 'red');
  board[9][5] = createPiece('A', 'red');
  board[9][6] = createPiece('B', 'red');
  board[9][7] = createPiece('N', 'red');
  board[9][8] = createPiece('R', 'red');
  board[7][1] = createPiece('C', 'red');
  board[7][7] = createPiece('C', 'red');
  board[6][0] = createPiece('P', 'red');
  board[6][2] = createPiece('P', 'red');
  board[6][4] = createPiece('P', 'red');
  board[6][6] = createPiece('P', 'red');
  board[6][8] = createPiece('P', 'red');
  return board;
}

let board = initBoard();

// 存储玩家连接及分配颜色
const players = [];

// 创建 HTTP 服务器，用于提供静态文件服务
const server = http.createServer((req, res) => {
  let reqPath = req.url;
  if (reqPath === '/') {
    reqPath = '/xiangqi_lan.html';
  }
  // 防止路径穿越攻击
  const filePath = path.join(__dirname, reqPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not Found');
    } else {
      // 根据扩展名设置内容类型
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
      };
      const contentType = mimeMap[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

// 创建 WebSocket 服务，与 HTTP 服务器共享端口
const wss = new WebSocket.Server({ server, path: '/ws' });

// 广播消息给所有客户端
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// 分配颜色给新连接者
function assignColor() {
  const colors = ['red', 'black'];
  for (const color of colors) {
    if (!players.find(p => p.color === color)) {
      return color;
    }
  }
  return null; // 超出两个玩家，不分配颜色
}

wss.on('connection', (ws) => {
  // 为新连接分配颜色（如果有空位）
  const color = assignColor();
  if (color) {
    players.push({ ws, color });
    ws.send(JSON.stringify({ type: 'assign', color }));
  } else {
    // 观战者不分配颜色
    ws.send(JSON.stringify({ type: 'assign', color: null }));
  }
  // 监听消息
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'move') {
        const { from, to } = data;
        // 更新服务器端棋盘
        const piece = board[from.r][from.c];
        if (piece) {
          board[to.r][to.c] = piece;
          board[from.r][from.c] = null;
          // 广播给所有客户端（包括自己）
          broadcast({ type: 'move', from, to });
        }
      }
    } catch (e) {
      console.error('Invalid message', e);
    }
  });
  // 连接关闭
  ws.on('close', () => {
    // 移除玩家
    const idx = players.findIndex(p => p.ws === ws);
    if (idx !== -1) {
      players.splice(idx, 1);
      // 重置棋局并通知所有客户端
      board = initBoard();
      broadcast({ type: 'reset' });
    }
  });
});

server.listen(PORT, () => {
  console.log(`服务器已启动，访问 http://localhost:${PORT}`);
});
