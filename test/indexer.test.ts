import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Indexer, type IndexRecord } from '../src/indexer.js';
import { Result } from '@synet/patterns';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Indexer Unit', () => {
  let testDir: string;
  let indexer: Indexer;

  beforeEach(async () => {
    // Create temporary directory for tests
    testDir = await mkdtemp(join(tmpdir(), 'indexer-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Unit Creation and Identity', () => {
    it('should create indexer with memory storage', () => {
      indexer = Indexer.create({
        indexPath: join(testDir, '.index.json'),
        storage: 'memory'
      });

      expect(indexer).toBeDefined();
      expect(indexer.whoami()).toContain('Indexer Unit');
      expect(indexer.whoami()).toContain('0 records');
    });

    it('should create indexer with file storage', () => {
      indexer = Indexer.create({
        indexPath: join(testDir, '.index.json'),
        storage: 'file'
      });

      expect(indexer).toBeDefined();
      expect(indexer.capabilities()).toBeInstanceOf(Array);
    });

    it('should have proper Unit DNA', () => {
      indexer = Indexer.create({
        indexPath: join(testDir, '.index.json')
      });

      expect(indexer.whoami()).toContain('indexer');
    });
  });

  describe('Record Management', () => {
    beforeEach(() => {
      indexer = Indexer.create({
        indexPath: join(testDir, '.index.json'),
        storage: 'memory'
      });
    });

    it('should add records successfully', async () => {
      const record: IndexRecord = {
        id: 'test-id-1',
        filename: 'test-file-1.json',
        metadata: { name: 'Test Record', type: 'identity' },
        created: new Date(),
        updated: new Date()
      };

      const result = await indexer.add(record);
      
      expect(result.isSuccess).toBe(true);
      expect(indexer.whoami()).toContain('1 records');
    });

    it('should get filename by ID', async () => {
      const record: IndexRecord = {
        id: 'findable-id',
        filename: 'findable.json',
        metadata: { name: 'Findable Record', category: 'test' },
        created: new Date(),
        updated: new Date()
      };

      await indexer.add(record);
      const filename = await indexer.get('findable-id');
      
      expect(filename).toBe('findable.json');
    });

    it('should return null for non-existent records', async () => {
      const filename = await indexer.get('non-existent-id');
      expect(filename).toBeNull();
    });

    it('should remove records successfully', async () => {
      const record: IndexRecord = {
        id: 'removable-id',
        filename: 'removable.json',
        metadata: { name: 'Removable Record' },
        created: new Date(),
        updated: new Date()
      };

      await indexer.add(record);
      const filename = await indexer.get('removable-id');
      expect(filename).toBe('removable.json');

      const result = await indexer.remove('removable-id');
      
      expect(result.isSuccess).toBe(true);
      const removedFilename = await indexer.get('removable-id');
      expect(removedFilename).toBeNull();
      expect(indexer.whoami()).toContain('0 records');
    });
  });

  describe('Search and Query', () => {
    beforeEach(async () => {
      indexer = Indexer.create({
        indexPath: join(testDir, '.index.json'),
        storage: 'memory'
      });

      // Add test records
      const records: IndexRecord[] = [
        {
          id: 'user-1',
          filename: 'user-1.json',
          metadata: { 
            name: 'Alice Johnson', 
            email: 'alice@example.com', 
            role: 'admin',
            department: 'Engineering'
          },
          created: new Date('2025-01-01'),
          updated: new Date('2025-01-15')
        },
        {
          id: 'user-2',
          filename: 'user-2.json',
          metadata: { 
            name: 'Bob Smith', 
            email: 'bob@example.com', 
            role: 'user',
            department: 'Sales'
          },
          created: new Date('2025-01-02'),
          updated: new Date('2025-01-10')
        },
        {
          id: 'user-3',
          filename: 'user-3.json',
          metadata: { 
            name: 'Charlie Brown', 
            email: 'charlie@example.com', 
            role: 'admin',
            department: 'Engineering'
          },
          created: new Date('2025-01-03'),
          updated: new Date('2025-01-20')
        }
      ];

      for (const record of records) {
        await indexer.add(record);
      }
    });

    it('should find records by keyword search', async () => {
      const aliceResults = await indexer.find('alice');
      expect(aliceResults.length).toBeGreaterThan(0);
      expect(aliceResults.some(r => r.metadata.name === 'Alice Johnson')).toBe(true);

      const exampleResults = await indexer.find('example');
      expect(exampleResults).toHaveLength(3); // All have @example.com emails

      const engineeringResults = await indexer.find('engineering');

      console.log(engineeringResults);
      expect(engineeringResults).toHaveLength(2);
    });

    it('should query records by metadata conditions', async () => {
      const adminResults = await indexer.query({ role: 'admin' });
      expect(adminResults).toHaveLength(2);
      expect(adminResults.every(r => r.metadata.role === 'admin')).toBe(true);

      const engineeringResults = await indexer.query({ department: 'Engineering' });
      expect(engineeringResults).toHaveLength(2);
      expect(engineeringResults.every(r => r.metadata.department === 'Engineering')).toBe(true);
    });

    it('should return empty results for non-matching searches', async () => {
      const noResults = await indexer.query({ role: 'manager' });
      expect(noResults).toHaveLength(0);

      const noKeywordResults = await indexer.find('nonexistent');
      expect(noKeywordResults).toHaveLength(0);
    });
  });

  describe('Unit Teaching and Learning', () => {
    beforeEach(() => {
      indexer = Indexer.create({
        indexPath: join(testDir, '.index.json'),
        storage: 'memory'
      });
    });

    it('should provide teaching contract', () => {
      const contract = indexer.teach();
      
      expect(contract).toBeDefined();
      expect(contract.unitId).toBe('indexer');
      expect(contract.capabilities).toBeDefined();
      expect(typeof contract.capabilities.add).toBe('function');
      expect(typeof contract.capabilities.get).toBe('function');
      expect(typeof contract.capabilities.find).toBe('function');
      expect(typeof contract.capabilities.remove).toBe('function');
    });

    it('should provide help documentation', () => {
      const help = indexer.help();
      
      expect(help).toBeDefined();
      expect(typeof help).toBe('string');
      expect(help).toContain('Indexer');
      expect(help).toContain('CAPABILITIES');
    });

    it('should evolve with proper lineage', () => {
      const evolved = indexer.evolve('evolved-indexer');
      
      expect(evolved).toBeDefined();
      expect(evolved.whoami()).toContain('indexer');
      // Evolved version should be different instance
      expect(evolved).not.toBe(indexer);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(() => {
      indexer = Indexer.create({
        indexPath: join(testDir, '.index.json'),
        storage: 'memory'
      });
    });

    it('should handle search with empty keyword', async () => {
      const results = await indexer.find('');
      expect(results).toBeInstanceOf(Array);
    });

    it('should handle query with empty conditions', async () => {
      const results = await indexer.query({});
      expect(results).toBeInstanceOf(Array);
    });

    it('should handle null/undefined metadata in search', async () => {
      // Add record with minimal metadata
      const record: IndexRecord = {
        id: 'minimal',
        filename: 'minimal.json',
        metadata: {},
        created: new Date(),
        updated: new Date()
      };

      await indexer.add(record);
      const results = await indexer.find('test');
      expect(results).toBeInstanceOf(Array);
    });
  });
});
