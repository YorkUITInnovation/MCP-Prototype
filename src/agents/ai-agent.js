import WebSocket from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const url = process.env.SERVER_URL || 'ws://localhost:8080';
const agentId = 'ai-agent';

let ws;

// Azure OpenAI Configuration from environment variables
const AZURE_OPENAI_CONFIG = {
  endpoint: process.env.AZURE_OPENAI_ENDPOINT || 'https://your-resource.openai.azure.com',
  apiKey: process.env.AZURE_OPENAI_API_KEY || '',
  deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview',
  modelName: process.env.AZURE_OPENAI_MODEL_NAME || 'gpt-4o-mini'
};

// Validate required environment variables
if (!AZURE_OPENAI_CONFIG.apiKey) {
  console.error('❌ AZURE_OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

if (!AZURE_OPENAI_CONFIG.endpoint.includes('openai.azure.com')) {
  console.error('❌ Invalid AZURE_OPENAI_ENDPOINT format');
  process.exit(1);
}

// AI Agent Capabilities
const tools = [
  {
    name: 'generate_text',
    description: 'Generate text content using AI based on a prompt',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { 
          type: 'string', 
          description: 'The prompt for text generation' 
        },
        max_tokens: { 
          type: 'number', 
          description: 'Maximum tokens to generate',
          default: 500
        },
        temperature: { 
          type: 'number', 
          description: 'Creativity level (0.0-2.0)',
          default: 0.7
        },
        system_message: {
          type: 'string',
          description: 'System message to guide AI behavior',
          default: 'You are a helpful AI assistant.'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'analyze_content',
    description: 'Analyze and summarize text content using AI',
    inputSchema: {
      type: 'object',
      properties: {
        content: { 
          type: 'string', 
          description: 'Content to analyze' 
        },
        analysis_type: {
          type: 'string',
          description: 'Type of analysis to perform',
          enum: ['summary', 'sentiment', 'key_points', 'themes', 'comprehensive'],
          default: 'summary'
        },
        max_tokens: { 
          type: 'number', 
          description: 'Maximum tokens for analysis',
          default: 300
        }
      },
      required: ['content']
    }
  },
  {
    name: 'answer_question',
    description: 'Answer questions based on provided context using AI',
    inputSchema: {
      type: 'object',
      properties: {
        question: { 
          type: 'string', 
          description: 'Question to answer' 
        },
        context: { 
          type: 'string', 
          description: 'Context information for answering the question' 
        },
        max_tokens: { 
          type: 'number', 
          description: 'Maximum tokens for answer',
          default: 250
        }
      },
      required: ['question']
    }
  },
  {
    name: 'improve_text',
    description: 'Improve, rewrite, or enhance text content',
    inputSchema: {
      type: 'object',
      properties: {
        text: { 
          type: 'string', 
          description: 'Text to improve' 
        },
        improvement_type: {
          type: 'string',
          description: 'Type of improvement needed',
          enum: ['grammar', 'clarity', 'tone', 'conciseness', 'professional', 'creative'],
          default: 'clarity'
        },
        target_audience: {
          type: 'string',
          description: 'Target audience for the improved text',
          default: 'general'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'explain_concept',
    description: 'Explain complex concepts in simple terms',
    inputSchema: {
      type: 'object',
      properties: {
        concept: { 
          type: 'string', 
          description: 'Concept to explain' 
        },
        context: { 
          type: 'string', 
          description: 'Additional context or data related to the concept' 
        },
        complexity_level: {
          type: 'string',
          description: 'Explanation complexity level',
          enum: ['beginner', 'intermediate', 'advanced'],
          default: 'beginner'
        },
        include_examples: {
          type: 'boolean',
          description: 'Include practical examples',
          default: true
        }
      },
      required: ['concept']
    }
  }
];

// Azure OpenAI API client
async function callAzureOpenAI(messages, maxTokens = 500, temperature = 0.7) {
  try {
    const requestBody = {
      messages: messages,
      max_tokens: maxTokens,
      temperature: temperature,
      top_p: 0.95,
      frequency_penalty: 0,
      presence_penalty: 0
    };

    const response = await fetch(
      `${AZURE_OPENAI_CONFIG.endpoint}/openai/deployments/${AZURE_OPENAI_CONFIG.deploymentName}/chat/completions?api-version=${AZURE_OPENAI_CONFIG.apiVersion}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_OPENAI_CONFIG.apiKey
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Azure OpenAI API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from Azure OpenAI');
    }

    return {
      success: true,
      content: data.choices[0].message.content,
      usage: data.usage,
      model: AZURE_OPENAI_CONFIG.modelName,
      finishReason: data.choices[0].finish_reason
    };

  } catch (error) {
    console.error('🚨 Azure OpenAI Error:', error);
    return {
      success: false,
      error: error.message,
      type: error.name
    };
  }
}

// Tool Implementations
const toolHandlers = {
  generate_text: async (args) => {
    try {
      const messages = [
        {
          role: 'system',
          content: args.system_message || 'You are a helpful AI assistant.'
        },
        {
          role: 'user',
          content: args.prompt
        }
      ];

      const result = await callAzureOpenAI(messages, args.max_tokens, args.temperature);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        success: true,
        prompt: args.prompt,
        generated_text: result.content,
        tokens_used: result.usage?.total_tokens,
        model: result.model,
        finish_reason: result.finishReason
      };

    } catch (error) {
      return {
        success: false,
        prompt: args.prompt,
        error: error.message,
        type: error.name
      };
    }
  },

  analyze_content: async (args) => {
    try {
      let systemPrompt = '';
      switch (args.analysis_type) {
        case 'summary':
          systemPrompt = 'You are an expert at creating concise, informative summaries. Provide a clear summary of the given content.';
          break;
        case 'sentiment':
          systemPrompt = 'You are a sentiment analysis expert. Analyze the emotional tone and sentiment of the given content.';
          break;
        case 'key_points':
          systemPrompt = 'You are skilled at identifying key points. Extract the most important points from the given content as a bulleted list.';
          break;
        case 'themes':
          systemPrompt = 'You are a thematic analysis expert. Identify the main themes and topics in the given content.';
          break;
        case 'comprehensive':
          systemPrompt = 'You are a comprehensive content analyst. Provide a detailed analysis including summary, key points, themes, and insights.';
          break;
        default:
          systemPrompt = 'You are a helpful content analyst. Analyze the given content and provide useful insights.';
      }

      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Please analyze this content:\n\n${args.content}`
        }
      ];

      const result = await callAzureOpenAI(messages, args.max_tokens, 0.3);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        success: true,
        original_content_length: args.content.length,
        analysis_type: args.analysis_type,
        analysis: result.content,
        tokens_used: result.usage?.total_tokens,
        model: result.model
      };

    } catch (error) {
      return {
        success: false,
        analysis_type: args.analysis_type,
        error: error.message,
        type: error.name
      };
    }
  },

  answer_question: async (args) => {
    try {
      const systemPrompt = 'You are a knowledgeable assistant. Answer questions accurately and helpfully. If you don\'t know something, say so clearly.';
      
      let userPrompt = `Question: ${args.question}`;
      if (args.context) {
        userPrompt += `\n\nContext: ${args.context}`;
      }

      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ];

      const result = await callAzureOpenAI(messages, args.max_tokens, 0.2);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        success: true,
        question: args.question,
        answer: result.content,
        context_provided: !!args.context,
        tokens_used: result.usage?.total_tokens,
        model: result.model
      };

    } catch (error) {
      return {
        success: false,
        question: args.question,
        error: error.message,
        type: error.name
      };
    }
  },

  improve_text: async (args) => {
    try {
      let systemPrompt = '';
      switch (args.improvement_type) {
        case 'grammar':
          systemPrompt = 'You are a grammar expert. Fix grammar, spelling, and punctuation errors while preserving the original meaning and tone.';
          break;
        case 'clarity':
          systemPrompt = 'You are a clarity expert. Improve text clarity and readability while maintaining the original meaning.';
          break;
        case 'tone':
          systemPrompt = `You are a tone expert. Adjust the tone of the text to be appropriate for ${args.target_audience}.`;
          break;
        case 'conciseness':
          systemPrompt = 'You are a conciseness expert. Make the text more concise while preserving all important information.';
          break;
        case 'professional':
          systemPrompt = 'You are a professional writing expert. Make the text more professional and formal.';
          break;
        case 'creative':
          systemPrompt = 'You are a creative writing expert. Make the text more engaging and creative.';
          break;
        default:
          systemPrompt = 'You are a writing improvement expert. Enhance the given text for better readability and impact.';
      }

      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Please improve this text:\n\n${args.text}`
        }
      ];

      const result = await callAzureOpenAI(messages, args.text.length + 200, 0.4);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        success: true,
        original_text: args.text,
        improved_text: result.content,
        improvement_type: args.improvement_type,
        target_audience: args.target_audience,
        tokens_used: result.usage?.total_tokens,
        model: result.model
      };

    } catch (error) {
      return {
        success: false,
        improvement_type: args.improvement_type,
        error: error.message,
        type: error.name
      };
    }
  },

  explain_concept: async (args) => {
    try {
      const systemPrompt = `You are an expert educator skilled at explaining complex concepts. Explain concepts at a ${args.complexity_level} level. ${args.include_examples ? 'Include practical examples to illustrate your points.' : 'Focus on clear explanations without examples.'}`;
      
      let userPrompt = `Please explain this concept: ${args.concept}`;
      if (args.context) {
        userPrompt += `\n\nAdditional context: ${args.context}`;
      }

      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ];

      const result = await callAzureOpenAI(messages, 400, 0.3);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        success: true,
        concept: args.concept,
        explanation: result.content,
        complexity_level: args.complexity_level,
        includes_examples: args.include_examples,
        context_provided: !!args.context,
        tokens_used: result.usage?.total_tokens,
        model: result.model
      };

    } catch (error) {
      return {
        success: false,
        concept: args.concept,
        error: error.message,
        type: error.name
      };
    }
  }
};

function connect() {
  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log(`🤖 AI Agent connected`);
    
    ws.send(JSON.stringify({
      type: 'register',
      from: agentId,
      capabilities: {
        tools,
        resources: [
          {
            uri: 'ai://azure-openai',
            name: 'Azure OpenAI Service',
            description: 'GPT-4o Mini model for text generation and analysis'
          },
          {
            uri: 'ai://capabilities',
            name: 'AI Capabilities',
            description: 'Content generation, analysis, Q&A, and text improvement'
          }
        ]
      }
    }));
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      console.log('AI AGENT RECV:', msg);

      if (msg.type === 'registered') {
        console.log('✅ AI Agent registered successfully');
        console.log(`🧠 Available tools: ${tools.map(t => t.name).join(', ')}`);
        console.log(`🎯 Model: ${AZURE_OPENAI_CONFIG.modelName} via Azure OpenAI`);
      }

      if (msg.type === 'tools/call') {
        const toolName = msg.params.name;
        const toolHandler = toolHandlers[toolName];
        
        if (toolHandler) {
          console.log(`🔧 Executing AI tool: ${toolName}`);
          const result = await toolHandler(msg.params.arguments);
          
          const response = {
            type: 'response',
            id: msg.id,
            result
          };
          
          ws.send(JSON.stringify(response));
        } else {
          const errorResponse = {
            type: 'response',
            id: msg.id,
            result: {
              success: false,
              error: `Unknown tool: ${toolName}`,
              available_tools: tools.map(t => t.name)
            }
          };
          
          ws.send(JSON.stringify(errorResponse));
        }
      }

    } catch (error) {
      console.error('🚨 AI Agent Error:', error);
    }
  });

  ws.on('close', () => {
    console.log('🤖 AI Agent disconnected, attempting to reconnect...');
    setTimeout(connect, 2000);
  });

  ws.on('error', (error) => {
    console.error('🚨 AI Agent WebSocket error:', error);
  });
}

console.log('🤖 Starting AI Agent...');
connect();
