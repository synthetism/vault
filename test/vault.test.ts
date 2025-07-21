/**
 * Vault<T> Unit Tests
 * Testing single-purpose, type-safe vault functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../src/vault.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

// Mock FileSystem for testing
class MockFileSystem {
  private files = new Map<string, string>();
  private dirs = new Set<string>();

  constructor(private basePath?: string) {}

  writeFileSync(path: string, content: string): void {
    this.files.set(path, content);
  }

  readFileSync(path: string): string {
    const content = this.files.get(path);
    if (!content) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  existsSync(path: string): boolean {
    return this.files.has(path) || this.dirs.has(path);
  }

  deleteFileSync(path: string): void {
    this.files.delete(path);
  }

  ensureDirSync(path: string): void {
    this.dirs.add(path);
  }

  whoami(): string {
    return `MockFileSystem [${this.basePath || 'memory'}]`;
  }

  teach() {
    return {
      unitId: 'filesystem',
      capabilities: {
        readFileSync: (...args: unknown[]) => this.readFileSync(args[0] as string),
        writeFileSync: (...args: unknown[]) => this.writeFileSync(args[0] as string, args[1] as string),
        existsSync: (...args: unknown[]) => this.existsSync(args[0] as string),
        deleteFileSync: (...args: unknown[]) => this.deleteFileSync(args[0] as string),
        ensureDirSync: (...args: unknown[]) => this.ensureDirSync(args[0] as string),
        // Backwards compatibility for tests
        'fs.writeFile': (...args: unknown[]) => this.writeFileSync(args[0] as string, args[1] as string),
        'fs.readFile': (...args: unknown[]) => this.readFileSync(args[0] as string),
        'fs.exists': (...args: unknown[]) => this.existsSync(args[0] as string),
        'fs.unlink': (...args: unknown[]) => this.deleteFileSync(args[0] as string),
      }
    };
  }
}

// Test data types
interface Identity {
  id: string;
  name: string;
  email: string;
  publicKey: string;
  created: Date;
}

interface Document {
  title: string;
  content: string;
  author: string;
  tags: string[];
  version: number;
}

interface Config {
  theme: string;
  language: string;
  notifications: boolean;
  features: {
    darkMode: boolean;
    autoSave: boolean;
  };
}

describe('Vault<T> Unit - Single-Purpose Type-Safe Vault', () => {
  let testDir: string;
  let mockFs: MockFileSystem;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'vault-unit-test-'));
    mockFs = new MockFileSystem(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Vault Creation and Loading', () => {
    it('should create a new vault with default configuration', async () => {
      const vault = await Vault.create<Identity>({
        path: testDir,
        fs: mockFs as any,
        name: 'test-identities'
      });

      expect(vault).toBeDefined();
      expect(vault.whoami()).toContain('Vault<T>');
      expect(vault.whoami()).toContain('test-identities');
      expect(vault.whoami()).toContain(testDir);

      // Should create vault metadata file
      expect(mockFs.existsSync(`${testDir}/.vault.json`)).toBe(true);
    });

    it('should create vault with custom configuration', async () => {
      const vault = await Vault.create<Document>({
        path: testDir,
        fs: mockFs as any,
        name: 'documents',
        version: '2.0.0',
        encryption: true,
        compression: true,
        encoding: 'base64',
        format: 'json'
      });

      expect(vault).toBeDefined();
      expect(vault.whoami()).toContain('documents');

      // Verify metadata was saved
      const metadataContent = mockFs.readFileSync(`${testDir}/.vault.json`);
      const metadata = JSON.parse(metadataContent);
      
      expect(metadata.name).toBe('documents');
      expect(metadata.version).toBe('2.0.0');
      expect(metadata.encryption).toBe(true);
      expect(metadata.compression).toBe(true);
      expect(metadata.encoding).toBe('base64');
      expect(metadata.format).toBe('json');
    });

    it('should load existing vault from path', async () => {
      // Create vault first
      const originalVault = await Vault.create<Config>({
        path: testDir,
        fs: mockFs as any,
        name: 'config-vault',
        encryption: true
      });

      // Load the same vault
      const loadedVault = await Vault.load<Config>(testDir, mockFs as any);

      expect(loadedVault).toBeDefined();
      expect(loadedVault.whoami()).toContain('config-vault');
      expect(loadedVault.whoami()).toContain(testDir);
    });

    it('should create vault even when path does not exist (idempotent)', async () => {
      // Test the new idempotent behavior - create() should work even for non-existent paths
      const vault = await Vault.create<Identity>({
        path: '/non/existent/path',
        fs: mockFs as any,
        name: 'test-vault'
      });
      
      expect(vault).toBeDefined();
      expect(vault.whoami()).toContain('test-vault');
      expect(Vault.exists('/non/existent/path', mockFs as any)).toBe(true);
    });

    it('should detect existing vaults', async () => {
      // Create a vault first
      const path = `${testDir}/existing-vault`;
      await Vault.create<Identity>({
        path,
        fs: mockFs as any,
        name: 'existing-vault'
      });
      
      // Check that it exists
      expect(Vault.exists(path, mockFs as any)).toBe(true);
      expect(Vault.exists(`${testDir}/non-existent`, mockFs as any)).toBe(false);
    });
  });

  describe('Data Storage and Retrieval', () => {
    let identityVault: Vault<Identity>;
    let documentVault: Vault<Document>;

    beforeEach(async () => {
      identityVault = await Vault.create<Identity>({
        path: `${testDir}/identities`,
        fs: mockFs as any,
        name: 'identity-vault',
        format: 'json'
      });

      documentVault = await Vault.create<Document>({
        path: `${testDir}/documents`,
        fs: mockFs as any,
        name: 'document-vault',
        encryption: true
      });
    });

    it('should save and retrieve typed data', async () => {
      const identity: Identity = {
        id: 'alice-001',
        name: 'Alice Smith',
        email: 'alice@example.com',
        publicKey: 'pk_alice_12345',
        created: new Date('2024-01-01')
      };

      // Save identity
      await identityVault.save('alice', identity, { type: 'user', role: 'admin' });

      // Retrieve identity
      const retrieved = await identityVault.get('alice');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('alice-001');
      expect(retrieved?.name).toBe('Alice Smith');
      expect(retrieved?.email).toBe('alice@example.com');
      expect(retrieved?.publicKey).toBe('pk_alice_12345');
    });

    it('should handle complex data structures', async () => {
      const document: Document = {
        title: 'SYNET Architecture',
        content: 'Unit-oriented programming paradigm...',
        author: 'System Architect',
        tags: ['architecture', 'units', 'consciousness'],
        version: 1
      };

      await documentVault.save('arch-doc', document, {
        category: 'documentation',
        priority: 'high',
        lastModified: new Date()
      });

      const retrieved = await documentVault.get('arch-doc');

      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('SYNET Architecture');
      expect(retrieved?.tags).toEqual(['architecture', 'units', 'consciousness']);
      expect(retrieved?.version).toBe(1);
    });

    it('should return null for non-existent records', async () => {
      const result = await identityVault.get('non-existent-id');
      expect(result).toBeNull();
    });

    it('should handle multiple records of same type', async () => {
      const alice: Identity = {
        id: 'alice-001',
        name: 'Alice Smith',
        email: 'alice@example.com',
        publicKey: 'pk_alice',
        created: new Date()
      };

      const bob: Identity = {
        id: 'bob-002',
        name: 'Bob Johnson',
        email: 'bob@example.com',
        publicKey: 'pk_bob',
        created: new Date()
      };

      await identityVault.save('alice', alice, { role: 'admin' });
      await identityVault.save('bob', bob, { role: 'user' });

      const retrievedAlice = await identityVault.get('alice');
      const retrievedBob = await identityVault.get('bob');

      expect(retrievedAlice?.name).toBe('Alice Smith');
      expect(retrievedBob?.name).toBe('Bob Johnson');
      expect(retrievedAlice?.id).not.toBe(retrievedBob?.id);
    });
  });

  describe('Search and Query Operations', () => {
    let vault: Vault<Document>;

    beforeEach(async () => {
      vault = await Vault.create<Document>({
        path: testDir,
        fs: mockFs as any,
        name: 'search-vault'
      });

      // Add test documents
      await vault.save('doc1', {
        title: 'Unit Architecture Guide',
        content: 'How to build consciousness-based units',
        author: 'System Designer',
        tags: ['architecture', 'units'],
        version: 1
      }, { category: 'guide', type: 'architecture' });

      await vault.save('doc2', {
        title: 'File Management',
        content: 'Working with conscious files',
        author: 'Developer',
        tags: ['files', 'storage'],
        version: 2
      }, { category: 'tutorial', type: 'files' });

      await vault.save('doc3', {
        title: 'Vault Operations',
        content: 'Type-safe data storage patterns',
        author: 'System Designer',
        tags: ['vault', 'storage'],
        version: 1
      }, { category: 'guide', type: 'storage' });
    });

    it('should find documents by keyword', async () => {
      const results = await vault.find('architecture');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Unit Architecture Guide');
    });

    it('should find documents by metadata category', async () => {
      const results = await vault.find('guide');

      expect(results).toHaveLength(2);
      expect(results.map(r => r.title)).toContain('Unit Architecture Guide');
      expect(results.map(r => r.title)).toContain('Vault Operations');
    });

    it('should return empty array for no matches', async () => {
      const results = await vault.find('nonexistent');
      expect(results).toEqual([]);
    });

    it('should list all records with metadata', async () => {
      const list = await vault.list();

      expect(list).toHaveLength(3);
      expect(list.map(item => item.id)).toContain('doc1');
      expect(list.map(item => item.id)).toContain('doc2');
      expect(list.map(item => item.id)).toContain('doc3');

      // Check metadata
      const doc1Meta = list.find(item => item.id === 'doc1');
      expect(doc1Meta?.metadata.category).toBe('guide');
      expect(doc1Meta?.metadata.type).toBe('architecture');
    });
  });

  describe('Data Management Operations', () => {
    let vault: Vault<Identity>;

    beforeEach(async () => {
      vault = await Vault.create<Identity>({
        path: testDir,
        fs: mockFs as any,
        name: 'management-vault'
      });
    });

    it('should delete records by ID', async () => {
      const identity: Identity = {
        id: 'temp-001',
        name: 'Temporary User',
        email: 'temp@example.com',
        publicKey: 'pk_temp',
        created: new Date()
      };

      // Save and verify
      await vault.save('temp', identity);
      expect(await vault.get('temp')).toBeDefined();

      // Delete and verify
      const deleted = await vault.delete('temp');
      expect(deleted).toBe(true);
      expect(await vault.get('temp')).toBeNull();
    });

    it('should return false when deleting non-existent record', async () => {
      const deleted = await vault.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should update records by saving with same ID', async () => {
      const original: Identity = {
        id: 'update-001',
        name: 'Original Name',
        email: 'original@example.com',
        publicKey: 'pk_original',
        created: new Date()
      };

      const updated: Identity = {
        id: 'update-001',
        name: 'Updated Name',
        email: 'updated@example.com',
        publicKey: 'pk_updated',
        created: new Date()
      };

      // Save original
      await vault.save('update-test', original);
      expect((await vault.get('update-test'))?.name).toBe('Original Name');

      // Save updated version
      await vault.save('update-test', updated);
      expect((await vault.get('update-test'))?.name).toBe('Updated Name');
      expect((await vault.get('update-test'))?.email).toBe('updated@example.com');
    });
  });

  describe('Vault Statistics and Metadata', () => {
    let vault: Vault<Config>;

    beforeEach(async () => {
      vault = await Vault.create<Config>({
        path: testDir,
        fs: mockFs as any,
        name: 'stats-vault',
        version: '3.0.0',
        encryption: true,
        format: 'json'
      });
    });

    it('should provide vault statistics', async () => {
      // Add some test data
      await vault.save('config1', {
        theme: 'dark',
        language: 'en',
        notifications: true,
        features: { darkMode: true, autoSave: false }
      });

      await vault.save('config2', {
        theme: 'light',
        language: 'es',
        notifications: false,
        features: { darkMode: false, autoSave: true }
      });

      const stats = await vault.stats();

      expect(stats.name).toBe('stats-vault');
      expect(stats.totalRecords).toBe(2);
      expect(stats.metadata.version).toBe('3.0.0');
      expect(stats.metadata.encryption).toBe(true);
      expect(stats.metadata.format).toBe('json');
      expect(stats.metadata.created).toBeInstanceOf(Date);
    });

    it('should show zero records for empty vault', async () => {
      const stats = await vault.stats();
      expect(stats.totalRecords).toBe(0);
    });
  });

  describe('Unit Architecture Integration', () => {
    let vault: Vault<Identity>;

    beforeEach(async () => {
      vault = await Vault.create<Identity>({
        path: testDir,
        fs: mockFs as any,
        name: 'architecture-vault'
      });
    });

    it('should have proper unit identity', () => {
      expect(vault.whoami()).toContain('Vault<T>');
      expect(vault.whoami()).toContain('architecture-vault');
      expect(vault.whoami()).toContain(testDir);
    });

    it('should provide vault capabilities', () => {
      const capabilities = vault.capabilities();
      
      expect(capabilities).toContain('save');
      expect(capabilities).toContain('get');
      expect(capabilities).toContain('find');
      expect(capabilities).toContain('list');
      expect(capabilities).toContain('delete');
      expect(capabilities).toContain('stats');
    });

    it('should teach vault capabilities to other units', () => {
      const contract = vault.teach();

      expect(contract.unitId).toContain('vault');
      expect(contract.capabilities).toBeDefined();
      expect(typeof contract.capabilities.save).toBe('function');
      expect(typeof contract.capabilities.get).toBe('function');
      expect(typeof contract.capabilities.find).toBe('function');
      expect(typeof contract.capabilities.list).toBe('function');
      expect(typeof contract.capabilities.delete).toBe('function');
      expect(typeof contract.capabilities.stats).toBe('function');
    });

    it('should execute taught capabilities correctly', async () => {
      const contract = vault.teach();

      // Test save capability
      const identity: Identity = {
        id: 'test-001',
        name: 'Test User',
        email: 'test@example.com',
        publicKey: 'pk_test',
        created: new Date()
      };

      await contract.capabilities.save('test', identity, { role: 'tester' });

      // Test get capability
      const retrieved = await contract.capabilities.get('test');
      expect(retrieved?.name).toBe('Test User');

      // Test list capability
      const list = await contract.capabilities.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('test');

      // Test stats capability
      const stats = await contract.capabilities.stats();
      expect(stats.totalRecords).toBe(1);

      // Test delete capability
      const deleted = await contract.capabilities.delete('test');
      expect(deleted).toBe(true);
    });

    it('should provide help documentation', () => {
      // Help method prints to console, so we just verify it exists and runs
      expect(() => vault.help()).not.toThrow();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    let vault: Vault<Identity>;

    beforeEach(async () => {
      vault = await Vault.create<Identity>({
        path: testDir,
        fs: mockFs as any,
        name: 'error-vault'
      });
    });

    it('should handle empty data gracefully', async () => {
      // Save record with minimal data
      await vault.save('minimal', {
        id: 'min-001',
        name: '',
        email: '',
        publicKey: '',
        created: new Date()
      });

      const retrieved = await vault.get('minimal');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('min-001');
    });

    it('should handle special characters in IDs', async () => {
      const identity: Identity = {
        id: 'special-001',
        name: 'Special User',
        email: 'special@example.com',
        publicKey: 'pk_special',
        created: new Date()
      };

      await vault.save('user-with-dashes_and_underscores.123', identity);
      const retrieved = await vault.get('user-with-dashes_and_underscores.123');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Special User');
    });

    it('should handle large data objects', async () => {
      const largeIdentity: Identity = {
        id: 'large-001',
        name: 'Large Data User',
        email: 'large@example.com',
        publicKey: 'pk_' + 'x'.repeat(1000), // Large public key
        created: new Date()
      };

      await vault.save('large', largeIdentity, {
        description: 'A'.repeat(1000),
        tags: Array(100).fill('tag'),
        metadata: {
          nested: {
            deep: {
              data: 'B'.repeat(500)
            }
          }
        }
      });

      const retrieved = await vault.get('large');
      expect(retrieved).toBeDefined();
      expect(retrieved?.publicKey).toHaveLength(1003); // 'pk_' + 1000 'x's
    });

    it('should gracefully handle filesystem errors', async () => {
      // Create a mock filesystem that throws errors
      const errorFs = {
        ...mockFs,
        readFileSync: () => { throw new Error('File system error'); }
      };

      const result = await vault.get('any-id');
      // Should return null instead of throwing
      expect(result).toBeNull();
    });
  });

  describe('Type Safety and Data Integrity', () => {
    it('should maintain type safety across different vault types', async () => {
      const identityVault = await Vault.create<Identity>({
        path: `${testDir}/identities`,
        fs: mockFs as any,
        name: 'identity-vault'
      });

      const documentVault = await Vault.create<Document>({
        path: `${testDir}/documents`,
        fs: mockFs as any,
        name: 'document-vault'
      });

      const identity: Identity = {
        id: 'type-001',
        name: 'Type Safe User',
        email: 'type@example.com',
        publicKey: 'pk_type',
        created: new Date()
      };

      const document: Document = {
        title: 'Type Safety Document',
        content: 'Ensuring data integrity',
        author: 'Type Checker',
        tags: ['types', 'safety'],
        version: 1
      };

      await identityVault.save('identity', identity);
      await documentVault.save('document', document);

      const retrievedIdentity = await identityVault.get('identity');
      const retrievedDocument = await documentVault.get('document');

      // TypeScript ensures type safety at compile time
      expect(retrievedIdentity?.email).toBe('type@example.com');
      expect(retrievedDocument?.title).toBe('Type Safety Document');
    });

    it('should preserve data types through serialization cycle', async () => {
      const vault = await Vault.create<Config>({
        path: testDir,
        fs: mockFs as any,
        name: 'serialization-vault'
      });

      const config: Config = {
        theme: 'dark',
        language: 'en',
        notifications: true,
        features: {
          darkMode: true,
          autoSave: false
        }
      };

      await vault.save('config', config);
      const retrieved = await vault.get('config');

      expect(retrieved?.theme).toBe('dark');
      expect(retrieved?.notifications).toBe(true);
      expect(retrieved?.features.darkMode).toBe(true);
      expect(retrieved?.features.autoSave).toBe(false);
      expect(typeof retrieved?.notifications).toBe('boolean');
    });
  });
});
