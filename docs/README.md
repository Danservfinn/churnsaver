# Churn Saver Developer Documentation

Welcome to the Churn Saver developer documentation. This comprehensive guide covers everything you need to understand, develop, deploy, and maintain the Churn Saver customer retention platform.

## 📋 Table of Contents

### 🚀 Getting Started
- [**Overview**](getting-started/overview.md) - High-level platform introduction and key concepts
- [**Setup Guide**](getting-started/setup.md) - Complete local development environment setup
- [**Architecture**](getting-started/architecture.md) - System design, components, and data flow

### 🎯 Core Features
- [**Recovery System**](features/recovery-system.md) - Automated customer recovery workflows and case management
- [**Incentive Management**](features/incentives.md) - Flexible incentive configuration and budget management
- [**Dashboard & Analytics**](features/dashboard.md) - Real-time KPIs, reporting, and business intelligence

### 🔌 API Reference
- [**REST API**](api/rest-api.md) - Complete API reference with examples
- [**Webhooks**](api/webhooks.md) - Real-time event notifications and integrations
- [**Authentication**](api/authentication.md) - API security, tokens, and access control

### 🔒 Security & Compliance
- [**Security Overview**](security/overview.md) - Comprehensive security architecture and best practices
- [**GDPR Compliance**](security/gdpr.md) - Data protection, user rights, and privacy regulations
- [**Auditing & Monitoring**](security/auditing.md) - Security monitoring, audit logging, and compliance reporting

### 🚢 Deployment & Operations
- [**Production Deployment**](deployment/production.md) - Complete production setup and infrastructure
- [**Monitoring Setup**](deployment/monitoring.md) - Observability and alerting configuration
- [**Incident Response**](deployment/incident-response.md) - Emergency procedures and response plans
- [**Backup & Recovery**](deployment/backup-recovery.md) - Data protection and disaster recovery
- [**Scaling Guide**](deployment/scaling.md) - Performance optimization and horizontal scaling

### 🧪 Testing & Quality
- [**Testing Overview**](testing/overview.md) - Testing strategy and methodologies
- [**Integration Testing**](testing/integration.md) - End-to-end and integration test suites
- [**Performance Testing**](testing/performance.md) - Load testing and performance benchmarks

### 🔧 Development Workflow
- [**Contributing Guide**](development/contributing.md) - Code standards and contribution process
- [**Code Standards**](development/standards.md) - Style guides and best practices
- [**CI/CD Pipeline**](development/cicd.md) - Automated testing and deployment

## 🎯 Quick Start

### For New Developers

1. **Read the Overview** - Understand what Churn Saver does
2. **Set Up Your Environment** - Follow the [Setup Guide](getting-started/setup.md)
3. **Explore the Architecture** - Learn how the system works
4. **Try the APIs** - Experiment with the [REST API](api/rest-api.md)

### For Platform Users

1. **Understand Recovery** - Learn about [automated recovery](features/recovery-system.md)
2. **Configure Incentives** - Set up [retention incentives](features/incentives.md)
3. **Monitor Performance** - Use the [dashboard](features/dashboard.md) for insights

### For DevOps/Security Teams

1. **Review Security** - Understand our [security architecture](security/overview.md)
2. **Plan Deployment** - Follow the [production guide](deployment/production.md)
3. **Set Up Monitoring** - Configure [observability](deployment/monitoring.md)

## 📊 Key Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| **Recovery Rate** | >25% | Percentage of at-risk customers successfully retained |
| **Time to Recovery** | <7 days | Average days from trigger to successful recovery |
| **ROI** | >300% | Return on incentive investment |
| **Uptime** | 99.9% | System availability SLA |
| **Response Time** | <200ms | API response time (p95) |

## 🔧 Technology Stack

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

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](development/contributing.md) for details on:

- Code standards and style guides
- Pull request process
- Testing requirements
- Documentation updates

## 📞 Support

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

## 📜 License

This documentation is licensed under the MIT License. The Churn Saver platform itself is proprietary software.

## 🔄 Version History

| Version | Date | Major Changes |
|---------|------|---------------|
| 1.0.0 | 2025-10-25 | Initial comprehensive documentation release |
| 0.9.0 | 2025-09-15 | Beta release with core features |
| 0.5.0 | 2025-06-01 | Alpha release with basic recovery system |

---

**Questions?** Check the [troubleshooting guide](troubleshooting/common-issues.md) or create a [GitHub Discussion](https://github.com/your-org/churn-saver/discussions).

**Found an issue?** Please [report it](https://github.com/your-org/churn-saver/issues) so we can improve the documentation.