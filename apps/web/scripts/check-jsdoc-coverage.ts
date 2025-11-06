#!/usr/bin/env tsx

/**
 * JSDoc Coverage Checker
 *
 * This script analyzes TypeScript and JavaScript files to calculate JSDoc documentation coverage.
 * It checks for proper JSDoc comments on exported functions, classes, interfaces, and components.
 *
 * Usage:
 *   npx tsx apps/web/scripts/check-jsdoc-coverage.ts [directory]
 *
 * Example:
 *   npx tsx apps/web/scripts/check-jsdoc-coverage.ts apps/web/src
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

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

interface CoverageStats {
  totalExports: number;
  documentedExports: number;
  totalFiles: number;
  analyzedFiles: number;
  coverage: number;
}

interface FileCoverage {
  file: string;
  exports: number;
  documented: number;
  coverage: number;
  undocumentedExports: string[];
}

class JSDocCoverageChecker {
  private stats: CoverageStats = {
    totalExports: 0,
    documentedExports: 0,
    totalFiles: 0,
    analyzedFiles: 0,
    coverage: 0
  };

  private fileResults: FileCoverage[] = [];
  /**
   * Get coverage statistics (public accessor for stats)
   */
  public getCoverageStats(): CoverageStats {
    return { ...this.stats };
  }

  /**
   * Main entry point for checking JSDoc coverage
   */
  async checkCoverage(directory: string): Promise<void> {
    console.log(`🔍 Analyzing JSDoc coverage in: ${directory}\n`);

    const files = this.findTypeScriptFiles(directory);
    this.stats.totalFiles = files.length;

    for (const file of files) {
      try {
        await this.analyzeFile(file);
        this.stats.analyzedFiles++;
      } catch (error) {
        console.warn(`⚠️  Failed to analyze ${file}:`, error);
      }
    }

    this.calculateOverallCoverage();
    this.printResults();
  }

      /**
   * Recursively find all TypeScript and JavaScript files
   */
  private findTypeScriptFiles(directory: string): string[] {
    const files: string[] = [];

    const traverse = (dir: string) => {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !skipDirectories.includes(item)) {
          traverse(fullPath);
        } else if (stat.isFile() && this.isTypeScriptFile(item)) {
          files.push(fullPath);
        }
      }
    };

    traverse(directory);
    return files;
  }

  /**
   * Check if directory should be skipped
   */
  private shouldSkipDirectory(dirname: string): boolean {
    const skipDirs = [
      'node_modules',
      '.next',
      'dist',
      'build',
      '.git',
      'coverage',
      '__tests__',
      '__mocks__'
    ];

    return skipDirs.includes(dirname);
  }

  /**
   * Check if file is a TypeScript or JavaScript file we should analyze
   */
  private isTypeScriptFile(filename: string): boolean {
    return /\.(ts|tsx|js|jsx)$/.test(filename) && !filename.endsWith('.d.ts');
  }

  /**
   * Analyze a single file for JSDoc coverage
   */
  private async analyzeFile(filePath: string): Promise<void> {
    const sourceCode = fs.readFileSync(filePath, 'utf-8');

    // Create TypeScript source file
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    const fileCoverage: FileCoverage = {
      file: path.relative(process.cwd(), filePath),
      exports: 0,
      documented: 0,
      coverage: 0,
      undocumentedExports: []
    };

    // Walk through all nodes to find exports
    const exports = this.findExports(sourceFile);

    for (const exportNode of exports) {
      fileCoverage.exports++;

      const isDocumented = this.isExportDocumented(exportNode, sourceFile);
      if (isDocumented) {
        fileCoverage.documented++;
      } else {
        const exportName = this.getExportName(exportNode);
        fileCoverage.undocumentedExports.push(exportName);
      }
    }

    if (fileCoverage.exports > 0) {
      fileCoverage.coverage = (fileCoverage.documented / fileCoverage.exports) * 100;
      this.fileResults.push(fileCoverage);
    }

    this.stats.totalExports += fileCoverage.exports;
    this.stats.documentedExports += fileCoverage.documented;
  }

  /**
   * Find all export declarations in a source file
   */
  private findExports(sourceFile: ts.SourceFile): ts.Node[] {
    const exports: ts.Node[] = [];

    function visit(node: ts.Node) {
      // Check for export declarations
      if (ts.isExportDeclaration(node) ||
          ts.isExportAssignment(node) ||
          ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {

        // Skip type-only exports and re-exports
        if (ts.isExportDeclaration(node) && node.exportClause) {
          // Named exports
          if (ts.isNamedExports(node.exportClause)) {
            exports.push(node);
          }
        } else if (ts.isExportAssignment(node)) {
          // Default export assignment
          exports.push(node);
        } else if (ts.canHaveModifiers(node)) {
          // Declaration with export modifier
          if (ts.isFunctionDeclaration(node) ||
              ts.isClassDeclaration(node) ||
              ts.isInterfaceDeclaration(node) ||
              ts.isTypeAliasDeclaration(node) ||
              ts.isEnumDeclaration(node) ||
              (ts.isVariableDeclaration(node) && node.parent && ts.isVariableStatement(node.parent))) {
            exports.push(node);
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return exports;
  }

  /**
   * Check if an export has proper JSDoc documentation
   */
  private isExportDocumented(exportNode: ts.Node, sourceFile: ts.SourceFile): boolean {
    // Get the node that contains the actual declaration
    let declarationNode = exportNode;

    if (ts.isExportDeclaration(exportNode)) {
      // For re-exports, we can't easily check documentation
      return false;
    }

    if (ts.isExportAssignment(exportNode)) {
      declarationNode = exportNode.expression;
    }

    // Look for JSDoc comment immediately before the declaration
    const commentRanges = ts.getLeadingCommentRanges(sourceFile.text, declarationNode.getFullStart());

    if (commentRanges) {
      for (const comment of commentRanges) {
        const commentText = sourceFile.text.substring(comment.pos, comment.end);

        // Check if it's a JSDoc comment (starts with /**)
        if (commentText.startsWith('/**') && commentText.endsWith('*/')) {
          // Basic check for meaningful documentation
          const content = commentText.slice(3, -2).trim();
          if (content.length > 10) { // Minimum meaningful content
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Get the name of an export for reporting
   */
  private getExportName(exportNode: ts.Node): string {
    if (ts.isExportAssignment(exportNode)) {
      return 'default export';
    }

    if (ts.canHaveModifiers(exportNode)) {
      if (ts.isFunctionDeclaration(exportNode)) {
        return exportNode.name?.text || 'anonymous function';
      }

      if (ts.isClassDeclaration(exportNode)) {
        return exportNode.name?.text || 'anonymous class';
      }

      if (ts.isInterfaceDeclaration(exportNode)) {
        return exportNode.name?.text || 'anonymous interface';
      }

      if (ts.isTypeAliasDeclaration(exportNode)) {
        return exportNode.name?.text || 'anonymous type';
      }

      if (ts.isEnumDeclaration(exportNode)) {
        return exportNode.name?.text || 'anonymous enum';
      }

      if (ts.isVariableDeclaration(exportNode) && ts.isVariableStatement(exportNode.parent)) {
        return exportNode.name?.getText() || 'anonymous variable';
      }
    }

    if (ts.isExportDeclaration(exportNode) && exportNode.exportClause && ts.isNamedExports(exportNode.exportClause)) {
      const names = exportNode.exportClause.elements.map(el => el.name.getText());
      return names.join(', ');
    }

    return 'export';
  }

  /**
   * Calculate overall coverage statistics
   */
  private calculateOverallCoverage(): void {
    if (this.stats.totalExports > 0) {
      this.stats.coverage = (this.stats.documentedExports / this.stats.totalExports) * 100;
    }
  }

  /**
   * Print coverage results
   */
  private printResults(): void {
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

    console.log(`\nFor detailed verification, run: npx tsx ${path.relative(process.cwd(), __filename)} <directory>`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const directory = args[0] || 'apps/web/src';

  if (!fs.existsSync(directory)) {
    console.error(`❌ Directory not found: ${directory}`);
    process.exit(1);
  }

  const checker = new JSDocCoverageChecker();
  await checker.checkCoverage(directory);

  // Exit with error code if coverage is below threshold
  if (checker.stats.coverage < 60) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { JSDocCoverageChecker };