import WebSocket from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const url = process.env.SERVER_URL || 'ws://localhost:8080';
const agentId = process.env.AGENT_ID || 'demo-agent-1';

let ws;
let registered = false;

function connect() {
  ws = new WebSocket(url);

  ws.on('open', () => {
    registered = false;
    console.log('Agent connected, registering as', agentId);
    ws.send(JSON.stringify({ type: 'register', from: agentId }));
    // send periodic pings to keep the connection alive
    ws.pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 20000);
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    console.log('AGENT RECV:', msg);

    if (msg.type === 'registered') {
      registered = true;
      console.log('Agent registration confirmed by server');
    }

    if (msg.type === 'request' && msg.method === 'sayHello') {
      const name = msg.params?.name || 'world';
      const response = {
        type: 'response',
        id: msg.id,
        from: agentId,
        to: msg.from,
        result: `Hello, ${name}! (from ${agentId})`
      };
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(response));
    }
  });

  ws.on('close', () => {
    console.log('Agent connection closed, will reconnect in 1s');
    registered = false;
    if (ws.pingInterval) clearInterval(ws.pingInterval);
    setTimeout(connect, 1000);
  });

  ws.on('error', (e) => {
    console.error('Agent ws error', e);
    // let close handler handle reconnect
  });
}

connect();
