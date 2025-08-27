#!/bin/bash

echo "🔄 Restarting all MCP agents..."

# Kill any existing agents
pkill -f "node src/agents" 2>/dev/null
pkill -f "node src/server" 2>/dev/null

# Wait for processes to terminate
sleep 2

echo "🚀 Starting MCP server..."
npm run start-server &
sleep 3

echo "🎭 Starting orchestrator agent..."
npm run start-orchestrator &
sleep 2

echo "📁 Starting file agent..."
npm run start-file-agent &
sleep 2

echo "🧮 Starting calculator agent..."
npm run start-calc-agent &
sleep 2

echo "🌐 Starting web agent..."
npm run start-web-agent &
sleep 2

echo "🤖 Starting AI agent..."
npm run start-ai-agent &
sleep 3

echo "✅ All agents started!"
echo "🔍 Checking running processes..."
ps aux | grep "node src" | grep -v grep

echo ""
echo "🌐 Web interface should be available at: http://localhost:8080"
echo "📊 Check agent status in the web interface"
