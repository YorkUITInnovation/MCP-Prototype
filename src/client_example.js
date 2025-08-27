import WebSocket from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const url = process.env.SERVER_URL || 'ws://localhost:8080';
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('Client connected to MCP server');

  // wait briefly so agents have time to register, then send a request to demo-agent-1
  setTimeout(() => {
    const req = {
      type: 'request',
      id: 'req-1',
      from: 'client-1',
      to: 'demo-agent-1',
      method: 'sayHello',
      params: { name: 'Alice' }
    };
    ws.send(JSON.stringify(req));
  }, 1000);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  console.log('CLIENT RECV:', msg);
  // close after receiving a response or error for this demo
  if (msg.id === 'req-1' || msg.type === 'error') {
    ws.close();
  }
});

ws.on('error', (e) => console.error('client ws error', e));
ws.on('close', () => console.log('client closed'));
