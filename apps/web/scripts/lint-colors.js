#!/usr/bin/env node

/**
 * Color-ban enforcement script
 * Scans codebase for banned color classes and hex codes
 * Banned: blue, green, cyan, teal, turquoise
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BANNED_PATTERNS = [
  // Tailwind classes
  /bg-(blue|green|cyan|teal|turquoise)-\d+/g,
  /text-(blue|green|cyan|teal|turquoise)-\d+/g,
  /border-(blue|green|cyan|teal|turquoise)-\d+/g,
  /ring-(blue|green|cyan|teal|turquoise)-\d+/g,
  /from-(blue|green|cyan|teal|turquoise)-\d+/g,
  /to-(blue|green|cyan|teal|turquoise)-\d+/g,
  /via-(blue|green|cyan|teal|turquoise)-\d+/g,
  // Hex codes (blue/green/cyan/teal/turquoise)
  /#[0-9a-fA-F]{6}.*(?:00(?:00|ff|80)|00ff|0080|00c0|40e0|80ff|c0ff|e0ff|00(?:80|ff)|0080|00c0|40e0|80ff|c0ff|e0ff)/g,
  // Specific banned hex codes
  /#(0000ff|00ff00|008000|00ffff|008080|40e0d0|80ff80|c0ffc0|e0ffe0|00ff80|00c080|40e080|80ffc0|c0ffe0|e0ffff)/gi,
  // RGB values
  /rgb\(0,\s*0,\s*255\)/gi, // blue
  /rgb\(0,\s*255,\s*0\)/gi, // green
  /rgb\(0,\s*128,\s*0\)/gi, // green
  /rgb\(0,\s*255,\s*255\)/gi, // cyan
  /rgb\(0,\s*128,\s*128\)/gi, // teal
];

const ALLOWED_PATTERNS = [
  // Allow comments mentioning colors
  /\/\/.*(blue|green|cyan|teal|turquoise)/i,
  /\/\*.*(blue|green|cyan|teal|turquoise).*\*\//i,
  // Allow in documentation strings
  /`.*(blue|green|cyan|teal|turquoise).*`/i,
];

const SCAN_DIRS = [
  'src',
  'app',
  'components',
  'lib',
  'styles',
  'public',
];

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.html'];

let errors = [];
let filesScanned = 0;

function shouldScanFile(filePath) {
  const ext = path.extname(filePath);
  if (!SCAN_EXTENSIONS.includes(ext)) {
    return false;
  }
  
  // Skip node_modules, .next, dist, etc.
  if (filePath.includes('node_modules') || 
      filePath.includes('.next') || 
      filePath.includes('dist') ||
      filePath.includes('coverage')) {
    return false;
  }
  
  return true;
}

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      // Skip allowed patterns (comments, docs)
      if (ALLOWED_PATTERNS.some(pattern => pattern.test(line))) {
        return;
      }
      
      BANNED_PATTERNS.forEach(pattern => {
        const matches = line.match(pattern);
        if (matches) {
          matches.forEach(match => {
            errors.push({
              file: filePath,
              line: index + 1,
              match: match,
              content: line.trim(),
            });
          });
        }
      });
    });
    
    filesScanned++;
  } catch (err) {
    console.error(`Error scanning ${filePath}:`, err.message);
  }
}

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  entries.forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile() && shouldScanFile(fullPath)) {
      scanFile(fullPath);
    }
  });
}

function main() {
  console.log('🔍 Scanning for banned colors (blue, green, cyan, teal, turquoise)...\n');
  
  const rootDir = process.cwd();
  
  SCAN_DIRS.forEach(dir => {
    const fullPath = path.join(rootDir, dir);
    if (fs.existsSync(fullPath)) {
      scanDirectory(fullPath);
    }
  });
  
  console.log(`📊 Scanned ${filesScanned} files\n`);
  
  if (errors.length > 0) {
    console.error('❌ Found banned colors:\n');
    
    // Group by file
    const errorsByFile = {};
    errors.forEach(error => {
      if (!errorsByFile[error.file]) {
        errorsByFile[error.file] = [];
      }
      errorsByFile[error.file].push(error);
    });
    
    Object.keys(errorsByFile).forEach(file => {
      console.error(`\n📄 ${file}:`);
      errorsByFile[file].forEach(error => {
        console.error(`   Line ${error.line}: ${error.match}`);
        console.error(`   ${error.content}`);
      });
    });
    
    console.error(`\n❌ Found ${errors.length} violation(s) in ${Object.keys(errorsByFile).length} file(s)`);
    console.error('\n💡 Replace banned colors with warm palette:');
    console.error('   - blue → primary (warm gray) or secondary (amber)');
    console.error('   - green → primary (warm gray) for success states');
    console.error('   - cyan/teal/turquoise → accent (deep orange)');
    process.exit(1);
  } else {
    console.log('✅ No banned colors found!');
    process.exit(0);
  }
}

main();



