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
  
  // Core file operations
  write(): Promise<Result<void>>;
  read(): Promise<Result<T>>;
  exists(): Promise<boolean>;
  unlink(): Promise<Result<void>>;

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
  [x: string]: unknown
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
  async write(): Promise<Result<void>> {
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
   * File reads itself using learned filesystem capabilities
   */
  async read(): Promise<Result<T>> {
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
  async unlink(): Promise<Result<void>> {
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
   * File capabilities
   */
  capabilities(): string[] {
   return Array.from(this._capabilities.keys());
  }

  /**
   * Teach file capabilities to other units
   */
  teach(): TeachingContract {
    return {
      unitId: this.dna.id,
      capabilities: {
        'file.write': this.write.bind(this),
        'file.read': this.read.bind(this),
        'file.exists': this.exists.bind(this),
        'file.unlink': this.unlink.bind(this),
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
  file.write() - Save file using learned filesystem
  file.read() - Load file data
  file.exists() - Check if file exists
  file.unlink() - Remove file
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
   * Serialize data for storage with selective encryption
   */
  private serializeForStorage(): string {
    // Prepare data - encrypt only if encryption is enabled
    const processedData = this.props.encryption && this.props.data
      ? this.encryptData(this.props.data)
      : this.props.data;

    const fileData = {
      id: this.props.id,  // Always plaintext for indexing
      data: processedData, // Encrypted or plaintext based on settings
      metadata: {
        ...this.metadata(),
        encrypted: this.props.encryption // Track encryption status
      },
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

    // Apply encoding only for transport/storage optimization, not security
    return this.encode(content);
  }

  /**
   * Encrypt sensitive data (placeholder - implement real encryption)
   */
  private encryptData(data: T): string {
    if (!this.props.encryption) {
      return data as unknown as string;
    }
    
    // TODO: Implement real encryption (AES-256-GCM, etc.)
    // For now, just base64 encode as placeholder
    const jsonData = JSON.stringify(data);
    return `encrypted:${Buffer.from(jsonData).toString('base64')}`;
  }

  /**
   * Decrypt sensitive data (placeholder - implement real decryption)
   */
  private decryptData(encryptedData: unknown): T {
    if (!this.props.encryption || typeof encryptedData !== 'string') {
      return encryptedData as T;
    }
    
    // TODO: Implement real decryption
    // For now, just base64 decode as placeholder
    try {
      if (encryptedData.startsWith('encrypted:')) {
        const base64Data = encryptedData.substring('encrypted:'.length);
        const jsonData = Buffer.from(base64Data, 'base64').toString('utf8');
        return JSON.parse(jsonData);
      }
      return encryptedData as unknown as T;
    } catch (error) {
      console.warn('Failed to decrypt data, returning as-is:', error);
      return encryptedData as unknown as T;
    }
  }

  /**
   * Deserialize data from storage with selective decryption
   */
  private deserializeFromStorage(content: string): T {
    // Decode content first if encoded
    const decodedContent = this.decode(content);
    
    switch (this.props.format) {
      case 'json': {
        const parsed = JSON.parse(decodedContent);
        // Verify ID consistency if present in data
        if (parsed.id && parsed.id !== this.props.id) {
          console.warn(`[${this.props.id}] ID mismatch in file data: expected ${this.props.id}, found ${parsed.id}`);
        }
        
        // Decrypt data if it was encrypted
        const isEncrypted = parsed.metadata?.encrypted || this.props.encryption;
        return isEncrypted ? this.decryptData(parsed.data) : parsed.data;
      }
      case 'text':
        return decodedContent as unknown as T;
      case 'binary': {
        const binaryParsed = JSON.parse(decodedContent);
        // Verify ID consistency if present in data
        if (binaryParsed.id && binaryParsed.id !== this.props.id) {
          console.warn(`[${this.props.id}] ID mismatch in file data: expected ${this.props.id}, found ${binaryParsed.id}`);
        }
        
        // Decrypt data if it was encrypted
        const isEncrypted = binaryParsed.metadata?.encrypted || this.props.encryption;
        return isEncrypted ? this.decryptData(binaryParsed.data) : binaryParsed.data;
      }
      default: {
        const defaultParsed = JSON.parse(decodedContent);
        // Verify ID consistency if present in data
        if (defaultParsed.id && defaultParsed.id !== this.props.id) {
          console.warn(`[${this.props.id}] ID mismatch in file data: expected ${this.props.id}, found ${defaultParsed.id}`);
        }
        
        // Decrypt data if it was encrypted
        const isEncrypted = defaultParsed.metadata?.encrypted || this.props.encryption;
        return isEncrypted ? this.decryptData(defaultParsed.data) : defaultParsed.data;
      }
    }
  }

  /**
   * Export file as JSON for storage by Vault
   */
  toJSON(): string {
    return this.serializeForStorage();
  }

  /**
   * Extract typed domain data from file
   */
  toDomain(): T | undefined {
    return this.props.data;
  }

  /**
   * Create file from raw JSON data (for Vault reconstruction)
   */
  static fromJSON<T>(jsonData: string, config?: Partial<FileConfig<T>>): File<T> {
    try {
      const parsed = JSON.parse(jsonData);
      
      return File.create<T>({
        id: parsed.id,
        filename: config?.filename || 'unknown.json',
        data: parsed.data,
        metadata: parsed.metadata || {},
        format: config?.format || 'json',
        encoding: config?.encoding || 'utf8',
        compression: config?.compression || false,
        encryption: config?.encryption || false,
        ...config
      });
    } catch (error) {
      throw new Error(`Failed to create File from JSON: ${error}`);
    }
  }

  get id(): string {
    return this.props.id;
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
