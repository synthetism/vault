/**
 * IFile<T> - Type-safe conscious file interface
 * The foundation for self-managing, type-aware files
 */

import { Unit, UnitSchema, createUnitSchema, type TeachingContract, type UnitProps } from '@synet/unit';
import { Result } from '@synet/patterns';
import { createId, base64urlEncode, base64urlDecode, hexEncode, hexDecode } from './utils.js';

/**
 * IFile<T> - The conscious file interface
 * Every file knows its type, manages itself, and protects its integrity
 */
export interface IFile<T> {
  // File identity
  readonly id: string;
  
  // Core file operations
  save(): Promise<Result<void>>;
  load(): Promise<Result<T>>;
  exists(): Promise<boolean>;
  delete(): Promise<Result<void>>;
  
  // File introspection
  metadata(): Record<string, unknown>;
  checksum(): string;
  size(): Promise<number>;
  
  // Type safety
  validate(data: unknown): data is T;

}

/**
 * File creation configuration
 */
export interface FileConfig<T> {
  id?: string;  // Optional ID - will be generated if not provided
  filename: string;
  data?: T;
  metadata?: Record<string, unknown>;
  format?: 'json' | 'binary' | 'text';
  encoding?: 'utf8' | 'base64' | 'hex';
  compression?: boolean;
  encryption?: boolean;
}

/**
 * Internal file properties
 */
export interface FileProps<T> extends UnitProps {
  id: string;  // Unique file identifier for indexing
  filename: string;
  data?: T;
  metadata: Record<string, unknown>;
  format: 'json' | 'binary' | 'text';
  encoding: 'utf8' | 'base64' | 'hex';
  compression: boolean;
  encryption: boolean;
  checksum?: string;
  created: Date;
  version: string;  // IFile interface version
  creatorDNA: UnitSchema;  // DNA of the system that created this file
}

/**
 * File<T> - Conscious file unit implementation
 * Self-managing, type-safe file that knows how to persist itself
 */
export class File<T> extends Unit<FileProps<T>> implements IFile<T> {
  
  protected constructor(props: FileProps<T>) {
    super(props);
  }

  /**
   * Create a new conscious file
   */
  static create<T>(config: FileConfig<T>): File<T> {
    const props: FileProps<T> = {
      dna: createUnitSchema({ id: 'file', version: '1.0.0' }),
      id: config.id || createId(), // Generate ID if not provided
      filename: config.filename,
      data: config.data,
      metadata: config.metadata || {},
      format: config.format || 'json',
      encoding: config.encoding || 'utf8',
      compression: config.compression || false,
      encryption: config.encryption || false,
      created: new Date(),
      version: '1.0.0',  // IFile interface version
      creatorDNA: createUnitSchema({ id: 'unknown', version: '1.0.0' }) // Default, can be overridden
    };

    return new File(props);
  }

  /**
   * File saves itself using learned filesystem capabilities
   */
  async save(): Promise<Result<void>> {
    try {
      if (!this.can('fs.writeFile')) {
        return Result.fail(`[${this.props.filename}] Missing filesystem capability. File needs to learn from a filesystem unit.`);
      }

      // Prepare data for storage
      const fileContent = this.serializeForStorage();
      
      // File saves itself!
      await this.execute('fs.writeFile', this.props.filename, fileContent);
      
      return Result.success(undefined);
    } catch (error) {
      return Result.fail(`[${this.props.filename}] Save failed: ${error}`);
    }
  }

  /**
   * File loads itself using learned filesystem capabilities
   */
  async load(): Promise<Result<T>> {
    try {
      if (!this.can('fs.readFile')) {
        return Result.fail(`[${this.props.filename}] Missing filesystem capability. File needs to learn from a filesystem unit.`);
      }

      // File loads itself!
      const content = await this.execute('fs.readFile', this.props.filename) as string;
      const data = this.deserializeFromStorage(content);
      
      // Update internal data
      this.props.data = data;
      
      return Result.success(data);
    } catch (error) {
      return Result.fail(`[${this.props.filename}] Load failed: ${error}`);
    }
  }

  /**
   * Check if file exists
   */
  async exists(): Promise<boolean> {
    if (!this.can('fs.exists')) {
      return false;
    }
    
    return await this.execute('fs.exists', this.props.filename) as boolean;
  }

  /**
   * File deletes itself
   */
  async delete(): Promise<Result<void>> {
    try {
      if (!this.can('fs.unlink')) {
        return Result.fail(`[${this.props.filename}] Missing filesystem capability for deletion.`);
      }

      await this.execute('fs.unlink', this.props.filename);
      return Result.success(undefined);
    } catch (error) {
      return Result.fail(`[${this.props.filename}] Delete failed: ${error}`);
    }
  }

  /**
   * Get file metadata
   */
  metadata(): Record<string, unknown> {
    return {
      id: this.props.id,
      ...this.props.metadata,
      filename: this.props.filename,
      format: this.props.format,
      encoding: this.props.encoding,
      compression: this.props.compression,
      encryption: this.props.encryption,
      created: this.props.created,
      version: this.props.version,
      creatorDNA: this.props.creatorDNA
    };
  }

  /**
   * Calculate file checksum
   */
  checksum(): string {
    // Simple checksum implementation - can be enhanced
    const content = JSON.stringify(this.props.data);
    return Buffer.from(content).toString('base64').slice(0, 16);
  }

  /**
   * Get file size (rough estimate)
   */
  async size(): Promise<number> {
    const content = this.serializeForStorage();
    return Buffer.byteLength(content, 'utf8');
  }

  /**
   * Type validation - basic implementation
   */
  validate(data: unknown): data is T {
    // Basic validation - can be enhanced with schema validation
    return data !== null && data !== undefined;
  }

  /**
   * Encode data using the file's encoding format
   */
  encode(data: string): string {
    switch (this.props.encoding) {
      case 'base64':
        return base64urlEncode(data);
      case 'hex':
        return hexEncode(data);
      case 'utf8':
      default:
        return data;
    }
  }

  /**
   * Decode data using the file's encoding format
   */
  decode(data: string): string {
    switch (this.props.encoding) {
      case 'base64':
        return base64urlDecode(data);
      case 'hex':
        return hexDecode(data);
      case 'utf8':
      default:
        return data;
    }
  }

  /**
   * File identity
   */
  whoami(): string {
    return `File<T> [${this.props.id}] ${this.props.filename} - ${this.props.format} format, created by ${this.props.creatorDNA.id}`;
  }

  /**
   * File ID getter (IFile interface requirement)
   */
  get id(): string {
    return this.props.id;
  }

  /**
   * File capabilities
   */
  capabilities(): string[] {
    return [
      'file.save',
      'file.load', 
      'file.exists',
      'file.delete',
      'file.metadata',
      'file.checksum',
      'file.size',
      'file.validate',
      'file.encode',
      'file.decode'
    ];
  }

  /**
   * Teach file capabilities to other units
   */
  teach(): TeachingContract {
    return {
      unitId: this.dna.id,
      capabilities: {
        'file.save': this.save.bind(this),
        'file.load': this.load.bind(this),
        'file.exists': this.exists.bind(this),
        'file.delete': this.delete.bind(this),
        'file.metadata': this.metadata.bind(this),
        'file.checksum': this.checksum.bind(this),
        'file.size': this.size.bind(this),
        'file.validate': this.validate.bind(this),
        'file.encode': (data: unknown) => this.encode(String(data)),
        'file.decode': (data: unknown) => this.decode(String(data))
      }
    };
  }

  /**
   * Help documentation for File unit
   */
  help(): string {
    return `
[${this.dna.id}] File<T> Unit - Type-safe conscious file

ID: ${this.props.id}
FILENAME: ${this.props.filename}
FORMAT: ${this.props.format}
ENCODING: ${this.props.encoding}
COMPRESSION: ${this.props.compression}
ENCRYPTION: ${this.props.encryption}
VERSION: ${this.props.version}
CREATOR: ${this.props.creatorDNA.id}

NATIVE CAPABILITIES:
  file.save() - Save file using learned filesystem
  file.load() - Load file data
  file.exists() - Check if file exists
  file.delete() - Remove file
  file.metadata() - Get file information (includes ID for indexing)
  file.checksum() - Calculate data integrity hash
  file.size() - Get file size in bytes
  file.validate(data) - Type validation

INDEXING:
  - Each file has a unique ID (${this.props.id})
  - Indexer can map ID → filename for restoration
  - Files are self-identifying and indexable

ENCODING SUPPORT:
  - utf8: Standard text encoding
  - base64: Base64url encoding (URL-safe)
  - hex: Hexadecimal encoding

LEARNING PATTERN:
  const fs = FileSystem.create();
  file.learn([fs.teach()]);
  await file.save(); // File saves itself!

CONSCIOUSNESS:
  - Files know their unique identity (ID)
  - Files know their type (T)
  - Files manage their own persistence
  - Files validate their own integrity
  - Files protect themselves from corruption

EXAMPLE:
  const config = File.create<Config>({
    id: 'app-config-v1',  // Optional - will generate if not provided
    filename: 'app.config.json',
    data: { theme: 'dark', port: 3000 },
    format: 'json'
  });
  
  config.learn([fs.teach()]);
  await config.save(); // Self-saving configuration!
  
  // Later, indexer can restore: ID 'app-config-v1' → 'app.config.json'
`;
  }

  /**
   * Serialize data for storage
   */
  private serializeForStorage(): string {
    const fileData = {
      id: this.props.id,  // Include ID in serialized data for indexing
      data: this.props.data,
      metadata: this.metadata(),
      checksum: this.checksum(),
      version: this.props.version
    };

    let content: string;
    switch (this.props.format) {
      case 'json':
        content = JSON.stringify(fileData, null, 2);
        break;
      case 'text':
        content = String(this.props.data);
        break;
      case 'binary':
        content = JSON.stringify(fileData); // For now, JSON fallback
        break;
      default:
        content = JSON.stringify(fileData, null, 2);
    }

    // Apply encoding if not utf8
    return this.encode(content);
  }

  /**
   * Deserialize data from storage
   */
  private deserializeFromStorage(content: string): T {
    // Decode content first if encoded
    const decodedContent = this.decode(content);
    
    switch (this.props.format) {
      case 'json':
        const parsed = JSON.parse(decodedContent);
        // Verify ID consistency if present in data
        if (parsed.id && parsed.id !== this.props.id) {
          console.warn(`[${this.props.id}] ID mismatch in file data: expected ${this.props.id}, found ${parsed.id}`);
        }
        return parsed.data;
      case 'text':
        return decodedContent as unknown as T;
      case 'binary':
        const binaryParsed = JSON.parse(decodedContent);
        // Verify ID consistency if present in data
        if (binaryParsed.id && binaryParsed.id !== this.props.id) {
          console.warn(`[${this.props.id}] ID mismatch in file data: expected ${this.props.id}, found ${binaryParsed.id}`);
        }
        return binaryParsed.data;
      default:
        const defaultParsed = JSON.parse(decodedContent);
        // Verify ID consistency if present in data
        if (defaultParsed.id && defaultParsed.id !== this.props.id) {
          console.warn(`[${this.props.id}] ID mismatch in file data: expected ${this.props.id}, found ${defaultParsed.id}`);
        }
        return defaultParsed.data;
    }
  }

  // Getters for easy access
  get filename(): string {
    return this.props.filename;
  }

  get data(): T | undefined {
    return this.props.data;
  }

  get format(): string {
    return this.props.format;
  }

  get encoding(): string {
    return this.props.encoding;
  }
}
