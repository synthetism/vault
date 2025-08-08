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
import type { AsyncFileSystem } from '@synet/fs';
import { File, type FileConfig } from './file.js';
import { Indexer, type IndexRecord } from './indexer.js';

const VERSION = '1.0.0';
/**
 * Vault configuration - storage-agnostic paths
 */
export interface VaultConfig {

  path: string;                              // Storage path (file: './identities', s3: 'bucket/folder/identities')
  fs: AsyncFileSystem;                       // Async filesystem implementation
  encryption?: boolean;                      // Encrypt stored data
  compression?: boolean;                     // Compress stored data  
  encoding?: 'utf8' | 'base64' | 'hex';      // Data encoding format
  format?: 'json' | 'binary' | 'text';       // File format
  metadata?: Record<string, unknown>;        // Additional metadata for runtime state
  name?: string;   
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
  name: string; // Vault name
  path: string;
  fs: AsyncFileSystem;
  indexer: Indexer;
  config: {
    encryption: boolean;
    compression: boolean;
    encoding: string;
    format: string;
  };
  metadata?: Record<string, unknown>; // Additional metadata for runtime state
}

/**
 * Vault metadata - represents vault state
 */
interface VaultMetadata {
  name: string;
  version: string;
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
export class Vault<T = unknown> extends Unit<OneVaultProps<T>> {
  
  private _initialized = false;

  protected constructor(props: OneVaultProps<T>) {
    super(props); 
  }

  /**
   * Pure creation - sync configuration only
   */
  static create<T>(config: VaultConfig): Vault<T> {
    // Create indexer (sync)
    const indexer = Indexer.create({
      indexPath: config.path,
      storage: 'file'
    });
    
    // Create default metadata (uninitialized state)
  
    const props: OneVaultProps<T> = {      
      name: config.name || `vault@${VERSION}`,
      dna: createUnitSchema({ id: 'vault', version: VERSION }),
      path: config.path,
      fs: config.fs,
      indexer,
      metadata: config?.metadata,
      created: new Date(),
      config: {
        encryption: config.encryption || false,
        compression: config.compression || false,
        encoding: config.encoding || 'utf8',
        format: config.format || 'json'
      }
    };
    
    return new Vault<T>(props);
  }

  /**
   * ✅ Async awakening - load existing or initialize new
   */
  async init(): Promise<void> {

    if (this._initialized) {
      return; // Already awakened
    }

    // Try to load existing vault metadata
    const existingMetadata = await this.load();
    if (existingMetadata) {
      this._initialized = true;  
    } else {
      await this.props.fs.ensureDir(this.props.path);
      this._initialized = true;
    }

    // Initialize child units
    this.props.indexer.learn([this.props.fs.teach()]);
    await this.props.indexer.initialize();

    // Persist current state
    await this.persist();
  }

  /**
   * Load existing metadata if it exists
   */
  private async load(): Promise<VaultMetadata | null> {
    try {
      const metadataPath = `${this.props.path}/.vault.json`;
      
      if (!await this.props.fs.exists(metadataPath)) {
        return null; // No existing vault
      }
      
      const metadataContent = await this.props.fs.readFile(metadataPath);
      const persistedState = JSON.parse(metadataContent);
      
      // Reconstruct full metadata with runtime state
      return {
        name: persistedState.name,
        version: persistedState.version,
        created: new Date(persistedState.created),
        lastAccessed: new Date(persistedState.lastAccessed),
        encryption: persistedState.encryption,
        compression: persistedState.compression,
        encoding: persistedState.encoding,
        format: persistedState.format
      };
    } catch (error) {
      console.warn(`Failed to load existing vault metadata: ${error}`);
      return null; // Treat as new vault
    }
  }

  /**
   * Load existing vault from path with full validation
   */
  /* static async load<T>(path: string, fs: AsyncFileSystem): Promise<Result<Vault<T>>> {
    try {
      const metadataPath = `${path}/.vault.json`;
      
      // Check if vault exists
      if (!await fs.exists(metadataPath)) {
        return Result.fail(`Vault not found at ${path} - missing .vault.json`);
      }
      
      // Try to load and parse metadata
      const metadataContent = await fs.readFile(metadataPath);
      const vaultMetadata = JSON.parse(metadataContent) as VaultMetadata;
      
      // Validate required fields
      if (!vaultMetadata.name || !vaultMetadata.version || !vaultMetadata.created) {
        return Result.fail(`Invalid vault metadata structure in ${metadataPath}`);
      }
      
      // Reconstruct config from metadata
      const config: VaultConfig = {
        path,
        fs,
        encryption: vaultMetadata.encryption,
        compression: vaultMetadata.compression,
        encoding: vaultMetadata.encoding as 'utf8' | 'base64' | 'hex',
        format: vaultMetadata.format as 'json' | 'binary' | 'text',
        name: vaultMetadata.name,
      };
      
      // Create indexer
      const indexer = Indexer.create({
        indexPath: path,
        storage: 'file'
      });
      indexer.learn([fs.teach()]);
      
      // Initialize indexer (load existing index file)
      await indexer.initialize();
      
      const props: OneVaultProps<T> = {
        dna: createUnitSchema({ id: 'vault', version: VERSION }),
        path,
        fs,
        indexer,
        config,
        vaultMetadata,
        created: new Date()
      };
      
      const vault = new Vault<T>(props);
      
      return Result.success(vault);
    } catch (error) {
      return Result.fail(`Failed to load vault from ${path}: ${error}`);
    }
  } */

  /**
   * Check if a vault exists at the given path
   */
  async exists(path: string): Promise<boolean> {
    const metadataPath = `${path}/.vault.json`;
    return await this.props.fs.exists(metadataPath);
  }
  
  /**
   * ✅ Ensure vault is awakened before operations
   */
  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error(`
[${this.dna.id}] Vault not initialized

Resolution:
  await vault.init();  // Awaken the vault first
  await vault.save(id, data); // Then use operations

Current state: ${this._initialized ? 'awakened' : 'dormant'}
`);
    }
  }

  /**
   * ✅ State query methods
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Save typed data to vault
   */
  async save(id: string, data: T, metadata: Record<string, unknown> = {}): Promise<void> {
    this.ensureInitialized();
    
    // Generate storage-safe filename
    const filename = this.generateFilename(metadata);
    const filepath = `${this.props.path}/${filename}`;
    
    // Create vault record
    const vaultRecord: VaultRecord<T> = {
      id,
      filename: filepath,
      data,
      metadata,
      created: new Date(),
      updated: new Date(),
      version: '1.0.0'
    };

    // Use File unit as structural boundary
    const file = File.create<T>({
      id: vaultRecord.id,
      filename: filepath,
      data: vaultRecord.data,
      metadata: vaultRecord.metadata
    });
    
    // Teach filesystem capabilities to file
    file.learn([this.props.fs.teach()]);
    
    // File saves itself with proper structure
    const result = await file.write();
    if (!result.isSuccess) {
      throw new Error(`Failed to save file: ${result.error}`);
    }
    
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
    
    // Update state and persist

    await this.persist();
  }

  /**
   * Get typed data by ID
   */
  async get(id: string): Promise<T | null> {
    this.ensureInitialized();
    
    try {
      // Use indexer to find filename by ID
      const filename = await this.props.indexer.get(id);
      
      if (!filename) {
        return null;
      }
      
      // Create file with the known filename and learn filesystem capabilities
      const file = File.create<T>({
        id,
        filename
      });
      file.learn([this.props.fs.teach()]);
      
      // Read the file - gets the data T directly
      const result = await file.read();
      if (!result.isSuccess) {
        console.error(`Failed to read file ${filename}:`, result.error);
        return null;
      }
      
      // File returns the domain data directly
      return result.value || null;
    } catch (error) {
      console.error('Failed to get record:', error);
      return null;
    }
  }

  /**
   * Find data by keyword
   */
  async find(keyword: string): Promise<T[]> {
    this.ensureInitialized();
    
    try {
      const results: T[] = [];
      const indexResults = await this.props.indexer.find(keyword);
      
      // Load all matching files
      for (const record of indexResults) {
        try {
          const file = File.create<T>({
            id: record.id,
            filename: record.filename
          });
          file.learn([this.props.fs.teach()]);
          
          const result = await file.read();
          if (result.isSuccess && result.value) {
            results.push(result.value);
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
    this.ensureInitialized();
    
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
    this.ensureInitialized();
    
    try {
      // Get filename from indexer
      const filename = await this.props.indexer.get(id);
      
      if (!filename) {
        return false;
      }

      // Delete file via async FileSystem
      await this.props.fs.deleteFile(filename);
      
      // Remove from index
      await this.props.indexer.remove(id);
      
         
      return true;
    } catch (error) {
      console.error('Failed to delete record:', error);
      return false;
    }
  }

  /**
   * Get vault statistics (calculated dynamically)
   */
  async stats(): Promise<{ 
    name: string; 
    totalRecords: number; 
    metadata?: Record<string, unknown>;
    created: Date;
    }> { 
    this.ensureInitialized();
    
    const records = await this.props.indexer.query({});
    
    return {
      name: this.props.name,
      totalRecords: records.length, // Calculated on demand
      metadata: this.props?.metadata || {},
      created: this.props.created || new Date(),
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
   * ✅ Clean state persistence - only persist what we need
   */
  private async persist(): Promise<void> {
    const metadataPath = `${this.props.path}/.vault.json`;
    
    // Only persist configuration, not runtime state
    const persistedState: VaultMetadata = {
      name: this.props.name,
      version: this.props.dna.version,
      created: this.props.created || new Date(),
      lastAccessed: new Date(),
      encryption: this.props.config.encryption,
      compression: this.props.config.compression,
      encoding: this.props.config.encoding,
      format: this.props.config.format
      // ✅ Don't persist: initialized (runtime state only)
    };
    
    const metadataContent = JSON.stringify(persistedState, null, 2);
    await this.props.fs.writeFile(metadataPath, metadataContent);
  }

  metadata(): Record<string, unknown> {
    return {
      ...this.props.metadata,
    };
  }


  // ==========================================
  // UNIT ARCHITECTURE METHODS
  // ==========================================

  whoami(): string {
    return `Vault [${this.props.name}] at ${this.props.path}`;
  }

  capabilities(): string[] {
    return this._getAllCapabilities();
  }

  teach(): TeachingContract {
    return {
      unitId: this.props.dna.id,
      capabilities: {
        init: () => this.init(),
        isInitialized: () => this.isInitialized(),
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
Vault<T> Unit - Single-purpose, type-safe vault

NAME: ${this.props.name}
PATH: ${this.props.path}
CREATED: ${this.props.created}
LAST ACCESSED: ${this.props.lastAccessed}

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
  // ✅ Two-phase initialization (consciousness awakening)
  const vault = Vault.create<T>(config);        // Setup phase (sync)
  await vault.run();                            // Awakening phase (async)
  
  // State queries
  vault.isInitialized();                        // Check awakening state
  vault.getState();                             // Get full metadata state
  
  // Type-safe operations (requires awakening)
  await vault.save(id, typedData);              // Save T
  const data: T = await vault.get(id);          // Get T
  const results: T[] = await vault.find(keyword);
  const list = await vault.list();
  await vault.delete(id);

PARAMS:
  path: string;                          // Storage path (file: './identities', s3: 'bucket/folder/identities')
  fs: FileSystem;                        // Filesystem implementation
  encryption?: boolean;                  // Encrypt stored data
  compression?: boolean;                 // Compress stored data
  encoding?: 'utf8' | 'base64' | 'hex';  // Data encoding format
  format?: 'json' | 'binary' | 'text';   // File format
  name?: string;                         // Vault name (for metadata)
  version?: string;                      // Vault version (for metadata)

USAGE:
  // ✅ Clean separation: creation vs awakening
  const vault = Vault.create<Identity>({
    path: 'storage/identities',
    fs: FileSystem.create({ type: 'node' }),
    encryption: true,
    format: 'json'
  });
  
  // Can pass dormant vault around in DI
  const dependencies = { identityVault: vault };
  
  // Later, awaken the vault (async operations)
  await vault.run();
  
  // Now ready for operations
  await vault.save('alice', aliceIdentity);
  const alice: Identity = await vault.get('alice');

   FileSystem: ${this.props.fs.whoami()}
`);
  }

  get name(): string {
    return this.props.name;
  }

  get path(): string {
    return this.props.path;
  }

}
