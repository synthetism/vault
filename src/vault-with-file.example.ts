
import { Unit, UnitSchema, createUnitSchema, type TeachingContract } from '@synet/unit';
import { Result } from '@synet/patterns';
import { File, type FileConfig } from './file';
import { Indexer, type IndexerConfig } from './indexer';
import { IFileSystem } from '@synet/fs';
// Vault's internal format - self-describing and recoverable

interface VaultData {
    vaultId?: string; // Unique vault identifier
    holder?: string; // DID of the holder
    credential?: string; // Credential information
    [x: string]: unknown;
}

interface VaultRecord<VaultData> extends FileConfig<VaultData> {
  id: string;                           // User-provided ID
  metadata: Record<string, unknown>;    // User-provided metadata
  data?: VaultData;                     // Encrypted/encoded payload
  codec: 'json' | 'base64' | 'msgpack'; // Encoding format
  collection: string;                   // Collection name
  index: string[];                      // Dynamic index fields
  created: Date;                        // Timestamp
  version: string;                      // Vault format version
}

// vault.json - Vault metadata
interface VaultConfig  {
  id: string;                    // Vault identifier
  version: string;               // Vault format version
  encryption: boolean;           // Default encryption
  codec: 'json' | 'base64';     // Default codec
  created: Date;                 // Vault creation
  updated: Date;                 // Last modification
  collections: string[];        // Available collections
  dna: UnitSchema;              // Unit DNA
}

export type VaultProps<T> = {
  filesystem: IFileSystem; // Filesystem to learn
  dna: UnitSchema;
  name: string;
  path: string;
  indexFields: string[];
  index: Map<string, VaultRecord<VaultData>>;
  created: Date;
  encryption?: boolean; // Optional encryption flag
};

// Vault is composed of specialized units
export class Vault<T> extends Unit<VaultProps<T>> {
  // Direct composition - no learning needed
  private indexer: Indexer;
  private dataFile: File<VaultRecord<VaultData>>;
  private configFile: File<VaultConfig>;
  
  protected constructor(props: VaultProps<T>) {
    super(props);
    
    // Initialize composed units
    this.indexer = Indexer.create({
      indexPath: props.path,
      storage: 'file'
    });
    
    this.dataFile = File.create({
      format: 'json',
      filename: `${props.name}.vault.json`,
      encoding: 'utf8',
      compression: false,
      encryption: props.encryption
    });
    
    this.configFile = File.create<VaultConfig>({
      format: 'json',
      filename: `${props.name}.vault.json`,
      encoding: 'utf8',
      compression: false,
      encryption: false
    });
    
    // All units learn from filesystem
    const fs = this.learnFileSystem();
    this.indexer.learn([fs.teach()]);
    this.dataFile.learn([fs.teach()]);
    this.configFile.learn([fs.teach()]);
  }
  
  static create<T>(name: string, path: string, indexFields: string[]): Vault<T> {
   
    const props: VaultProps<T> = {
      dna: createUnitSchema({ id: 'vault', version: '1.0.7' }),
      created: new Date(),
      name,
      path,
      indexFields,
      encryption: false
    };
    
    return new Vault(props);
  }


  capabilities(): string[] {
   return Array.from(this._capabilities.keys());
  }
  
  // Vault operations use composed units directly
  async save(id: string, data: T, metadata: Record<string, unknown>): Promise<Result<void>> {
    const vaultRecord: VaultRecord = {
      id,
      metadata,
      data: JSON.stringify(data),
      created: new Date(),
      version: '1.0.7'
    };
    
    // Save using File unit
    const filename = `${id}.vault.json`;
    const filepath = `${this.props.path}/${filename}`;
    const saveResult = await this.dataFile.save(filepath, vaultRecord);
    
    if (!saveResult.isSuccess) {
      return saveResult;
    }
    
    // Update index using Indexer unit
    const indexRecord: IndexRecord = {
      id,
      metadata,
      filename,
      created: new Date(),
      updated: new Date()
    };
    
    await this.indexer.add(indexRecord);
    
    return Result.success(undefined);
  }
  
  async get(id: string): Promise<Result<T | null>> {
    // Query index first
    const indexResults = await this.indexer.query({ id });
    if (indexResults.length === 0) {
      return Result.success(null);
    }
    
    // Load file using File unit
    const record = indexResults[0];
    const filepath = `${this.props.path}/${record.filename}`;
    const loadResult = await this.dataFile.load(filepath);
    
    if (!loadResult.isSuccess) {
      return Result.fail(loadResult.errorMessage);
    }
    
    const vaultRecord = loadResult.value;
    const data = JSON.parse(vaultRecord.data);
    
    return Result.success(data);
  }
  
  async find(keyword: string): Promise<Result<T[]>> {
    // Use indexer for search
    const indexResults = await this.indexer.find(keyword);
    
    // Load all matching files
    const loadPromises = indexResults.map(record => {
      const filepath = `${this.props.path}/${record.filename}`;
      return this.dataFile.load(filepath);
    });
    
    const loadResults = await Promise.all(loadPromises);
    
    const data = loadResults
      .filter(result => result.isSuccess)
      .map(result => JSON.parse(result.value.data));
    
    return Result.success(data);
  }
  
  // Vault teaches vault operations, not component operations
  teach(): TeachingContract {
    return {
      unitId: this.dna.id,
      capabilities: {
        'vault.save': this.save.bind(this),
        'vault.get': this.get.bind(this),
        'vault.find': this.find.bind(this),
        'vault.list': this.list.bind(this),
        'vault.delete': this.delete.bind(this)
      }
    };
  }
  
  help(): string {
    return `
[${this.dna.id}] Vault Unit - Composed Storage System

COMPOSITION ARCHITECTURE:
  ├── Indexer Unit (${this.indexer.dna.id}) - Index operations
  ├── File Unit (${this.dataFile.dna.id}) - Data file handling
  └── File Unit (${this.configFile.dna.id}) - Config file handling

NATIVE CAPABILITIES:
  vault.save(id, data, metadata) - Save with automatic indexing
  vault.get(id) - Retrieve by ID using index
  vault.find(keyword) - Search across index fields
  vault.list(query?) - List records with filtering
  vault.delete(id) - Delete with index cleanup

VAULT CONFIGURATION:
  Collection: ${this.props.name}
  Path: ${this.props.path}
  Index Fields: ${this.props.indexFields.join(', ')}
  Encryption: ${this.props.encryption}

DEPENDENCIES:
  @synet/fs - Filesystem operations
  @synet/indexer - Index management
  @synet/file - File format handling
  @synet/unit - Architecture foundation

EXAMPLE USAGE:
  const vault = Vault.create<CredentialModel>('credentials', './vault', ['id', 'did', 'type']);
  
  await vault.save('vc-123', credentialData, { did: 'did:synet:alice', type: 'IpAsset' });
  const credential = await vault.get('vc-123');
  const synetCredentials = await vault.find('synet');
`;
  }
}
```