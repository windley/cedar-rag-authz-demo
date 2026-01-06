/**
 * Cedar helper functions
 * 
 * Utilities for loading and working with Cedar schemas, policies, and entities.
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { initCedar, Schema, PolicySet, Entities, Authorizer } from '@cedar-policy/cedar-wasm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');

let cedarInitialized = false;

/**
 * Initialize Cedar WASM (idempotent)
 */
export async function initializeCedar() {
  if (!cedarInitialized) {
    await initCedar();
    cedarInitialized = true;
  }
}

/**
 * Load Cedar schema from file
 * 
 * @param {string} schemaPath - Path to schema file
 * @returns {Schema} Cedar schema object
 */
export function loadSchema(schemaPath = resolve(PROJECT_ROOT, 'cedar/schema.cedarschema')) {
  const schemaText = readFileSync(schemaPath, 'utf-8');
  return Schema.fromString(schemaText);
}

/**
 * Load all Cedar policies from a directory
 * 
 * @param {string} policiesDir - Directory containing .cedar policy files
 * @returns {string[]} Array of policy text strings
 */
export function loadPolicies(policiesDir = resolve(PROJECT_ROOT, 'cedar/policies')) {
  const policies = [];
  const files = readdirSync(policiesDir);
  
  for (const file of files) {
    if (file.endsWith('.cedar')) {
      const policyText = readFileSync(resolve(policiesDir, file), 'utf-8');
      policies.push(policyText);
    }
  }
  
  return policies;
}

/**
 * Load Cedar policy set from directory
 * 
 * @param {string} policiesDir - Directory containing .cedar policy files
 * @returns {PolicySet} Cedar policy set
 */
export function loadPolicySet(policiesDir = resolve(PROJECT_ROOT, 'cedar/policies')) {
  const policyTexts = loadPolicies(policiesDir);
  return PolicySet.fromPolicies(policyTexts);
}

/**
 * Load Cedar entities from JSON file
 * 
 * @param {string} entitiesPath - Path to entities JSON file
 * @param {Schema} schema - Cedar schema
 * @returns {Entities} Cedar entities object
 */
export function loadEntities(
  entitiesPath = resolve(PROJECT_ROOT, 'cedar/entities.json'),
  schema = null
) {
  if (!schema) {
    schema = loadSchema();
  }
  const entitiesJson = readFileSync(entitiesPath, 'utf-8');
  return Entities.fromJson(entitiesJson, schema);
}

/**
 * Create a Cedar authorizer with schema, policies, and entities
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.schemaPath - Path to schema file
 * @param {string} options.policiesDir - Directory containing policies
 * @param {string} options.entitiesPath - Path to entities file
 * @returns {Authorizer} Cedar authorizer
 */
export async function createAuthorizer(options = {}) {
  await initializeCedar();
  
  const schema = loadSchema(options.schemaPath);
  const policySet = loadPolicySet(options.policiesDir);
  const entities = loadEntities(options.entitiesPath, schema);
  
  return new Authorizer(schema, policySet, entities);
}

/**
 * Parse Cedar entity reference string to extract type and ID
 * 
 * @param {string} entityRef - Entity reference like "Platform::Customer::\"kate\""
 * @returns {{namespace: string, type: string, id: string}} Parsed entity parts
 */
export function parseEntityRef(entityRef) {
  // Remove quotes and parse namespace::type::"id"
  const match = entityRef.match(/^([^:]+)::([^:]+)::"([^"]+)"$/);
  if (!match) {
    throw new Error(`Invalid entity reference format: ${entityRef}`);
  }
  
  return {
    namespace: match[1],
    type: match[2],
    id: match[3],
    full: entityRef
  };
}

