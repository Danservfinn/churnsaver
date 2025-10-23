# Churn Saver Infrastructure

This directory contains the infrastructure components for the Churn Saver application, including database migrations, deployment scripts, and operational procedures.

## Directory Structure

```
infra/
├── migrations/                    # Database migration files
│   ├── 001_init.sql              # Initial database schema
│   ├── 001_rollback.sql          # Rollback for migration 001
│   ├── 002_enable_rls_policies.sql
│   ├── 002_rollback.sql
│   ├── ...
│   ├── 010_rate_limits_table.sql
│   ├── 010_rollback.sql
│   └── 011_migration_tracking.sql # Migration tracking system
├── scripts/                      # Utility and deployment scripts
│   ├── migrate.js               # Migration management tool
│   ├── validate-migrations.js   # Migration validation
│   ├── test-rollback.js         # Rollback testing
│   ├── enhanced-staging-rehearsal.sh
│   └── emergency-rollback.sh    # Emergency rollback procedures
├── docs/                        # Documentation
│   ├── migration-deployment-guide.md
│   └── emergency-rollback-playbook.md
├── package.json                 # NPM scripts and dependencies
└── README.md                    # This file
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Database connection string (DATABASE_URL)

### Installation

```bash
cd infra
npm install
```

### Basic Usage

```bash
# Check migration status
npm run migrate:status

# Apply pending migrations
npm run migrate:up

# Rollback to specific migration
npm run migrate:down 8

# Validate migration files
npm run validate

# Test rollback procedures
npm run test:rollback:dry-run
```

## Migration Management

### Migration Commands

| Command | Description |
|---------|-------------|
| `npm run migrate:up` | Apply all pending migrations |
| `npm run migrate:up [n]` | Apply migrations up to version n |
| `npm run migrate:down [n]` | Rollback to migration n |
| `npm run migrate:status` | Show current migration status |
| `npm run migrate:validate` | Validate migration integrity |

### Validation Commands

| Command | Description |
|---------|-------------|
| `npm run validate` | Run all validation checks |
| `npm run validate:deps` | Check migration dependencies |
| `npm run validate:safety` | Check safety constraints |

### Testing Commands

| Command | Description |
|---------|-------------|
| `npm run test:rollback` | Test rollback procedures |
| `npm run test:rollback:dry-run` | Validate rollback files without executing |
| `npm run test:rollback:all` | Test all rollback procedures |

## Migration Development

### Creating New Migrations

1. Create forward migration file: `XXX_description.sql`
2. Create rollback file: `XXX_rollback.sql`
3. Follow the established patterns from existing migrations
4. Test both forward and rollback procedures

### Migration File Template

**Forward Migration (XXX_description.sql):**
```sql
-- Migration: XXX_description.sql
-- Description: Brief description of changes
-- Author: Developer name
-- Date: YYYY-MM-DD

-- Use idempotent operations
CREATE TABLE IF NOT EXISTS example_table (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_example_created_at ON example_table(created_at);

-- Add documentation
COMMENT ON TABLE example_table IS 'Example table for demonstration';
```

**Rollback Migration (XXX_rollback.sql):**
```sql
-- Rollback: XXX_rollback.sql
-- Reverses migration: XXX_description.sql
-- Author: Developer name
-- Date: YYYY-MM-DD

-- WARNING: This will permanently delete data
-- Consider backing up critical data before proceeding

BEGIN;

-- Drop indexes first
DROP INDEX IF EXISTS idx_example_created_at;

-- Drop table with warning
DROP TABLE IF EXISTS example_table;

COMMIT;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Rollback XXX completed successfully';
    RAISE NOTICE 'WARNING: All data in example_table has been permanently deleted';
END $$;
```

## Deployment Process

### Staging Deployment

1. **Validation Phase:**
   ```bash
   npm run validate
   npm run test:rollback:dry-run
   ```

2. **Staging Rehearsal:**
   ```bash
   chmod +x scripts/enhanced-staging-rehearsal.sh
   ./scripts/enhanced-staging-rehearsal.sh
   ```

3. **Rollback Testing:**
   ```bash
   npm run test:rollback:all
   ```

### Production Deployment

1. **Pre-deployment Checks:**
   ```bash
   npm run validate
   npm run migrate:status
   ```

2. **Create Backup:**
   ```bash
   pg_dump $DATABASE_URL > production-backup-$(date +%s).sql
   ```

3. **Apply Migrations:**
   ```bash
   npm run migrate:up
   ```

4. **Verification:**
   ```bash
   npm run migrate:status
   curl -f https://churn-saver.vercel.app/api/health
   ```

## Emergency Procedures

### Emergency Rollback

For critical incidents requiring immediate rollback:

```bash
# Full emergency rollback (app + database)
./scripts/emergency-rollback.sh --full-emergency

# Rollback to specific migration
./scripts/emergency-rollback.sh --migration-target=8

# Rollback application only
./scripts/emergency-rollback.sh --app-rollback

# Check system status
./scripts/emergency-rollback.sh --status-only
```

### Incident Response

1. **Immediate Actions:**
   - Create emergency backup
   - Assess impact scope
   - Notify stakeholders
   - Execute rollback if needed

2. **Follow-up:**
   - Document incident
   - Schedule post-mortem
   - Update procedures
   - Train team

## Monitoring and Validation

### Health Checks

```bash
# Application health
curl -f https://churn-saver.vercel.app/api/health

# Database health
psql $DATABASE_URL -c "SELECT 1;"

# Migration status
npm run migrate:status
```

### Validation Scripts

```bash
# Comprehensive validation
npm run validate

# Dependency checking
npm run validate:deps

# Safety validation
npm run validate:safety
```

## CI/CD Integration

### GitHub Actions

The migration system includes comprehensive CI/CD pipelines:

- **Migration Validation**: Validates all migration files on PR
- **Rollback Testing**: Tests rollback procedures in staging
- **Security Scanning**: Scans for security issues
- **Automated Deployment**: Applies migrations with proper validation

### Workflow Triggers

- **Pull Request**: Run validation and security checks
- **Push to main**: Run full test suite
- **Manual Dispatch**: Run specific test suites
- **Scheduled**: Run periodic health checks

## Best Practices

### Development Best Practices

- Keep migrations small and focused
- Use idempotent operations (IF NOT EXISTS)
- Include proper error handling
- Document all changes thoroughly
- Test rollback procedures extensively

### Safety Guidelines

- Always create backups before major changes
- Test in staging before production
- Use feature flags for risky changes
- Monitor continuously during deployment
- Have rollback procedures ready

### Rollback Guidelines

- Test rollback procedures regularly
- Keep rollback scripts updated
- Train team on emergency procedures
- Document all rollback scenarios
- Verify rollback success

## Troubleshooting

### Common Issues

**Migration Failures:**
```bash
# Check migration status
npm run migrate:status

# Check error logs
npm run migrate:validate

# Test rollback
npm run test:rollback:dry-run
```

**Rollback Issues:**
```bash
# Check system status
./scripts/emergency-rollback.sh --status-only

# Verify backup
ls -la emergency-backups-*/

# Manual intervention
psql $DATABASE_URL < manual-rollback.sql
```

**Performance Issues:**
```bash
# Check database performance
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity;"

# Check slow queries
psql $DATABASE_URL -c "SELECT query, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"
```

## Documentation

- [Migration Deployment Guide](docs/migration-deployment-guide.md)
- [Emergency Rollback Playbook](docs/emergency-rollback-playbook.md)
- [Production Rollout Plan](../apps/web/production/production-rollout-plan.md)
- [Incident Response Plan](../apps/web/production/incident-response-plan.md)

## Support

### Emergency Contacts

- **Engineering Lead**: [Contact information]
- **DevOps Lead**: [Contact information]
- **Database Administrator**: [Contact information]

### Getting Help

1. Check this README and documentation
2. Review troubleshooting section
3. Check GitHub issues
4. Contact on-call team
5. Escalate to management if needed

## Contributing

### Development Workflow

1. Create feature branch
2. Develop migration with rollback
3. Test thoroughly in staging
4. Submit PR with validation
5. Address review feedback
6. Merge to main
7. Deploy to production

### Code Review Checklist

- [ ] Migration follows established patterns
- [ ] Rollback file provided and tested
- [ ] Documentation included
- [ ] Security considerations addressed
- [ ] Performance impact assessed
- [ ] Testing completed

### Testing Requirements

- All validation checks pass
- Rollback procedures tested
- Staging rehearsal successful
- Security scan clean
- Performance acceptable

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-21 | Initial migration system with rollback capabilities |

---

**Version**: 1.0  
**Last Updated**: 2025-10-21  
**Maintainers**: DevOps Team  
**License**: Internal Use Only