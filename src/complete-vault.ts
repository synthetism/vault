/**
 * Complete Vault - Simple composition + structural boundaries + indexing
 * 
 * Architecture:
 * - Direct FileSystem composition (no complex teaching/learning)
 * - File unit for data serialization (structural boundary)
 * - Per-collection indexers with ID → filename mapping
 * - Each collection has its own folder and .index.json
 */
import { Unit, createUnitSchema, type TeachingContract, type UnitProps } from '@synet/unit';
import type { FileSystem } from '@synet/fs';
import { File, type FileConfig } from './file.js';
import { Indexer, type IndexRecord } from './indexer.js';

/**
 * Vault record format - extends FileConfig for structural boundary
 */
interface VaultRecord<T = unknown> extends FileConfig<T> {
  collection: string;
  created: Date;
  updated: Date;
  version: string;
}

/**
 * Complete Vault properties
 */
interface CompleteVaultProps extends UnitProps {
  basePath: string;
  fs: FileSystem;
  indexers: Map<string, Indexer>;
}

/**
 * Complete Vault Unit - Simple composition with structural boundaries
 * 
 * Path structure:
 * basePath/
 * ├── identities/
 * │   ├── .index.json          (ID → filename mapping)
 * │   └── *.vault.json         (actual data files)
 * ├── credentials/
 * │   ├── .index.json
 * │   └── *.vault.json
 * └── presentations/
 *     ├── .index.json
 *     └── *.vault.json
 */
export class CompleteVault extends Unit<CompleteVaultProps> {
  
  protected constructor(props: CompleteVaultProps) {
    super(props);
  }

  static create(basePath: string, fs: FileSystem): CompleteVault {
    const props: CompleteVaultProps = {
      dna: createUnitSchema({ id: 'complete-vault', version: '1.0.0' }),
      basePath,
      fs,
      indexers: new Map<string, Indexer>(),
      created: new Date()
    };
    
    return new CompleteVault(props);
  }

  /**
   * Get or create indexer for a collection
   */
  private getCollectionIndexer(collection: string): Indexer {
    if (!this.props.indexers.has(collection)) {
      const collectionPath = `${this.props.basePath}/${collection}`;
      
      // Create indexer for this collection
      const indexer = Indexer.create({
        indexPath: collectionPath,
        storage: 'file'
      });
      
      // Teach filesystem capabilities to the indexer
      indexer.learn([this.props.fs.teach()]);
      
      this.props.indexers.set(collection, indexer);
    }
    
    const indexer = this.props.indexers.get(collection);
    if (!indexer) {
      throw new Error(`Failed to create indexer for collection: ${collection}`);
    }
    return indexer;
  }

  /**
   * Save data with File structural boundary and indexing
   */
  async save<T>(
    id: string, 
    data: T, 
    metadata: Record<string, unknown> = {}, 
    collection = 'default'
  ): Promise<void> {
    // Ensure collection directory exists
    const collectionPath = `${this.props.basePath}/${collection}`;
    this.props.fs.ensureDirSync(collectionPath);
    
    // Generate filesystem-safe filename (no IDs in filenames!)
    const filename = this.generateFilename(metadata);
    const filepath = `${collectionPath}/${filename}`;
    
    // Create vault record with FileConfig structure
    const vaultRecord: VaultRecord<T> = {
      id,
      filename: filepath,
      data,
      metadata,
      format: 'json',
      encoding: 'utf8',
      collection,
      created: new Date(),
      updated: new Date(),
      version: '1.0.0'
    };

    // Use File unit as structural boundary for serialization
    const file = File.create<VaultRecord<T>>({
      id: vaultRecord.id,
      filename: vaultRecord.filename,
      data: vaultRecord,
      format: 'json',
      encoding: 'utf8',
      metadata: vaultRecord.metadata
    });
    
    // Save file via direct FileSystem composition
    const serializedData = file.toJSON();
    this.props.fs.writeFileSync(filepath, serializedData);
    
    // Update collection index with ID → filename mapping
    const indexRecord: IndexRecord = {
      id,
      filename: filepath,
      metadata: {
        ...metadata,
        collection,
        created: vaultRecord.created,
        updated: vaultRecord.updated
      },
      created: vaultRecord.created,
      updated: vaultRecord.updated
    };
    
    // Add to collection indexer
    const indexer = this.getCollectionIndexer(collection);
    await indexer.add(indexRecord);
  }

  /**
   * Get data by ID using indexer mapping
   */
  async get<T>(id: string, collection = 'default'): Promise<T | null> {
    try {
      // Use collection indexer to find filename by ID
      const indexer = this.getCollectionIndexer(collection);
      const filename = await indexer.get(id);
      
      if (!filename) {
        return null;
      }
      
      // Load file via direct FileSystem
      const rawData = this.props.fs.readFileSync(filename);
      const file = File.fromJSON<VaultRecord<T>>(rawData);
      const vaultRecord = file.toDomain();
      
      return vaultRecord?.data || null;
    } catch (error) {
      console.error('Failed to get record:', error);
      return null;
    }
  }

  /**
   * Find data by keyword across collections
   */
  async find<T>(keyword: string, collection?: string): Promise<T[]> {
    try {
      const results: T[] = [];
      
      // Search specific collection or all collections
      const collectionsToSearch = collection 
        ? [collection] 
        : Array.from(this.props.indexers.keys());
      
      for (const col of collectionsToSearch) {
        const indexer = this.getCollectionIndexer(col);
        const indexResults = await indexer.find(keyword);
        
        // Load all matching files from this collection
        for (const record of indexResults) {
          try {
            const rawData = this.props.fs.readFileSync(record.filename);
            const file = File.fromJSON<VaultRecord<T>>(rawData);
            const vaultRecord = file.toDomain();
            
            if (vaultRecord?.data) {
              results.push(vaultRecord.data);
            }
          } catch (error) {
            console.warn(`Failed to load file ${record.filename}:`, error);
          }
        }
      }
      
      return results;
    } catch (error) {
      console.error('Failed to find records:', error);
      return [];
    }
  }

  /**
   * List all records in a collection with metadata
   */
  async list(collection?: string): Promise<Array<{ id: string; metadata: Record<string, unknown> }>> {
    try {
      const results: Array<{ id: string; metadata: Record<string, unknown> }> = [];
      
      // List specific collection or all collections
      const collectionsToList = collection 
        ? [collection] 
        : Array.from(this.props.indexers.keys());
      
      for (const col of collectionsToList) {
        const indexer = this.getCollectionIndexer(col);
        const indexResults = await indexer.query({});
        
        for (const record of indexResults) {
          results.push({
            id: record.id,
            metadata: record.metadata
          });
        }
      }
      
      return results;
    } catch (error) {
      console.error('Failed to list records:', error);
      return [];
    }
  }

  /**
   * Delete record by ID
   */
  async delete(id: string, collection = 'default'): Promise<boolean> {
    try {
      // Get filename from collection indexer
      const indexer = this.getCollectionIndexer(collection);
      const filename = await indexer.get(id);
      
      if (!filename) {
        return false;
      }

      // Delete file via direct FileSystem
      this.props.fs.deleteFileSync(filename);
      
      // Remove from index
      await indexer.remove(id);
      
      return true;
    } catch (error) {
      console.error('Failed to delete record:', error);
      return false;
    }
  }

  /**
   * Get collections and statistics
   */
  async stats(): Promise<{ collections: string[]; totalRecords: number }> {
    try {
      const collections: string[] = [];
      let totalRecords = 0;
      
      for (const [collectionName, indexer] of this.props.indexers) {
        collections.push(collectionName);
        const records = await indexer.query({});
        totalRecords += records.length;
      }
      
      return { collections, totalRecords };
    } catch (error) {
      console.error('Failed to get stats:', error);
      return { collections: [], totalRecords: 0 };
    }
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  /**
   * Generate filesystem-safe filename from metadata
   */
  private generateFilename(metadata: Record<string, unknown>): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const suffix = metadata.type ? `-${metadata.type}` : '';
    return `${timestamp}-${random}${suffix}.vault.json`;
  }

  // ==========================================
  // UNIT ARCHITECTURE METHODS
  // ==========================================

  whoami(): string {
    return `CompleteVault at ${this.props.basePath}`;
  }

  capabilities(): string[] {
    return ['save', 'get', 'find', 'list', 'delete', 'stats'];
  }

  teach(): TeachingContract {
    return {
      unitId: this.props.dna.id,
      capabilities: {
        save: (...args: unknown[]) => this.save(
          args[0] as string, 
          args[1], 
          args[2] as Record<string, unknown>, 
          args[3] as string
        ),
        get: (...args: unknown[]) => this.get(args[0] as string, args[1] as string),
        find: (...args: unknown[]) => this.find(args[0] as string, args[1] as string),
        list: (...args: unknown[]) => this.list(args[0] as string),
        delete: (...args: unknown[]) => this.delete(args[0] as string, args[1] as string),
        stats: () => this.stats()
      }
    };
  }

  help(): void {
    console.log(`
Complete Vault Unit - Simple composition + structural boundaries + indexing

ARCHITECTURE:
  🏗️  Direct FileSystem composition (no complex teaching/learning overhead)
  📁  File unit for data serialization (structural boundary)  
  🗂️  Per-collection indexers with ID → filename mapping
  📂  Each collection has its own folder and .index.json

STRUCTURE:
  ${this.props.basePath}/
  ├── identities/
  │   ├── .index.json          (ID → filename mapping)
  │   └── *.vault.json         (actual data files)
  ├── credentials/
  │   ├── .index.json
  │   └── *.vault.json
  └── presentations/
      ├── .index.json
      └── *.vault.json

USAGE:
  const fs = FileSystem.create({ type: 'node' });
  const vault = CompleteVault.create('./storage', fs);
  
  // Save to collection
  await vault.save('did:synet:alice', aliceData, { type: 'identity' }, 'identities');
  await vault.save('cred-123', credData, { type: 'credential' }, 'credentials');
  
  // Retrieve from collection  
  const alice = await vault.get('did:synet:alice', 'identities');
  const cred = await vault.get('cred-123', 'credentials');
  
  // Search and list
  const identities = await vault.find('synet', 'identities');
  const allRecords = await vault.list();
  const stats = await vault.stats();

FileSystem: ${this.props.fs.whoami()}
Collections: ${Array.from(this.props.indexers.keys()).join(', ') || 'none yet'}
`);
  }
}
