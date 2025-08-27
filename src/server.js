import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// MCP Server State
const agents = new Map(); // agentId -> { ws, tools, resources, capabilities }
const toolRegistry = new Map(); // toolName -> { agentId, schema }
const resourcePermissions = new Map(); // clientId -> Set<resourceURI>
const workflows = new Map(); // workflowId -> { steps, currentStep, results }

// Home page
app.get('/', (req, res) => {
  const agentList = Array.from(agents.keys());
  const toolList = Array.from(toolRegistry.entries());
  
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>MCP Protocol Demo</title>
  <style>
    body { font-family: sans-serif; max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 12px; margin-bottom: 2rem; }
    .status { background: #f0f8ff; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    .agents { background: #f8f8f8; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    .tools-section { background: #fff; border: 2px solid #e3f2fd; border-radius: 8px; margin: 1rem 0; }
    .tools-header { background: #2196f3; color: white; padding: 1rem; border-radius: 6px 6px 0 0; }
    .tools-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; padding: 1rem; }
    .tool-card { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 1rem; }
    .tool-name { font-weight: bold; color: #0066cc; margin-bottom: 0.5rem; }
    .tool-agent { font-size: 0.8em; color: #666; margin-bottom: 0.5rem; }
    .tool-desc { font-size: 0.9em; color: #333; }
    .workflow-section { background: #fff; border: 2px solid #e8f5e8; border-radius: 8px; margin: 1rem 0; }
    .workflow-header { background: #4caf50; color: white; padding: 1rem; border-radius: 6px 6px 0 0; }
    .workflow-controls { padding: 1rem; }
    .workflow-example { background: #f1f8e9; padding: 1rem; border-radius: 6px; margin: 1rem 0; font-family: monospace; font-size: 0.9em; }
    .demo-section { background: #fff; border: 2px solid #fff3e0; border-radius: 8px; margin: 1rem 0; }
    .demo-header { background: #ff9800; color: white; padding: 1rem; border-radius: 6px 6px 0 0; }
    .demo-content { padding: 1rem; }
    .demo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .demo-card { background: #fafafa; border: 1px solid #ddd; border-radius: 6px; padding: 1rem; text-align: center; }
    .demo-button { background: #ff9800; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; margin: 0.25rem; }
    .demo-button:hover { background: #f57c00; }
    code { background: #eee; padding: 2px 4px; border-radius: 3px; }
    pre { background: #f8f8f8; padding: 1rem; border-radius: 8px; overflow-x: auto; }
    .feature { margin: 1rem 0; padding: 1rem; background: #f9f9f9; border-left: 4px solid #2196f3; }
    .success { color: #4caf50; }
    .error { color: #f44336; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔗 Model Context Protocol (MCP) Demo</h1>
    <p>Real-time demonstration of MCP's standardized agent communication, tool discovery, resource management, and multi-agent orchestration.</p>
  </div>
  
  <div class="status">
    <h2>🚀 Server Status</h2>
    <p class="success">✅ MCP Server running on port 8080</p>
    <p>📡 Connected agents: <strong>${agentList.length}</strong></p>
    <p>🔧 Available tools: <strong>${toolList.length}</strong></p>
    <p>🔄 Workflows: <strong>Active</strong></p>
  </div>
  
  <div class="agents">
    <h2>🤖 Registered Agents</h2>
    ${agentList.length > 0 
      ? `<ul>${agentList.map(id => {
          const agent = agents.get(id);
          return `<li><code>${id}</code> - ${agent.tools.length} tools, ${agent.resources.length} resources</li>`;
        }).join('')}</ul>`
      : '<p>⚠️ No agents currently registered. Start agents using the commands below.</p>'
    }
  </div>
  
  ${toolList.length > 0 ? `
  <div class="tools-section">
    <div class="tools-header">
      <h2>🔧 Tool Registry (Real MCP Feature)</h2>
      <p>Agents register tools with schemas. Clients discover and invoke tools dynamically.</p>
    </div>
    <div class="tools-grid">
      ${toolList.map(([name, {agentId, schema}]) => `
        <div class="tool-card">
          <div class="tool-name">${name}</div>
          <div class="tool-agent">Provider: ${agentId}</div>
          <div class="tool-desc">${schema.description}</div>
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}
  
  <div class="workflow-section">
    <div class="workflow-header">
      <h2>⚡ Multi-Agent Workflows (Real MCP Feature)</h2>
      <p>Orchestrate multiple agents to complete complex tasks through standardized tool composition.</p>
    </div>
    <div class="workflow-controls">
      <h3>Example Workflow:</h3>
      <div class="workflow-example">
1. fetch_url("https://jsonplaceholder.typicode.com/posts/1")
2. parse_json(response_data)
3. write_file("fetched_post.json", parsed_data)
4. calculate(file_size + 100)
      </div>
      <button onclick="runWorkflow()" class="demo-button">🚀 Run Example Workflow</button>
      <div id="workflow-result" style="margin-top: 1rem;"></div>
    </div>
  </div>
  
  ${agentList.includes('orchestrator-agent') ? `
  <div class="chat-section" style="background: #fff; border: 2px solid #4caf50; border-radius: 8px; margin: 1rem 0;">
    <div class="chat-header" style="background: #4caf50; color: white; padding: 1rem; border-radius: 6px 6px 0 0;">
      <h2 style="margin: 0;">🎭 Natural Language Interface (True MCP Experience)</h2>
      <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">Just tell me what you want - I'll coordinate the right agents automatically!</p>
    </div>
    <div class="chat-messages" id="chat-messages" style="height: 300px; overflow-y: auto; padding: 1rem; border-bottom: 1px solid #ddd;"></div>
    <div class="chat-controls" style="padding: 1rem; display: flex; gap: 0.5rem;">
      <input type="text" id="natural-input" placeholder="Try: 'read package.json', 'calculate 15 * 8', 'list files in src', 'fetch data from https://httpbin.org/json'" 
             style="flex: 1; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;" onkeypress="handleNaturalKeyPress(event)">
      <button onclick="sendNaturalRequest()" style="padding: 0.5rem 1rem; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer;">Ask</button>
    </div>
    <div style="padding: 0 1rem 1rem; font-size: 0.9em; color: #666;">
      <strong>Try these examples:</strong><br>
      • "Read the package.json file"<br>
      • "Calculate 25 * 4 + 10"<br>
      • "Get statistics for numbers 10, 20, 30, 40, 50"<br>
      • "List files in the src directory"<br>
      • "Fetch data from https://jsonplaceholder.typicode.com/posts/1"
    </div>
  </div>
  ` : `
  <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 1rem; margin: 1rem 0;">
    <h3>🎭 Natural Language Interface Available</h3>
    <p>Start the orchestrator agent to enable natural language requests:</p>
    <pre>npm run start-orchestrator</pre>
    <p>Then refresh this page to see the chat interface!</p>
  </div>
  `}
  
  <div class="demo-section">
    <div class="demo-header">
      <h2>🎯 Try MCP Features</h2>
      <p>Test real MCP protocol capabilities with these interactive demos.</p>
    </div>
    <div class="demo-content">
      <div class="demo-grid">
        <div class="demo-card">
          <h3>📁 File Operations</h3>
          <p>Secure file system access</p>
          <button onclick="testTool('read_file', {path: 'package.json'})" class="demo-button">Read package.json</button>
          <button onclick="testTool('list_files', {directory: 'src'})" class="demo-button">List src/</button>
        </div>
        <div class="demo-card">
          <h3>🧮 Calculator</h3>
          <p>Mathematical operations</p>
          <button onclick="testTool('calculate', {expression: '2 + 3 * 4'})" class="demo-button">Calculate</button>
          <button onclick="testTool('statistics', {numbers: [1,2,3,4,5], operations: ['mean', 'sum']})" class="demo-button">Statistics</button>
        </div>
        <div class="demo-card">
          <h3>🌐 Web Requests</h3>
          <p>HTTP API interactions</p>
          <button onclick="testTool('fetch_url', {url: 'https://httpbin.org/json'})" class="demo-button">Fetch JSON</button>
          <button onclick="testTool('check_status', {url: 'https://jsonplaceholder.typicode.com'})" class="demo-button">Check Status</button>
        </div>
        <div class="demo-card">
          <h3>🔍 Tool Discovery</h3>
          <p>Dynamic capability discovery</p>
          <button onclick="discoverTools()" class="demo-button">List All Tools</button>
          <button onclick="getResources()" class="demo-button">Get Resources</button>
        </div>
      </div>
      <div id="demo-result" style="margin-top: 1rem; padding: 1rem; background: #f5f5f5; border-radius: 6px; display: none;">
        <strong>Result:</strong>
        <pre id="demo-output"></pre>
      </div>
    </div>
  </div>
  
  <div class="feature">
    <h2>🎯 What Makes This Actually MCP?</h2>
    <ul>
      <li><strong>Standardized Tool Discovery:</strong> Agents register tools with JSON schemas, clients discover them dynamically</li>
      <li><strong>Resource Management:</strong> Secure access control for files, databases, APIs with permission system</li>
      <li><strong>Multi-Agent Orchestration:</strong> Complex workflows spanning multiple specialized agents</li>
      <li><strong>Protocol Standards:</strong> Consistent message formats, error handling, capability negotiation</li>
      <li><strong>Composable Tools:</strong> Chain tools from different agents into powerful workflows</li>
    </ul>
  </div>
  
  <h2>🚀 Getting Started</h2>
  <pre>
# Terminal 1: Start MCP server
npm run start-server

# Terminal 2: Start all agents
npm run start-file-agent &
npm run start-calc-agent &
npm run start-web-agent &

# Or start individually:
npm run start-file-agent
npm run start-calc-agent  
npm run start-web-agent

# Then refresh this page to see tools!</pre>
  
  <p>🔗 <a href="/agents">View agents JSON</a> | <a href="https://github.com/modelcontextprotocol/specification">MCP Specification</a></p>
  
  <script>
    let ws = null;
    let messageId = 1;
    
    function connectWebSocket() {
      if (ws && ws.readyState === WebSocket.OPEN) return;
      
      ws = new WebSocket('ws://localhost:8080');
      
      ws.onopen = () => {
        console.log('Connected to MCP server');
      };
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        console.log('Received:', msg);
        
        if (msg.type === 'response') {
          // Handle natural language responses
          if (msg.id && msg.id.startsWith('natural-')) {
            // Remove thinking indicator
            const messages = document.getElementById('chat-messages');
            if (messages && messages.lastChild) {
              messages.removeChild(messages.lastChild);
            }
            
            const result = msg.result;
            if (result && result.response) {
              addChatMessage('agent', 'Orchestrator', result.response);
            } else {
              addChatMessage('agent', 'Orchestrator', JSON.stringify(result, null, 2));
            }
          } else {
            showResult(msg);
          }
        } else if (msg.type === 'error') {
          if (msg.id && msg.id.startsWith('natural-')) {
            const messages = document.getElementById('chat-messages');
            if (messages && messages.lastChild) {
              messages.removeChild(messages.lastChild);
            }
            addChatMessage('error', 'Error', msg.error?.message || 'Unknown error');
          } else {
            showResult(msg);
          }
        } else if (msg.type === 'workflow/result') {
          showWorkflowResult(msg);
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket closed, reconnecting...');
        setTimeout(connectWebSocket, 1000);
      };
    }
    
    function showResult(msg) {
      const resultDiv = document.getElementById('demo-result');
      const outputPre = document.getElementById('demo-output');
      resultDiv.style.display = 'block';
      outputPre.textContent = JSON.stringify(msg.result || msg.error, null, 2);
    }
    
    function showWorkflowResult(msg) {
      const resultDiv = document.getElementById('workflow-result');
      resultDiv.innerHTML = \`
        <h4>Workflow \${msg.workflowId} - \${msg.status}</h4>
        <pre>\${JSON.stringify(msg.results, null, 2)}</pre>
      \`;
    }
    
    function addChatMessage(type, sender, content) {
      const messagesDiv = document.getElementById('chat-messages');
      if (!messagesDiv) return;
      
      const messageDiv = document.createElement('div');
      messageDiv.style.marginBottom = '1rem';
      messageDiv.style.padding = '0.5rem';
      messageDiv.style.borderRadius = '6px';
      
      if (type === 'user') {
        messageDiv.style.background = '#e3f2fd';
        messageDiv.style.textAlign = 'right';
      } else if (type === 'agent') {
        messageDiv.style.background = '#f1f8e9';
      } else {
        messageDiv.style.background = '#ffebee';
        messageDiv.style.color = '#c62828';
      }
      
      messageDiv.innerHTML = \`<strong>\${sender}:</strong> \${content}\`;
      messagesDiv.appendChild(messageDiv);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    function sendNaturalRequest() {
      const input = document.getElementById('natural-input');
      const query = input.value.trim();
      
      if (!query) return;
      
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        addChatMessage('error', 'System', 'Not connected to server');
        return;
      }
      
      addChatMessage('user', 'You', query);
      
      const request = {
        type: 'tools/call',
        id: \`natural-\${messageId++}\`,
        from: 'web-client',
        params: {
          name: 'natural_request',
          arguments: { query }
        }
      };
      
      ws.send(JSON.stringify(request));
      input.value = '';
      
      // Show thinking indicator
      addChatMessage('agent', 'Orchestrator', '🤔 Thinking...');
    }
    
    function handleNaturalKeyPress(event) {
      if (event.key === 'Enter') {
        sendNaturalRequest();
      }
    }
    
    function testTool(toolName, args) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server. Please wait...');
        return;
      }
      
      const request = {
        type: 'tools/call',
        id: \`test-\${messageId++}\`,
        from: 'web-client',
        params: { name: toolName, arguments: args }
      };
      
      ws.send(JSON.stringify(request));
    }
    
    function discoverTools() {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server');
        return;
      }
      
      const request = {
        type: 'tools/list',
        id: \`discover-\${messageId++}\`,
        from: 'web-client'
      };
      
      ws.send(JSON.stringify(request));
    }
    
    function getResources() {
      const result = {
        resources: [
          { uri: 'file://src/', name: 'Source Code' },
          { uri: 'file://package.json', name: 'Package Config' },
          { uri: 'web://httpbin.org', name: 'HTTP Testing' }
        ]
      };
      showResult({ result });
    }
    
    function runWorkflow() {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server');
        return;
      }
      
      const workflow = {
        type: 'workflow/start',
        id: \`workflow-\${messageId++}\`,
        from: 'web-client',
        params: {
          steps: [
            { tool: 'fetch_url', arguments: { url: 'https://jsonplaceholder.typicode.com/posts/1' } },
            { tool: 'calculate', arguments: { expression: '42 * 2' } },
            { tool: 'statistics', arguments: { numbers: [1,2,3,4,5], operations: ['mean', 'sum'] } }
          ]
        }
      };
      
      ws.send(JSON.stringify(workflow));
    }
    
    // Connect when page loads
    connectWebSocket();
  </script>
</body>
</html>
  `);
});

// Debug: HTTP endpoint to list registered agents
app.get('/agents', (req, res) => {
  res.json({ agents: Array.from(agents.keys()) });
});

// MCP Protocol Message Handlers
const messageHandlers = {
  // Agent Registration with Capabilities
  register: (ws, msg) => {
    const { from: agentId, capabilities = {} } = msg;
    const agentInfo = {
      ws,
      tools: capabilities.tools || [],
      resources: capabilities.resources || [],
      lastSeen: Date.now()
    };
    
    agents.set(agentId, agentInfo);
    ws.agentId = agentId;
    
    // Register tools in global registry
    agentInfo.tools.forEach(tool => {
      toolRegistry.set(tool.name, { agentId, schema: tool });
    });
    
    console.log(`MCP: Agent ${agentId} registered with ${agentInfo.tools.length} tools, ${agentInfo.resources.length} resources`);
    console.log(`Available tools: ${agentInfo.tools.map(t => t.name).join(', ')}`);
    
    // Send registration confirmation to the registering agent
    ws.send(JSON.stringify({
      type: 'registered',
      for: agentId,
      serverCapabilities: {
        tools: Array.from(toolRegistry.keys()),
        resources: getAvailableResources(),
        workflows: true
      }
    }));

    // Broadcast updated capabilities to all other agents
    const updatedCapabilities = {
      type: 'capabilities_updated',
      serverCapabilities: {
        tools: Array.from(toolRegistry.keys()),
        resources: getAvailableResources(),
        workflows: true
      }
    };
    
    agents.forEach((agent, id) => {
      if (id !== agentId && agent.ws.readyState === 1) {
        agent.ws.send(JSON.stringify(updatedCapabilities));
      }
    });
  },

  // Tool Discovery
  'tools/list': (ws, msg) => {
    const tools = Array.from(toolRegistry.values()).map(({ agentId, schema }) => ({
      ...schema,
      provider: agentId
    }));
    
    ws.send(JSON.stringify({
      type: 'response',
      id: msg.id,
      result: { tools }
    }));
  },

  // Tool Execution
  'tools/call': async (ws, msg) => {
    const { name: toolName, arguments: args } = msg.params;
    const toolInfo = toolRegistry.get(toolName);
    
    if (!toolInfo) {
      return ws.send(JSON.stringify({
        type: 'error',
        id: msg.id,
        error: { code: 'TOOL_NOT_FOUND', message: `Tool ${toolName} not found` }
      }));
    }
    
    const targetAgent = agents.get(toolInfo.agentId);
    if (!targetAgent || targetAgent.ws.readyState !== 1) {
      return ws.send(JSON.stringify({
        type: 'error',
        id: msg.id,
        error: { code: 'AGENT_UNAVAILABLE', message: `Agent ${toolInfo.agentId} unavailable` }
      }));
    }
    
    // Forward tool call to agent
    const forwardedMsg = {
      type: 'tools/call',
      id: msg.id,
      from: msg.from || 'client',
      params: { name: toolName, arguments: args },
      _responseTarget: ws
    };
    
    targetAgent.ws.send(JSON.stringify(forwardedMsg));
    console.log(`MCP: Forwarding tool call ${toolName} to ${toolInfo.agentId}`);
  },

  // Resource Access Request
  'resources/read': async (ws, msg) => {
    const { uri } = msg.params;
    const clientId = msg.from || 'client';
    
    // Check permissions
    if (!hasResourcePermission(clientId, uri)) {
      return ws.send(JSON.stringify({
        type: 'error',
        id: msg.id,
        error: { code: 'PERMISSION_DENIED', message: `No permission to access ${uri}` }
      }));
    }
    
    try {
      if (uri.startsWith('file://')) {
        const filePath = uri.replace('file://', '');
        const content = await fs.readFile(path.resolve(filePath), 'utf-8');
        
        ws.send(JSON.stringify({
          type: 'response',
          id: msg.id,
          result: { uri, mimeType: 'text/plain', text: content }
        }));
      } else {
        throw new Error('Unsupported URI scheme');
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        id: msg.id,
        error: { code: 'READ_FAILED', message: error.message }
      }));
    }
  },

  // Workflow Execution
  'workflow/start': async (ws, msg) => {
    const { steps } = msg.params;
    const workflowId = `workflow-${Date.now()}`;
    
    workflows.set(workflowId, {
      steps,
      currentStep: 0,
      results: [],
      clientWs: ws,
      status: 'running'
    });
    
    ws.send(JSON.stringify({
      type: 'response',
      id: msg.id,
      result: { workflowId, status: 'started' }
    }));
    
    executeWorkflowStep(workflowId);
  },

  // Generic response handling
  response: (ws, msg) => {
    // Handle tool responses from agents
    if (msg._responseTarget) {
      msg._responseTarget.send(JSON.stringify(msg));
    } else {
      // Broadcast to all clients or handle differently
      broadcastToClients(msg, ws);
    }
  }
};

// Helper Functions
function getAvailableResources() {
  return [
    { uri: 'file://src/', name: 'Source Code', description: 'Project source files' },
    { uri: 'file://package.json', name: 'Package Config', description: 'Project configuration' }
  ];
}

function hasResourcePermission(clientId, uri) {
  // For demo: grant access to safe paths
  const allowedPaths = ['src/', 'package.json', 'README.md'];
  const resourcePath = uri.replace('file://', '');
  return allowedPaths.some(allowed => resourcePath.includes(allowed));
}

function broadcastToClients(msg, excludeWs = null) {
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(JSON.stringify(msg));
    }
  });
}

async function executeWorkflowStep(workflowId) {
  const workflow = workflows.get(workflowId);
  if (!workflow || workflow.currentStep >= workflow.steps.length) {
    return completeWorkflow(workflowId);
  }
  
  const step = workflow.steps[workflow.currentStep];
  console.log(`MCP: Executing workflow step ${workflow.currentStep + 1}: ${step.tool}`);
  
  // Execute step via tool call
  const toolInfo = toolRegistry.get(step.tool);
  if (!toolInfo) {
    workflow.results.push({ error: `Tool ${step.tool} not found` });
    workflow.currentStep++;
    return executeWorkflowStep(workflowId);
  }
  
  const targetAgent = agents.get(toolInfo.agentId);
  if (!targetAgent) {
    workflow.results.push({ error: `Agent ${toolInfo.agentId} unavailable` });
    workflow.currentStep++;
    return executeWorkflowStep(workflowId);
  }
  
  // Send tool call to agent with workflow context
  const msg = {
    type: 'tools/call',
    id: `${workflowId}-step-${workflow.currentStep}`,
    params: { name: step.tool, arguments: step.arguments },
    _workflowId: workflowId
  };
  
  targetAgent.ws.send(JSON.stringify(msg));
}

function completeWorkflow(workflowId) {
  const workflow = workflows.get(workflowId);
  if (!workflow) return;
  
  workflow.status = 'completed';
  
  workflow.clientWs.send(JSON.stringify({
    type: 'workflow/result',
    workflowId,
    results: workflow.results,
    status: 'completed'
  }));
  
  console.log(`MCP: Workflow ${workflowId} completed with ${workflow.results.length} results`);
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      console.log('MCP SERVER RECV:', msg);

      // Handle workflow responses
      if (msg._workflowId && msg.type === 'response') {
        const workflow = workflows.get(msg._workflowId);
        if (workflow) {
          workflow.results.push(msg.result);
          workflow.currentStep++;
          executeWorkflowStep(msg._workflowId);
          return;
        }
      }

      // Route to appropriate handler
      const handler = messageHandlers[msg.type];
      if (handler) {
        handler(ws, msg);
      } else {
        // Legacy fallback for old message types
        if (msg.type === 'request' && msg.to) {
          const target = agents.get(msg.to);
          if (!target) {
            ws.send(JSON.stringify({ type: 'error', id: msg.id, message: 'agent-not-found' }));
            return;
          }
          target.ws.send(JSON.stringify(msg));
          return;
        }
        
        ws.send(JSON.stringify({ 
          type: 'error', 
          id: msg.id, 
          error: { code: 'UNKNOWN_MESSAGE', message: `Unknown message type: ${msg.type}` }
        }));
      }
    } catch (e) {
      console.error('MCP: Message parse error:', e);
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: { code: 'INVALID_JSON', message: 'Invalid JSON message' }
      }));
    }
  });

  ws.on('close', () => {
    if (ws.agentId) {
      const agent = agents.get(ws.agentId);
      if (agent) {
        // Remove tools from registry
        agent.tools.forEach(tool => {
          toolRegistry.delete(tool.name);
        });
        agents.delete(ws.agentId);
        console.log(`MCP: Agent ${ws.agentId} disconnected`);
        console.log(`Remaining agents: ${Array.from(agents.keys())}`);
      }
    }
  });
});const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`MCP demo server listening on http://localhost:${PORT}`);
});
