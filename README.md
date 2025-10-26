# Churn Saver

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![pnpm Version](https://img.shields.io/badge/pnpm-%3E%3D9.15.9-blue)
![PostgreSQL Version](https://img.shields.io/badge/postgresql-%3E%3D14.0-blue)

A comprehensive customer retention platform that helps businesses identify at-risk customers and automate recovery workflows to reduce churn.

## 🚀 Project Overview

Churn Saver is an intelligent customer retention platform designed to help businesses proactively identify customers at risk of churning and implement automated recovery strategies. Our platform combines real-time analytics, AI-powered insights, and automated workflows to maximize customer retention and lifetime value.

### Key Features

- **Automated Churn Detection**: AI-powered algorithms identify customers at risk of churning based on usage patterns and behavior
- **Intelligent Recovery Workflows**: Automated multi-channel recovery sequences with personalized incentives
- **Real-time Analytics Dashboard**: Comprehensive KPIs and insights into retention metrics
- **Flexible Incentive Management**: Configurable incentive programs with budget tracking and ROI analysis
- **Seamless Integrations**: Native integration with Whop API and other popular platforms
- **Enterprise-grade Security**: Role-based access control, data encryption, and GDPR compliance

### Value Proposition

- **Increase Retention Rate**: Average recovery rate of >25% for at-risk customers
- **Maximize ROI**: Average return on incentive investment of >300%
- **Reduce Time to Recovery**: Average recovery time of <7 days from trigger to success
- **Scalable Solution**: Built to handle enterprise-level customer volumes

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL 15+ with Prisma ORM
- **Cache**: Redis 6+
- **Message Queue**: Built-in (Redis-based)

### Frontend
- **Framework**: Next.js 14 with React 18
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI + shadcn/ui
- **State Management**: React hooks + Context

### Infrastructure
- **Hosting**: AWS (ECS, RDS, ElastiCache, CloudFront)
- **Monitoring**: DataDog, Sentry, CloudWatch
- **Security**: AWS WAF, Shield, Certificate Manager
- **CI/CD**: GitHub Actions

### External Integrations
- **Payment Processing**: Whop API
- **Email Delivery**: SMTP/Postmark
- **AI Services**: OpenRouter (Gemini, GPT)
- **Analytics**: Custom events + DataDog

## 🏁 Quick Start Guide

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18.x or higher
- **pnpm**: Version 9.15.9 or higher (package manager)
- **PostgreSQL**: Version 14.x or higher
- **Git**: Version 2.x or higher
- **GitHub account**: For repository access and collaboration

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-org/churn-saver.git
   cd churn-saver
   ```

2. **Install Dependencies**
   ```bash
   # Install dependencies using pnpm
   pnpm install
   ```

3. **Environment Setup**
   ```bash
   # Copy the environment template
   cp .env.example .env.local
   
   # Edit .env.local with your configuration
   # You'll need to configure database connection, API keys, etc.
   ```

4. **Database Setup**
   ```bash
   # Start PostgreSQL (using Docker recommended)
   docker-compose up -d postgres
   
   # Run database migrations
   pnpm run db:migrate
   
   # Seed development data (optional)
   pnpm run db:seed
   ```

5. **Start the Application**
   ```bash
   # Start the development server
   pnpm dev
   ```

6. **Access the Application**
   - Open your browser and navigate to `http://localhost:3000`
   - The application should now be running locally

## 📁 Project Structure

Churn Saver follows a monorepo structure with clear separation of concerns:

```
churn-saver/
├── apps/                   # Application packages
│   └── web/               # Main Next.js web application
│       ├── src/           # Source code
│       ├── public/        # Static assets
│       ├── docs/          # Application-specific documentation
│       └── test/          # Test files
├── docs/                  # Main documentation
│   ├── api/              # API documentation
│   ├── deployment/       # Deployment guides
│   ├── features/         # Feature documentation
│   ├── getting-started/  # Setup and installation guides
│   └── security/         # Security documentation
├── infra/                 # Infrastructure and configuration
│   ├── migrations/       # Database migrations
│   └── docs/            # Infrastructure documentation
├── supabase/             # Supabase configuration
├── tasks/                # Build and deployment tasks
├── .github/              # GitHub workflows and templates
└── CONTRIBUTING.md       # Contribution guidelines
```

### Key Directories

- **`apps/web/`**: Main Next.js application with all source code
- **`docs/`**: Comprehensive documentation covering all aspects of the platform
- **`infra/migrations/`**: Database schema migrations
- **`apps/web/src/server/services/`**: Business logic and service implementations
- **`apps/web/src/components/`**: React components organized by feature
- **`apps/web/src/lib/`**: Utility libraries and integrations

## 📚 Documentation Links

We maintain comprehensive documentation to help you get started and make the most of Churn Saver:

### 📖 Main Documentation
- **[Developer Documentation](docs/README.md)** - Complete developer guide
- **[Getting Started Guide](docs/getting-started/overview.md)** - High-level platform introduction
- **[Setup Guide](docs/getting-started/setup.md)** - Complete local development setup

### 🔌 API Documentation
- **[REST API Reference](docs/api/rest-api.md)** - Complete API reference with examples
- **[Webhooks Documentation](docs/api/webhooks.md)** - Real-time event notifications
- **[Authentication Guide](docs/api/authentication.md)** - API security and access control

### 🚀 Development Guides
- **[Development Workflow](apps/web/docs/development/README.md)** - Development setup and workflow
- **[Component Library](apps/web/docs/components/README.md)** - UI components and usage
- **[Database Schema](apps/web/docs/database/README.md)** - Database structure and relationships

### 🚢 Deployment Documentation
- **[Production Deployment](docs/deployment/production.md)** - Complete production setup
- **[Security Configuration](apps/web/production/security-configuration.md)** - Security best practices
- **[Monitoring Setup](apps/web/production/monitoring-setup-guide.md)** - Observability and alerting

## 🤝 Contributing Guidelines

We welcome contributions from the community! Please follow our guidelines to ensure a smooth contribution process:

### How to Contribute

1. **Read our [Contributing Guide](CONTRIBUTING.md)** - Detailed guidelines for contributors
2. **Fork the Repository** - Create your own fork to work on
3. **Create a Feature Branch** - Use descriptive branch names
4. **Make Your Changes** - Follow our coding standards and conventions
5. **Submit a Pull Request** - Include tests and documentation updates

### Code of Conduct

Please read and follow our [Code of Conduct](CONTRIBUTING.md#code-of-conduct) to ensure a welcoming and inclusive environment for all contributors.

### Pull Request Process

- Ensure your code follows our coding standards
- Include tests for new functionality
- Update documentation as needed
- Use conventional commit messages
- Request appropriate code reviews

## 📄 License Information

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 Churn Saver

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 🏆 Key Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| **Recovery Rate** | >25% | Percentage of at-risk customers successfully retained |
| **Time to Recovery** | <7 days | Average days from trigger to successful recovery |
| **ROI** | >300% | Return on incentive investment |
| **Uptime** | 99.9% | System availability SLA |
| **Response Time** | <200ms | API response time (p95) |

## 🆘 Support

### Developer Support
- **Documentation**: This site (comprehensive guides and API reference)
- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and community support

### Production Support
- **Status Page**: [status.churnsaver.com](https://status.churnsaver.com)
- **Incident Response**: 24/7 on-call engineering team
- **Security Issues**: security@churnsaver.com (responsible disclosure)

### Business Support
- **Sales**: sales@churnsaver.com
- **Customer Success**: success@churnsaver.com
- **Training**: training@churnsaver.com

---

**Questions?** Check our [documentation](docs/README.md) or create a [GitHub Discussion](https://github.com/your-org/churn-saver/discussions).

**Found an issue?** Please [report it](https://github.com/your-org/churn-saver/issues) so we can improve the platform.