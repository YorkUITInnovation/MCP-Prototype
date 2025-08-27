import WebSocket from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const url = process.env.SERVER_URL || 'ws://localhost:8080';
const agentId = 'orchestrator-agent';

let ws;
let availableTools = new Map(); // toolName -> { agentId, schema }
let pendingRequests = new Map(); // requestId -> { originalMessage, plan, currentStep, results }

// Conversation memory to support multi-step interactions
let conversationMemory = {
  lastResult: null,
  lastQuery: null,
  lastIntent: null,
  recentResults: [] // Keep last 5 results
};

// Orchestrator Agent Capabilities
const tools = [
  {
    name: 'natural_request',
    description: 'Process natural language requests and coordinate multiple agents to fulfill them',
    inputSchema: {
      type: 'object',
      properties: {
        query: { 
          type: 'string', 
          description: 'Natural language request from user' 
        },
        context: {
          type: 'object',
          description: 'Optional context about previous conversation',
          properties: {
            previousResults: { type: 'array' },
            userPreferences: { type: 'object' }
          }
        }
      },
      required: ['query']
    }
  }
];

// Intent detection patterns
const intentPatterns = [
  // URL-based patterns (check these FIRST before math patterns)
  {
    patterns: [
      /summarize.*webpage|summarize.*url|analyze.*webpage/i, 
      /summarize.*from.*http/i,
      /summarize.*this.*webpage/i,
      /summarize.*https?:\/\//i,
      /analyze.*https?:\/\//i,
      /summary.*of.*https?:\/\//i,
      /https?:\/\/.*summarize/i,
      /https?:\/\/.*analyze/i
    ],
    intent: 'web_ai_analyze',
    tools: ['extract_text', 'analyze_content'],
    extractUrl: (query) => {
      const urlMatch = query.match(/(https?:\/\/[^\s]+)/i);
      return urlMatch ? urlMatch[1] : '';
    }
  },
  {
    patterns: [
      /extract.*text|get.*text.*from|read.*webpage|scrape.*text/i, 
      /text.*from.*page/i, 
      /extract.*data.*from.*http/i, 
      /extract.*from.*wiki/i, 
      /get.*content.*from/i,
      /extract.*from.*https?:\/\//i,
      /https?:\/\/.*extract/i,
      /https?:\/\/.*text/i
    ],
    intent: 'extract_text',
    tools: ['extract_text'],
    extractUrl: (query) => {
      const urlMatch = query.match(/(https?:\/\/[^\s]+)/i);
      return urlMatch ? urlMatch[1] : 'https://example.com';
    }
  },
  {
    patterns: [/fetch|get.*url|download|request.*http/i, /api.*call/i, /get.*data.*from/i, /retrieve.*from.*http/i],
    intent: 'fetch_url',
    tools: ['fetch_url'],
    extractUrl: (query) => {
      const urlMatch = query.match(/(https?:\/\/[^\s]+)/i);
      return urlMatch ? urlMatch[1] : 'https://jsonplaceholder.typicode.com/posts/1';
    }
  },
  // File operations (non-URL)
  {
    patterns: [/read|show|display|get.*file/i, /what.*in.*file/i, /content.*of/i],
    intent: 'read_file',
    tools: ['read_file'],
    extractPath: (query) => {
      const matches = query.match(/(?:file|path)\s+["`']?([^"`'\s]+)["`']?/i) ||
                     query.match(/["`']([^"`']+\.[a-z]+)["`']/i) ||
                     query.match(/(\w+\.\w+)/);
      return matches ? matches[1] : 'package.json'; // default
    }
  },
  // Context-aware file saving (save previous results) - PRIORITY: Before statistics
  {
    patterns: [
      /save.*that|save.*it|save.*summary|save.*result/i,
      /write.*that.*to|put.*that.*in|store.*that/i,
      /save.*previous|save.*last/i,
      /create.*file.*with.*that/i
    ],
    intent: 'save_context',
    tools: ['write_file'],
    extractFileName: (query) => {
      const fileMatch = query.match(/(?:to|as|file|called)\s+["`']?([^"`'\s]+(?:\.[a-z]+)?)["`']?/i);
      if (fileMatch) {
        let fileName = fileMatch[1];
        // Add .txt extension if no extension provided
        if (!fileName.includes('.')) {
          fileName += '.txt';
        }
        return fileName;
      }
      // Default filename based on last intent
      return conversationMemory.lastIntent === 'web_ai_analyze' ? 'webpage_summary.txt' : 'result.txt';
    }
  },
  // Mathematical operations (AFTER URL patterns)
  {
    patterns: [/calculate|compute|math|solve/i, /what.*is.*\+|\-|\*|\//i],
    intent: 'calculate',
    tools: ['calculate'],
    extractExpression: (query) => {
      const mathMatch = query.match(/(?:calculate|compute|solve|what.*is)\s*[:`"]?\s*([0-9+\-*/().\s]+)/i);
      return mathMatch ? mathMatch[1].trim() : query.replace(/.*(?:calculate|compute|solve)\s*/i, '');
    }
  },
  {
    patterns: [/statistics|stats|analyze.*numbers|mean|average|mathematical.*sum/i],
    intent: 'statistics',
    tools: ['statistics'],
    extractNumbers: (query) => {
      const numberArrayMatch = query.match(/\[([0-9,\s]+)\]/);
      if (numberArrayMatch) {
        return numberArrayMatch[1].split(',').map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
      }
      const numbersMatch = query.match(/(\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)*)/);
      if (numbersMatch) {
        return numbersMatch[1].split(',').map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
      }
      return [1, 2, 3, 4, 5]; // default
    }
  },
  {
    patterns: [/list.*files|show.*directory|files.*in/i, /what.*files/i],
    intent: 'list_files',
    tools: ['list_files'],
    extractDirectory: (query) => {
      // Try to match "in the X directory" pattern first
      const inTheMatch = query.match(/(?:in|from)\s+the\s+([^"\s]+)\s+directory/i);
      if (inTheMatch) {
        return inTheMatch[1];
      }
      
      // Try to match "in X directory" pattern  
      const inMatch = query.match(/(?:in|from)\s+([^"\s]+)\s+directory/i);
      if (inMatch) {
        return inMatch[1];
      }
      
      // Try to match quoted directories
      const quotedMatch = query.match(/(?:in|from|directory)\s+["`']([^"`']+)["`']/i);
      if (quotedMatch) {
        return quotedMatch[1];
      }
      
      // Try to match "files in X" pattern
      const filesInMatch = query.match(/files\s+(?:in|from)\s+([^"\s]+)/i);
      if (filesInMatch) {
        return filesInMatch[1];
      }
      
      // Default fallback
      return 'src';
    }
  },
  {
    patterns: [/write.*file|save.*to|create.*file/i, /put.*in.*file/i],
    intent: 'write_file',
    tools: ['write_file'],
    extractFileInfo: (query) => {
      const pathMatch = query.match(/(?:to|file|path)\s+["`']?([^"`'\s]+)["`']?/i);
      const contentMatch = query.match(/(?:write|save|put)\s*["`']([^"`']+)["`']/i);
      return {
        path: pathMatch ? pathMatch[1] : 'output.txt',
        content: contentMatch ? contentMatch[1] : 'Generated content'
      };
    }
  },
  {
    patterns: [/analyze.*file.*and|read.*calculate|file.*math|stats.*from.*file/i],
    intent: 'file_analysis',
    tools: ['read_file', 'parse_json', 'statistics'],
    extractPath: (query) => {
      const matches = query.match(/(?:file|path)\s+["`']?([^"`'\s]+)["`']?/i) ||
                     query.match(/["`']([^"`']+\.[a-z]+)["`']/i);
      return matches ? matches[1] : 'package.json';
    }
  },
  {
    patterns: [/fetch.*and.*save|download.*to.*file|get.*url.*write/i],
    intent: 'fetch_and_save',
    tools: ['fetch_url', 'write_file'],
    extractInfo: (query) => {
      const urlMatch = query.match(/(https?:\/\/[^\s]+)/i);
      const pathMatch = query.match(/(?:to|file|save.*to)\s+["`']?([^"`'\s]+)["`']?/i);
      return {
        url: urlMatch ? urlMatch[1] : 'https://jsonplaceholder.typicode.com/posts/1',
        path: pathMatch ? pathMatch[1] : 'downloaded_data.json'
      };
    }
  },
  // AI-powered intents
  {
    patterns: [/summarize|summary|analyze.*content|analyze.*text/i, /what.*is.*this.*about/i],
    intent: 'ai_analyze',
    tools: ['analyze_content'],
    extractContent: (query) => {
      // This will be populated by compound workflows
      return '';
    },
    extractAnalysisType: (query) => {
      if (/summary|summarize/i.test(query)) return 'summary';
      if (/sentiment/i.test(query)) return 'sentiment';
      if (/key.*points/i.test(query)) return 'key_points';
      if (/themes/i.test(query)) return 'themes';
      return 'comprehensive';
    }
  },
  {
    patterns: [/generate.*text|write.*content|create.*content/i, /generate.*story|write.*article/i],
    intent: 'ai_generate',
    tools: ['generate_text'],
    extractPrompt: (query) => {
      const promptMatch = query.match(/(?:generate|write|create)\s+(.+)/i);
      return promptMatch ? promptMatch[1] : query;
    }
  },
  {
    patterns: [/explain|what.*is|how.*does|tell.*me.*about/i, /help.*understand/i],
    intent: 'ai_explain',
    tools: ['explain_concept'],
    extractConcept: (query) => {
      const conceptMatch = query.match(/(?:explain|what.*is|tell.*me.*about)\s+(.+)/i);
      return conceptMatch ? conceptMatch[1] : query.replace(/^(explain|what.*is|tell.*me.*about)\s*/i, '');
    }
  },
  {
    patterns: [/improve.*text|fix.*text|rewrite|make.*better/i, /grammar.*check/i],
    intent: 'ai_improve',
    tools: ['improve_text'],
    extractText: (query) => {
      // This will be populated by compound workflows or explicit text
      return '';
    },
    extractImprovementType: (query) => {
      if (/grammar/i.test(query)) return 'grammar';
      if (/clarity/i.test(query)) return 'clarity';
      if (/professional/i.test(query)) return 'professional';
      if (/creative/i.test(query)) return 'creative';
      if (/concise/i.test(query)) return 'conciseness';
      return 'clarity';
    }
  },
  {
    patterns: [/answer.*question|ask.*about|question.*about/i],
    intent: 'ai_question',
    tools: ['answer_question'],
    extractQuestion: (query) => {
      const questionMatch = query.match(/(?:answer|ask|question)\s+(.+)/i);
      return questionMatch ? questionMatch[1] : query;
    }
  },
  {
    patterns: [/analyze.*file.*with.*ai|ai.*analyze.*file|summarize.*file/i],
    intent: 'file_ai_analyze',
    tools: ['read_file', 'analyze_content'],
    extractPath: (query) => {
      const matches = query.match(/(?:file|path)\s+["`']?([^"`'\s]+)["`']?/i) ||
                     query.match(/["`']([^"`']+\.[a-z]+)["`']/i);
      return matches ? matches[1] : 'package.json';
    }
  },
  {
    patterns: [/explain.*calculation|explain.*math|why.*is.*result/i],
    intent: 'calc_ai_explain',
    tools: ['calculate', 'explain_concept'],
    extractExpression: (query) => {
      const mathMatch = query.match(/(?:explain|why)\s+(?:is\s+)?(.+?)(?:\s+equal|\s*=|\s*$)/i);
      return mathMatch ? mathMatch[1].trim() : '';
    }
  }
];

// Intent detection engine
function detectIntent(query) {
  const lowercaseQuery = query.toLowerCase();
  
  for (const pattern of intentPatterns) {
    for (const regex of pattern.patterns) {
      if (regex.test(lowercaseQuery)) {
        console.log(`🎯 Detected intent: ${pattern.intent}`);
        return pattern;
      }
    }
  }
  
  // Fallback - try to find any tool mention
  for (const [toolName] of availableTools) {
    if (lowercaseQuery.includes(toolName.replace('_', ' '))) {
      return {
        intent: toolName,
        tools: [toolName],
        patterns: [`Tool ${toolName} mentioned`]
      };
    }
  }
  
  return {
    intent: 'unknown',
    tools: [],
    patterns: ['No pattern matched']
  };
}

// Create execution plan
function createExecutionPlan(intent, query) {
  const plan = { steps: [], intent, originalQuery: query };
  
  switch (intent.intent) {
    case 'read_file':
      plan.steps.push({
        tool: 'read_file',
        arguments: { path: intent.extractPath(query) },
        description: `Read file: ${intent.extractPath(query)}`
      });
      break;
      
    case 'calculate':
      plan.steps.push({
        tool: 'calculate',
        arguments: { expression: intent.extractExpression(query) },
        description: `Calculate: ${intent.extractExpression(query)}`
      });
      break;
      
    case 'statistics':
      const numbers = intent.extractNumbers(query);
      plan.steps.push({
        tool: 'statistics',
        arguments: { numbers, operations: ['mean', 'sum', 'min', 'max', 'stddev'] },
        description: `Analyze numbers: [${numbers.join(', ')}]`
      });
      break;
      
    case 'fetch_url':
      plan.steps.push({
        tool: 'fetch_url',
        arguments: { url: intent.extractUrl(query) },
        description: `Fetch URL: ${intent.extractUrl(query)}`
      });
      break;
      
    case 'extract_text':
      plan.steps.push({
        tool: 'extract_text',
        arguments: { url: intent.extractUrl(query), max_length: 2000 },
        description: `Extract text from: ${intent.extractUrl(query)}`
      });
      break;
      
    case 'list_files':
      plan.steps.push({
        tool: 'list_files',
        arguments: { directory: intent.extractDirectory(query) },
        description: `List files in: ${intent.extractDirectory(query)}`
      });
      break;
      
    case 'write_file':
      const fileInfo = intent.extractFileInfo(query);
      plan.steps.push({
        tool: 'write_file',
        arguments: fileInfo,
        description: `Write to file: ${fileInfo.path}`
      });
      break;
      
    case 'save_context':
      const fileName = intent.extractFileName(query);
      // Check if we have previous result to save
      // Try lastResult, then recentResults as fallback
      let last = conversationMemory.lastResult;
      if (!last && conversationMemory.recentResults.length > 0) {
        const recent = conversationMemory.recentResults[conversationMemory.recentResults.length - 1];
        console.log('🔁 Falling back to recentResults for save_context:', recent?.intent);
        last = recent?.result || recent;
      }

      if (!last) {
        plan.error = "No previous result to save. Please run a command that generates content first.";
        break;
      }

      // Extract content from last result
      let contentToSave = '';
      console.log('🔍 Saving context - lastIntent:', conversationMemory.lastIntent);
      try {
        console.log('🔍 Saving context - lastResult structure:', Object.keys(last || {}));
      } catch (e) {
        console.log('🔍 Saving context - lastResult (non-object)');
      }

      if ((conversationMemory.lastIntent === 'web_ai_analyze' || (conversationMemory.recentResults.slice(-1)[0]?.intent === 'web_ai_analyze')) && last.analysis) {
        contentToSave = `Website Summary\n================\n\n${last.analysis}`;
      } else if (last.result !== undefined) {
        contentToSave = typeof last.result === 'string' ? last.result : JSON.stringify(last.result, null, 2);
      } else if (last.response) {
        contentToSave = last.response;
      } else if (typeof last === 'string') {
        contentToSave = last;
      } else {
        contentToSave = JSON.stringify(last, null, 2);
      }

      console.log('🔍 Content to save length:', contentToSave.length);
      console.log('🔍 File name extracted:', fileName);
      
      plan.steps.push({
        tool: 'write_file',
        arguments: { 
          path: fileName,
          content: contentToSave
        },
        description: `Save previous result to: ${fileName}`
      });
      break;
      
    case 'file_analysis':
      const filePath = intent.extractPath(query);
      plan.steps.push(
        {
          tool: 'read_file',
          arguments: { path: filePath },
          description: `Read file: ${filePath}`
        },
        {
          tool: 'statistics',
          arguments: { numbers: [1, 2, 3, 4, 5], operations: ['mean', 'sum'] },
          description: 'Analyze data (simplified for demo)',
          dependsOn: 0
        }
      );
      break;
      
    case 'fetch_and_save':
      const fetchInfo = intent.extractInfo(query);
      plan.steps.push(
        {
          tool: 'fetch_url',
          arguments: { url: fetchInfo.url },
          description: `Fetch: ${fetchInfo.url}`
        },
        {
          tool: 'write_file',
          arguments: { path: fetchInfo.path, content: 'PLACEHOLDER' },
          description: `Save to: ${fetchInfo.path}`,
          dependsOn: 0
        }
      );
      break;
      
    // AI-powered single step intents
    case 'ai_analyze':
      plan.steps.push({
        tool: 'analyze_content',
        arguments: { 
          content: intent.extractContent(query) || 'Content will be provided by compound workflow',
          analysis_type: intent.extractAnalysisType(query)
        },
        description: `AI analyze content: ${intent.extractAnalysisType(query)}`
      });
      break;
      
    case 'ai_generate':
      plan.steps.push({
        tool: 'generate_text',
        arguments: { 
          prompt: intent.extractPrompt(query),
          max_tokens: 500,
          temperature: 0.7
        },
        description: `AI generate: ${intent.extractPrompt(query)}`
      });
      break;
      
    case 'ai_explain':
      plan.steps.push({
        tool: 'explain_concept',
        arguments: { 
          concept: intent.extractConcept(query),
          complexity_level: 'beginner',
          include_examples: true
        },
        description: `AI explain: ${intent.extractConcept(query)}`
      });
      break;
      
    case 'ai_improve':
      plan.steps.push({
        tool: 'improve_text',
        arguments: { 
          text: intent.extractText(query) || 'Text will be provided by compound workflow',
          improvement_type: intent.extractImprovementType(query)
        },
        description: `AI improve text: ${intent.extractImprovementType(query)}`
      });
      break;
      
    case 'ai_question':
      plan.steps.push({
        tool: 'answer_question',
        arguments: { 
          question: intent.extractQuestion(query)
        },
        description: `AI answer: ${intent.extractQuestion(query)}`
      });
      break;
      
    // Compound AI workflows
    case 'web_ai_analyze':
      const url = intent.extractUrl(query);
      plan.steps.push(
        {
          tool: 'extract_text',
          arguments: { url, max_length: 3000 },
          description: `Extract text from: ${url}`
        },
        {
          tool: 'analyze_content',
          arguments: { 
            content: 'PLACEHOLDER',
            analysis_type: 'summary'
          },
          description: 'AI analyze extracted content',
          dependsOn: 0
        }
      );
      break;
      
    case 'file_ai_analyze':
      const aiFilePath = intent.extractPath(query);
      plan.steps.push(
        {
          tool: 'read_file',
          arguments: { path: aiFilePath },
          description: `Read file: ${aiFilePath}`
        },
        {
          tool: 'analyze_content',
          arguments: { 
            content: 'PLACEHOLDER',
            analysis_type: 'comprehensive'
          },
          description: 'AI analyze file content',
          dependsOn: 0
        }
      );
      break;
      
    case 'calc_ai_explain':
      const expression = intent.extractExpression(query);
      plan.steps.push(
        {
          tool: 'calculate',
          arguments: { expression },
          description: `Calculate: ${expression}`
        },
        {
          tool: 'explain_concept',
          arguments: { 
            concept: `mathematical calculation: ${expression}`,
            context: 'PLACEHOLDER',
            complexity_level: 'beginner',
            include_examples: true
          },
          description: 'AI explain calculation',
          dependsOn: 0
        }
      );
      break;
      
    default:
      plan.steps.push({
        tool: 'error',
        arguments: { message: `I don't understand how to: ${query}` },
        description: 'Unknown request'
      });
  }
  
  return plan;
}

// Execute a plan step
async function executeStep(plan, stepIndex, previousResults = []) {
  const step = plan.steps[stepIndex];
  
  if (step.tool === 'error') {
    return { success: false, error: step.arguments.message };
  }
  
  // Handle dependencies
  if (step.dependsOn !== undefined) {
    const dependentResult = previousResults[step.dependsOn];
    
    if (step.tool === 'write_file' && dependentResult?.data) {
      step.arguments.content = typeof dependentResult.data === 'object' 
        ? JSON.stringify(dependentResult.data, null, 2)
        : dependentResult.data.toString();
    }
    
    // Handle AI analysis tools that depend on extracted content
    if (step.tool === 'analyze_content') {
      // Check for text in result.text (from extract_text tool)
      if (dependentResult?.result?.text) {
        step.arguments.content = dependentResult.result.text;
      }
      // Fallback: check for direct text property
      else if (dependentResult?.text) {
        step.arguments.content = dependentResult.text;
      }
    }
    
    // Handle AI explanation tools that depend on calculation results
    if (step.tool === 'explain_concept') {
      if (dependentResult?.result?.result) {
        step.arguments.context = `The calculation result is: ${dependentResult.result.result}`;
      } else if (dependentResult?.result) {
        step.arguments.context = `The calculation result is: ${dependentResult.result}`;
      }
    }
    
    // Handle AI improvement tools that depend on file content
    if (step.tool === 'improve_text') {
      if (dependentResult?.result?.content) {
        step.arguments.text = dependentResult.result.content;
      } else if (dependentResult?.content) {
        step.arguments.text = dependentResult.content;
      }
    }
  }
  
  const toolInfo = availableTools.get(step.tool);
  if (!toolInfo) {
    return { success: false, error: `Tool ${step.tool} not available` };
  }
  
  return new Promise((resolve) => {
    const requestId = `orchestrator-${Date.now()}-${stepIndex}`;
    
    // Store request for response handling
    const requestInfo = {
      resolve,
      step,
      stepIndex,
      timestamp: Date.now()
    };
    
    pendingRequests.set(requestId, requestInfo);
    
    // Send tool call
    const toolCall = {
      type: 'tools/call',
      id: requestId,
      from: agentId,
      params: {
        name: step.tool,
        arguments: step.arguments
      }
    };
    
    console.log(`🔧 Orchestrator executing step ${stepIndex + 1}: ${step.description}`);
    ws.send(JSON.stringify(toolCall));
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        resolve({ success: false, error: 'Tool call timeout', tool: step.tool });
      }
    }, 10000);
  });
}

// Execute complete plan
async function executePlan(plan, originalMessage) {
  const results = [];
  
  console.log(`🎯 Orchestrator executing plan: ${plan.intent} with ${plan.steps.length} steps`);
  
  for (let i = 0; i < plan.steps.length; i++) {
    const result = await executeStep(plan, i, results);
    results.push(result);
    
    if (!result.success) {
      break;
    }
  }
  
  // Synthesize response
  const response = synthesizeResponse(plan, results);
  
  // Store result in conversation memory for future reference
  if (results.length > 0 && results[results.length - 1].success) {
    const lastResult = results[results.length - 1].result;
    conversationMemory.lastResult = lastResult;
    conversationMemory.lastQuery = plan.originalQuery;
    conversationMemory.lastIntent = plan.intent.intent;
    
    // Keep recent results (last 5)
    conversationMemory.recentResults.push({
      query: plan.originalQuery,
      intent: plan.intent.intent,
      result: lastResult,
      timestamp: Date.now()
    });
    if (conversationMemory.recentResults.length > 5) {
      conversationMemory.recentResults.shift();
    }
  }
  
  // Send response back to original requester
  if (originalMessage._responseTarget) {
    originalMessage._responseTarget.send(JSON.stringify({
      type: 'response',
      id: originalMessage.id,
      result: {
        success: true,
        query: plan.originalQuery,
        intent: plan.intent,
        executedSteps: plan.steps.length,
        response
      }
    }));
  }
}

// Synthesize natural language response
function synthesizeResponse(plan, results) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  if (failed.length > 0) {
    return `❌ I encountered an error: ${failed[0].error}`;
  }
  
  switch (plan.intent.intent) {
    case 'read_file':
      const fileResult = successful[0]?.result;
      if (fileResult?.content) {
        const preview = fileResult.content.length > 200 
          ? fileResult.content.substring(0, 200) + '...'
          : fileResult.content;
        return `📄 File content (${fileResult.size} bytes):\n\n${preview}`;
      }
      return '📄 File read successfully but no content returned.';
      
    case 'calculate':
      const calcResult = successful[0]?.result;
      return `🧮 Result: ${calcResult?.expression} = ${calcResult?.result}`;
      
    case 'statistics':
      const statsResult = successful[0]?.result;
      if (statsResult?.statistics) {
        const stats = statsResult.statistics;
        return `📊 Statistics for ${statsResult.count} numbers:\n` +
               `• Sum: ${stats.sum}\n` +
               `• Mean: ${stats.mean?.toFixed(2)}\n` +
               `• Min: ${stats.min}, Max: ${stats.max}\n` +
               `• Std Dev: ${stats.stddev?.toFixed(2)}`;
      }
      return '📊 Statistics calculated successfully.';
      
    case 'fetch_url':
      const fetchResult = successful[0]?.result;
      return `🌐 Fetched ${fetchResult?.url} (${fetchResult?.status} ${fetchResult?.statusText})\n` +
             `Content type: ${fetchResult?.contentType}\n` +
             `Size: ${fetchResult?.size} bytes`;
      
    case 'extract_text':
      const textResult = successful[0]?.result;
      if (textResult?.text) {
        return `📄 Extracted text from ${textResult.url}\n` +
               `📰 Title: ${textResult.title}\n` +
               `📏 Length: ${textResult.extractedLength} characters\n\n` +
               `${textResult.text}`;
      }
      return `📄 Text extracted from ${textResult?.url || 'webpage'} but no content found.`;
      
    case 'list_files':
      const listResult = successful[0]?.result;
      if (listResult?.files) {
        const filesList = listResult.files
          .slice(0, 10)
          .map(f => `• ${f.name} (${f.type})`)
          .join('\n');
        return `📁 Files in ${listResult.directory}:\n${filesList}`;
      }
      return '📁 Directory listing completed.';
      
    case 'write_file':
      const writeResult = successful[0]?.result;
      return `💾 Successfully wrote ${writeResult?.size} bytes to ${writeResult?.path}`;
      
    case 'save_context':
      const contextSaveResult = successful[0]?.result;
      if (!contextSaveResult) {
        return `❌ Failed to save file - no result returned`;
      }
      if (!contextSaveResult.success) {
        return `❌ Failed to save file: ${contextSaveResult.error || 'Unknown error'}`;
      }
      const filePath = contextSaveResult.path || 'unknown file';
      const fileSize = contextSaveResult.size || 0;
      const sourceQuery = conversationMemory.lastQuery || 'previous operation';
      return `💾 Successfully saved previous result to ${filePath}\n` +
             `📄 Content: ${fileSize} bytes from "${sourceQuery}"`;
      
    case 'file_analysis':
      const readResult = successful[0]?.result;
      const analysisResult = successful[1]?.result;
      return `📊 Analyzed file: ${readResult?.path}\n` +
             `File size: ${readResult?.size} bytes\n` +
             `Analysis: ${JSON.stringify(analysisResult?.statistics)}`;
      
    case 'fetch_and_save':
      const webResult = successful[0]?.result;
      const saveResult = successful[1]?.result;
      return `🌐➡️💾 Downloaded ${webResult?.url} and saved to ${saveResult?.path}\n` +
             `Status: ${webResult?.status}, Size: ${saveResult?.size} bytes`;
      
    // AI-powered single step responses
    case 'ai_analyze':
      const analyzeResult = successful[0]?.result;
      return `🤖 AI Analysis:\n\n${analyzeResult?.analysis || 'Analysis completed successfully.'}`;
      
    case 'ai_generate':
      const generateResult = successful[0]?.result;
      return `✨ AI Generated Content:\n\n${generateResult?.text || 'Content generated successfully.'}`;
      
    case 'ai_explain':
      const explainResult = successful[0]?.result;
      return `🎓 AI Explanation:\n\n${explainResult?.explanation || 'Explanation provided successfully.'}`;
      
    case 'ai_improve':
      const improveResult = successful[0]?.result;
      return `📝 AI Improved Text:\n\n${improveResult?.improved_text || 'Text improved successfully.'}`;
      
    case 'ai_question':
      const questionResult = successful[0]?.result;
      return `💭 AI Answer:\n\n${questionResult?.answer || 'Question answered successfully.'}`;
      
    // Compound AI workflow responses
    case 'web_ai_analyze':
      const webExtractResult = successful[0]?.result;
      const webAnalyzeResult = successful[1]?.result;
      return `🌐🤖 Web Content Analysis:\n\n` +
             `📄 Extracted from: ${webExtractResult?.url}\n` +
             `📰 Title: ${webExtractResult?.title}\n\n` +
             `🤖 AI Analysis:\n${webAnalyzeResult?.analysis || 'Analysis completed.'}`;
      
    case 'file_ai_analyze':
      const fileReadResult = successful[0]?.result;
      const fileAnalyzeResult = successful[1]?.result;
      return `📄🤖 File Content Analysis:\n\n` +
             `📁 File: ${fileReadResult?.path}\n` +
             `📏 Size: ${fileReadResult?.size} bytes\n\n` +
             `🤖 AI Analysis:\n${fileAnalyzeResult?.analysis || 'Analysis completed.'}`;
      
    case 'calc_ai_explain':
      const calcExplainResult = successful[0]?.result;
      const explainCalcResult = successful[1]?.result;
      return `🧮🤖 Mathematical Explanation:\n\n` +
             `📊 Calculation: ${calcExplainResult?.expression} = ${calcExplainResult?.result}\n\n` +
             `🎓 AI Explanation:\n${explainCalcResult?.explanation || 'Explanation provided.'}`;
      
    default:
      return `✅ Completed ${successful.length} operations successfully.`;
  }
}

// Tool Implementations
const toolHandlers = {
  natural_request: async (args) => {
    try {
      const query = args.query;
      console.log(`🎭 Orchestrator processing: "${query}"`);
      
      // Detect intent
      const intent = detectIntent(query);
      
      if (intent.intent === 'unknown') {
        return {
          success: true,
          query,
          intent: 'unknown',
          response: `🤔 I'm not sure how to help with: "${query}"\n\nI can help with:\n• Reading files\n• Mathematical calculations\n• Statistics\n• Web requests\n• File operations\n\nTry asking something like "read package.json" or "calculate 2 + 3 * 4"`
        };
      }
      
      // Create and execute plan
      const plan = createExecutionPlan(intent, query);
      
      // Execute the plan synchronously and return the actual result
      const results = [];
      
      for (let i = 0; i < plan.steps.length; i++) {
        const result = await executeStep(plan, i, results);
        results.push(result);
        
        if (!result.success) {
          break;
        }
      }
      
      // Synthesize response
      const response = synthesizeResponse(plan, results);
      
      // Store result in conversation memory for future reference (mirror executePlan behavior)
      if (results.length > 0 && results[results.length - 1].success) {
        const lastResult = results[results.length - 1].result;
        conversationMemory.lastResult = lastResult;
        conversationMemory.lastQuery = plan.originalQuery || query;
        conversationMemory.lastIntent = intent.intent;
        conversationMemory.recentResults.push({
          query: plan.originalQuery || query,
          intent: intent.intent,
          result: lastResult,
          timestamp: Date.now()
        });
        if (conversationMemory.recentResults.length > 5) conversationMemory.recentResults.shift();
      }

      return {
        success: true,
        query,
        intent: intent.intent,
        executedSteps: plan.steps.length,
        response
      };
      
    } catch (error) {
      return {
        success: false,
        query: args.query,
        error: error.message,
        response: `❌ Error processing request: ${error.message}`
      };
    }
  }
};

function connect() {
  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log(`🎭 Orchestrator Agent connected`);
    
    ws.send(JSON.stringify({
      type: 'register',
      from: agentId,
      capabilities: {
        tools,
        resources: []
      }
    }));
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      console.log('ORCHESTRATOR RECV:', msg);

      if (msg.type === 'registered') {
        console.log('✅ Orchestrator Agent registered successfully');
        console.log(`🎯 Available for natural language coordination`);
        
        // Update our tool registry
        if (msg.serverCapabilities?.tools) {
          availableTools.clear();
          msg.serverCapabilities.tools.forEach(toolName => {
            availableTools.set(toolName, { agentId: 'unknown', schema: { name: toolName } });
          });
          console.log(`🔧 Discovered ${availableTools.size} available tools`);
        }
        return;
      }

      if (msg.type === 'capabilities_updated') {
        console.log('🔄 Updating tool capabilities...');
        
        // Update our tool registry with latest capabilities
        if (msg.serverCapabilities?.tools) {
          availableTools.clear();
          msg.serverCapabilities.tools.forEach(toolName => {
            availableTools.set(toolName, { agentId: 'unknown', schema: { name: toolName } });
          });
          console.log(`🔧 Updated to ${availableTools.size} available tools: ${Array.from(availableTools.keys()).join(', ')}`);
        }
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
        
        console.log(`🔧 Orchestrator executing: ${toolName}`);
        const result = await handler(args);
        
        // Store response target for async execution
        if (msg.id.startsWith('orchestrator-async')) {
          // This is for async plan execution, handle differently
          return;
        }
        
        ws.send(JSON.stringify({
          type: 'response',
          id: msg.id,
          result,
          _workflowId: msg._workflowId
        }));
      }

      if (msg.type === 'response') {
          // Handle responses from other agents
          const requestInfo = pendingRequests.get(msg.id);
          console.log('🟢 Orchestrator received response:', {
            id: msg.id,
            tool: requestInfo?.step?.tool,
            result: msg.result
          });
          if (requestInfo) {
            pendingRequests.delete(msg.id);
            requestInfo.resolve({ success: true, result: msg.result, tool: requestInfo.step.tool });
          }
      }

      if (msg.type === 'error') {
        // Handle errors from other agents
        const requestInfo = pendingRequests.get(msg.id);
        if (requestInfo) {
          pendingRequests.delete(msg.id);
          requestInfo.resolve({ 
            success: false, 
            error: msg.error?.message || 'Unknown error',
            tool: requestInfo.step.tool 
          });
        }
      }

    } catch (error) {
      console.error('Orchestrator Agent error:', error);
      if (msg?.id) {
        ws.send(JSON.stringify({
          type: 'error',
          id: msg.id,
          error: { code: 'INTERNAL_ERROR', message: error.message }
        }));
      }
    }
  });

  ws.on('close', () => {
    console.log('🎭 Orchestrator Agent connection closed, reconnecting...');
    setTimeout(connect, 1000);
  });

  ws.on('error', (error) => {
    console.error('Orchestrator Agent error:', error);
  });
}

console.log('🎭 Starting Orchestrator Agent...');
connect();
