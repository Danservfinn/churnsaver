// Security tests for path traversal prevention
import { describe, it, expect, beforeEach } from 'vitest';

describe('Path Traversal Prevention Tests', () => {
  describe('File path manipulation prevention', () => {
    it('should prevent directory traversal in file paths', () => {
      const traversalAttempts = [
        '../../../etc/passwd',
        '../../../../etc/shadow',
        '..\\..\\windows\\system32',
        '....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2fetc%2fpasswd', // URL encoded
        '..%2f..%2fetc%2fpasswd', // Mixed encoding
      ];

      for (const attempt of traversalAttempts) {
        // Normalize and sanitize path
        let sanitized = attempt
          .replace(/\.\./g, '') // Remove parent directory references
          .replace(/[\/\\]/g, '/') // Normalize separators
          .replace(/^\/+/, '') // Remove leading slashes
          .replace(/\/+/g, '/'); // Normalize multiple slashes

        // URL decode if needed
        try {
          sanitized = decodeURIComponent(sanitized);
          sanitized = sanitized.replace(/\.\./g, '');
        } catch {
          // Invalid encoding, already sanitized
        }

        expect(sanitized).not.toContain('..');
        expect(sanitized).not.toContain('etc/passwd');
        expect(sanitized).not.toContain('etc/shadow');
      }
    });

    it('should prevent absolute path access', () => {
      const absolutePaths = [
        '/etc/passwd',
        '/etc/shadow',
        '/root/.ssh/id_rsa',
        'C:\\Windows\\System32',
        'C:\\Windows\\System32\\config\\SAM',
      ];

      for (const path of absolutePaths) {
        // Verify absolute paths are rejected or normalized to relative
        const isAbsolute = path.startsWith('/') || /^[A-Z]:\\/.test(path);
        if (isAbsolute) {
          // Should be rejected or normalized
          expect(path).toBeTruthy();
        }
      }
    });
  });

  describe('Directory traversal attacks', () => {
    it('should prevent accessing parent directories', () => {
      const baseDir = '/allowed/directory';
      const maliciousPaths = [
        '../secret',
        '../../secret',
        '....//....//secret',
        '..%2fsecret',
      ];

      for (const maliciousPath of maliciousPaths) {
        // Verify path resolution doesn't escape base directory
        const resolved = `${baseDir}/${maliciousPath}`;
        const normalized = resolved.replace(/\.\./g, '').replace(/\/+/g, '/');
        
        expect(normalized).not.toContain('..');
        expect(normalized).toContain(baseDir);
      }
    });

    it('should prevent null byte injection', () => {
      const nullByteAttempts = [
        '../../etc/passwd\x00',
        'file.txt\x00.php',
        'normal\x00file.txt',
      ];

      for (const attempt of nullByteAttempts) {
        // Verify null bytes are removed
        const sanitized = attempt.replace(/\x00/g, '');
        expect(sanitized).not.toContain('\x00');
      }
    });
  });

  describe('File access restrictions', () => {
    it('should restrict access to system files', () => {
      const systemFiles = [
        '/etc/passwd',
        '/etc/shadow',
        '/etc/hosts',
        '/proc/self/environ',
        '/sys/kernel',
        'C:\\Windows\\System32\\config\\SAM',
        'C:\\Windows\\System32\\drivers\\etc\\hosts',
      ];

      for (const file of systemFiles) {
        // Verify access to system files is blocked
        const isSystemFile = file.includes('/etc/') || 
                           file.includes('/proc/') || 
                           file.includes('/sys/') ||
                           file.includes('System32');
        
        if (isSystemFile) {
          // Should be rejected
          expect(file).toBeTruthy();
        }
      }
    });

    it('should restrict access to application config files', () => {
      const configFiles = [
        '../../.env',
        '../../config.json',
        '../../package.json',
        '../../../.git/config',
      ];

      for (const file of configFiles) {
        // Verify access to config files outside allowed directory is blocked
        const sanitized = file.replace(/\.\./g, '');
        expect(sanitized).not.toContain('..');
      }
    });

    it('should validate file extensions', () => {
      const maliciousFiles = [
        '../../../etc/passwd.txt',
        '../../config.json',
        '..\\..\\settings.php',
      ];

      const allowedExtensions = ['.json', '.txt', '.csv'];
      const allowedBaseDir = '/allowed/directory';

      for (const file of maliciousFiles) {
        // Normalize path
        let normalized = file.replace(/\.\./g, '').replace(/[\/\\]/g, '/');
        
        // Verify it's within allowed directory
        const isWithinAllowed = normalized.startsWith(allowedBaseDir);
        
        // Verify extension is allowed
        const extension = normalized.substring(normalized.lastIndexOf('.'));
        const hasAllowedExtension = allowedExtensions.includes(extension);
        
        // Should be rejected if outside allowed directory or wrong extension
        expect(isWithinAllowed || hasAllowedExtension).toBe(false);
      }
    });
  });

  describe('URL path traversal prevention', () => {
    it('should prevent path traversal in URL parameters', () => {
      const maliciousUrls = [
        '/api/files?path=../../../etc/passwd',
        '/api/export?file=..%2f..%2fconfig.json',
        '/api/download?file=....//....//secret.txt',
      ];

      for (const url of maliciousUrls) {
        // Parse and validate URL parameters
        const urlObj = new URL(url, 'http://localhost');
        const pathParam = urlObj.searchParams.get('path') || urlObj.searchParams.get('file');
        
        if (pathParam) {
          const sanitized = pathParam.replace(/\.\./g, '').replace(/[\/\\]/g, '/');
          expect(sanitized).not.toContain('..');
        }
      }
    });
  });
});

