// Quick debugging script to understand File serialization
import { File } from './src/file.js';

// Simulate what vault does
const vaultRecord = {
  id: 'test-id',
  filename: 'test.json', 
  data: { title: 'SYNET Architecture', content: 'test' },
  metadata: { category: 'doc' },
  format: 'json',
  encoding: 'utf8',
  created: new Date(),
  updated: new Date(),
  version: '1.0.0'
};

console.log('=== SAVING ===');
console.log('Original vaultRecord:', vaultRecord);

// Create file like vault does
const file = File.create({
  id: vaultRecord.id,
  filename: vaultRecord.filename,
  data: vaultRecord,
  format: 'json',
  encoding: 'utf8',
  metadata: vaultRecord.metadata
});

console.log('File created, data prop:', file.toDomain());

// Serialize like vault does
const serialized = file.toJSON();
console.log('Serialized:', serialized);

console.log('\n=== LOADING ===');

// Reconstruct like vault does
const reconstructed = File.fromJSON(serialized);
console.log('Reconstructed file, data prop:', reconstructed.toDomain());

const vaultRecordReconstructed = reconstructed.toDomain();
console.log('VaultRecord reconstructed:', vaultRecordReconstructed);
console.log('Domain data:', vaultRecordReconstructed?.data);
