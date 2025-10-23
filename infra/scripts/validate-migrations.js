#!/usr/bin/env node

/**
 * Migration Validation Script
 * Validates migration integrity, dependencies, and safety
 * 
 * Usage:
 *   node validate-migrations.js                    # Validate all migrations
 *   node validate-migrations.js --check-deps      # Check dependencies only
 *   node validate-migrations.js --check-safety    # Check safety constraints only
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

class MigrationValidator {
  constructor() {
    this.migrations = this.loadMigrations();
    this.issues = [];
    this.warnings = [];
  }

  loadMigrations() {
    const migrations = [];
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const match = file.match(/^(\d+)_([^.]+)\.sql$/);
      if (match) {
        const number = parseInt(match[1]);
        const name = match[2];
        const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        const checksum = crypto.createHash('sha256').update(content).digest('hex');
        const isRollback = file.includes('_rollback');
        
        migrations.push({
          number,
          name,
          filename: file,
          content,
          checksum,
          isRollback
        });
      }
    }

    return migrations;
  }

  validateFileStructure() {
    console.log('🔍 Validating file structure...');
    
    const forwardMigrations = this.migrations.filter(m => !m.isRollback);
    const rollbackMigrations = this.migrations.filter(m => m.isRollback);
    
    // Check for consecutive numbering
    for (let i = 0; i < forwardMigrations.length; i++) {
      const expected = i + 1;
      if (forwardMigrations[i].number !== expected) {
        this.issues.push(`Migration ${forwardMigrations[i].number} should be ${expected}`);
      }
    }

    // Check for corresponding rollback files
    for (const migration of forwardMigrations) {
      const hasRollback = rollbackMigrations.some(r => r.number === migration.number);
      if (!hasRollback) {
        this.warnings.push(`Migration ${migration.number} missing rollback file`);
      }
    }

    // Check for orphaned rollback files
    for (const rollback of rollbackMigrations) {
      const hasForward = forwardMigrations.some(f => f.number === rollback.number);
      if (!hasForward) {
        this.issues.push(`Rollback ${rollback.number} has no corresponding forward migration`);
      }
    }

    console.log(`✅ Found ${forwardMigrations.length} forward migrations`);
    console.log(`✅ Found ${rollbackMigrations.length} rollback migrations`);
  }

  validateDependencies() {
    console.log('\n🔍 Validating migration dependencies...');
    
    const forwardMigrations = this.migrations.filter(m => !m.isRollback);
    
    for (const migration of forwardMigrations) {
      const dependencies = this.extractDependencies(migration.content);
      
      for (const dep of dependencies) {
        const depMigration = forwardMigrations.find(m => 
          m.number < migration.number && this.providesDependency(m, dep)
        );
        
        if (!depMigration) {
          this.issues.push(`Migration ${migration.number} depends on ${dep} but no previous migration provides it`);
        }
      }
    }
  }

  extractDependencies(content) {
    const dependencies = [];
    
    // Extract table references
    const tableRefs = content.match(/FROM\s+(\w+)|JOIN\s+(\w+)|REFERENCES\s+(\w+)/gi);
    if (tableRefs) {
      for (const ref of tableRefs) {
        const match = ref.match(/\w+$/);
        if (match && !['public', 'pg_catalog'].includes(match[0])) {
          dependencies.push({ type: 'table', name: match[0] });
        }
      }
    }

    // Extract function calls
    const funcRefs = content.match(/\w+\s*\(/gi);
    if (funcRefs) {
      for (const ref of funcRefs) {
        const funcName = ref.replace(/\s*\($/, '');
        if (!['CREATE', 'ALTER', 'DROP', 'INSERT', 'UPDATE', 'DELETE', 'SELECT'].includes(funcName.toUpperCase())) {
          dependencies.push({ type: 'function', name: funcName });
        }
      }
    }

    // Extract schema references
    const schemaRefs = content.match(/SET\s+search_path\s+TO\s+([^;]+)/gi);
    if (schemaRefs) {
      const schemas = schemaRefs[0].split('TO ')[1].split(',');
      for (const schema of schemas) {
        const schemaName = schema.trim();
        if (schemaName !== 'public') {
          dependencies.push({ type: 'schema', name: schemaName });
        }
      }
    }

    return dependencies;
  }

  providesDependency(migration, dependency) {
    switch (dependency.type) {
      case 'table':
        return migration.content.includes(`CREATE TABLE ${dependency.name}`) ||
               migration.content.includes(`CREATE TABLE IF NOT EXISTS ${dependency.name}`);
      case 'function':
        return migration.content.includes(`CREATE FUNCTION ${dependency.name}`) ||
               migration.content.includes(`CREATE OR REPLACE FUNCTION ${dependency.name}`);
      case 'schema':
        return migration.content.includes(`CREATE SCHEMA ${dependency.name}`) ||
               migration.content.includes(`CREATE SCHEMA IF NOT EXISTS ${dependency.name}`);
      default:
        return false;
    }
  }

  validateSafetyConstraints() {
    console.log('\n🔍 Validating safety constraints...');
    
    const forwardMigrations = this.migrations.filter(m => !m.isRollback);
    const rollbackMigrations = this.migrations.filter(m => m.isRollback);
    
    // Check forward migrations for dangerous operations
    for (const migration of forwardMigrations) {
      this.checkForwardMigrationSafety(migration);
    }

    // Check rollback migrations for safety
    for (const rollback of rollbackMigrations) {
      this.checkRollbackMigrationSafety(rollback);
    }
  }

  checkForwardMigrationSafety(migration) {
    // Check for DROP without IF EXISTS
    const dropWithoutIf = migration.content.match(/DROP\s+(TABLE|INDEX|SCHEMA)\s+(?!IF\s+EXISTS)(\w+)/gi);
    if (dropWithoutIf) {
      for (const match of dropWithoutIf) {
        this.warnings.push(`Migration ${migration.number}: ${match} without IF EXISTS`);
      }
    }

    // Check for DELETE without WHERE (dangerous)
    const deleteWithoutWhere = migration.content.match(/DELETE\s+FROM\s+\w+(?!\s+WHERE)/gi);
    if (deleteWithoutWhere) {
      this.issues.push(`Migration ${migration.number}: DELETE without WHERE clause`);
    }

    // Check for TRUNCATE (dangerous)
    if (migration.content.includes('TRUNCATE')) {
      this.warnings.push(`Migration ${migration.number}: Contains TRUNCATE operation`);
    }

    // Check for proper transaction handling
    if (!migration.content.includes('BEGIN') && !migration.content.includes('START TRANSACTION')) {
      this.warnings.push(`Migration ${migration.number}: Missing transaction start`);
    }
  }

  checkRollbackMigrationSafety(rollback) {
    // Check for data preservation warnings
    if (rollback.content.includes('DROP TABLE') && !rollback.content.includes('WARNING')) {
      this.warnings.push(`Rollback ${rollback.number}: Drops table without data preservation warning`);
    }

    // Check for idempotent operations
    const dropWithoutIf = rollback.content.match(/DROP\s+(TABLE|INDEX|SCHEMA)\s+(?!IF\s+EXISTS)(\w+)/gi);
    if (dropWithoutIf) {
      this.issues.push(`Rollback ${rollback.number}: ${match} without IF EXISTS`);
    }

    // Check for proper transaction handling
    if (!rollback.content.includes('BEGIN') && !rollback.content.includes('START TRANSACTION')) {
      this.issues.push(`Rollback ${rollback.number}: Missing transaction start`);
    }

    if (!rollback.content.includes('ROLLBACK') && !rollback.content.includes('COMMIT')) {
      this.issues.push(`Rollback ${rollback.number}: Missing transaction handling`);
    }
  }

  validateRollbackCompleteness() {
    console.log('\n🔍 Validating rollback completeness...');
    
    const forwardMigrations = this.migrations.filter(m => !m.isRollback);
    
    for (const migration of forwardMigrations) {
      const rollback = this.migrations.find(r => r.isRollback && r.number === migration.number);
      
      if (rollback) {
        this.validateRollbackMatchesForward(migration, rollback);
      }
    }
  }

  validateRollbackMatchesForward(forward, rollback) {
    const forwardObjects = this.extractCreatedObjects(forward.content);
    const rollbackDrops = this.extractDroppedObjects(rollback.content);
    
    // Check if all created objects are dropped in rollback
    for (const obj of forwardObjects) {
      const isDropped = rollbackDrops.some(drop => 
        drop.type === obj.type && drop.name === obj.name
      );
      
      if (!isDropped) {
        this.warnings.push(`Rollback ${rollback.number} doesn't drop ${obj.type} ${obj.name}`);
      }
    }

    // Check for drops without corresponding creates
    for (const drop of rollbackDrops) {
      const isCreated = forwardObjects.some(obj => 
        obj.type === drop.type && obj.name === drop.name
      );
      
      if (!isCreated) {
        this.warnings.push(`Rollback ${rollback.number} drops ${drop.type} ${drop.name} not created in forward migration`);
      }
    }
  }

  extractCreatedObjects(content) {
    const objects = [];
    
    // Extract tables
    const tableMatches = content.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)/gi);
    if (tableMatches) {
      for (const match of tableMatches) {
        const tableName = match.match(/(\w+)$/)[1];
        objects.push({ type: 'table', name: tableName });
      }
    }

    // Extract indexes
    const indexMatches = content.match(/CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi);
    if (indexMatches) {
      for (const match of indexMatches) {
        const indexName = match.match(/(\w+)$/)[1];
        objects.push({ type: 'index', name: indexName });
      }
    }

    // Extract functions
    const functionMatches = content.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(\w+)/gi);
    if (functionMatches) {
      for (const match of functionMatches) {
        const functionName = match.match(/(\w+)$/)[1];
        objects.push({ type: 'function', name: functionName });
      }
    }

    return objects;
  }

  extractDroppedObjects(content) {
    const objects = [];
    
    // Extract tables
    const tableMatches = content.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:\w+\.)?(\w+)/gi);
    if (tableMatches) {
      for (const match of tableMatches) {
        const tableName = match.match(/(\w+)$/)[1];
        objects.push({ type: 'table', name: tableName });
      }
    }

    // Extract indexes
    const indexMatches = content.match(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(\w+)/gi);
    if (indexMatches) {
      for (const match of indexMatches) {
        const indexName = match.match(/(\w+)$/)[1];
        objects.push({ type: 'index', name: indexName });
      }
    }

    // Extract functions
    const functionMatches = content.match(/DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(\w+)/gi);
    if (functionMatches) {
      for (const match of functionMatches) {
        const functionName = match.match(/(\w+)$/)[1];
        objects.push({ type: 'function', name: functionName });
      }
    }

    return objects;
  }

  validateNamingConventions() {
    console.log('\n🔍 Validating naming conventions...');
    
    const forwardMigrations = this.migrations.filter(m => !m.isRollback);
    
    for (const migration of forwardMigrations) {
      // Check filename format
      if (!/^\d{3}_[a-z_]+\.sql$/.test(migration.filename)) {
        this.warnings.push(`Migration ${migration.number}: Filename should follow XXX_description.sql format`);
      }

      // Check for descriptive names
      if (migration.name.length < 5) {
        this.warnings.push(`Migration ${migration.number}: Name should be more descriptive`);
      }

      // Check for snake_case in names
      if (/[A-Z]/.test(migration.name)) {
        this.warnings.push(`Migration ${migration.number}: Name should use snake_case`);
      }
    }
  }

  runValidation(options = {}) {
    console.log('🚀 Starting migration validation...\n');

    if (!options.checkDeps && !options.checkSafety) {
      this.validateFileStructure();
      this.validateDependencies();
      this.validateSafetyConstraints();
      this.validateRollbackCompleteness();
      this.validateNamingConventions();
    } else {
      if (options.checkDeps) {
        this.validateDependencies();
      }
      if (options.checkSafety) {
        this.validateSafetyConstraints();
      }
    }

    this.printResults();
  }

  printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 VALIDATION RESULTS');
    console.log('='.repeat(80));

    const totalMigrations = this.migrations.filter(m => !m.isRollback).length;
    
    console.log(`\nTotal migrations: ${totalMigrations}`);
    console.log(`❌ Issues: ${this.issues.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);

    if (this.issues.length > 0) {
      console.log('\n❌ ISSUES (must be fixed):');
      for (const issue of this.issues) {
        console.log(`  • ${issue}`);
      }
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS (should be addressed):');
      for (const warning of this.warnings) {
        console.log(`  • ${warning}`);
      }
    }

    if (this.issues.length === 0 && this.warnings.length === 0) {
      console.log('\n✅ All validations passed!');
    } else if (this.issues.length === 0) {
      console.log('\n✅ No critical issues found (warnings present)');
    } else {
      console.log('\n❌ Critical issues found - fix before deploying');
    }

    console.log('\n' + '='.repeat(80));
    
    return this.issues.length === 0;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  for (const arg of args) {
    if (arg === '--check-deps') {
      options.checkDeps = true;
    } else if (arg === '--check-safety') {
      options.checkSafety = true;
    } else if (arg === '--help') {
      console.log(`
Usage: node validate-migrations.js [options]

Options:
  --check-deps     Check dependencies only
  --check-safety   Check safety constraints only
  --help           Show this help message

Examples:
  node validate-migrations.js              # Validate everything
  node validate-migrations.js --check-deps # Check dependencies only
  node validate-migrations.js --check-safety # Check safety only
      `);
      process.exit(0);
    }
  }

  const validator = new MigrationValidator();
  const isValid = validator.runValidation(options);
  
  process.exit(isValid ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = MigrationValidator;