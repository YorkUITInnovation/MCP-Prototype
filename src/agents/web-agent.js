import WebSocket from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const url = process.env.SERVER_URL || 'ws://localhost:8080';
const agentId = 'web-agent';

let ws;

// Web Agent Capabilities
const tools = [
  {
    name: 'fetch_url',
    description: 'Fetch content from a URL with HTTP GET request',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        headers: { 
          type: 'object', 
          description: 'Optional HTTP headers',
          additionalProperties: { type: 'string' }
        },
        timeout: { 
          type: 'number', 
          description: 'Request timeout in milliseconds',
          default: 10000
        }
      },
      required: ['url']
    }
  },
  {
    name: 'post_data',
    description: 'Send data to a URL with HTTP POST request',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to post to' },
        data: { 
          type: 'object',
          description: 'Data to send in request body'
        },
        headers: { 
          type: 'object', 
          description: 'Optional HTTP headers',
          additionalProperties: { type: 'string' }
        },
        timeout: { 
          type: 'number', 
          description: 'Request timeout in milliseconds',
          default: 10000
        }
      },
      required: ['url', 'data']
    }
  },
  {
    name: 'check_status',
    description: 'Check if a URL is accessible and get response status',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to check' },
        method: { 
          type: 'string', 
          enum: ['GET', 'HEAD', 'POST'],
          description: 'HTTP method to use',
          default: 'HEAD'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'parse_json',
    description: 'Parse JSON data from text or validate JSON structure',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'JSON text to parse' },
        validate_only: { 
          type: 'boolean', 
          description: 'Only validate JSON without returning parsed data',
          default: false
        }
      },
      required: ['text']
    }
  },
  {
    name: 'extract_text',
    description: 'Fetch a webpage and extract clean text content from HTML',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch and extract text from' },
        max_length: { 
          type: 'number', 
          description: 'Maximum length of extracted text',
          default: 2000
        },
        include_links: {
          type: 'boolean',
          description: 'Include links in the extracted text',
          default: false
        }
      },
      required: ['url']
    }
  }
];

// Allowed domains for security (demo purposes)
const allowedDomains = [
  'httpbin.org',
  'jsonplaceholder.typicode.com',
  'api.github.com',
  'httpstat.us',
  'echo.free.beeceptor.com',
  'example.com',
  'wikipedia.org',
  'en.wikipedia.org',
  'news.ycombinator.com',
  'reddit.com',
  'stackoverflow.com',
  'github.com',
  'npmjs.com',
  'nodejs.org',
  'mozilla.org',
  'w3.org',
  'developer.mozilla.org'
];

function isUrlAllowed(urlString) {
  try {
    const url = new URL(urlString);
    return allowedDomains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
  } catch {
    return false;
  }
}

// Tool Implementations
const toolHandlers = {
  fetch_url: async (args) => {
    try {
      if (!isUrlAllowed(args.url)) {
        throw new Error(`URL not allowed. Permitted domains: ${allowedDomains.join(', ')}`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), args.timeout || 10000);

      const response = await fetch(args.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'MCP-Web-Agent/1.0',
          ...args.headers
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let data;
      let text;

      if (contentType.includes('application/json')) {
        text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      } else {
        text = await response.text();
        data = text;
      }

      return {
        success: true,
        url: args.url,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        contentType,
        data,
        text: text.length > 1000 ? text.substring(0, 1000) + '...' : text,
        size: text.length
      };
    } catch (error) {
      return {
        success: false,
        url: args.url,
        error: error.message,
        type: error.name
      };
    }
  },

  post_data: async (args) => {
    try {
      if (!isUrlAllowed(args.url)) {
        throw new Error(`URL not allowed. Permitted domains: ${allowedDomains.join(', ')}`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), args.timeout || 10000);

      const body = JSON.stringify(args.data);
      const response = await fetch(args.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MCP-Web-Agent/1.0',
          ...args.headers
        },
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let responseData;
      const text = await response.text();

      if (contentType.includes('application/json') && text) {
        try {
          responseData = JSON.parse(text);
        } catch {
          responseData = text;
        }
      } else {
        responseData = text;
      }

      return {
        success: true,
        url: args.url,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        sent: args.data,
        response: responseData,
        responseText: text.length > 1000 ? text.substring(0, 1000) + '...' : text
      };
    } catch (error) {
      return {
        success: false,
        url: args.url,
        error: error.message,
        sent: args.data
      };
    }
  },

  check_status: async (args) => {
    try {
      if (!isUrlAllowed(args.url)) {
        throw new Error(`URL not allowed. Permitted domains: ${allowedDomains.join(', ')}`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(args.url, {
        method: args.method || 'HEAD',
        headers: {
          'User-Agent': 'MCP-Web-Agent/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      return {
        success: true,
        url: args.url,
        status: response.status,
        statusText: response.statusText,
        accessible: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        responseTime: Date.now() // Simplified timing
      };
    } catch (error) {
      return {
        success: false,
        url: args.url,
        accessible: false,
        error: error.message
      };
    }
  },

  parse_json: async (args) => {
    try {
      const parsed = JSON.parse(args.text);
      
      if (args.validate_only) {
        return {
          success: true,
          valid: true,
          text: args.text.length > 100 ? args.text.substring(0, 100) + '...' : args.text
        };
      }
      
      return {
        success: true,
        valid: true,
        data: parsed,
        text: args.text.length > 100 ? args.text.substring(0, 100) + '...' : args.text,
        type: Array.isArray(parsed) ? 'array' : typeof parsed,
        size: Object.keys(parsed).length || parsed.length || 0
      };
    } catch (error) {
      return {
        success: false,
        valid: false,
        error: error.message,
        text: args.text.length > 100 ? args.text.substring(0, 100) + '...' : args.text
      };
    }
  },

  extract_text: async (args) => {
    try {
      if (!isUrlAllowed(args.url)) {
        throw new Error(`URL not allowed. Permitted domains: ${allowedDomains.join(', ')}`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(args.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'MCP-Web-Agent/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      
      // Simple HTML to text conversion
      let text = html
        // Remove script and style elements
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        // Remove HTML comments
        .replace(/<!--[\s\S]*?-->/g, '')
        // Convert common HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Extract links if requested
        .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, 
          args.include_links ? '$2 ($1)' : '$2')
        // Remove all other HTML tags
        .replace(/<[^>]+>/g, '')
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

      // Truncate if needed
      const maxLength = args.max_length || 2000;
      if (text.length > maxLength) {
        text = text.substring(0, maxLength) + '...';
      }

      return {
        success: true,
        url: args.url,
        status: response.status,
        statusText: response.statusText,
        title: html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || 'No title',
        text: text,
        originalLength: html.length,
        extractedLength: text.length,
        contentType: response.headers.get('content-type') || ''
      };

    } catch (error) {
      return {
        success: false,
        url: args.url,
        error: error.message,
        type: error.name
      };
    }
  }
};

function connect() {
  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log(`🌐 Web Agent connected`);
    
    ws.send(JSON.stringify({
      type: 'register',
      from: agentId,
      capabilities: {
        tools,
        resources: [
          {
            uri: 'web://httpbin.org',
            name: 'HTTP Testing Service',
            description: 'Service for testing HTTP requests'
          },
          {
            uri: 'web://jsonplaceholder.typicode.com',
            name: 'JSON Placeholder API',
            description: 'Fake REST API for testing'
          }
        ]
      }
    }));
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      console.log('WEB AGENT RECV:', msg);

      if (msg.type === 'registered') {
        console.log('✅ Web Agent registered successfully');
        console.log(`🌍 Available tools: ${tools.map(t => t.name).join(', ')}`);
        console.log(`🔒 Allowed domains: ${allowedDomains.join(', ')}`);
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
      console.error('Web Agent error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        id: msg.id,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      }));
    }
  });

  ws.on('close', () => {
    console.log('🌐 Web Agent connection closed, reconnecting...');
    setTimeout(connect, 1000);
  });

  ws.on('error', (error) => {
    console.error('Web Agent error:', error);
  });
}

console.log('🌐 Starting Web Agent...');
connect();
