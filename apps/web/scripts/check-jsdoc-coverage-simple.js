#!/usr/bin/env node

/**
 * Simple JSDoc Coverage Checker
 *
 * This script analyzes TypeScript and JavaScript files to calculate JSDoc documentation coverage.
 * It checks for proper JSDoc comments on exported functions, classes, interfaces, and components.
 *
 * Usage:
 *   node apps/web/scripts/check-jsdoc-coverage-simple.js [directory]
 *
 * Example:
 *   node apps/web/scripts/check-jsdoc-coverage-simple.js apps/web/src
 */

const fs = require('fs');
const path = require('path');

class JSDocCoverageChecker {
  constructor() {
    this.stats = {
      totalExports: 0,
      documentedExports: 0,
      totalFiles: 0,
      analyzedFiles: 0,
      coverage: 0
    };
    this.fileResults = [];
  }

  checkCoverage(directory) {
    console.log(`🔍 Analyzing JSDoc coverage in: ${directory}\n`);

    const files = this.findTypeScriptFiles(directory);
    this.stats.totalFiles = files.length;

    for (const file of files) {
      try {
        this.analyzeFile(file);
        this.stats.analyzedFiles++;
      } catch (error) {
        console.warn(`⚠️  Failed to analyze ${file}:`, error.message);
      }
    }

    this.calculateOverallCoverage();
    this.printResults();
  }

  findTypeScriptFiles(directory) {
    const files = [];
    const skipDirectories = [
      'node_modules',
      '.next',
      'dist',
      'build',
      '.git',
      'coverage',
      '__tests__',
      '__mocks__'
    ];

    function traverse(dir) {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !skipDirectories.includes(item)) {
          traverse(fullPath);
        } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(item) && !item.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
    }

    traverse(directory);
    return files;
  }

  analyzeFile(filePath) {
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    const fileCoverage = {
      file: path.relative(process.cwd(), filePath),
      exports: 0,
      documented: 0,
      coverage: 0,
      undocumentedExports: []
    };

    // Find export statements using regex patterns
    const exportPatterns = [
      /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g,
      /export\s*{\s*([^}]+)\s*}/g,
      /export\s+default\s+(?:function|class)?\s*(\w+)?/g
    ];

    let match;
    for (const pattern of exportPatterns) {
      while ((match = pattern.exec(sourceCode)) !== null) {
        if (match[1]) {
          // Named exports
          const exports = match[1].split(',').map(e => e.trim().split(' ')[0]);
          for (const exportName of exports) {
            if (exportName && exportName !== 'as') {
              fileCoverage.exports++;
              if (!this.isExportDocumented(sourceCode, match.index, exportName)) {
                fileCoverage.undocumentedExports.push(exportName);
              } else {
                fileCoverage.documented++;
              }
            }
          }
        } else if (match[0].includes('export default')) {
          // Default export
          fileCoverage.exports++;
          if (!this.isDefaultExportDocumented(sourceCode, match.index)) {
            fileCoverage.undocumentedExports.push('default export');
          } else {
            fileCoverage.documented++;
          }
        }
      }
    }

    if (fileCoverage.exports > 0) {
      fileCoverage.coverage = (fileCoverage.documented / fileCoverage.exports) * 100;
      this.fileResults.push(fileCoverage);
    }

    this.stats.totalExports += fileCoverage.exports;
    this.stats.documentedExports += fileCoverage.documented;
  }

  isExportDocumented(sourceCode, exportIndex, exportName) {
    // Look backwards from the export to find JSDoc comment
    const beforeExport = sourceCode.substring(0, exportIndex);
    const lines = beforeExport.split('\n');
    let commentLines = [];
    let inComment = false;

    // Look at the last few lines before the export
    for (let i = lines.length - 1; i >= 0 && commentLines.length < 10; i--) {
      const line = lines[i].trim();
      const trimmedLine = line.trim();

      if (trimmedLine === '' && commentLines.length === 0) {
        continue; // Skip empty lines at the end
      }

      if (trimmedLine.startsWith('/**')) {
        inComment = true;
        commentLines.unshift(line);
      } else if (inComment) {
        commentLines.unshift(line);
        if (trimmedLine.endsWith('*/')) {
          break;
        }
      } else if (trimmedLine.startsWith('//') || trimmedLine === '') {
        // Skip single-line comments and empty lines
        continue;
      } else {
        // Hit non-comment, non-empty line - no JSDoc found
        break;
      }
    }

    if (commentLines.length > 0) {
      const commentText = commentLines.join('\n');
      // Check if it's a meaningful JSDoc comment
      return commentText.includes('/**') &&
             commentText.includes('*/') &&
             commentText.replace(/\/\*\*[\s\S]*?\*\//g, '').trim().length > 10;
    }

    return false;
  }

  isDefaultExportDocumented(sourceCode, exportIndex) {
    // Similar logic for default exports
    return this.isExportDocumented(sourceCode, exportIndex, 'default');
  }

  calculateOverallCoverage() {
    if (this.stats.totalExports > 0) {
      this.stats.coverage = (this.stats.documentedExports / this.stats.totalExports) * 100;
    }
  }

  printResults() {
    console.log('📊 JSDoc Coverage Report\n');

    console.log(`Files analyzed: ${this.stats.analyzedFiles}/${this.stats.totalFiles}`);
    console.log(`Total exports: ${this.stats.totalExports}`);
    console.log(`Documented exports: ${this.stats.documentedExports}`);
    console.log(`Coverage: ${this.stats.coverage.toFixed(1)}%\n`);

    // Show coverage by file
    if (this.fileResults.length > 0) {
      console.log('Coverage by file:');
      console.log('─'.repeat(80));

      // Sort by coverage ascending (worst first)
      const sortedResults = [...this.fileResults].sort((a, b) => a.coverage - b.coverage);

      for (const result of sortedResults) {
        const status = result.coverage >= 80 ? '🟢' :
                      result.coverage >= 60 ? '🟡' : '🔴';
        const coverage = result.coverage.toFixed(1).padStart(5);

        console.log(`${status} ${coverage}% ${result.file}`);

        // Show undocumented exports for files with low coverage
        if (result.coverage < 80 && result.undocumentedExports.length > 0) {
          console.log(`   Undocumented: ${result.undocumentedExports.slice(0, 3).join(', ')}${result.undocumentedExports.length > 3 ? '...' : ''}`);
        }
      }
      console.log();
    }

    // Overall assessment
    if (this.stats.coverage >= 90) {
      console.log('🎉 Excellent! JSDoc coverage is very high.');
    } else if (this.stats.coverage >= 80) {
      console.log('✅ Good! JSDoc coverage meets standards.');
    } else if (this.stats.coverage >= 60) {
      console.log('⚠️  Fair! JSDoc coverage needs improvement.');
    } else {
      console.log('🔴 Poor! JSDoc coverage requires significant attention.');
    }

    console.log(`\nFor detailed verification, run: node ${path.relative(process.cwd(), __filename)} <directory>`);
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const directory = args[0] || 'apps/web/src';

  if (!fs.existsSync(directory)) {
    console.error(`❌ Directory not found: ${directory}`);
    process.exit(1);
  }

  const checker = new JSDocCoverageChecker();
  checker.checkCoverage(directory);

  // Exit with error code if coverage is below threshold
  if (checker.stats.coverage < 60) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { JSDocCoverageChecker };