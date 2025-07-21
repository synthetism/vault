/**
 * Simple Vault - Direct FileSystem composition without complex teaching/learning
 */
import { Unit, createUnitSchema, type TeachingContract, type UnitProps } from '@synet/unit';
import type { FileSystem } from '@synet/fs';

interface SimpleVaultProps extends UnitProps {
  path: string;
  fs: FileSystem; // Direct composition - much simpler!
}

interface VaultRecord {
  id: string;
  data: unknown;
  metadata: Record<string, unknown>;
  created: Date;
  updated: Date;
}

/**
 * Simple Vault Unit - Direct FileSystem composition
 * No complex teaching/learning - just direct unit composition
 */
export class SimpleVault extends Unit<SimpleVaultProps> {
  
  protected constructor(props: SimpleVaultProps) {
    super(props);
  }

  static create(path: string, fs: FileSystem): SimpleVault {
    const props: SimpleVaultProps = {
      dna: createUnitSchema({ id: 'simple-vault', version: '1.0.0' }),
      path,
      fs,
      created: new Date()
    };
    
    return new SimpleVault(props);
  }

  /**
   * Save data to vault - simple and direct
   */
  async save(id: string, data: unknown, metadata: Record<string, unknown> = {}): Promise<void> {
    const record: VaultRecord = {
      id,
      data,
      metadata,
      created: new Date(),
      updated: new Date()
    };

    const filename = `${this.props.path}/${id.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    
    // Ensure directory exists
    this.props.fs.ensureDirSync(this.props.path);
    
    // Write file directly - no complex teaching/learning
    this.props.fs.writeFileSync(filename, JSON.stringify(record, null, 2));
  }

  /**
   * Get data from vault
   */
  get(id: string): VaultRecord | null {
    try {
      const filename = `${this.props.path}/${id.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      
      if (!this.props.fs.existsSync(filename)) {
        return null;
      }
      
      const content = this.props.fs.readFileSync(filename);
      return JSON.parse(content) as VaultRecord;
    } catch (error) {
      console.error('Failed to get record:', error);
      return null;
    }
  }

  /**
   * List all records
   */
  list(): VaultRecord[] {
    try {
      if (!this.props.fs.existsSync(this.props.path)) {
        return [];
      }

      const files = this.props.fs.readDirSync(this.props.path);
      const records: VaultRecord[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = this.props.fs.readFileSync(`${this.props.path}/${file}`);
            const record = JSON.parse(content) as VaultRecord;
            records.push(record);
          } catch (error) {
            console.warn(`Failed to read file ${file}:`, error);
          }
        }
      }

      return records;
    } catch (error) {
      console.error('Failed to list records:', error);
      return [];
    }
  }

  whoami(): string {
    return `SimpleVault at ${this.props.path}`;
  }

  capabilities(): string[] {
    return ['save', 'get', 'list'];
  }

  teach(): TeachingContract {
    return {
      unitId: this.props.dna.id,
      capabilities: {
        save: (...args: unknown[]) => this.save(args[0] as string, args[1], args[2] as Record<string, unknown>),
        get: (...args: unknown[]) => this.get(args[0] as string),
        list: () => this.list()
      }
    };
  }

  help(): void {
    console.log(`
Simple Vault Unit - Direct FileSystem composition

Usage:
  const fs = FileSystem.create({ type: 'node' });
  const vault = SimpleVault.create('./my-vault', fs);
  
  await vault.save('user-123', { name: 'Alice' }, { type: 'user' });
  const user = vault.get('user-123');
  const allUsers = vault.list();

Path: ${this.props.path}
FileSystem: ${this.props.fs.whoami()}
`);
  }
}
