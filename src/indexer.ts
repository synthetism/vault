import { Unit, UnitSchema, createUnitSchema, type TeachingContract, type UnitProps } from '@synet/unit';
import { Result } from '@synet/patterns';

interface IndexerConfig {
  indexPath: string;
  storage?: 'memory' | 'file';
}

interface IndexRecord {
  id: string;
  metadata: Record<string, unknown>;
  filename: string;
  created: Date;
  updated: Date;
}

interface IndexerProps extends UnitProps {
  indexPath: string;
  storage: 'memory' | 'file';
  records: Map<string, IndexRecord>;  // id -> record mapping
  searchIndexes: string[];            // search terms for find()
}

class Indexer extends Unit<IndexerProps> {
  protected constructor(props: IndexerProps) {
    super(props);
  }

  whoami(): string {
    return `Indexer Unit [${this.props.dna.id}] - ${this.props.records.size} records`;
  }

  capabilities(): string[] {
   return Array.from(this._capabilities.keys());
  }
  
  static create(config: IndexerConfig): Indexer {
    const props: IndexerProps = {
      dna: createUnitSchema({ id: 'indexer', version: '1.0.8' }),
      created: new Date(),
      indexPath: config.indexPath,
      storage: config.storage || 'file',
      records: new Map(),
      searchIndexes: []
    };
    
    const indexer = new Indexer(props);
    // Note: loadIndex() will be called after learning filesystem capabilities
    return indexer;
  }
  
  /**
   * Initialize indexer with filesystem capabilities and load existing index
   * Must be called after learning filesystem capabilities
   */
  async initialize(): Promise<void> {
    await this.loadIndex();
  }
  
  // Core index operations
  
  /**
   * Get filename by ID - the most important indexer capability
   */
  async get(id: string): Promise<string | null> {
    const record = this.props.records.get(id);
    return record ? record.filename : null;
  }
  
  /**
   * Add record to index and auto-generate search indexes from metadata
   */
  async add(record: IndexRecord): Promise<Result<void>> {
    // Store the record
    this.props.records.set(record.id, {
      ...record,
      updated: new Date()
    });
    
    // Auto-generate search indexes from metadata
    this.updateSearchIndexes(record);
    
    if (this.props.storage === 'file') {
      await this.saveToFile();
    }
    
    return Result.success(undefined);
  }
  
  async remove(id: string): Promise<Result<void>> {
    const record = this.props.records.get(id);
    if (record) {
      this.props.records.delete(id);
      // Remove from search indexes
      this.removeFromSearchIndexes(record);
    }
    
    if (this.props.storage === 'file') {
      await this.saveToFile();
    }
    
    return Result.success(undefined);
  }
  
  /**
   * Find records by keyword - searches only in each record's own metadata
   */
  async find(keyword: string): Promise<IndexRecord[]> {
    const results: IndexRecord[] = [];
    const lowerKeyword = keyword.toLowerCase();
    
    for (const [id, record] of this.props.records) {
      // Search only in this record's metadata
      if (this.searchInMetadata(record.metadata, lowerKeyword)) {
        results.push(record);
      }
    }
    
    return results;
  }
  
  /**
   * Query records by structured metadata conditions
   */
  async query(conditions: Record<string, unknown>): Promise<IndexRecord[]> {
    const results: IndexRecord[] = [];
    
    for (const [id, record] of this.props.records) {
      if (this.matchesConditions(record.metadata, conditions)) {
        results.push(record);
      }
    }
    
    return results;
  }
  
  async rebuild(records: IndexRecord[]): Promise<Result<void>> {
    // Clear existing index
    this.props.records.clear();
    this.props.searchIndexes.length = 0;
    
    // Add all records and rebuild search indexes
    for (const record of records) {
      this.props.records.set(record.id, record);
      this.updateSearchIndexes(record);
    }
    
    // Save to file if needed
    if (this.props.storage === 'file') {
      await this.saveToFile();
    }
    
    return Result.success(undefined);
  }
  
  async exists(): Promise<boolean> {
    if (this.props.storage === 'memory') {
      return this.props.records.size > 0;
    }
    
    const indexPath = this.getIndexFilePath();
    return this.can('fs-async.exists') ? await this.execute('fs-async.exists', indexPath) : false;
  }
  
  // File operations
  private async loadIndex(): Promise<void> {
    if (this.props.storage === 'file') {
      const indexPath = this.getIndexFilePath();
      
      if (this.can('fs-async.exists') && await this.execute('fs-async.exists', indexPath)) {
        const content = await this.execute('fs-async.readFile', indexPath);
        const indexData = JSON.parse(content as string);
        
        // Load records
        if (indexData.records) {
          for (const record of indexData.records) {
            this.props.records.set(record.id, record);
          }
        }
        
        // Load search indexes
        if (indexData.searchIndexes) {
          this.props.searchIndexes.push(...indexData.searchIndexes);
        }
      }
    }
  }
  
  private async saveToFile(): Promise<void> {
    if (this.props.storage === 'file') {
      const indexPath = this.getIndexFilePath();
      const indexData = {
        records: Array.from(this.props.records.values()),
        searchIndexes: this.props.searchIndexes,
        version: '1.0.8',
        updated: new Date()
      };
      
      // Ensure directory exists
      await this.execute('fs-async.ensureDir', this.props.indexPath);
      
      // Use the correct async method name that AsyncFileSystem teaches
      await this.execute('fs-async.writeFile', indexPath, JSON.stringify(indexData, null, 2));
    }
  }
  
  private getIndexFilePath(): string {
    return `${this.props.indexPath}/.index.json`;
  }
  
  /**
   * Auto-generate search indexes from metadata
   */
  private updateSearchIndexes(record: IndexRecord): void {
    // Extract searchable terms from metadata
    const terms = this.extractSearchTerms(record.metadata);
    
    // Add unique terms to search indexes
    for (const term of terms) {
      if (!this.props.searchIndexes.includes(term)) {
        this.props.searchIndexes.push(term);
      }
    }
  }
  
  /**
   * Remove terms from search indexes when record is deleted
   */
  private removeFromSearchIndexes(record: IndexRecord): void {
    // For simplicity, we rebuild search indexes when removing
    // In production, you might want more sophisticated reference counting
    this.rebuildSearchIndexes();
  }
  
  /**
   * Rebuild search indexes from all current records
   */
  private rebuildSearchIndexes(): void {
    this.props.searchIndexes.length = 0;
    for (const [id, record] of this.props.records) {
      this.updateSearchIndexes(record);
    }
  }
  
  /**
   * Extract searchable terms from metadata
   */
  private extractSearchTerms(metadata: Record<string, unknown>): string[] {
    const terms: string[] = [];
    
    const extract = (obj: Record<string, unknown>, prefix = ''): void => {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          terms.push(value);
          // Add individual words
          terms.push(...value.toLowerCase().split(/\s+/).filter(word => word.length > 2));
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          extract(value as Record<string, unknown>, `${prefix}${key}.`);
        }
      }
    };
    
    extract(metadata);
    return [...new Set(terms)]; // Remove duplicates
  }
  
  /**
   * Search in metadata recursively
   */
  private searchInMetadata(metadata: Record<string, unknown>, keyword: string): boolean {
    const search = (obj: Record<string, unknown>): boolean => {
      for (const [key, value] of Object.entries(obj)) {
        // Search in string values
        if (typeof value === 'string' && value.toLowerCase().includes(keyword)) {
          return true;
        }
        
        // Search in arrays of strings
        if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'string' && item.toLowerCase().includes(keyword)) {
              return true;
            }
          }
        }
        
        // Search in nested objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          if (search(value as Record<string, unknown>)) return true;
        }
      }
      return false;
    };
    
    return search(metadata);
  }

  /* private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  } */

  private matchesConditions(metadata: Record<string, unknown>, conditions: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }
  
  teach(): TeachingContract {
    return {
      unitId: this.dna.id,
      capabilities: {
        get: (...args: unknown[]) => this.get(args[0] as string),
        add: (...args: unknown[]) => this.add(args[0] as IndexRecord),
        remove: (...args: unknown[]) => this.remove(args[0] as string),
        find: (...args: unknown[]) => this.find(args[0] as string),
        query: (...args: unknown[]) => this.query(args[0] as Record<string, unknown>),
        rebuild: (...args: unknown[]) => this.rebuild(args[0] as IndexRecord[]),
        exists: (...args: unknown[]) => this.exists()
      }
    };
  }
  
  help(): string {
    return `
[${this.dna.id}] Indexer Unit - Metadata-Based Index Operations

NATIVE CAPABILITIES:
  get(id) - Get filename by ID (CORE FUNCTION)
  add(record) - Add record to index (auto-generates search terms)
  remove(id) - Remove record from index
  find(keyword) - Search in metadata and search indexes
  query(conditions) - Query by specific metadata conditions
  rebuild(records) - Rebuild entire index from records
  .exists() - Check if index exists

STORAGE: ${this.props.storage}
PATH: ${this.props.indexPath}
RECORDS: ${this.props.records.size}
SEARCH TERMS: ${this.props.searchIndexes.length}

STORAGE MODES:
  - memory: Fast, volatile index
  - file: Persistent index in .index.json

INDEXING STRATEGY:
  - Metadata IS the index (no separate indexFields needed)
  - Search indexes auto-generated from metadata values
  - Core function: ID → filename mapping for file recovery

EXAMPLE USAGE:
  const indexer = Indexer.create({
    indexPath: './vault',
    storage: 'file'
  });
  
  // Add file to index
  await indexer.add({
    id: 'app-config-v1',
    filename: 'app.config.json',
    metadata: { type: 'config', app: 'synet', theme: 'dark' },
    created: new Date(),
    updated: new Date()
  });
  
  // Core function: Get filename by ID
  const filename = await indexer.get('app-config-v1');
  // Returns: 'app.config.json'
  
  // Search by keyword (searches all metadata)
  const configs = await indexer.find('config');
  
  // Structured query
  const darkConfigs = await indexer.query({ theme: 'dark' });

FILE RECOVERY PATTERN:
  const filename = await indexer.get(fileId);
  if (filename) {
    const file = File.create({ filename, id: fileId });
    await file.load(); // File restores itself!
  }
`;
  }
}

export { Indexer, type IndexRecord, type IndexerConfig };