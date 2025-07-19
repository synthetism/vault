import { Unit, UnitSchema, createUnitSchema, type TeachingContract } from '@synet/unit';
import { Result } from '@synet/patterns';

// Vault's internal format - self-describing and recoverable
interface VaultRecord {
  id: string;                           // User-provided ID
  metadata: Record<string, unknown>;    // User-provided metadata
  data: string;                         // Encrypted/encoded payload
  encryption: boolean;                  // Encryption flag
  codec: 'json' | 'base64' | 'msgpack'; // Encoding format
  collection: string;                   // Collection name
  index: string[];                      // Dynamic index fields
  created: Date;                        // Timestamp
  version: string;                      // Vault format version
}

// vault.json - Vault metadata
interface VaultConfig {
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
  dna: UnitSchema;
  name: string;
  path: string;
  indexFields: string[];
  index: Map<string, VaultRecord>;
  created: Date;
  encrypted?: boolean; // Optional encryption flag
};

export class Vault<T> extends Unit<VaultProps<T>> {
  protected constructor(props: VaultProps<T>) {
    super(props);
  }

  whoami(): string {
      return this.props.name;
  }


  
  static create<T>(
    name: string, 
    path: string, 
    indexFields: string[] = ['id']
  ): Vault<T> {
    const props: VaultProps<T> = {
      dna: createUnitSchema({ id: 'vault', version: '1.0.7' }),
      name,
      path,
      indexFields,
      index: new Map(),  // In-memory index: id -> VaultRecord
      created: new Date()
    };
    
    const vault = new Vault(props);
    vault.loadOrCreateVault();
    return vault;
  }
  
  // Dynamic search across index fields
  async find(keyword: string): Promise<VaultRecord[]> {
    const results: VaultRecord[] = [];
    
    for (const [id, record] of this.props.index) {
      // Search in all index fields
      for (const field of this.props.indexFields) {
        const value = this.getNestedValue(record.metadata, field);
        if (value && String(value).includes(keyword)) {
          results.push(record);
          break; // Found match, no need to check other fields
        }
      }
    }
    
    return results;
  }
  
  // Save with user-provided ID and metadata
  async save(id: string, data: T, metadata: Record<string, unknown> = {}): Promise<Result<void>> {
    const vaultRecord: VaultRecord = {
      id,
      metadata: { ...metadata, ...this.extractIndexMetadata(data) },
      data: await this.encodeData(data),
      encryption: this.props.encryption || false,
      codec: this.props.codec || 'json',
      collection: this.props.name,
      index: this.props.indexFields,
      created: new Date(),
      version: '1.0.7'
    };
    
    // Save to file
    const filename = this.generateFilename(id);
    const filepath = `${this.props.path}/${filename}`;
    
    if (!this.can('fs.writeFile')) {
      return Result.fail('Missing fs.writeFile capability');
    }
    
    await this.execute('fs.writeFile', filepath, JSON.stringify(vaultRecord));
    
    // Update in-memory index
    this.props.index.set(id, vaultRecord);
    
    // Update vault config
    await this.updateVaultConfig();
    
    return Result.success(undefined);
  }
  
  // Deterministic get by ID
  async get(id: string): Promise<Result<T | null>> {
    const record = this.props.index.get(id);
    if (!record) {
      return Result.success(null);
    }
    
    const data = await this.decodeData(record.data, record.codec);
    return Result.success(data);
  }
  
  // List with optional filtering
  async list(query?: Record<string, unknown>): Promise<Result<VaultRecord[]>> {
    const records = Array.from(this.props.index.values());
    
    if (!query) {
      return Result.success(records);
    }
    
    const filtered = records.filter(record => 
      this.matchesQuery(record.metadata, query)
    );
    
    return Result.success(filtered);
  }
  
  // Dynamic index rebuild
  async rebuild(newIndexFields?: string[]): Promise<Result<void>> {
    if (newIndexFields) {
      // Update index fields
      this.props.indexFields = newIndexFields;
    }
    
    // Scan data folder
    const files = await this.execute('fs.readdir', this.props.path);
    const vaultFiles = files.filter(f => f.endsWith('.vault.json'));
    
    // Rebuild index from files
    const newIndex = new Map<string, VaultRecord>();
    
    for (const file of vaultFiles) {
      const filepath = `${this.props.path}/${file}`;
      const content = await this.execute('fs.readFile', filepath);
      const record: VaultRecord = JSON.parse(content);
      
      // Update index fields if changed
      if (newIndexFields) {
        record.index = newIndexFields;
      }
      
      newIndex.set(record.id, record);
    }
    
    this.props.index = newIndex;
    await this.updateVaultConfig();
    
    return Result.success(undefined);
  }
  
  // Recovery from corrupted index
  async recover(): Promise<Result<VaultRecord[]>> {
    const recoveredRecords: VaultRecord[] = [];
    
    try {
      // Scan for vault files
      const files = await this.execute('fs.readdir', this.props.path);
      const vaultFiles = files.filter(f => f.endsWith('.vault.json'));
      
      for (const file of vaultFiles) {
        const filepath = `${this.props.path}/${file}`;
        const content = await this.execute('fs.readFile', filepath);
        const record: VaultRecord = JSON.parse(content);
        
        recoveredRecords.push(record);
        this.props.index.set(record.id, record);
      }
      
      await this.updateVaultConfig();
      
      return Result.success(recoveredRecords);
    } catch (error) {
      return Result.fail(`Recovery failed: ${error}`);
    }
  }
  
  // Helper methods
  private generateFilename(id: string): string {
    return `${id}.vault.json`;
  }
  
  private async loadOrCreateVault(): Promise<void> {
    const vaultConfigPath = `${this.props.path}/vault.json`;
    
    if (await this.execute('fs.exists', vaultConfigPath)) {
      await this.loadVaultConfig();
      await this.loadIndex();
    } else {
      await this.createVault();
    }
  }
  
  private async createVault(): Promise<void> {
    // Create directory
    await this.execute('fs.mkdir', this.props.path, { recursive: true });
    
    // Create vault.json
    const vaultConfig: VaultConfig = {
      id: this.props.name,
      version: '1.0.7',
      encryption: this.props.encryption || false,
      codec: this.props.codec || 'json',
      created: new Date(),
      updated: new Date(),
      collections: [this.props.name],
      dna: this.props.dna
    };
    
    await this.execute('fs.writeFile', 
      `${this.props.path}/vault.json`, 
      JSON.stringify(vaultConfig, null, 2)
    );
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  private extractIndexMetadata(data: T): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    
    for (const field of this.props.indexFields) {
      const value = this.getNestedValue(data, field);
      if (value !== undefined) {
        metadata[field] = value;
      }
    }
    
    return metadata;
  }
  
  teach(): TeachingContract {
    return {
      unitId: this.dna.id,
      capabilities: {
        'vault.save': this.save.bind(this),
        'vault.get': this.get.bind(this),
        'vault.list': this.list.bind(this),
        'vault.find': this.find.bind(this),
        'vault.rebuild': this.rebuild.bind(this),
        'vault.recover': this.recover.bind(this)
      }
    };
  }
  
  help(): string {
    return `
[${this.dna.id}] Vault Unit - Self-Describing Storage with Dynamic Indexing

NATIVE CAPABILITIES:
  vault.save(id, data, metadata?) - Save data with user-provided ID
  vault.get(id) - Retrieve data by ID (deterministic)
  vault.list(query?) - List records with optional filtering
  vault.find(keyword) - Search across all index fields
  vault.rebuild(newIndexFields?) - Rebuild index with optional field changes
  vault.recover() - Recover from corrupted index by scanning files

COLLECTION: ${this.props.name}
INDEX FIELDS: ${this.props.indexFields.join(', ')}
PATH: ${this.props.path}

VAULT FORMAT:
  - Self-describing .vault.json files
  - Automatic encryption/encoding
  - Recoverable from file system
  - Dynamic index field updates

EXAMPLE USAGE:
  const vault = Vault.create<CredentialModel>('credentials', './vault', ['id', 'did', 'type']);
  
  await vault.save('vc-123', credentialData, { did: 'did:synet:alice', type: 'IpAsset' });
  const credential = await vault.get('vc-123');
  const synetCredentials = await vault.find('synet');
  
  // Dynamic index update
  await vault.rebuild(['id', 'did', 'type', 'issuer']);
`;
  }
}