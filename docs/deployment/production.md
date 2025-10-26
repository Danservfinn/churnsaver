# Production Deployment Guide

This guide covers the complete production deployment process for Churn Saver, including infrastructure setup, security configuration, monitoring, and maintenance procedures.

## Prerequisites

### Infrastructure Requirements

#### Cloud Platform Setup

**AWS Requirements:**
- **VPC**: Isolated network environment
- **EC2/RDS/Lambda**: Compute and database services
- **CloudFront**: CDN for global distribution
- **Route 53**: DNS management
- **CloudWatch**: Monitoring and logging
- **WAF**: Web application firewall

**Minimum Instance Sizes:**
```yaml
# Production Infrastructure Sizing
web_servers:
  instance_type: c5.large    # 2 vCPU, 4GB RAM
  min_instances: 2          # For high availability
  max_instances: 10         # Auto-scaling limit

database:
  instance_type: db.r5.large # 2 vCPU, 16GB RAM
  storage: 100GB           # Initial allocation
  multi_az: true           # High availability

redis:
  instance_type: cache.t3.medium
  cluster_mode: true       # For high availability
```

#### Domain & SSL

**Domain Configuration:**
```bash
# DNS Records Required
# Main application
@ IN A your-app.churnsaver.com

# API endpoints
api IN CNAME your-api.churnsaver.com

# Webhooks (if needed)
webhooks IN CNAME your-webhooks.churnsaver.com

# Admin dashboard
admin IN CNAME your-admin.churnsaver.com
```

**SSL Certificate Setup:**
```bash
# Using certbot for Let's Encrypt
certbot certonly --webroot -w /var/www/html -d your-app.churnsaver.com

# Or using AWS Certificate Manager
aws acm request-certificate \
  --domain-name your-app.churnsaver.com \
  --validation-method DNS
```

### Environment Preparation

#### Production Environment Variables

```bash
# Application Configuration
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

# Database (Production)
DATABASE_URL=postgresql://user:password@prod-db-host:5432/churn_saver_prod
DIRECT_URL=postgresql://user:password@prod-db-host:5432/churn_saver_prod

# Redis (Production)
REDIS_URL=redis://prod-redis-host:6379

# Security
ENCRYPTION_KEY=your-production-encryption-key
JWT_SECRET=your-production-jwt-secret
WEBHOOK_SECRET=your-production-webhook-secret

# External Services
WHOP_API_KEY=your-production-whop-api-key
OPENROUTER_API_KEY=your-production-openrouter-key
SMTP_HOST=your-production-smtp-host
SMTP_USER=your-production-smtp-user
SMTP_PASS=your-production-smtp-password

# Monitoring
SENTRY_DSN=your-sentry-dsn
DATADOG_API_KEY=your-datadog-api-key
```

## Deployment Process

### Step 1: Infrastructure Provisioning

#### Using Terraform

```hcl
# main.tf - Production Infrastructure
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "churn-saver-terraform-state"
    key    = "production/terraform.tfstate"
    region = "us-east-1"
  }
}

# VPC Configuration
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "churn-saver-prod"
    Environment = "production"
  }
}

# Public Subnets
resource "aws_subnet" "public" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "churn-saver-prod-public-${count.index + 1}"
  }
}

# Private Subnets
resource "aws_subnet" "private" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "churn-saver-prod-private-${count.index + 1}"
  }
}

# RDS PostgreSQL Database
resource "aws_db_instance" "main" {
  identifier             = "churn-saver-prod"
  engine                 = "postgres"
  engine_version         = "15.4"
  instance_class         = "db.r5.large"
  allocated_storage      = 100
  max_allocated_storage  = 1000
  storage_type           = "gp3"
  db_name                = "churn_saver_prod"
  username               = var.db_username
  password               = var.db_password
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  multi_az               = true
  backup_retention_period = 30
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  skip_final_snapshot    = false
  final_snapshot_identifier = "churn-saver-prod-final-snapshot"

  tags = {
    Name        = "churn-saver-prod-db"
    Environment = "production"
  }
}

# ElastiCache Redis
resource "aws_elasticache_cluster" "main" {
  cluster_id           = "churn-saver-prod"
  engine               = "redis"
  node_type            = "cache.t3.medium"
  num_cache_nodes      = 2
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  tags = {
    Name        = "churn-saver-prod-redis"
    Environment = "production"
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "churn-saver-prod"

  tags = {
    Name        = "churn-saver-prod-cluster"
    Environment = "production"
  }
}

# ECS Service
resource "aws_ecs_service" "main" {
  name            = "churn-saver-prod"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = 2

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = "churn-saver"
    container_port   = 3000
  }

  tags = {
    Name        = "churn-saver-prod-service"
    Environment = "production"
  }
}
```

#### Using CloudFormation

```yaml
# production-stack.yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Churn Saver Production Infrastructure'

Parameters:
  Environment:
    Type: String
    Default: production
    AllowedValues:
      - production

  DBInstanceClass:
    Type: String
    Default: db.r5.large
    AllowedValues:
      - db.r5.large
      - db.r5.xlarge
      - db.r5.2xlarge

Resources:
  # VPC and Networking
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsHostnames: true
      EnableDnsSupport: true
      Tags:
        - Key: Name
          Value: !Sub "${Environment}-vpc"
        - Key: Environment
          Value: !Ref Environment

  # RDS Database
  DBInstance:
    Type: AWS::RDS::DBInstance
    Properties:
      DBInstanceIdentifier: !Sub "${Environment}-db"
      DBInstanceClass: !Ref DBInstanceClass
      Engine: postgres
      EngineVersion: "15.4"
      AllocatedStorage: "100"
      StorageType: gp3
      DBName: churn_saver_prod
      MasterUsername: !Ref DBUsername
      MasterUserPassword: !Ref DBPassword
      VPCSecurityGroups:
        - !Ref DBInstanceSecurityGroup
      DBSubnetGroupName: !Ref DBSubnetGroup
      MultiAZ: true
      BackupRetentionPeriod: 30
      PreferredBackupWindow: "03:00-04:00"
      PreferredMaintenanceWindow: "sun:04:00-sun:05:00"
      DeletionProtection: true
      Tags:
        - Key: Name
          Value: !Sub "${Environment}-db"
        - Key: Environment
          Value: !Ref Environment

  # ElastiCache Redis
  RedisCluster:
    Type: AWS::ElastiCache::CacheCluster
    Properties:
      ClusterName: !Sub "${Environment}-redis"
      Engine: redis
      CacheNodeType: cache.t3.medium
      NumCacheNodes: 2
      Port: 6379
      CacheSubnetGroupName: !Ref RedisSubnetGroup
      VpcSecurityGroupIds:
        - !Ref RedisSecurityGroup
      Tags:
        - Key: Name
          Value: !Sub "${Environment}-redis"
        - Key: Environment
          Value: !Ref Environment
```

### Step 2: Application Deployment

#### Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile --production=false; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

RUN \
  if [ -f yarn.lock ]; then yarn build; \
  else npm run build; \
  fi

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

#### ECS Task Definition

```json
{
  "family": "churn-saver-prod",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "executionRoleArn": "${EXECUTION_ROLE_ARN}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "churn-saver",
      "image": "${ECR_REPOSITORY_URI}:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "hostPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" }
      ],
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "${DB_SECRET_ARN}:DATABASE_URL::" },
        { "name": "REDIS_URL", "valueFrom": "${REDIS_SECRET_ARN}:REDIS_URL::" },
        { "name": "ENCRYPTION_KEY", "valueFrom": "${ENCRYPTION_SECRET_ARN}:key::" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/churn-saver-prod",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/api/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

### Step 3: Database Setup

#### Production Database Configuration

```sql
-- Production database setup
CREATE DATABASE churn_saver_prod;
GRANT ALL PRIVILEGES ON DATABASE churn_saver_prod TO churn_prod_user;

-- Enable required extensions
\c churn_saver_prod;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Set up schemas and permissions
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS archive;

-- Grant schema permissions
GRANT USAGE ON SCHEMA audit TO churn_prod_user;
GRANT USAGE ON SCHEMA archive TO churn_prod_user;

-- Configure connection limits and timeouts
ALTER DATABASE churn_saver_prod SET statement_timeout = '30s';
ALTER DATABASE churn_saver_prod SET idle_in_transaction_session_timeout = '10s';
ALTER DATABASE churn_saver_prod SET work_mem = '64MB';
ALTER DATABASE churn_saver_prod SET maintenance_work_mem = '256MB';
```

#### Migration Execution

```bash
# Run database migrations
npm run db:migrate

# Seed initial data (if needed)
npm run db:seed

# Verify migration success
npm run db:verify
```

### Step 4: Security Configuration

#### Network Security

```hcl
# Security Groups
resource "aws_security_group" "alb" {
  name_prefix = "churn-saver-prod-alb-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP access from anywhere"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS access from anywhere"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name        = "churn-saver-prod-alb"
    Environment = "production"
  }
}

resource "aws_security_group" "ecs" {
  name_prefix = "churn-saver-prod-ecs-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "Allow traffic from ALB"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name        = "churn-saver-prod-ecs"
    Environment = "production"
  }
}

resource "aws_security_group" "rds" {
  name_prefix = "churn-saver-prod-rds-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
    description     = "Allow PostgreSQL access from ECS"
  }

  tags = {
    Name        = "churn-saver-prod-rds"
    Environment = "production"
  }
}
```

#### Web Application Firewall (WAF)

```hcl
# AWS WAF Configuration
resource "aws_wafv2_web_acl" "main" {
  name  = "churn-saver-prod-waf"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  # AWS Managed Rules
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # Rate limiting
  rule {
    name     = "RateLimit"
    priority = 2

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
      sampled_requests_enabled   = true
    }
  }

  # SQL Injection protection
  rule {
    name     = "SQLInjection"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "SQLInjection"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "churn-saver-prod-waf"
    sampled_requests_enabled   = true
  }
}
```

### Step 5: Monitoring Setup

#### Application Performance Monitoring

```typescript
// Sentry Configuration
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: "production",
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Postgres(),
    new Sentry.Integrations.Redis(),
  ],
  beforeSend(event) {
    // Sanitize sensitive data
    if (event.request?.data) {
      event.request.data = sanitizeData(event.request.data);
    }
    return event;
  },
});

// DataDog APM
import tracer from 'dd-trace';

tracer.init({
  service: 'churn-saver',
  env: 'production',
  version: process.env.APP_VERSION,
});

tracer.use('http', {
  service: 'churn-saver-http',
});

tracer.use('pg', {
  service: 'churn-saver-postgres',
});

tracer.use('redis', {
  service: 'churn-saver-redis',
});
```

#### Infrastructure Monitoring

```yaml
# CloudWatch Alarms
- AlarmName: HighCPUUtilization
  AlarmDescription: CPU utilization is too high
  MetricName: CPUUtilization
  Namespace: AWS/ECS
  Statistic: Average
  Period: 300
  Threshold: 80
  ComparisonOperator: GreaterThanThreshold
  EvaluationPeriods: 2
  AlarmActions:
    - !Ref HighCPUAlarmTopic

- AlarmName: LowHealthyHosts
  AlarmDescription: Too few healthy hosts
  MetricName: HealthyHostCount
  Namespace: AWS/ApplicationELB
  Statistic: Minimum
  Period: 60
  Threshold: 2
  ComparisonOperator: LessThanThreshold
  EvaluationPeriods: 2
  AlarmActions:
    - !Ref LowHealthyHostsAlarmTopic

- AlarmName: DatabaseConnectionCount
  AlarmDescription: Too many database connections
  MetricName: DatabaseConnections
  Namespace: AWS/RDS
  Statistic: Maximum
  Period: 300
  Threshold: 80
  ComparisonOperator: GreaterThanThreshold
  EvaluationPeriods: 1
  AlarmActions:
    - !Ref DatabaseAlarmTopic
```

#### Logging Configuration

```typescript
// Winston Logger Configuration
import winston from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'churn-saver',
    environment: 'production',
    version: process.env.APP_VERSION
  },
  transports: [
    // Console logging for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),

    // AWS CloudWatch for production
    new WinstonCloudWatch({
      logGroupName: '/ecs/churn-saver-prod',
      logStreamName: `${process.env.ECS_TASK_ID || 'unknown'}`,
      awsRegion: process.env.AWS_REGION,
      jsonMessage: true
    })
  ]
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.id
    });
  });

  next();
});
```

### Step 6: Backup & Recovery

#### Database Backup Strategy

```bash
#!/bin/bash
# backup.sh - Production database backup script

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="churn_saver_prod_${DATE}.sql.gz"

# Create backup
pg_dump \
  --host=$DB_HOST \
  --username=$DB_USER \
  --dbname=churn_saver_prod \
  --compress=9 \
  --format=custom \
  --file=${BACKUP_DIR}/${BACKUP_NAME}

# Upload to S3
aws s3 cp ${BACKUP_DIR}/${BACKUP_NAME} s3://churn-saver-backups/production/${BACKUP_NAME}

# Clean up old backups (keep last 30 days)
find ${BACKUP_DIR} -name "*.sql.gz" -mtime +30 -delete

# Send notification
curl -X POST -H 'Content-type: application/json' \
  --data "{\"text\":\"Database backup completed: ${BACKUP_NAME}\"}" \
  $SLACK_WEBHOOK_URL
```

#### Automated Backup Configuration

```hcl
# AWS Backup Configuration
resource "aws_backup_plan" "daily" {
  name = "churn-saver-prod-daily-backup"

  rule {
    rule_name         = "daily_backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 2 ? * * *)"  # Daily at 2 AM UTC

    lifecycle {
      delete_after = 30  # Delete after 30 days
    }
  }

  tags = {
    Name        = "churn-saver-prod-backup-plan"
    Environment = "production"
  }
}

resource "aws_backup_selection" "rds" {
  name         = "churn-saver-prod-rds-backup"
  iam_role_arn = aws_iam_role.backup.arn
  plan_id      = aws_backup_plan.daily.id

  resources = [
    aws_db_instance.main.arn
  ]
}
```

### Step 7: Deployment Validation

#### Health Checks

```typescript
// Health check endpoint
app.get('/api/health', async (req, res) => {
  const checks = await Promise.all([
    checkDatabaseConnection(),
    checkRedisConnection(),
    checkExternalServices(),
    checkDiskSpace(),
    checkMemoryUsage()
  ]);

  const isHealthy = checks.every(check => check.healthy);
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION,
    checks: checks.reduce((acc, check) => {
      acc[check.name] = {
        healthy: check.healthy,
        response_time: check.responseTime,
        message: check.message
      };
      return acc;
    }, {})
  });
});

async function checkDatabaseConnection(): Promise<HealthCheck> {
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      name: 'database',
      healthy: true,
      responseTime: Date.now() - start,
      message: 'Database connection successful'
    };
  } catch (error) {
    return {
      name: 'database',
      healthy: false,
      responseTime: Date.now() - start,
      message: `Database connection failed: ${error.message}`
    };
  }
}

async function checkRedisConnection(): Promise<HealthCheck> {
  const start = Date.now();

  try {
    await redis.ping();
    return {
      name: 'redis',
      healthy: true,
      responseTime: Date.now() - start,
      message: 'Redis connection successful'
    };
  } catch (error) {
    return {
      name: 'redis',
      healthy: false,
      responseTime: Date.now() - start,
      message: `Redis connection failed: ${error.message}`
    };
  }
}
```

#### Smoke Tests

```typescript
// Post-deployment smoke tests
async function runSmokeTests() {
  const tests = [
    testHealthEndpoint(),
    testDatabaseConnection(),
    testUserAuthentication(),
    testBasicAPIEndpoints(),
    testWebhookProcessing()
  ];

  const results = await Promise.all(tests);
  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  console.log(`Smoke tests: ${passed}/${total} passed`);

  if (passed < total) {
    console.error('Smoke tests failed!');
    process.exit(1);
  }

  console.log('All smoke tests passed!');
}

async function testHealthEndpoint(): Promise<TestResult> {
  try {
    const response = await fetch(`${process.env.APP_URL}/api/health`);
    const data = await response.json();

    if (response.ok && data.status === 'healthy') {
      return { test: 'health_endpoint', passed: true };
    }

    return {
      test: 'health_endpoint',
      passed: false,
      error: `Health check failed: ${data.status}`
    };
  } catch (error) {
    return {
      test: 'health_endpoint',
      passed: false,
      error: error.message
    };
  }
}

async function testUserAuthentication(): Promise<TestResult> {
  try {
    // Test login with test credentials
    const response = await fetch(`${process.env.APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.TEST_USER_EMAIL,
        password: process.env.TEST_USER_PASSWORD
      })
    });

    if (response.ok) {
      return { test: 'user_authentication', passed: true };
    }

    return {
      test: 'user_authentication',
      passed: false,
      error: `Authentication failed: ${response.status}`
    };
  } catch (error) {
    return {
      test: 'user_authentication',
      passed: false,
      error: error.message
    };
  }
}
```

## Production Maintenance

### Regular Maintenance Tasks

#### Database Maintenance

```sql
-- Weekly maintenance tasks
-- Reindex tables with high fragmentation
REINDEX TABLE CONCURRENTLY recovery_cases;
REINDEX TABLE CONCURRENTLY incentives;
REINDEX TABLE CONCURRENTLY events;

-- Update table statistics
ANALYZE recovery_cases;
ANALYZE incentives;
ANALYZE events;

-- Vacuum tables to reclaim space
VACUUM (ANALYZE, VERBOSE) recovery_cases;
VACUUM (ANALYZE, VERBOSE) incentives;
VACUUM (ANALYZE, VERBOSE) events;

-- Archive old data (older than 2 years)
INSERT INTO archive.recovery_cases
SELECT * FROM recovery_cases
WHERE created_at < NOW() - INTERVAL '2 years';

DELETE FROM recovery_cases
WHERE created_at < NOW() - INTERVAL '2 years';
```

#### Application Maintenance

```bash
#!/bin/bash
# maintenance.sh - Weekly maintenance script

echo "Starting weekly maintenance..."

# Update dependencies
npm audit fix

# Run database migrations (if any)
npm run db:migrate

# Clear application caches
npm run cache:clear

# Update SSL certificates
certbot renew

# Rotate logs
logrotate /etc/logrotate.d/churn-saver

# Run security scans
npm run security:scan

# Update monitoring configurations
npm run monitoring:update

echo "Weekly maintenance completed"
```

### Scaling Procedures

#### Horizontal Scaling

```typescript
// Auto-scaling based on CPU utilization
const autoScalingPolicy = {
  targetValue: 70.0,  // Target CPU utilization
  predefinedMetricType: 'ASGAverageCPUUtilization',
  scaleInCooldown: 300,  // 5 minutes
  scaleOutCooldown: 300  // 5 minutes
};

// Scale based on request rate
const requestScalingPolicy = {
  targetValue: 1000.0,  // Target requests per minute
  predefinedMetricType: 'ALBRequestCountPerTarget',
  scaleInCooldown: 300,
  scaleOutCooldown: 300
};
```

#### Database Scaling

```sql
-- Add read replica for read-heavy workloads
CREATE SUBSCRIPTION read_replica CONNECTION 'host=primary-db port=5432 user=replica dbname=churn_saver_prod';

-- Partition large tables by date
CREATE TABLE recovery_cases_y2025m01 PARTITION OF recovery_cases
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Add database indexes for performance
CREATE INDEX CONCURRENTLY idx_recovery_cases_status_created
    ON recovery_cases (status, created_at DESC);

CREATE INDEX CONCURRENTLY idx_incentives_case_id_status
    ON incentives (case_id, status);
```

### Incident Response

#### Production Incident Runbook

```yaml
# incident-response.yaml
incident_response:
  severity_levels:
    critical:
      response_time: "15 minutes"
      communication: "immediate"
      escalation: "executive_team"
      resolution_target: "4 hours"
    high:
      response_time: "1 hour"
      communication: "hourly_updates"
      escalation: "engineering_lead"
      resolution_target: "8 hours"
    medium:
      response_time: "4 hours"
      communication: "daily_updates"
      escalation: "team_lead"
      resolution_target: "24 hours"
    low:
      response_time: "24 hours"
      communication: "weekly_updates"
      escalation: "individual_contributor"
      resolution_target: "1 week"

  response_phases:
    1_identify:
      actions:
        - assess_impact
        - determine_scope
        - notify_stakeholders
        - create_incident_ticket
    2_contain:
      actions:
        - implement_workarounds
        - block_affected_traffic
        - rollback_changes
        - scale_resources
    3_investigate:
      actions:
        - gather_logs
        - analyze_metrics
        - reproduce_issue
        - identify_root_cause
    4_resolve:
      actions:
        - implement_fix
        - test_fix
        - deploy_fix
        - monitor_stability
    5_prevent:
      actions:
        - document_incident
        - update_runbooks
        - implement_monitoring
        - schedule_retrospective
```

#### Rollback Procedures

```bash
#!/bin/bash
# rollback.sh - Emergency rollback script

echo "Starting emergency rollback..."

# Get last known good deployment
LAST_GOOD_DEPLOYMENT=$(aws ecs describe-services \
  --cluster churn-saver-prod \
  --services churn-saver-prod \
  --query 'services[0].taskDefinition' \
  --output text)

# Update service to use previous task definition
aws ecs update-service \
  --cluster churn-saver-prod \
  --service churn-saver-prod \
  --task-definition $LAST_GOOD_DEPLOYMENT \
  --force-new-deployment

# Wait for deployment to complete
aws ecs wait services-stable \
  --cluster churn-saver-prod \
  --services churn-saver-prod

# Verify rollback success
curl -f https://your-app.churnsaver.com/api/health

if [ $? -eq 0 ]; then
  echo "Rollback successful"
  # Notify team
  curl -X POST -H 'Content-type: application/json' \
    --data '{"text":"🚨 Emergency rollback completed successfully"}' \
    $SLACK_WEBHOOK_URL
else
  echo "Rollback verification failed"
  exit 1
fi
```

## Performance Optimization

### Application Performance

#### Caching Strategy

```typescript
// Redis caching for frequently accessed data
class CacheManager {
  private redis = new Redis(process.env.REDIS_URL);

  async getRecoveryCase(caseId: string): Promise<RecoveryCase | null> {
    const cacheKey = `case:${caseId}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const caseData = await prisma.recoveryCase.findUnique({
      where: { id: caseId }
    });

    if (caseData) {
      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(caseData));
    }

    return caseData;
  }

  async invalidateCaseCache(caseId: string): Promise<void> {
    await this.redis.del(`case:${caseId}`);
    // Also invalidate related caches
    await this.redis.del(`case:${caseId}:incentives`);
    await this.redis.del(`case:${caseId}:timeline`);
  }
}
```

#### Database Optimization

```sql
-- Query optimization
EXPLAIN ANALYZE
SELECT rc.*, i.type as incentive_type, i.value as incentive_value
FROM recovery_cases rc
LEFT JOIN incentives i ON rc.id = i.case_id
WHERE rc.status = 'active'
  AND rc.created_at > NOW() - INTERVAL '30 days'
ORDER BY rc.created_at DESC
LIMIT 50;

-- Add composite indexes for common queries
CREATE INDEX idx_cases_status_created ON recovery_cases (status, created_at DESC);
CREATE INDEX idx_cases_risk_level ON recovery_cases (risk_level);
CREATE INDEX idx_incentives_case_status ON incentives (case_id, status);

-- Partition strategy for large tables
CREATE TABLE recovery_cases_y2025 PARTITION OF recovery_cases
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01')
    PARTITION BY RANGE (created_at);
```

### Monitoring Performance

#### Application Metrics

```typescript
// Prometheus metrics
import promClient from 'prom-client';

const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'churn_saver_' });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const recoveryCasesCreated = new promClient.Counter({
  name: 'recovery_cases_created_total',
  help: 'Total number of recovery cases created',
  labelNames: ['risk_level']
});

const databaseQueryDuration = new promClient.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2]
});

// Middleware to collect metrics
app.use((req, res, next) => {
  const start = Date.now();
  const { method, route } = req;

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(method, route.path || 'unknown', res.statusCode.toString())
      .observe(duration);
  });

  next();
});
```

## Security Maintenance

### Regular Security Updates

```bash
#!/bin/bash
# security-updates.sh - Monthly security maintenance

echo "Starting security updates..."

# Update system packages
apt update && apt upgrade -y

# Update Node.js dependencies
npm audit fix --audit-level moderate

# Update Docker images
docker-compose pull
docker-compose up -d

# Rotate encryption keys
npm run keys:rotate

# Update SSL certificates
certbot renew --force-renewal

# Run security scans
npm run security:scan
npm run vulnerability:scan

# Update WAF rules
aws wafv2 update-web-acl \
  --name churn-saver-prod-waf \
  --scope REGIONAL \
  --id $WAF_ID \
  --lock-token $LOCK_TOKEN \
  --rules file://updated-rules.json

echo "Security updates completed"
```

### Compliance Auditing

```typescript
// Automated compliance checks
class ComplianceAuditor {
  async runComplianceAudit() {
    const checks = [
      this.checkGDPRCompliance(),
      this.checkSecurityHeaders(),
      this.checkDataEncryption(),
      this.checkAccessControls(),
      this.checkAuditLogging()
    ];

    const results = await Promise.all(checks);
    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    const report = {
      timestamp: new Date(),
      score: (passed / total) * 100,
      results,
      recommendations: this.generateRecommendations(results)
    };

    // Store audit report
    await database.complianceAudits.insert(report);

    // Send to compliance team
    await emailService.sendComplianceReport(report);

    return report;
  }

  private async checkSecurityHeaders(): Promise<ComplianceCheck> {
    const response = await fetch(process.env.APP_URL!);
    const headers = response.headers;

    const requiredHeaders = [
      'strict-transport-security',
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection'
    ];

    const missingHeaders = requiredHeaders.filter(
      header => !headers.get(header)
    );

    return {
      check: 'security_headers',
      passed: missingHeaders.length === 0,
      details: missingHeaders.length === 0
        ? 'All required security headers present'
        : `Missing headers: ${missingHeaders.join(', ')}`
    };
  }
}
```

## Next Steps

- **[Monitoring Setup](monitoring.md)** - Detailed monitoring configuration
- **[Incident Response](../deployment/incident-response.md)** - Response procedures
- **[Scaling Guide](scaling.md)** - Performance scaling strategies
- **[Backup & Recovery](backup-recovery.md)** - Comprehensive backup procedures