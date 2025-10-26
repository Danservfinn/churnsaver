# Contributing to Churn Saver

Thank you for your interest in contributing to Churn Saver! This guide will help you understand how to contribute effectively to our project.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Coding Standards](#coding-standards)
5. [Testing Guidelines](#testing-guidelines)
6. [Documentation Standards](#documentation-standards)
7. [Pull Request Process](#pull-request-process)
8. [Release Process](#release-process)
9. [Community Resources](#community-resources)

## Code of Conduct

### Our Pledge

We are committed to making participation in our project a harassment-free experience for everyone, regardless of level of experience, gender, gender identity and expression, sexual orientation, disability, personal appearance, body size, race, ethnicity, age, religion, or nationality.

### Our Standards

**Positive Behavior:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable Behavior:**
- Harassment, sexualized language, or imagery
- Trolling, insulting/derogatory comments, or personal/political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Any other conduct which could reasonably be considered inappropriate

### Enforcement

Project maintainers have the right and responsibility to remove, edit, or reject comments, commits, code, wiki edits, issues, and other contributions that are not aligned to this Code of Conduct. Project maintainers who do not follow the Code of Conduct may be removed from the project team.

### Reporting

If you experience or witness unacceptable behavior, please contact us at [conduct@churnsaver.com](mailto:conduct@churnsaver.com). All reports will be reviewed and investigated and will result in a response that is in the best interest of our community.

## Getting Started

### Prerequisites

Before you start contributing, make sure you have:

- **Node.js**: Version 18.x or higher
- **pnpm**: Version 9.15.9 or higher (package manager)
- **PostgreSQL**: Version 14.x or higher
- **Git**: Version 2.x or higher
- **GitHub account**: For repository access and collaboration

### Development Setup

1. **Fork the Repository**
   ```bash
   # Fork the repository on GitHub
   # Clone your fork locally
   git clone https://github.com/your-username/churn-saver.git
   cd churn-saver
   ```

2. **Set Up Development Environment**
   ```bash
   # Install dependencies
   pnpm install
   
   # Set up environment variables
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

3. **Database Setup**
   ```bash
   # Start PostgreSQL (using Docker recommended)
   docker-compose up -d postgres
   
   # Run migrations
   pnpm run db:migrate
   
   # Seed development data
   pnpm run db:seed
   ```

4. **Start Development Server**
   ```bash
   # Start the development server
   pnpm dev
   ```

### Development Resources

- **Development Guide**: [apps/web/docs/development/README.md](apps/web/docs/development/README.md)
- **API Documentation**: [apps/web/docs/api/README.md](apps/web/docs/api/README.md)
- **Component Library**: [apps/web/docs/components/README.md](apps/web/docs/components/README.md)
- **Database Schema**: [infra/migrations/](infra/migrations/)

## Development Workflow

### Branching Strategy

We use a simplified Git Flow model:

```bash
main                    # Production-ready code
├── develop             # Integration branch for features
├── release/v1.0.0     # Release preparation
└── hotfix/critical-bug  # Production hotfixes
```

### Branch Naming Conventions

- **Feature branches**: `feature/feature-name`
- **Bug fix branches**: `bugfix/issue-description`
- **Hotfix branches**: `hotfix/critical-issue`
- **Release branches**: `release/version-number`

### Daily Development Workflow

1. **Start of Day**
   ```bash
   # Update develop branch
   git checkout develop
   git pull origin develop
   
   # Create/update feature branch
   git checkout feature/current-feature
   git rebase develop
   ```

2. **During Development**
   ```bash
   # Make small, focused changes
   # Commit frequently with descriptive messages
   git add .
   git commit -m "feat: add user authentication form"
   ```

3. **End of Day**
   ```bash
   # Push changes to remote
   git push origin feature/current-feature
   ```

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
feat:     # New feature
fix:       # Bug fix
docs:      # Documentation changes
style:     # Code formatting (no logic change)
refactor:   # Code refactoring
test:       # Adding or updating tests
chore:      # Maintenance tasks
perf:       # Performance improvements
ci:         # CI/CD changes
build:      # Build system changes
revert:     # Revert previous commit
```

**Format**: `type(scope): description`

**Examples**:
```bash
feat(auth): add user authentication
fix(api): resolve database connection timeout
docs(readme): update installation instructions
style(components): fix linting issues
refactor(services): simplify user service logic
test(auth): add unit tests for authentication
chore(deps): update dependencies
perf(api): optimize database queries
ci(github): add automated testing workflow
build(webpack): update webpack configuration
revert(api): revert problematic API changes
```

## Coding Standards

### Code Organization

Follow the established project structure:

```
apps/web/src/
├── app/                  # Next.js app router
├── components/            # React components
│   ├── ui/             # Base UI components
│   ├── layouts/         # Layout components
│   └── dashboard/       # Dashboard components
├── lib/                  # Utility libraries
│   ├── whop/            # Whop SDK integration
│   ├── auth/            # Authentication utilities
│   └── common/          # Common utilities
├── server/               # Server-side code
│   ├── middleware/       # API middleware
│   ├── services/         # Business logic
│   └── webhooks/        # Webhook handlers
└── types/                # TypeScript definitions
```

### File Naming Conventions

- **Components**: PascalCase with `.tsx` extension
- **Utilities**: camelCase with `.ts` extension
- **API Routes**: lowercase with hyphens
- **Types**: camelCase with `.ts` extension

### Code Style

We use **Biome** for linting and formatting:

```bash
# Run linter
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format
```

#### Import Organization

```typescript
// Import order: External libraries, internal modules, relative imports
import React from 'react';
import { NextRequest } from 'next/server';

import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/common/formatters';

import { UserCard } from './user-card';
import { UserList } from './user-list';
```

#### TypeScript Guidelines

- Use TypeScript for all new files
- Define interfaces for complex objects
- Use proper type annotations
- Avoid `any` type when possible
- Use generics for reusable components

#### React Guidelines

- Use functional components with hooks
- Follow React naming conventions
- Use proper prop types/interfaces
- Implement proper error boundaries
- Use React.memo for performance optimization

#### API Guidelines

- Follow RESTful conventions
- Use proper HTTP status codes
- Implement proper error handling
- Validate input data
- Use consistent response format

### Security Guidelines

- Never commit sensitive information
- Use environment variables for configuration
- Implement proper authentication and authorization
- Validate all input data
- Use HTTPS for all API calls
- Follow OWASP security best practices

## Testing Guidelines

### Test Structure

```
test/
├── unit/                 # Unit tests
├── integration/          # Integration tests
├── e2e/                 # End-to-end tests
├── fixtures/             # Test data
├── helpers/              # Test utilities
└── setup/               # Test setup
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test test/auth.test.js

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

### Test Requirements

- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test API endpoints and database operations
- **E2E Tests**: Test complete user workflows
- **Coverage**: Maintain at least 80% code coverage

### Writing Tests

#### Unit Tests

```javascript
// test/unit/lib/formatters.test.js
const { formatCurrency } = require('../../../src/lib/common/formatters');

describe('formatCurrency', () => {
  test('formats positive amounts correctly', () => {
    expect(formatCurrency(2999, 'USD')).toBe('$29.99');
  });

  test('handles zero amount correctly', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });

  test('handles negative amounts correctly', () => {
    expect(formatCurrency(-500, 'USD')).toBe('-$5.00');
  });
});
```

#### Integration Tests

```javascript
// test/integration/api/auth.test.js
const request = require('supertest');
const app = require('../../../src/app');

describe('Authentication API', () => {
  test('POST /api/auth/login with valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      })
      .expect(200);

    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
  });
});
```

### Test Best Practices

- Write descriptive test names
- Use AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Test edge cases and error conditions
- Keep tests simple and focused
- Use meaningful test data

## Documentation Standards

### Code Documentation

- Add JSDoc comments for all public functions
- Include parameter types and return types
- Add usage examples for complex functions
- Document error conditions
- Keep comments up-to-date with code changes

#### JSDoc Example

```typescript
/**
 * Formats a currency amount with the specified currency code.
 * 
 * @param amount - The amount in cents to format
 * @param currency - The currency code (ISO 4217)
 * @returns The formatted currency string
 * 
 * @example
 * ```typescript
 * formatCurrency(2999, 'USD') // Returns '$29.99'
 * formatCurrency(2999, 'EUR') // Returns '€29.99'
 * ```
 */
export const formatCurrency = (amount: number, currency: string): string => {
  // Implementation
};
```

### API Documentation

- Document all endpoints with method, path, and parameters
- Include request/response examples
- Document authentication requirements
- Include error response examples
- Keep API docs in sync with code changes

### Component Documentation

- Document component props and their types
- Include usage examples
- Document any special requirements
- Add accessibility information

### README Updates

- Update README for significant features
- Include installation and setup instructions
- Add usage examples
- Document configuration options

## Pull Request Process

### Creating a Pull Request

1. **Prepare Your Branch**
   ```bash
   # Ensure your branch is up to date
   git checkout develop
   git pull origin develop
   git checkout feature/your-feature
   git rebase develop
   ```

2. **Run Tests and Quality Checks**
   ```bash
   # Run all tests
   pnpm test
   
   # Run linting and formatting
   pnpm lint
   pnpm format
   
   # Type checking
   pnpm type-check
   ```

3. **Create Pull Request**
   - Use the GitHub web interface
   - Fill out the PR template completely
   - Link related issues
   - Request appropriate reviewers

### Pull Request Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Cross-browser testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review of code completed
- [ ] Code is self-documenting
- [ ] Documentation updated if necessary
- [ ] Tests added for new functionality
- [ ] No console.log statements left in code
- [ ] Environment variables documented if added

## Related Issues
Closes #issue_number
Fixes #issue_number
```

### Code Review Process

1. **Automated Checks**
   - CI/CD pipeline runs automatically
   - Linting, formatting, type checking
   - Unit and integration tests
   - Security scans

2. **Manual Review**
   - Code review by team members
   - Focus on logic and architecture
   - Security and performance considerations

3. **Approval Criteria**
   - All automated checks pass
   - All review comments addressed
   - At least one approval from team member
   - Team lead approval for major changes

### Merge Strategies

- **Feature branches**: Use squash merge
- **Release branches**: Use merge commit
- **Hotfix branches**: Use merge commit

## Release Process

### Pre-release Checklist

```markdown
## Code Quality
- [ ] All tests pass
- [ ] Code coverage meets requirements
- [ ] Linting checks pass
- [ ] Type checking passes
- [ ] Security scans pass

## Documentation
- [ ] API documentation updated
- [ ] README updated if necessary
- [ ] Changelog updated
- [ ] Migration scripts prepared

## Environment
- [ ] Environment variables configured
- [ ] Database migrations tested
- [ ] External services configured
- [ ] Monitoring and logging set up
```

### Release Process

1. **Prepare Release**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b release/v1.0.0
   ```

2. **Update Version Numbers**
   - Update package.json version
   - Update changelog
   - Commit changes

3. **Run Final Tests**
   ```bash
   pnpm test
   pnpm build
   ```

4. **Deploy to Staging**
   - Deploy to staging environment
   - Run smoke tests
   - Manual verification

5. **Deploy to Production**
   - Merge release to main
   - Deploy to production
   - Monitor deployment

6. **Post-deployment**
   - Verify functionality
   - Monitor error rates
   - Check performance metrics

### Version Management

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

## Community Resources

### Communication Channels

- **GitHub Discussions**: [Join our discussions](https://github.com/your-org/churn-saver/discussions)
- **Slack**: Join our community at [churn-saver.slack.com](https://churn-saver.slack.com)
- **Twitter**: Follow us [@churnsaver](https://twitter.com/churnsaver)
- **Email**: Reach us at [team@churnsaver.com](mailto:team@churnsaver.com)

### Recognition and Appreciation

We value all contributions and recognize our community members:

- **Contributor Spotlight**: Monthly feature of top contributors
- **Hall of Fame**: Annual recognition of outstanding contributors
- **Swag**: Contributors receive exclusive Churn Saver merchandise
- **Conference Tickets**: Top contributors may receive conference tickets

### Mentorship Opportunities

- **First-time Contributors**: We provide dedicated mentorship
- **Pair Programming**: Schedule sessions with experienced developers
- **Code Review Learning**: Learn from code review discussions
- **Office Hours**: Weekly Q&A sessions with maintainers

### Contributor Spotlight

We celebrate our contributors and their success stories:

- **Blog Features**: Contributor stories on our blog
- **Social Media Shoutouts**: Recognition on our social channels
- **Newsletter Features**: Featured in our monthly newsletter
- **Conference Presentations**: Opportunities to present at conferences

### Getting Help

- **GitHub Issues**: [Create issue](https://github.com/your-org/churn-saver/issues) for bugs and feature requests
- **Discussions**: [Join discussions](https://github.com/your-org/churn-saver/discussions) for questions and ideas
- **Documentation**: Check existing guides for specific topics
- **Community Chat**: Real-time help in our Slack channel

## Integration Points

### Existing Documentation Structure

Our contribution guidelines integrate with existing documentation:

- **Development Setup**: [apps/web/docs/development/README.md](apps/web/docs/development/README.md)
- **API Documentation**: [apps/web/docs/api/README.md](apps/web/docs/api/README.md)
- **Component Library**: [apps/web/docs/components/README.md](apps/web/docs/components/README.md)
- **Database Schema**: [infra/migrations/](infra/migrations/)

### Existing Code Patterns

Follow established patterns in the codebase:

- **Authentication**: Use existing auth middleware and patterns
- **Error Handling**: Follow established error handling patterns
- **API Responses**: Use consistent response formats
- **Database Operations**: Follow existing migration patterns
- **Testing**: Use existing test utilities and helpers

### Existing Testing Frameworks

We use:

- **Unit Testing**: Jest and React Testing Library
- **Integration Testing**: Supertest for API testing
- **E2E Testing**: Playwright for end-to-end testing
- **Database Testing**: Test containers for isolated testing

### Existing API Response Formats

Follow established API response patterns:

```typescript
// Success response
{
  "success": true,
  "data": { /* response data */ },
  "message": "Operation completed successfully"
}

// Error response
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { /* additional error details */ }
  }
}
```

### Existing Error Handling

Follow established error handling patterns:

- Use structured error types
- Implement proper error logging
- Provide meaningful error messages
- Handle errors at appropriate levels
- Use circuit breakers for external services

### Existing Authentication Patterns

Use established authentication patterns:

- JWT-based authentication
- Role-based access control
- Middleware for route protection
- Session management
- OAuth integration with Whop

---

Thank you for contributing to Churn Saver! Your contributions help make this project better for everyone.

**Last Updated**: 2025-10-25  
**Version**: 1.0.0

For questions or feedback about these guidelines, please [open an issue](https://github.com/your-org/churn-saver/issues) or contact us at [team@churnsaver.com](mailto:team@churnsaver.com).