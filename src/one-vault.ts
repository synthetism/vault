/**
 * OneVault - Single-purpose vault with clean API
 * 
 * Architecture:
 * - One vault = One data type (type safety)
 * - Clean config with storage-agnostic paths  
 * - File unit for serialization boundaries
 * - Indexer for ID → filename mapping
 * - Metadata files: .vault.json (config), .index.json (mapping)
 */
import { Unit, createUnitSchema, type TeachingContract, type UnitProps } from '@synet/unit';
import type { FileSystem } from '@synet/fs';
import { File, type FileConfig } from './file.js';
import { Indexer, type IndexRecord } from './indexer.js';

/**
 * Vault configuration - storage-agnostic paths
 */
interface VaultConfig {
  path: string;                                    // Storage path (file: './identities', s3: 'bucket/folder/identities')
  fs: FileSystem;                                  // Filesystem implementation
  encryption?: boolean;                            // Encrypt stored data
  compression?: boolean;                           // Compress stored data  
  encoding?: 'utf8' | 'base64' | 'hex';           // Data encoding format
  format?: 'json' | 'binary' | 'text';            // File format
  name?: string;                                   // Vault name (for metadata)
  version?: string;                                // Vault version
}

/**
 * Vault record format - typed data wrapper
 */
interface VaultRecord<T = unknown> extends FileConfig<T> {
  id: string;
  data: T;
  metadata: Record<string, unknown>;
  created: Date;
  updated: Date;
  version: string;
}

/**
 * OneVault properties
 */
interface OneVaultProps<T> extends UnitProps {
  path: string;
  fs: FileSystem;
  indexer: Indexer;
  config: VaultConfig;
  vaultMetadata: VaultMetadata;
}

/**
 * Vault metadata stored in .vault.json
 */
interface VaultMetadata {
  name: string;
  version: string;
  dataType: string;
  created: Date;
  lastAccessed: Date;
  encryption: boolean;
  compression: boolean;
  encoding: string;
  format: string;
}

/**
 * OneVault<T> - Single-purpose, type-safe vault
 * 
 * File structure:
 * path/
 * ├── .vault.json          (vault metadata)
 * ├── .index.json          (ID → filename mapping)
 * └── *.vault.json         (actual data files)
 */
export class OneVault<T = unknown> extends Unit<OneVaultProps<T>> {
  
  protected constructor(props: OneVaultProps<T>) {
    super(props);
  }

  /**
   * Create a new single-purpose vault
   */
  static async create<T>(config: VaultConfig): Promise<OneVault<T>> {
    // Ensure vault directory exists
    config.fs.ensureDirSync(config.path);
    
    // Create indexer for this vault
    const indexer = Indexer.create({
      indexPath: config.path,
      storage: 'file'
    });
    
    // Teach filesystem capabilities to indexer
    indexer.learn([config.fs.teach()]);
    
    // Create vault metadata
    const vaultMetadata: VaultMetadata = {
      name: config.name || 'OneVault',
      version: config.version || '1.0.0',
      dataType: 'T', // Will be inferred from usage
      created: new Date(),
      lastAccessed: new Date(),
      encryption: config.encryption || false,
      compression: config.compression || false,
      encoding: config.encoding || 'utf8',
      format: config.format || 'json'
    };
    
    const props: OneVaultProps<T> = {
      dna: createUnitSchema({ id: 'one-vault', version: '1.0.0' }),
      path: config.path,
      fs: config.fs,
      indexer,
      config,
      vaultMetadata,
      created: new Date()
    };
    
    const vault = new OneVault<T>(props);
    
    // Initialize vault metadata file
    await vault.saveVaultMetadata();
    
    return vault;
  }

  /**
   * Load existing vault from path
   */
  static async load<T>(path: string, fs: FileSystem): Promise<OneVault<T>> {
    const metadataPath = `${path}/.vault.json`;
    
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Vault not found at ${path} - missing .vault.json`);
    }
    
    // Load vault metadata
    const metadataContent = fs.readFileSync(metadataPath);
    const vaultMetadata: VaultMetadata = JSON.parse(metadataContent);
    
    // Reconstruct config from metadata
    const config: VaultConfig = {
      path,
      fs,
      encryption: vaultMetadata.encryption,
      compression: vaultMetadata.compression,
      encoding: vaultMetadata.encoding as 'utf8' | 'base64' | 'hex',
      format: vaultMetadata.format as 'json' | 'binary' | 'text',
      name: vaultMetadata.name,
      version: vaultMetadata.version
    };
    
    // Create indexer
    const indexer = Indexer.create({
      indexPath: path,
      storage: 'file'
    });
    indexer.learn([fs.teach()]);
    
    const props: OneVaultProps<T> = {
      dna: createUnitSchema({ id: 'one-vault', version: '1.0.0' }),
      path,
      fs,
      indexer,
      config,
      vaultMetadata: {
        ...vaultMetadata,
        lastAccessed: new Date()
      },
      created: new Date()
    };
    
    const vault = new OneVault<T>(props);
    
    // Only update lastAccessed in memory (no expensive write)
    vault.props.vaultMetadata.lastAccessed = new Date();
    
    return vault;
  }

  /**
   * Save typed data to vault
   */
  async save(id: string, data: T, metadata: Record<string, unknown> = {}): Promise<void> {
    // Generate storage-safe filename
    const filename = this.generateFilename(metadata);
    const filepath = `${this.props.path}/${filename}`;
    
    // Create vault record
    const vaultRecord: VaultRecord<T> = {
      id,
      filename: filepath,
      data,
      metadata,
      format: this.props.config.format || 'json',
      encoding: this.props.config.encoding || 'utf8',
      created: new Date(),
      updated: new Date(),
      version: '1.0.0'
    };

    // Use File unit as structural boundary
    const file = File.create<VaultRecord<T>>({
      id: vaultRecord.id,
      filename: vaultRecord.filename,
      data: vaultRecord,
      format: this.props.config.format,
      encoding: this.props.config.encoding,
      compression: this.props.config.compression,
      encryption: this.props.config.encryption,
      metadata: vaultRecord.metadata
    });
    
    // Save file via direct FileSystem composition
    const serializedData = file.toJSON();
    this.props.fs.writeFileSync(filepath, serializedData);
    
    // Update index with ID → filename mapping
    const indexRecord: IndexRecord = {
      id,
      filename: filepath,
      metadata: {
        ...metadata,
        created: vaultRecord.created,
        updated: vaultRecord.updated
      },
      created: vaultRecord.created,
      updated: vaultRecord.updated
    };
    
    await this.props.indexer.add(indexRecord);
    
    // No expensive metadata updates on save operations
  }

  /**
   * Get typed data by ID
   */
  async get(id: string): Promise<T | null> {
    try {
      // Use indexer to find filename by ID
      const filename = await this.props.indexer.get(id);
      
      if (!filename) {
        return null;
      }
      
      // Load file via direct FileSystem
      const rawData = this.props.fs.readFileSync(filename);
      const file = File.fromJSON<VaultRecord<T>>(rawData);
      const vaultRecord = file.toDomain();
      
      // No expensive metadata updates on get operations
      
      return vaultRecord?.data || null;
    } catch (error) {
      console.error('Failed to get record:', error);
      return null;
    }
  }

  /**
   * Find data by keyword
   */
  async find(keyword: string): Promise<T[]> {
    try {
      const results: T[] = [];
      const indexResults = await this.props.indexer.find(keyword);
      
      // Load all matching files
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
      
      return results;
    } catch (error) {
      console.error('Failed to find records:', error);
      return [];
    }
  }

  /**
   * List all records with metadata
   */
  async list(): Promise<Array<{ id: string; metadata: Record<string, unknown> }>> {
    try {
      const indexResults = await this.props.indexer.query({});
      
      return indexResults.map(record => ({
        id: record.id,
        metadata: record.metadata
      }));
    } catch (error) {
      console.error('Failed to list records:', error);
      return [];
    }
  }

  /**
   * Delete record by ID
   */
  async delete(id: string): Promise<boolean> {
    try {
      // Get filename from indexer
      const filename = await this.props.indexer.get(id);
      
      if (!filename) {
        return false;
      }

      // Delete file via direct FileSystem
      this.props.fs.deleteFileSync(filename);
      
      // Remove from index
      await this.props.indexer.remove(id);
      
      // No expensive metadata updates on delete operations
      
      return true;
    } catch (error) {
      console.error('Failed to delete record:', error);
      return false;
    }
  }

  /**
   * Get vault statistics (calculated dynamically)
   */
  async stats(): Promise<{ name: string; totalRecords: number; metadata: VaultMetadata }> {
    const records = await this.props.indexer.query({});
    
    return {
      name: this.props.vaultMetadata.name,
      totalRecords: records.length, // Calculated on demand
      metadata: this.props.vaultMetadata
    };
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  /**
   * Generate storage-safe filename from metadata
   */
  private generateFilename(metadata: Record<string, unknown>): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const suffix = metadata.type ? `-${metadata.type}` : '';
    const extension = this.props.config.format === 'json' ? '.vault.json' : '.vault.dat';
    return `${timestamp}-${random}${suffix}${extension}`;
  }

  /**
   * Save vault metadata to .vault.json
   */
  private async saveVaultMetadata(): Promise<void> {
    const metadataPath = `${this.props.path}/.vault.json`;
    const metadataContent = JSON.stringify(this.props.vaultMetadata, null, 2);
    this.props.fs.writeFileSync(metadataPath, metadataContent);
  }

  // ==========================================
  // UNIT ARCHITECTURE METHODS
  // ==========================================

  whoami(): string {
    return `OneVault<${this.props.vaultMetadata.dataType}> [${this.props.vaultMetadata.name}] at ${this.props.path}`;
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
          args[1] as T, 
          args[2] as Record<string, unknown>
        ),
        get: (...args: unknown[]) => this.get(args[0] as string),
        find: (...args: unknown[]) => this.find(args[0] as string),
        list: () => this.list(),
        delete: (...args: unknown[]) => this.delete(args[0] as string),
        stats: () => this.stats()
      }
    };
  }

  help(): void {
    console.log(`
OneVault<T> Unit - Single-purpose, type-safe vault

NAME: ${this.props.vaultMetadata.name}
TYPE: ${this.props.vaultMetadata.dataType}
PATH: ${this.props.path}
CREATED: ${this.props.vaultMetadata.created}
LAST ACCESSED: ${this.props.vaultMetadata.lastAccessed}

CONFIGURATION:
  📁 Format: ${this.props.config.format}
  🔐 Encoding: ${this.props.config.encoding}
  🗜️ Compression: ${this.props.config.compression}
  🔒 Encryption: ${this.props.config.encryption}

STRUCTURE:
  ${this.props.path}/
  ├── .vault.json          (vault metadata)
  ├── .index.json          (ID → filename mapping)
  └── *.vault.json         (typed data files)

SIMPLE API:
  // Type-safe operations
  await vault.save(id, typedData);           // Save T
  const data: T = await vault.get(id);       // Get T
  const results: T[] = await vault.find(keyword);
  const list = await vault.list();
  await vault.delete(id);

ADVANTAGES:
  ✅ Type safety - Vault<Identity> only stores Identity
  ✅ Clean API - No collection parameter pollution
  ✅ Storage agnostic - Works with any FileSystem (local, S3, etc.)
  ✅ Self-documenting - .vault.json contains all metadata
  ✅ Secure composition - Pass individual vaults, not monolith
  ✅ Storage flexibility - Each vault can use different formats

USAGE:
  // Create specialized vaults
  const identityVault = await OneVault.create<Identity>({
    path: 'storage/identities',  // or 'bucket/app/identities' for S3
    fs: FileSystem.create({ type: 'node' }),
    encryption: true,
    format: 'json'
  });
  
  // Clean, type-safe operations
  await identityVault.save('alice', aliceIdentity);
  const alice: Identity = await identityVault.get('alice');

FileSystem: ${this.props.fs.whoami()}
`);
  }
}
