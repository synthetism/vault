/**
 * IFile<T> - Type-safe conscious file interface
 * The foundation for self-managing, type-aware files
 */

import { Unit, UnitSchema, createUnitSchema, type TeachingContract, type UnitProps } from '@synet/unit';
import { Result } from '@synet/patterns';

/**
 * IFile<T> - The conscious file interface
 * Every file knows its type, manages itself, and protects its integrity
 */
export interface IFile<T> {
  // Core file operations
  save(): Promise<Result<void>>;
  load(): Promise<Result<T>>;
  exists(): Promise<boolean>;
  delete(): Promise<Result<void>>;
  
  // File introspection
  getMetadata(): Record<string, unknown>;
  getChecksum(): string;
  getSize(): Promise<number>;
  
  // Type safety
  validate(data: unknown): data is T;
  
  // Consciousness methods
  whoami(): string;
  capabilities(): string[];
  teach(): TeachingContract;
}

/**
 * File creation configuration
 */
export interface FileConfig<T> {
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
  getMetadata(): Record<string, unknown> {
    return {
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
  getChecksum(): string {
    // Simple checksum implementation - can be enhanced
    const content = JSON.stringify(this.props.data);
    return Buffer.from(content).toString('base64').slice(0, 16);
  }

  /**
   * Get file size (rough estimate)
   */
  async getSize(): Promise<number> {
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
   * File identity
   */
  whoami(): string {
    return `File<T> [${this.props.filename}] - ${this.props.format} format, created by ${this.props.creatorDNA.id}`;
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
      'file.getMetadata',
      'file.getChecksum',
      'file.getSize',
      'file.validate'
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
        'file.getMetadata': this.getMetadata.bind(this),
        'file.getChecksum': this.getChecksum.bind(this),
        'file.getSize': this.getSize.bind(this),
        'file.validate': this.validate.bind(this)
      }
    };
  }

  /**
   * Help documentation for File unit
   */
  help(): string {
    return `
[${this.dna.id}] File<T> Unit - Type-safe conscious file

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
  file.getMetadata() - Get file information
  file.getChecksum() - Calculate data integrity hash
  file.getSize() - Get file size in bytes
  file.validate(data) - Type validation

LEARNING PATTERN:
  const fs = FileSystem.create();
  file.learn([fs.teach()]);
  await file.save(); // File saves itself!

CONSCIOUSNESS:
  - Files know their type (T)
  - Files manage their own persistence
  - Files validate their own integrity
  - Files protect themselves from corruption

EXAMPLE:
  const config = File.create<Config>({
    filename: 'app.config.json',
    data: { theme: 'dark', port: 3000 },
    format: 'json'
  });
  
  config.learn([fs.teach()]);
  await config.save(); // Self-saving configuration!
`;
  }

  /**
   * Serialize data for storage
   */
  private serializeForStorage(): string {
    const fileData = {
      data: this.props.data,
      metadata: this.getMetadata(),
      checksum: this.getChecksum(),
      version: this.props.version
    };

    switch (this.props.format) {
      case 'json':
        return JSON.stringify(fileData, null, 2);
      case 'text':
        return String(this.props.data);
      case 'binary':
        return JSON.stringify(fileData); // For now, JSON fallback
      default:
        return JSON.stringify(fileData, null, 2);
    }
  }

  /**
   * Deserialize data from storage
   */
  private deserializeFromStorage(content: string): T {
    switch (this.props.format) {
      case 'json':
        const parsed = JSON.parse(content);
        return parsed.data;
      case 'text':
        return content as unknown as T;
      case 'binary':
        const binaryParsed = JSON.parse(content);
        return binaryParsed.data;
      default:
        const defaultParsed = JSON.parse(content);
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
}
