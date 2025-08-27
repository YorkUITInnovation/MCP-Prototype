import WebSocket from 'ws';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const url = process.env.SERVER_URL || 'ws://localhost:8080';
const agentId = 'file-agent';

let ws;

// File Agent Capabilities
const tools = [
  {
    name: 'read_file',
    description: 'Read contents of a text file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write text content to a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_files',
    description: 'List files in a directory',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory path to list' }
      },
      required: ['directory']
    }
  },
  {
    name: 'create_directory',
    description: 'Create a new directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to create' }
      },
      required: ['path']
    }
  }
];

const resources = [
  {
    uri: 'file://src/',
    name: 'Source Files',
    description: 'Project source code files',
    mimeType: 'text/plain'
  },
  {
    uri: 'file://package.json',
    name: 'Package Configuration',
    description: 'Node.js package configuration',
    mimeType: 'application/json'
  }
];

// Tool Implementations
const toolHandlers = {
  read_file: async (args) => {
    try {
      const filePath = path.resolve(args.path);
      
      // Security check - only allow reading from project directory
      const projectRoot = process.cwd();
      if (!filePath.startsWith(projectRoot)) {
        throw new Error('Access denied: File outside project directory');
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);
      
      return {
        success: true,
        content,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        path: args.path
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: args.path
      };
    }
  },

  write_file: async (args) => {
    try {
      console.log('📝 File Agent: write_file called with', args);
      const filePath = path.resolve(args.path);
      const projectRoot = process.cwd();
      
      if (!filePath.startsWith(projectRoot)) {
        throw new Error('Access denied: File outside project directory');
      }
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, args.content, 'utf-8');
      
      const stats = await fs.stat(filePath);
      const result = {
        success: true,
        path: args.path,
        size: stats.size,
        written: new Date().toISOString()
      };
      console.log('📝 File Agent: write_file returning', result);
      return result;
    } catch (error) {
      console.log('📝 File Agent: write_file error', error);
      return {
        success: false,
        error: error.message,
        path: args.path
      };
    }
  },

  list_files: async (args) => {
    try {
      const dirPath = path.resolve(args.directory);
      const projectRoot = process.cwd();
      
      if (!dirPath.startsWith(projectRoot)) {
        throw new Error('Access denied: Directory outside project');
      }
      
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files = [];
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const stats = await fs.stat(fullPath);
        
        files.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime.toISOString()
        });
      }
      
      return {
        success: true,
        directory: args.directory,
        files: files.sort((a, b) => a.name.localeCompare(b.name))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        directory: args.directory
      };
    }
  },

  create_directory: async (args) => {
    try {
      const dirPath = path.resolve(args.path);
      const projectRoot = process.cwd();
      
      if (!dirPath.startsWith(projectRoot)) {
        throw new Error('Access denied: Directory outside project');
      }
      
      await fs.mkdir(dirPath, { recursive: true });
      
      return {
        success: true,
        path: args.path,
        created: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: args.path
      };
    }
  }
};

function connect() {
  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log(`🗂️ File Agent connected`);
    
    // Register with MCP server including capabilities
    ws.send(JSON.stringify({
      type: 'register',
      from: agentId,
      capabilities: {
        tools,
        resources
      }
    }));
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      console.log('FILE AGENT RECV:', msg);

      if (msg.type === 'registered') {
        console.log('✅ File Agent registered successfully');
        console.log(`📁 Available tools: ${tools.map(t => t.name).join(', ')}`);
        return;
      }

      if (msg.type === 'tools/call') {
        const { name: toolName, arguments: args } = msg.params;
        const handler = toolHandlers[toolName];
        
        if (!handler) {
          return ws.send(JSON.stringify({
            type: 'error',
            id: msg.id,
            error: { code: 'TOOL_NOT_FOUND', message: `Tool ${toolName} not implemented` }
          }));
        }
        
        console.log(`🔧 Executing tool: ${toolName}`);
        const result = await handler(args);
        
        ws.send(JSON.stringify({
          type: 'response',
          id: msg.id,
          result,
          _workflowId: msg._workflowId
        }));
      }
    } catch (error) {
      console.error('File Agent error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        id: msg.id,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      }));
    }
  });

  ws.on('close', () => {
    console.log('🗂️ File Agent connection closed, reconnecting...');
    setTimeout(connect, 1000);
  });

  ws.on('error', (error) => {
    console.error('File Agent error:', error);
  });
}

console.log('🗂️ Starting File Agent...');
connect();
