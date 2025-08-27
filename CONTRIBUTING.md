# Contributing to MCP Prototype

We love your input! We want to make contributing to this project as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

## Pull Requests

Pull requests are the best way to propose changes to the codebase. We actively welcome your pull requests:

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. Issue that pull request!

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same [MIT License](http://choosealicense.com/licenses/mit/) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report bugs using GitHub's [issue tracker](https://github.com/YorkUITInnovation/MCP-Prototype/issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/YorkUITInnovation/MCP-Prototype/issues/new).

## Write bug reports with detail, background, and sample code

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/YorkUITInnovation/MCP-Prototype.git
   cd MCP-Prototype
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   npm run setup
   # Edit .env with your Azure OpenAI credentials
   ```

4. **Validate your setup**
   ```bash
   npm run validate-env
   ```

5. **Start development environment**
   ```bash
   npm run dev
   ```

## Code Style

- Use ES6+ JavaScript features
- Follow existing naming conventions
- Add JSDoc comments for functions and classes
- Use meaningful variable and function names
- Keep functions small and focused

## Testing

- Run the test suite: `npm test`
- Test individual agents manually
- Verify environment configuration: `npm run validate-env`
- Test the complete workflow with `npm run demo`

## Project Structure

```
src/
├── server.js                 # Main MCP server
├── agents/                   # Individual agent implementations
│   ├── orchestrator-agent.js # Natural language coordinator  
│   ├── ai-agent.js          # Azure OpenAI integration
│   ├── web-agent.js         # Web content extraction
│   ├── file-agent.js        # File operations
│   └── calculator-agent.js  # Mathematical utilities
scripts/                     # Utility scripts
docs/                        # Documentation
```

## Adding New Agents

1. Create a new file in `src/agents/`
2. Follow the existing agent pattern:
   - Import WebSocket and dotenv
   - Define agent tools with JSON schema
   - Implement tool handlers
   - Register with MCP server
3. Add npm script to `package.json`
4. Update documentation

## Adding New Features

1. **Features should align with MCP standards**
   - Tool discovery and registration
   - Resource management
   - Workflow orchestration
   - Security and sandboxing

2. **Consider the multi-agent architecture**
   - How does this fit with existing agents?
   - Does it require new communication patterns?
   - Is it a new agent or enhancement to existing ones?

3. **Update relevant documentation**
   - README.md for user-facing features
   - Code comments for technical details
   - Environment configuration if needed

## Security Guidelines

- **Never commit credentials**: Use environment variables
- **Validate all inputs**: Especially from external sources
- **Sandbox operations**: File and web operations should be restricted
- **Rate limiting**: Implement appropriate limits for external APIs
- **Error handling**: Don't expose sensitive information in errors

## Documentation

- Update README.md for new features
- Add environment variables to .env.example
- Document breaking changes
- Include usage examples
- Update API documentation

## License

By contributing, you agree that your contributions will be licensed under its MIT License.

## Questions?

Feel free to contact the York University IT Innovation team or open an issue for discussion.
