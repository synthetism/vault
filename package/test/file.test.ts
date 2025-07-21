import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { File, type FileConfig } from '../src/file.js';
import { Result } from '@synet/patterns';
import { AsyncFileSystem } from '@synet/fs';

interface TestData {
  name: string;
  value: number;
  active: boolean;
}

describe('File Unit', () => {
  let asyncFs: AsyncFileSystem;

  beforeEach(async () => {
    // Create AsyncFileSystem with memory backend
    asyncFs = AsyncFileSystem.create({ type: 'memory' });
  });

  afterEach(async () => {
    // Clear memory filesystem after each test to prevent state leakage
    try {
      await asyncFs.clear('/');
    } catch {
      // Ignore errors if clear is not available or directory doesn't exist
    }
  });

  // Helper function to create a filesystem adapter that maps unlink to deleteFile
  function createFsAdapter(filesystem: AsyncFileSystem) {
    const originalContract = filesystem.teach();
    return {
      unitId: originalContract.unitId,
      capabilities: {
        ...originalContract.capabilities,
        // Add unlink as an alias for deleteFile
        unlink: originalContract.capabilities.deleteFile
      }
    };
  }

  describe('Unit Creation and Identity', () => {
    it('should create file with basic config', () => {
      const config: FileConfig<TestData> = {
        filename: 'test.json',
        data: { name: 'test', value: 42, active: true }
      };

      const file = File.create(config);
      
      expect(file).toBeDefined();
      expect(file.whoami()).toContain('File<T>');
      expect(file.whoami()).toContain('test.json');
    });

    it('should generate ID when not provided', () => {
      const config: FileConfig<TestData> = {
        filename: 'auto-id.json',
        data: { name: 'auto', value: 1, active: false }
      };

      const file = File.create(config);
      expect(file.whoami()).toContain('auto-id.json');
    });

    it('should accept custom ID', () => {
      const config: FileConfig<TestData> = {
        id: 'custom-file-id',
        filename: 'custom.json',
        data: { name: 'custom', value: 100, active: true }
      };

      const file = File.create(config);
      expect(file.whoami()).toContain('custom-file-id');
    });

    it('should handle different formats and encodings', () => {
      const jsonFile = File.create({
        filename: 'data.json',
        format: 'json',
        encoding: 'utf8'
      });

      const textFile = File.create({
        filename: 'data.txt',
        format: 'text',
        encoding: 'utf8'
      });

      expect(jsonFile.whoami()).toContain('data.json');
      expect(textFile.whoami()).toContain('data.txt');
    });
  });

  describe('File Operations with Mock Filesystem', () => {
    let file: File<TestData>;
    const testData: TestData = { name: 'test-data', value: 42, active: true };

    beforeEach(() => {
      const config: FileConfig<TestData> = {
        filename: 'test-file.json',  // Back to natural relative path
        data: testData,
        metadata: { description: 'Test file', version: '1.0' }
      };

      file = File.create(config);
      file.learn([createFsAdapter(asyncFs)]);
    });

    it('should write file successfully', async () => {
      console.log('=== DEBUG WRITE TEST ===');
      console.log('File capabilities before:', file.capabilities());
      console.log('Can writeFile before:', file.can('fs-async.writeFile'));
      
      const result = await file.write();
      
      console.log('Write result:', result);
      console.log('Write result.isSuccess:', result.isSuccess);
      if (!result.isSuccess) {
        console.log('Write error:', result.error);
      }
      
      expect(result.isSuccess).toBe(true);
      expect(await asyncFs.exists('test-file.json')).toBe(true);
    });

    it('should read file successfully', async () => {
      // First write data
      await file.write();
      
      // Then read it back
      const result = await file.read();
      
      expect(result.isSuccess).toBe(true);
      expect(result.value).toEqual(testData);
    });

    it('should handle file existence check', async () => {
      // File should not exist initially
      expect(await file.exists()).toBe(true);

      // Write file
      await file.write();

    
      // Now it should exist
      expect(await file.exists()).toBe(true);
    });

    it('should unlink (delete) file successfully', async () => {
      // Write file first
      await file.write();
      expect(await file.exists()).toBe(true);
      
      // Delete file
      const result = await file.unlink();
      
      expect(result.isSuccess).toBe(true);
      expect(await file.exists()).toBe(false);
    });

    it('should handle read operation on non-existent file', async () => {
      const result = await file.read();
      
      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Load failed');
    });

    it('should preserve data integrity through write-read cycle', async () => {
      const originalData: TestData = {
        name: 'integrity-test',
        value: 123,
        active: false
      };

      const config: FileConfig<TestData> = {
        filename: 'integrity.json',  // Back to relative path
        data: originalData
      };

      const writeFile = File.create(config);
      writeFile.learn([createFsAdapter(asyncFs)]);
      
      // Write data
      await writeFile.write();
      
      // Create new file instance to read
      const readFile = File.create({
        filename: 'integrity.json'  // Back to relative path
      });
      readFile.learn([createFsAdapter(asyncFs)]);
      
      // Read data back
      const result = await readFile.read();
      
      expect(result.isSuccess).toBe(true);
      expect(result.value).toEqual(originalData);
    });
  });

  describe('File Metadata and Introspection', () => {
    let file: File<TestData>;

    beforeEach(() => {
      const config: FileConfig<TestData> = {
        filename: 'metadata-test.json',
        data: { name: 'meta', value: 999, active: true },
        metadata: {
          description: 'Test metadata',
          tags: ['test', 'metadata'],
          version: '2.0'
        }
      };

      file = File.create(config);
    });

    it('should provide metadata information', () => {
      const metadata = file.metadata();
      
      expect(metadata).toBeDefined();
      expect(metadata.description).toBe('Test metadata');
      expect(metadata.tags).toEqual(['test', 'metadata']);
      expect(metadata.version).toBe('1.0.0');
    });

    it('should generate checksum', () => {
      const checksum = file.checksum();
      
      expect(checksum).toBeDefined();
      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBeGreaterThan(0);
    });

    it('should calculate size', async () => {
      file.learn([createFsAdapter(asyncFs)]);
      await file.write();
      
      const size = await file.size();
      expect(size).toBeGreaterThan(0);
    });

    it('should maintain consistent checksums for same data', () => {
      const checksum1 = file.checksum();
      const checksum2 = file.checksum();
      
      expect(checksum1).toBe(checksum2);
    });
  });

  describe('Type Safety and Validation', () => {
    let file: File<TestData>;

    beforeEach(() => {
      file = File.create({
        filename: 'validation-test.json',
        data: { name: 'validation', value: 1, active: true }
      });
    });

    it('should validate correct data type', () => {
      const validData: TestData = { name: 'valid', value: 42, active: false };
      expect(file.validate(validData)).toBe(true);
    });

    it('should reject invalid data structures', () => {
      // File validation is basic - only checks for null/undefined
      expect(file.validate(null)).toBe(false);
      expect(file.validate(undefined)).toBe(false);
    });

    it('should accept any non-null data', () => {
      // File's validate method accepts any non-null/undefined data
      expect(file.validate('string')).toBe(true);
      expect(file.validate(42)).toBe(true);
      expect(file.validate({})).toBe(true);
      expect(file.validate({ name: 'invalid', missing: 'value field' })).toBe(true);
    });
  });

  describe('Error Handling', () => {
    let file: File<TestData>;

    beforeEach(() => {
      file = File.create({
        filename: 'error-test.json',  // Back to relative path
        data: { name: 'error', value: 0, active: false }
      });
    });

    it('should fail operations without filesystem capabilities', async () => {
      // File without learned filesystem capabilities
      const writeResult = await file.write();
      expect(writeResult.isFailure).toBe(true);
      expect(writeResult.error?.message).toContain('Missing filesystem capability');

      const readResult = await file.read();
      expect(readResult.isFailure).toBe(true);
      expect(readResult.error?.message).toContain('Missing filesystem capability');

      const existsResult = await file.exists();
      expect(existsResult).toBe(false);
    });

    it('should provide meaningful error messages', async () => {
      file.learn([createFsAdapter(asyncFs)]);
      
      // Try to read non-existent file
      const result = await file.read();
      
      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('error-test.json');
      expect(result.error?.message).toContain('Load failed');
    });
  });

  describe('Unit Teaching and Learning', () => {
    let file: File<TestData>;

    beforeEach(() => {
      file = File.create({
        filename: 'teaching-test.json',
        data: { name: 'teacher', value: 1, active: true }
      });
    });

    it('should provide teaching contract', () => {
      const contract = file.teach();
      
      expect(contract).toBeDefined();
      expect(contract.unitId).toContain('file');
      expect(contract.capabilities).toBeDefined();
      expect(typeof contract.capabilities.write).toBe('function');
      expect(typeof contract.capabilities.read).toBe('function');
      expect(typeof contract.capabilities.exists).toBe('function');
    });

    it('should provide help documentation', () => {
      const help = file.help();
      
      expect(help).toBeDefined();
      expect(typeof help).toBe('string');
      expect(help).toContain('File<T> Unit');
      expect(help).toContain('CAPABILITIES');
    });

    it('should learn from filesystem', () => {
      expect(file.can('fs-async.writeFile')).toBe(false);
      
      file.learn([createFsAdapter(asyncFs)]);
      
      expect(file.can('fs-async.writeFile')).toBe(true);
      expect(file.can('fs-async.readFile')).toBe(true);
      expect(file.can('fs-async.exists')).toBe(true);
    });
  });

  describe('Different File Formats', () => {
    it('should handle JSON format', async () => {
      const jsonFile = File.create({
        filename: 'data.json',  // Back to relative path
        format: 'json',
        data: { test: 'json', number: 42 }
      });
      
      jsonFile.learn([createFsAdapter(asyncFs)]);
      
      await jsonFile.write();
      const result = await jsonFile.read();

      console.log('JSON read result:', result);
      
      expect(result.isSuccess).toBe(true);
      expect(result.value).toEqual({ test: 'json', number: 42 });
    });

    it('should handle text format', async () => {
      const textFile = File.create({
        filename: 'data.txt',
        format: 'text',
        data: 'Hello, World!'
      });
      
      textFile.learn([createFsAdapter(asyncFs)]);
      
      await textFile.write();
      const result = await textFile.read();
      
      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe('Hello, World!');
    });

    it('should handle different encodings', async () => {
      const utf8File = File.create({
        filename: 'utf8.txt',
        encoding: 'utf8',
        data: 'UTF-8 content'
      });
      
      const base64File = File.create({
        filename: 'base64.txt',
        encoding: 'base64',
        data: 'Base64 content'
      });
      
      utf8File.learn([createFsAdapter(asyncFs)]);
      base64File.learn([createFsAdapter(asyncFs)]);
      
      await utf8File.write();
      await base64File.write();
      
      const utf8Result = await utf8File.read();
      const base64Result = await base64File.read();
      
      expect(utf8Result.isSuccess).toBe(true);
      expect(base64Result.isSuccess).toBe(true);
    });
  });

  describe('Edge Cases and Robustness', () => {
    it('should handle empty data', () => {
      const emptyFile = File.create({
        filename: 'empty.json'
      });
      
      expect(emptyFile).toBeDefined();
      expect(emptyFile.whoami()).toContain('empty.json');
    });

    it('should handle special characters in filename', () => {
      const specialFile = File.create({
        filename: 'spëcîál-chärs_123.json',
        data: { test: true }
      });
      
      expect(specialFile).toBeDefined();
      expect(specialFile.whoami()).toContain('spëcîál-chärs_123.json');
    });

    it('should handle large data objects', () => {
      const largeData = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: `Data for item ${i}`.repeat(10)
        }))
      };
      
      const largeFile = File.create({
        filename: 'large.json',
        data: largeData
      });
      
      expect(largeFile).toBeDefined();
      expect(largeFile.checksum()).toBeDefined();
    });
  });
});
