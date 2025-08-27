import WebSocket from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const url = process.env.SERVER_URL || 'ws://localhost:8080';
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('Test client connected to MCP server');

  // send summarize request
  const summarize = {
    type: 'tools/call',
    id: 'test-summarize-1',
    from: 'test-client',
    params: {
      name: 'natural_request',
      arguments: { query: 'Summarize this webpage - https://en.wikipedia.org/wiki/York_University' }
    }
  };

  ws.send(JSON.stringify(summarize));

  // after AI analysis completes, send a save request (give it a few seconds)
  setTimeout(() => {
    const save = {
      type: 'tools/call',
      id: 'test-save-1',
      from: 'test-client',
      params: {
        name: 'natural_request',
        arguments: { query: 'save that to york.txt' }
      }
    };
    ws.send(JSON.stringify(save));
  }, 5000);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  console.log('TEST CLIENT RECV:', msg);
});

ws.on('error', (e) => console.error('test client ws error', e));
ws.on('close', () => console.log('test client closed'));
