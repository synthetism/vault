/**
 * File<T> - Ultra-Simple Pure File Unit
 * 
 * ARCHITECTURE PRINCIPLE: File is just a smart JSON wrapper
 * - File: Pure data storage/retrieval
 * - Vault: Handles all complexity (security, indexing, etc.)
 * 
 * ULTRA-SIMPLE: No metadata passing, no serialization complexity
 */

import { Unit, createUnitSchema, type UnitSchema, type TeachingContract, type UnitProps } from '@synet/unit';
import { Result } from '@synet/patterns';
import { createId } from './utils.js';

/**
 * IFile<T> - Ultra-simple file interface
 */
export interface IFile<T> {
  write(): Promise<Result<void>>;
  read(): Promise<Result<T>>;
  exists(): Promise<boolean>;
  unlink(): Promise<Result<void>>;
}

/**
 * File creation configuration - MINIMAL
 */
export interface FileConfig<T> {
  id?: string;
  filename: string;
  data?: T;
  metadata?: Record<string, unknown>;
}

/**
 * Internal file properties - MINIMAL
 */
export interface FileProps<T> extends UnitProps {
  dna: UnitSchema;
  id: string;
  filename: string;
  data?: T;
  metadata?: Record<string, unknown>;
  checksum?: string;
}

/**
 * File<T> - Ultra-simple conscious file unit
 * Just stores/retrieves pure JSON data
 */
export class File<T> extends Unit<FileProps<T>> implements IFile<T> {
  
  protected constructor(props: FileProps<T>) {
    super(props);
  }

  /**
   * Create a new ultra-simple file
   */
  static create<T>(config: FileConfig<T>): File<T> {
    const props: FileProps<T> = {
      dna: createUnitSchema({ id: 'file', version: '1.0.0' }),
      id: config.id || createId(),
      filename: config.filename,
      data: config.data,
      metadata: config.metadata
    };

    return new File(props);
  }

 checksum(): string {
    // Simple checksum implementation - can be enhanced
    const content = JSON.stringify(this.props.data);
    return Buffer.from(content).toString('base64').slice(0, 16);
  }

  /**
   * File saves itself as pure JSON
   */
  async write(): Promise<Result<void>> {
    try {
      if (!this.can('fs-async.writeFile')) {
        return Result.fail(`[${this.props.filename}] Missing filesystem capability. File needs to learn from an AsyncFileSystem unit.`);
      }

      // Ultra-simple: just store the data as JSON
      //const jsonContent = JSON.stringify(this.props.data, null, 2);
      
      const jsonContent = this.toJSON();

      // File saves itself!
      await this.execute('fs-async.writeFile', this.props.filename, jsonContent);
      
      return Result.success(undefined);
    } catch (error) {
      return Result.fail(`[${this.props.filename}] Save failed: ${error}`);
    }
  }

  /**
   * File reads itself from pure JSON
   */
  async read(): Promise<Result<T>> {
    try {
      if (!this.can('fs-async.readFile')) {
        return Result.fail(`[${this.props.filename}] Missing filesystem capability. File needs to learn from an AsyncFileSystem unit.`);
      }

      // File loads itself!
      const jsonContent = await this.execute('fs-async.readFile', this.props.filename) as string;
      

      const content = this.fromJSON(jsonContent);


      
      return Result.success(content.data);
    } catch (error) {
      return Result.fail(`[${this.props.filename}] Load failed: ${error}`);
    }
  }

  /**
   * Check if file exists
   */
  async exists(): Promise<boolean> {
    if (!this.can('fs-async.exists')) {
      return false;
    }
    return await this.execute('fs-async.exists', this.props.filename) as boolean;
  }

  /**
   * File deletes itself
   */
  async unlink(): Promise<Result<void>> {
    try {
      if (!this.can('fs-async.deleteFile')) {
        return Result.fail(`[${this.props.filename}] Missing filesystem capability for deletion.`);
      }

      await this.execute('fs-async.deleteFile', this.props.filename);
      return Result.success(undefined);
    } catch (error) {
      return Result.fail(`[${this.props.filename}] Delete failed: ${error}`);
    }
  }

  // ==========================================
  // UNIT ARCHITECTURE METHODS
  // ==========================================

  whoami(): string {
    return `[📄] File<T> Unit - ${this.props.filename} (${this.props.id})`;
  }

  capabilities(): string[] {
    const native = ['write', 'read', 'exists', 'unlink'];
    const learned = Array.from(this._capabilities.keys());
    return [...native, ...learned];
  }

  teach(): TeachingContract {
    return {
      unitId: this.props.dna.id,
      capabilities: {
        write: (...args: unknown[]) => this.write(),
        read: (...args: unknown[]) => this.read(),
        exists: (...args: unknown[]) => this.exists(),
        unlink: (...args: unknown[]) => this.unlink()
      }
    };
  }

  help(): void {
    console.log(`
[📄] File<T> Unit v2.0.0 - Ultra-Simple File

ID: ${this.props.id}
FILENAME: ${this.props.filename}

ARCHITECTURE PRINCIPLE:
  • File stores/retrieves PURE JSON data
  • Vault handles ALL complexity (security, indexing, metadata)
  • Ultra-simple: No encoding, no encryption, no format confusion

NATIVE CAPABILITIES:
  • write() - Save data as pure JSON
  • read() - Load data from JSON
  • exists() - Check if file exists
  • unlink() - Remove file

CONSCIOUSNESS:
  • Files know their identity (${this.props.id})
  • Files know their type (T)
  • Files delegate complexity to Vault

LEARNING PATTERN:
  const fs = AsyncFileSystem.create();
  file.learn([fs.teach()]);
  await file.write(); // Pure JSON output!

VAULT INTEGRATION:
  // Vault creates file
  const file = File.create<VaultRecord<T>>({
    id: vaultRecord.id,
    filename: vaultRecord.filename,
    data: vaultRecord.data
  });
  
  // File writes pure JSON
  await file.write();
  
  // File reads pure JSON
  const result = await file.read();
  const vaultRecord = result.value; // Ready to use!
    `);
  }

  // ==========================================
  // GETTERS FOR EASY ACCESS
  // ==========================================

  get id(): string {
    return this.props.id;
  }

  get filename(): string {
    return this.props.filename;
  }

  get data(): T | undefined {
    return this.props.data;
  }

  metadata(): Record<string, unknown> {
    return this.props.metadata || {};
  }

   fromJSON(jsonContent: string): { id: string; data: T; metadata: Record<string, unknown>; checksum: string; version?: string } {
     const parsed = JSON.parse(jsonContent);
     return {
       id: parsed.id,
       data: parsed.data,
       metadata: parsed.metadata || {},
       checksum: parsed.checksum,
       version: parsed.version
     };
   }
    /**
   * Serialize file structure for storage
   * File is SMART about structure (id, metadata, wrapper) but SIMPLE about data contents
   */
  toJSON(): string {
    const fileStructure = {
      id: this.props.id,           // Always accessible for indexing
      data: this.props.data,       // The actual content (can be encrypted by Vault)
      metadata: this.props.metadata || {},
      checksum: this.checksum(),
      version: '1.0.0'
    };

    return JSON.stringify(fileStructure, null, 2);
  }

}
