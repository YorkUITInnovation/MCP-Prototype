# Environment Configuration

This document explains how to configure the MCP Demo application using environment variables.

## Quick Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your actual values:
   ```bash
   nano .env  # or use your preferred editor
   ```

3. **Critical**: Update the Azure OpenAI credentials with your actual values

## Required Environment Variables

### Azure OpenAI Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_OPENAI_ENDPOINT` | Your Azure OpenAI resource endpoint | `https://your-resource.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Your Azure OpenAI API key | `your-32-character-api-key` |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Your model deployment name | `gpt-4o-mini` |
| `AZURE_OPENAI_API_VERSION` | API version to use | `2025-01-01-preview` |
| `AZURE_OPENAI_MODEL_NAME` | Model name for logging | `gpt-4o-mini` |

### Server Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `SERVER_URL` | WebSocket URL for agents | `ws://localhost:8080` |

## Security Best Practices

1. **Never commit `.env`** - It's already in `.gitignore`
2. **Rotate API keys** regularly
3. **Use different keys** for development/production
4. **Restrict API key permissions** in Azure Portal
5. **Monitor API usage** to detect anomalies

## Getting Azure OpenAI Credentials

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your Azure OpenAI resource
3. Go to "Keys and Endpoint" section
4. Copy:
   - **Endpoint**: The full URL ending in `.openai.azure.com`
   - **Key**: One of the provided API keys
5. Go to "Model deployments" to get your deployment name

## Troubleshooting

### Error: "AZURE_OPENAI_API_KEY environment variable is required"
- Ensure `.env` file exists and contains `AZURE_OPENAI_API_KEY=your-key`
- Check that your key is valid and active in Azure Portal

### Error: "Invalid AZURE_OPENAI_ENDPOINT format"
- Endpoint must end with `.openai.azure.com`
- Include the full URL with `https://`

### Connection errors
- Verify the PORT and SERVER_URL match
- Check if the port is already in use: `lsof -i :8080`

## Development vs Production

For production deployment:
1. Set `NODE_ENV=production`
2. Use production Azure OpenAI keys
3. Consider using Azure Key Vault for secrets
4. Enable additional security features
5. Set appropriate rate limits

## Environment Variable Validation

The application validates required environment variables on startup:
- Missing required variables will cause the app to exit
- Invalid formats will be detected and reported
- Warnings will be shown for recommended but optional variables
