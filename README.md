# Model Context Protocol (MCP) Prototype

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Azure OpenAI](https://img.shields.io/badge/Azure-OpenAI-blue)](https://azure.microsoft.com/en-us/products/ai-services/openai-service)

A comprehensive implementation of the Model Context Protocol (MCP) featuring multi-agent orchestration with Azure OpenAI integration. This prototype demonstrates advanced AI agent coordination, natural language processing workflows, and secure API management.

## 🌟 Features

### Core MCP Implementation
- **WebSocket-based Communication**: Real-time agent-to-agent messaging
- **Tool Discovery & Registration**: Dynamic capability detection
- **Resource Management**: Shared resource access and coordination
- **Workflow Orchestration**: Multi-step process automation

### AI-Powered Agents
- **🎭 Orchestrator Agent**: Natural language command interpretation and workflow coordination
- **🤖 AI Agent**: Azure OpenAI integration for content analysis and generation
- **� Web Agent**: Secure web content extraction with domain whitelisting
- **📁 File Agent**: Sandboxed file operations with security controls
- **🔢 Calculator Agent**: Mathematical computations and unit conversions

### Professional Features
- **Environment-based Configuration**: Secure credential management
- **Comprehensive Logging**: Debug and production logging modes
- **Error Handling**: Graceful failure recovery and reporting
- **Rate Limiting**: API usage controls and throttling
- **Security**: Input validation and sandboxed operations
## 🚀 Quick Start

### Prerequisites
- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Azure OpenAI resource with API access

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YorkUITInnovation/MCP-Prototype.git
   cd MCP-Prototype
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   npm run setup
   # Edit .env with your Azure OpenAI credentials
   ```

4. **Start the demo**
   ```bash
   npm run demo
   ```

5. **Test the system**
   ```bash
   npm test
   ```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │  Orchestrator   │    │   AI Agent      │
│                 │    │     Agent       │    │ (Azure OpenAI)  │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │                      │                      │
     ┌────▼────────────────────────▼──────────────────────▼────┐
     │                MCP Server                              │
     │          (WebSocket Hub + Tool Registry)              │
     └────┬────────────────────────┬──────────────────────┬────┘
          │                      │                      │
┌─────────▼───────┐    ┌─────────▼───────┐    ┌─────────▼───────┐
│   File Agent    │    │   Web Agent     │    │ Calculator Agent│
│  (Sandboxed)    │    │  (Whitelisted)  │    │  (Math Utils)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 💡 Usage Examples

### Natural Language Workflows

```javascript
// Example: Web content analysis and file saving
"Summarize this webpage - https://en.wikipedia.org/wiki/Artificial_Intelligence"
// → AI extracts content, analyzes it, returns summary

"Save that summary to ai_summary.txt"
// → File agent writes the previous result to disk
```

### Direct Tool Usage

```javascript
// Mathematical calculations
"Calculate the compound interest on $10,000 at 5% for 10 years"

// Unit conversions  
"Convert 100 kilometers to miles"

// Web data extraction
"Extract the main content from https://example.com"
```

## 🤖 Available Agents

### **🎭 Orchestrator Agent**
- `natural_request` - Process natural language and coordinate other agents
- **The main interface** - understands intent and manages multi-agent workflows

### **🤖 AI Agent** (Azure OpenAI Integration)
- `generate_text` - Create content using GPT models
- `analyze_content` - Summarize and analyze text
- `answer_question` - Intelligent Q&A
- `improve_text` - Content enhancement
- `explain_concept` - Educational explanations

### **📁 File Agent**
- `read_file` - Read text files with security controls
- `write_file` - Write content to files  
- `list_files` - Directory listings
- `create_directory` - Create folders

### **🔢 Calculator Agent**  
- `calculate` - Safe mathematical expressions
- `statistics` - Mean, median, mode, std dev
- `convert_units` - Temperature, length, weight conversions

### **🌐 Web Agent**
- `fetch_url` - HTTP GET requests
- `post_data` - HTTP POST with JSON
- `check_status` - URL health checks
- `extract_text` - Clean text extraction from web pages

## 📁 Project Structure

```
MCP-Prototype/
├── src/
│   ├── server.js                 # Main MCP server
│   ├── agents/
│   │   ├── orchestrator-agent.js # Natural language coordinator
│   │   ├── ai-agent.js          # Azure OpenAI integration
│   │   ├── web-agent.js         # Web content extraction
│   │   ├── file-agent.js        # File operations
│   │   └── calculator-agent.js  # Mathematical utilities
│   ├── client_example.js        # Example client implementation
│   └── agent_example.js         # Example agent template
├── scripts/
│   ├── run_summarize_save.js    # End-to-end test script
│   └── restart-agents.sh        # Process management
├── docs/
│   └── ENVIRONMENT.md           # Environment configuration guide
├── .env.example                 # Environment template
├── .gitignore                   # Git ignore rules
├── package.json                 # Project configuration
└── README.md                    # This file
```

## ⚙️ Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key-here
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name

# Server Configuration  
PORT=8080
SERVER_URL=ws://localhost:8080

# Security Settings
WEB_AGENT_ALLOWED_DOMAINS=wikipedia.org,github.com
FILE_AGENT_SANDBOX_MODE=true
```

See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for complete configuration options.

## 🔧 Development

### Running Individual Components

```bash
# Start MCP server
npm run start-server

# Start specific agents
npm run start-orchestrator
npm run start-ai-agent
npm run start-web-agent
npm run start-file-agent
npm run start-calc-agent

# Start all agents
npm run start-all-agents
```

### Development Mode

```bash
npm run dev
```

### Testing

```bash
# Run the summarization workflow test
npm test

# Validate environment configuration
npm run validate-env
```

## 🔒 Security Features

- **API Key Protection**: Environment-based credential management
- **Domain Whitelisting**: Web agent restricted to approved domains
- **File Sandboxing**: File operations limited to project directory
- **Input Validation**: Comprehensive parameter validation
- **Rate Limiting**: Configurable API usage limits
- **Error Sanitization**: Secure error reporting without credential exposure

## 🌐 Interactive Web Interface

Visit `http://localhost:8080` to access:

- **Real-time tool registry** - Tools from all connected agents
- **Interactive chat interface** - Natural language interaction with orchestrator
- **Tool testing** - Direct tool invocation and testing
- **System monitoring** - Agent status and performance metrics
- **MCP protocol inspection** - Live message monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🏫 About York University IT Innovation

This project is developed by the York University IT Innovation team as part of our research into advanced AI agent systems and the Model Context Protocol.

## 🐛 Issues & Support

- Report bugs: [GitHub Issues](https://github.com/YorkUITInnovation/MCP-Prototype/issues)
- Documentation: [docs/](docs/)
- Environment Setup: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)

## 🙏 Acknowledgments

- Model Context Protocol specification
- Azure OpenAI Service
- WebSocket protocol implementation
- Open source community contributions

---

**Built with ❤️ by York University IT Innovation Team**
npm run start-web-agent

# Legacy simple demo
npm run start-agent
npm run start-client
```

## 🎯 What This Demonstrates

This demo shows how MCP enables:

1. **Standardized Agent Communication** - Consistent protocols across different agent types
2. **Tool Ecosystem** - Agents contribute specialized capabilities to a shared registry  
3. **Secure Resource Access** - Controlled access to files, APIs, databases via URI abstraction
4. **Workflow Orchestration** - Complex tasks spanning multiple agents with tool composition
5. **Dynamic Discovery** - Clients find and use tools without hardcoded integrations

**This is what makes MCP different from basic chat/RAG systems** - it's a protocol for building composable, secure, multi-agent AI systems.
