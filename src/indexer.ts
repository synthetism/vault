import { Unit, UnitSchema, createUnitSchema, type TeachingContract, type UnitProps } from '@synet/unit';
import { Result } from '@synet/patterns';

interface IndexerConfig {
  indexFields: string[];
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
  indexFields: string[];
  indexPath: string;
  storage: 'memory' | 'file';
  index: Map<string, IndexRecord>;
}

class Indexer extends Unit<IndexerProps> {
  protected constructor(props: IndexerProps) {
    super(props);
  }

  whoami(): string {
    return `Indexer Unit [${this.props.dna.id}] - ${this.props.indexFields.join(', ')}`;
  }

  capabilities(): string[] {
    return [
      'indexer.add',
      'indexer.remove', 
      'indexer.find',
      'indexer.query',
      'indexer.rebuild',
      'indexer.exists'
    ];
  }
  
  static create(config: IndexerConfig): Indexer {
    const props: IndexerProps = {
      dna: createUnitSchema({ id: 'indexer', version: '1.0.7' }),
      created: new Date(),
      indexFields: config.indexFields,
      indexPath: config.indexPath,
      storage: config.storage || 'file',
      index: new Map()
    };
    
    const indexer = new Indexer(props);
    indexer.loadIndex();
    return indexer;
  }
  
  // Core index operations
  async add(record: IndexRecord): Promise<Result<void>> {
    this.props.index.set(record.id, record);
    
    if (this.props.storage === 'file') {
      await this.saveToFile();
    }
    
    return Result.success(undefined);
  }
  
  async remove(id: string): Promise<Result<void>> {
    this.props.index.delete(id);
    
    if (this.props.storage === 'file') {
      await this.saveToFile();
    }
    
    return Result.success(undefined);
  }
  
  async find(keyword: string): Promise<IndexRecord[]> {
    const results: IndexRecord[] = [];
    
    for (const [id, record] of this.props.index) {
      for (const field of this.props.indexFields) {
        const value = this.getNestedValue(record.metadata, field);
        if (value && String(value).includes(keyword)) {
          results.push(record);
          break;
        }
      }
    }
    
    return results;
  }
  
  async query(conditions: Record<string, unknown>): Promise<IndexRecord[]> {
    const results: IndexRecord[] = [];
    
    for (const [id, record] of this.props.index) {
      if (this.matchesConditions(record.metadata, conditions)) {
        results.push(record);
      }
    }
    
    return results;
  }
  
  async rebuild(records: IndexRecord[]): Promise<Result<void>> {
    // Clear existing index
    this.props.index.clear();
    
    // Add all records
    for (const record of records) {
      this.props.index.set(record.id, record);
    }
    
    // Save to file if needed
    if (this.props.storage === 'file') {
      await this.saveToFile();
    }
    
    return Result.success(undefined);
  }
  
  async exists(): Promise<boolean> {
    if (this.props.storage === 'memory') {
      return this.props.index.size > 0;
    }
    
    const indexPath = this.getIndexFilePath();
    return this.can('fs.exists') ? await this.execute('fs.exists', indexPath) : false;
  }
  
  // File operations
  private async loadIndex(): Promise<void> {
    if (this.props.storage === 'file') {
      const indexPath = this.getIndexFilePath();
      
      if (this.can('fs.exists') && await this.execute('fs.exists', indexPath)) {
        const content = await this.execute('fs.readFile', indexPath);
        const indexData = JSON.parse(content as string);
        
        for (const record of indexData) {
          this.props.index.set(record.id, record);
        }
      }
    }
  }
  
  private async saveToFile(): Promise<void> {
    if (this.props.storage === 'file') {
      const indexPath = this.getIndexFilePath();
      const indexData = Array.from(this.props.index.values());
      
      await this.execute('fs.writeFile', indexPath, JSON.stringify(indexData, null, 2));
    }
  }
  
  private getIndexFilePath(): string {
    return `${this.props.indexPath}/.index.json`;
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
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
        'indexer.add': ((...args: unknown[]) => this.add(args[0] as IndexRecord)) as (...args: unknown[]) => unknown,
        'indexer.remove': ((...args: unknown[]) => this.remove(args[0] as string)) as (...args: unknown[]) => unknown,
        'indexer.find': ((...args: unknown[]) => this.find(args[0] as string)) as (...args: unknown[]) => unknown,
        'indexer.query': ((...args: unknown[]) => this.query(args[0] as Record<string, unknown>)) as (...args: unknown[]) => unknown,
        'indexer.rebuild': ((...args: unknown[]) => this.rebuild(args[0] as IndexRecord[])) as (...args: unknown[]) => unknown,
        'indexer.exists': ((...args: unknown[]) => this.exists()) as (...args: unknown[]) => unknown
      }
    };
  }
  
  help(): string {
    return `
[${this.dna.id}] Indexer Unit - Index Operations and Search

NATIVE CAPABILITIES:
  indexer.add(record) - Add record to index
  indexer.remove(id) - Remove record from index
  indexer.find(keyword) - Search across all index fields
  indexer.query(conditions) - Query by specific conditions
  indexer.rebuild(records) - Rebuild entire index
  indexer.exists() - Check if index exists

INDEX FIELDS: ${this.props.indexFields.join(', ')}
STORAGE: ${this.props.storage}
PATH: ${this.props.indexPath}
RECORDS: ${this.props.index.size}

STORAGE MODES:
  - memory: Fast, volatile index
  - file: Persistent index in .index.json

EXAMPLE USAGE:
  const indexer = Indexer.create({
    indexFields: ['id', 'did', 'type'],
    indexPath: './vault',
    storage: 'file'
  });
  
  await indexer.add({
    id: 'vc-123',
    metadata: { did: 'did:synet:alice', type: 'IpAsset' },
    filename: 'vc-123.vault.json'
  });
  
  const results = await indexer.find('synet');
`;
  }
}

export { Indexer, type IndexRecord, type IndexerConfig };