import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';

const PORT = process.env.PORT || 9999;

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req);
});

wss.on('listening', () => {
  console.log(`🚀 Yjs WebSocket server running on ws://localhost:${PORT}`);
});

wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  wss.close(() => {
    process.exit(0);
  });
});
