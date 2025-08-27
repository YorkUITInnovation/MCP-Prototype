#!/usr/bin/env node

import dotenv from 'dotenv';
import fs from 'fs';

console.log('🔍 Validating MCP Prototype Environment Configuration...\n');

// Load environment variables
dotenv.config();

let errors = 0;
let warnings = 0;

function error(message) {
  console.log(`❌ ERROR: ${message}`);
  errors++;
}

function warning(message) {
  console.log(`⚠️  WARNING: ${message}`);
  warnings++;
}

function success(message) {
  console.log(`✅ ${message}`);
}

function info(message) {
  console.log(`ℹ️  ${message}`);
}

// Check if .env file exists
if (!fs.existsSync('.env')) {
  error('.env file not found. Run "npm run setup" to create one.');
} else {
  success('.env file exists');
}

// Required environment variables
const required = [
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_DEPLOYMENT_NAME'
];

const optional = [
  'AZURE_OPENAI_API_VERSION',
  'AZURE_OPENAI_MODEL_NAME',
  'PORT',
  'SERVER_URL',
  'WEB_AGENT_ALLOWED_DOMAINS',
  'FILE_AGENT_SANDBOX_MODE'
];

console.log('\n📋 Required Variables:');
required.forEach(varName => {
  const value = process.env[varName];
  if (!value) {
    error(`${varName} is not set`);
  } else if (value.includes('your-') || value.includes('example')) {
    error(`${varName} contains placeholder value: ${value}`);
  } else {
    success(`${varName} is configured`);
  }
});

console.log('\n📋 Optional Variables:');
optional.forEach(varName => {
  const value = process.env[varName];
  if (!value) {
    info(`${varName} using default value`);
  } else {
    success(`${varName} = ${value}`);
  }
});

// Validate Azure OpenAI endpoint format
console.log('\n🔍 Validation Checks:');
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
if (endpoint) {
  if (!endpoint.includes('.openai.azure.com')) {
    error('AZURE_OPENAI_ENDPOINT must be a valid Azure OpenAI endpoint (.openai.azure.com)');
  } else if (!endpoint.startsWith('https://')) {
    error('AZURE_OPENAI_ENDPOINT must start with https://');
  } else {
    success('Azure OpenAI endpoint format is valid');
  }
}

// Check API key format
const apiKey = process.env.AZURE_OPENAI_API_KEY;
if (apiKey) {
  if (apiKey.length < 20) {
    warning('Azure OpenAI API key seems too short');
  } else if (apiKey === 'your-api-key-here') {
    error('Azure OpenAI API key is still the placeholder value');
  } else {
    success('Azure OpenAI API key format looks valid');
  }
}

// Check port availability
const port = process.env.PORT || '8080';
if (isNaN(parseInt(port))) {
  error(`PORT must be a number, got: ${port}`);
} else {
  success(`Server will run on port ${port}`);
}

// Summary
console.log('\n📊 Validation Summary:');
if (errors === 0 && warnings === 0) {
  console.log('🎉 All checks passed! Your environment is properly configured.');
  console.log('💡 You can now run "npm run demo" to start the MCP prototype.');
} else {
  if (errors > 0) {
    console.log(`❌ Found ${errors} error(s) that must be fixed before running the application.`);
  }
  if (warnings > 0) {
    console.log(`⚠️  Found ${warnings} warning(s) that should be reviewed.`);
  }
  
  console.log('\n🔧 Next Steps:');
  console.log('1. Edit your .env file to fix the issues above');
  console.log('2. Refer to docs/ENVIRONMENT.md for detailed configuration help');
  console.log('3. Run this script again to verify your fixes');
}

process.exit(errors > 0 ? 1 : 0);
