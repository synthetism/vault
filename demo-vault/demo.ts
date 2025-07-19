/**
 * Vault Demo - Consciousness-Based Storage in Action
 * Showcasing File<T>, Indexer, and Vault with Identity & Credentials
 */

import path from 'node:path';
import os from 'node:os';
import { Vault } from '../src/vault-old.js';
import { FileSystem } from '@synet/fs';

// Demo types for Identity and Credentials
interface IdentityData {
  did: string;
  holder: string;
  publicKey: string;
  metadata: {
    created: string;
    type: 'identity';
    method: 'synet';
  };
}

interface CredentialData {
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: Record<string, unknown>;
  proof: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    jws: string;
  };
}

interface VerifiablePresentationData {
  id: string;
  type: string[];
  holder: string;
  verifiableCredential: string[];
  proof: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    challenge: string;
    domain: string;
    jws: string;
  };
}

/**
 * Demo data generators
 */
function createSampleIdentity(name: string): IdentityData {
  const did = `did:synet:${name.toLowerCase()}`;
  
  return {
    did,
    holder: did,
    publicKey: `ed25519:${Buffer.from(`${name}-public-key-data`).toString('base64url')}`,
    metadata: {
      created: new Date().toISOString(),
      type: 'identity',
      method: 'synet'
    }
  };
}

function createSampleCredential(holder: string, issuer: string, credentialType: string): CredentialData {
  const id = `urn:uuid:credential-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  return {
    id,
    type: ['VerifiableCredential', credentialType],
    issuer,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: holder,
      name: holder.split(':').pop(),
      skillLevel: credentialType === 'DeveloperCredential' ? 'Expert' : 'Advanced',
      specialization: credentialType === 'DeveloperCredential' ? 'Unit Architecture' : 'Identity Management',
      experience: Math.floor(Math.random() * 10) + 5
    },
    proof: {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      verificationMethod: `${issuer}#key-1`,
      proofPurpose: 'assertionMethod',
      jws: `eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.${Buffer.from(JSON.stringify({ vc: id })).toString('base64url')}.${Buffer.from('mock-signature').toString('base64url')}`
    }
  };
}

function createSamplePresentation(holder: string, credentials: string[]): VerifiablePresentationData {
  const id = `urn:uuid:presentation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  return {
    id,
    type: ['VerifiablePresentation'],
    holder,
    verifiableCredential: credentials,
    proof: {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      verificationMethod: `${holder}#key-1`,
      proofPurpose: 'authentication',
      challenge: `challenge-${Math.random().toString(36).slice(2, 8)}`,
      domain: 'synet.dev',
      jws: `eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.${Buffer.from(JSON.stringify({ vp: id })).toString('base64url')}.${Buffer.from('mock-vp-signature').toString('base64url')}`
    }
  };
}

/**
 * Main Demo Function
 */
async function runVaultDemo() {
  console.log('🚀 VAULT DEMO - Consciousness-Based Storage');
  console.log('=' .repeat(50));
  
  try {
    // Setup vault path in demo-vault for instant feedback
    const vaultPath = path.join(__dirname, 'storage');
    console.log(`📁 Vault Path: ${vaultPath}`);
    
    // Create filesystem and vault
    const fs = FileSystem.create({ type: 'node' });
    
    // Create teaching contract wrapper for filesystem capabilities
    const fsTeaching = {
      unitId: 'filesystem',
      capabilities: fs.teach()
    } as any; // Type assertion for now - filesystem capabilities work but typing differs
    
    const vault = Vault.create<any>({
      name: 'identity-vault',
      path: vaultPath,
      encryption: false
    }, fsTeaching);
    
    console.log(`\n✨ ${vault.whoami()}`);
    console.log(`📋 Capabilities: ${vault.capabilities().join(', ')}`);
    
    // Create sample identities
    console.log('\n🆔 Creating Sample Identities...');
    const alice = createSampleIdentity('Alice');
    const bob = createSampleIdentity('Bob');
    const charlie = createSampleIdentity('Charlie');
    
    // Save identities to vault
    console.log('\n💾 Saving Identities to Vault...');
    
    await vault.save(
      alice.did,
      alice,
      { type: 'identity', method: 'synet', holder: alice.holder },
      'identities'
    );
    console.log(`  ✅ Saved: ${alice.did}`);
    
    await vault.save(
      bob.did,
      bob,
      { type: 'identity', method: 'synet', holder: bob.holder },
      'identities'
    );
    console.log(`  ✅ Saved: ${bob.did}`);
    
    await vault.save(
      charlie.did,
      charlie,
      { type: 'identity', method: 'synet', holder: charlie.holder },
      'identities'
    );
    console.log(`  ✅ Saved: ${charlie.did}`);
    
    // Create and save credentials
    console.log('\n🏆 Creating and Saving Credentials...');
    
    const aliceDevCred = createSampleCredential(alice.did, bob.did, 'DeveloperCredential');
    const bobSecCred = createSampleCredential(bob.did, charlie.did, 'SecurityCredential');
    const charlieArchCred = createSampleCredential(charlie.did, alice.did, 'ArchitectCredential');
    
    await vault.save(
      aliceDevCred.id,
      aliceDevCred,
      { 
        type: 'VerifiableCredential',
        credentialType: 'DeveloperCredential',
        holder: alice.did,
        issuer: bob.did
      },
      'credentials'
    );
    console.log(`  ✅ Saved: ${aliceDevCred.id}`);
    
    await vault.save(
      bobSecCred.id,
      bobSecCred,
      { 
        type: 'VerifiableCredential',
        credentialType: 'SecurityCredential', 
        holder: bob.did,
        issuer: charlie.did
      },
      'credentials'
    );
    console.log(`  ✅ Saved: ${bobSecCred.id}`);
    
    await vault.save(
      charlieArchCred.id,
      charlieArchCred,
      { 
        type: 'VerifiableCredential',
        credentialType: 'ArchitectCredential',
        holder: charlie.did,
        issuer: alice.did
      },
      'credentials'
    );
    console.log(`  ✅ Saved: ${charlieArchCred.id}`);
    
    // Create and save presentations
    console.log('\n📜 Creating and Saving Presentations...');
    
    const alicePresentation = createSamplePresentation(alice.did, [aliceDevCred.id]);
    const bobPresentation = createSamplePresentation(bob.did, [bobSecCred.id]);
    
    await vault.save(
      alicePresentation.id,
      alicePresentation,
      {
        type: 'VerifiablePresentation',
        holder: alice.did,
        credentialCount: 1
      },
      'presentations'
    );
    console.log(`  ✅ Saved: ${alicePresentation.id}`);
    
    await vault.save(
      bobPresentation.id,
      bobPresentation,
      {
        type: 'VerifiablePresentation', 
        holder: bob.did,
        credentialCount: 1
      },
      'presentations'
    );
    console.log(`  ✅ Saved: ${bobPresentation.id}`);
    
    // Demonstrate search capabilities
    console.log('\n🔍 Testing Search Capabilities...');
    
    // Get by ID (using indexer)
    console.log('\n📋 Get by ID Tests:');
    const retrievedAlice = await vault.get(alice.did);
    if (retrievedAlice.isSuccess && retrievedAlice.value) {
      console.log(`  ✅ Retrieved Alice: ${retrievedAlice.value.did}`);
    }
    
    const retrievedCred = await vault.get(aliceDevCred.id);
    if (retrievedCred.isSuccess && retrievedCred.value) {
      console.log(`  ✅ Retrieved Credential: ${retrievedCred.value.type.join(', ')}`);
    }
    
    // Search by keyword
    console.log('\n🔎 Keyword Search Tests:');
    const synetResults = await vault.find('synet');
    if (synetResults.isSuccess) {
      console.log(`  ✅ Found ${synetResults.value.length} items containing 'synet'`);
    }
    
    const developerResults = await vault.find('Developer');
    if (developerResults.isSuccess) {
      console.log(`  ✅ Found ${developerResults.value.length} items containing 'Developer'`);
    }
    
    // Query by conditions
    console.log('\n📊 Structured Query Tests:');
    const identityResults = await vault.query({ type: 'identity' });
    if (identityResults.isSuccess) {
      console.log(`  ✅ Found ${identityResults.value.length} identity records`);
    }
    
    const credentialResults = await vault.query({ type: 'VerifiableCredential' });
    if (credentialResults.isSuccess) {
      console.log(`  ✅ Found ${credentialResults.value.length} credential records`);
    }
    
    const presentationResults = await vault.query({ type: 'VerifiablePresentation' });
    if (presentationResults.isSuccess) {
      console.log(`  ✅ Found ${presentationResults.value.length} presentation records`);
    }
    
    // List collections
    console.log('\n📁 Collection Listings:');
    const identitiesList = await vault.list('identities');
    if (identitiesList.isSuccess) {
      console.log(`  📝 Identities Collection: ${identitiesList.value.length} records`);
      identitiesList.value.forEach((item, i) => {
        console.log(`    ${i + 1}. ${item.id} (${item.metadata.holder})`);
      });
    }
    
    const credentialsList = await vault.list('credentials');
    if (credentialsList.isSuccess) {
      console.log(`  📝 Credentials Collection: ${credentialsList.value.length} records`);
      credentialsList.value.forEach((item, i) => {
        console.log(`    ${i + 1}. ${item.metadata.credentialType} for ${item.metadata.holder}`);
      });
    }
    
    const presentationsList = await vault.list('presentations');
    if (presentationsList.isSuccess) {
      console.log(`  📝 Presentations Collection: ${presentationsList.value.length} records`);
      presentationsList.value.forEach((item, i) => {
        console.log(`    ${i + 1}. Presentation by ${item.metadata.holder}`);
      });
    }
    
    // Vault statistics
    console.log('\n📈 Vault Statistics:');
    const stats = await vault.stats();
    if (stats.isSuccess) {
      console.log(`  📊 Total Records: ${stats.value.totalRecords}`);
      console.log(`  📁 Collections: ${stats.value.collections.join(', ')}`);
    }
    
    // Show file structure
    console.log('\n📂 Generated File Structure:');
    console.log(`${vaultPath}/`);
    console.log('├── vault.json              (vault configuration)');
    console.log('├── .index.json            (ID → filename mapping)');
    console.log('├── identities/            (identity collection)');
    console.log('│   ├── [generated-file-1].vault.json');
    console.log('│   ├── [generated-file-2].vault.json');
    console.log('│   └── [generated-file-3].vault.json');
    console.log('├── credentials/           (credentials collection)');
    console.log('│   ├── [generated-file-1].vault.json');
    console.log('│   ├── [generated-file-2].vault.json');
    console.log('│   └── [generated-file-3].vault.json');
    console.log('└── presentations/         (presentations collection)');
    console.log('    ├── [generated-file-1].vault.json');
    console.log('    └── [generated-file-2].vault.json');
    
    console.log('\n✨ Demo Complete! Check the files at:', vaultPath);
    console.log('\n🎯 Key Architectural Features Demonstrated:');
    console.log('  ✅ ID → Filename mapping (no IDs in filenames!)');
    console.log('  ✅ Type-safe File<T> as structural boundaries');
    console.log('  ✅ Vault orchestrates persistence via learned filesystem');
    console.log('  ✅ Indexer enables complex queries and searches');
    console.log('  ✅ Multiple collections with organized storage');
    console.log('  ✅ Consciousness-based unit collaboration');
    console.log('  ✅ Result pattern for robust error handling');
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
    throw error;
  }
}

/**
 * Error handling wrapper
 */
async function main() {
  try {
    await runVaultDemo();
  } catch (error) {
    console.error('Fatal error in demo:', error);
    process.exit(1);
  }
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runVaultDemo };
