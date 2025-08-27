import WebSocket from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const url = process.env.SERVER_URL || 'ws://localhost:8080';
const agentId = 'calculator-agent';

let ws;

// Calculator Agent Capabilities
const tools = [
  {
    name: 'calculate',
    description: 'Perform mathematical calculations with basic operations',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Mathematical expression to evaluate (e.g., "2 + 3 * 4")' }
      },
      required: ['expression']
    }
  },
  {
    name: 'statistics',
    description: 'Calculate statistics for an array of numbers',
    inputSchema: {
      type: 'object',
      properties: {
        numbers: { 
          type: 'array', 
          items: { type: 'number' },
          description: 'Array of numbers to analyze'
        },
        operations: {
          type: 'array',
          items: { 
            type: 'string',
            enum: ['mean', 'median', 'mode', 'sum', 'min', 'max', 'stddev']
          },
          description: 'Statistical operations to perform'
        }
      },
      required: ['numbers']
    }
  },
  {
    name: 'convert_units',
    description: 'Convert between different units',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'Value to convert' },
        from_unit: { type: 'string', description: 'Source unit (e.g., "celsius", "feet", "kg")' },
        to_unit: { type: 'string', description: 'Target unit (e.g., "fahrenheit", "meters", "lbs")' }
      },
      required: ['value', 'from_unit', 'to_unit']
    }
  }
];

// Safe math expression evaluator
function evaluateExpression(expr) {
  // Remove whitespace and validate characters
  const cleaned = expr.replace(/\s/g, '');
  const allowedChars = /^[0-9+\-*/().\s]+$/;
  
  if (!allowedChars.test(cleaned)) {
    throw new Error('Invalid characters in expression. Only numbers, +, -, *, /, (, ) are allowed.');
  }
  
  // Prevent function calls and other dangerous patterns
  const dangerous = /(function|eval|window|document|process|require|import|export)/i;
  if (dangerous.test(expr)) {
    throw new Error('Potentially dangerous expression detected.');
  }
  
  try {
    // Use Function constructor for safer evaluation than eval
    const result = new Function(`"use strict"; return (${cleaned})`)();
    
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('Result is not a valid number.');
    }
    
    return result;
  } catch (error) {
    throw new Error(`Calculation error: ${error.message}`);
  }
}

// Statistical calculations
function calculateStatistics(numbers, operations = ['mean', 'sum', 'min', 'max']) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const results = {};
  
  if (operations.includes('sum')) {
    results.sum = numbers.reduce((a, b) => a + b, 0);
  }
  
  if (operations.includes('mean')) {
    results.mean = results.sum !== undefined ? results.sum / numbers.length : numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }
  
  if (operations.includes('median')) {
    const mid = Math.floor(sorted.length / 2);
    results.median = sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
  
  if (operations.includes('mode')) {
    const frequency = {};
    numbers.forEach(num => frequency[num] = (frequency[num] || 0) + 1);
    const maxFreq = Math.max(...Object.values(frequency));
    results.mode = Object.keys(frequency).filter(key => frequency[key] === maxFreq).map(Number);
  }
  
  if (operations.includes('min')) {
    results.min = Math.min(...numbers);
  }
  
  if (operations.includes('max')) {
    results.max = Math.max(...numbers);
  }
  
  if (operations.includes('stddev')) {
    const mean = results.mean !== undefined ? results.mean : numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const variance = numbers.reduce((acc, num) => acc + Math.pow(num - mean, 2), 0) / numbers.length;
    results.stddev = Math.sqrt(variance);
  }
  
  return results;
}

// Unit conversions
const conversions = {
  temperature: {
    celsius: {
      fahrenheit: (c) => (c * 9/5) + 32,
      kelvin: (c) => c + 273.15
    },
    fahrenheit: {
      celsius: (f) => (f - 32) * 5/9,
      kelvin: (f) => ((f - 32) * 5/9) + 273.15
    },
    kelvin: {
      celsius: (k) => k - 273.15,
      fahrenheit: (k) => ((k - 273.15) * 9/5) + 32
    }
  },
  length: {
    meters: {
      feet: (m) => m * 3.28084,
      inches: (m) => m * 39.3701,
      kilometers: (m) => m / 1000
    },
    feet: {
      meters: (ft) => ft / 3.28084,
      inches: (ft) => ft * 12,
      kilometers: (ft) => ft / 3280.84
    },
    inches: {
      meters: (in_) => in_ / 39.3701,
      feet: (in_) => in_ / 12,
      centimeters: (in_) => in_ * 2.54
    }
  },
  weight: {
    kg: {
      lbs: (kg) => kg * 2.20462,
      grams: (kg) => kg * 1000
    },
    lbs: {
      kg: (lbs) => lbs / 2.20462,
      ounces: (lbs) => lbs * 16
    }
  }
};

function convertUnits(value, fromUnit, toUnit) {
  const from = fromUnit.toLowerCase();
  const to = toUnit.toLowerCase();
  
  // Find the conversion category
  for (const [category, units] of Object.entries(conversions)) {
    if (units[from] && units[from][to]) {
      return {
        result: units[from][to](value),
        category,
        original: { value, unit: fromUnit },
        converted: { unit: toUnit }
      };
    }
  }
  
  throw new Error(`Conversion from ${fromUnit} to ${toUnit} not supported`);
}

// Tool Implementations
const toolHandlers = {
  calculate: async (args) => {
    try {
      const result = evaluateExpression(args.expression);
      return {
        success: true,
        expression: args.expression,
        result,
        formatted: result.toLocaleString()
      };
    } catch (error) {
      return {
        success: false,
        expression: args.expression,
        error: error.message
      };
    }
  },

  statistics: async (args) => {
    try {
      if (!Array.isArray(args.numbers) || args.numbers.length === 0) {
        throw new Error('Numbers array is required and must not be empty');
      }
      
      if (!args.numbers.every(n => typeof n === 'number' && isFinite(n))) {
        throw new Error('All elements must be finite numbers');
      }
      
      const results = calculateStatistics(args.numbers, args.operations);
      
      return {
        success: true,
        count: args.numbers.length,
        input: args.numbers,
        statistics: results
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        input: args.numbers
      };
    }
  },

  convert_units: async (args) => {
    try {
      const conversion = convertUnits(args.value, args.from_unit, args.to_unit);
      conversion.converted.value = conversion.result;
      conversion.success = true;
      
      return conversion;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        input: { value: args.value, from: args.from_unit, to: args.to_unit }
      };
    }
  }
};

function connect() {
  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log(`🧮 Calculator Agent connected`);
    
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
      console.log('CALC AGENT RECV:', msg);

      if (msg.type === 'registered') {
        console.log('✅ Calculator Agent registered successfully');
        console.log(`🔢 Available tools: ${tools.map(t => t.name).join(', ')}`);
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
      console.error('Calculator Agent error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        id: msg.id,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      }));
    }
  });

  ws.on('close', () => {
    console.log('🧮 Calculator Agent connection closed, reconnecting...');
    setTimeout(connect, 1000);
  });

  ws.on('error', (error) => {
    console.error('Calculator Agent error:', error);
  });
}

console.log('🧮 Starting Calculator Agent...');
connect();
