/**
 * Utility functions
 * 
 * Shared helper functions for file I/O, formatting, and common operations.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';

/**
 * Read and parse JSON file
 * 
 * @param {string} filePath - Path to JSON file
 * @returns {Object} Parsed JSON object
 */
export function readJson(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Write JSON file with pretty formatting
 * 
 * @param {string} filePath - Path to output file
 * @param {Object} data - Data to write
 * @param {number} indent - Indentation spaces (default: 2)
 */
export function writeJson(filePath, data, indent = 2) {
  ensureDir(dirname(filePath));
  const content = JSON.stringify(data, null, indent);
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * Read JSONL file (one JSON object per line)
 * 
 * @param {string} filePath - Path to JSONL file
 * @returns {Object[]} Array of parsed JSON objects
 */
export function readJsonl(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

/**
 * Write JSONL file (one JSON object per line)
 * 
 * @param {string} filePath - Path to output file
 * @param {Object[]} data - Array of objects to write
 */
export function writeJsonl(filePath, data) {
  ensureDir(dirname(filePath));
  const content = data.map(obj => JSON.stringify(obj)).join('\n') + '\n';
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * Ensure directory exists, creating it if necessary
 * 
 * @param {string} dirPath - Directory path
 */
export function ensureDir(dirPath) {
  if (dirPath && dirPath !== '.' && !existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Extract entity ID from Cedar entity reference
 * 
 * @param {Object} entityRef - Entity reference object like {"__entity": "Platform::Tenant", "id": "custco"}
 * @returns {string} Entity ID
 */
export function extractEntityId(entityRef) {
  if (typeof entityRef === 'string') {
    // Parse string like "Platform::Tenant::\"custco\""
    const match = entityRef.match(/::"([^"]+)"/);
    return match ? match[1] : entityRef;
  }
  if (entityRef && entityRef.id) {
    return entityRef.id;
  }
  if (entityRef && entityRef.__entity) {
    // Handle {"__entity": "Platform::Tenant", "id": "custco"}
    return entityRef.id || entityRef.__entity;
  }
  return entityRef;
}

/**
 * Format entity reference for display
 * 
 * @param {Object} entityRef - Entity reference
 * @returns {string} Formatted string
 */
export function formatEntityRef(entityRef) {
  if (typeof entityRef === 'string') {
    return entityRef;
  }
  if (entityRef && entityRef.__entity && entityRef.id) {
    return `${entityRef.__entity}::"${entityRef.id}"`;
  }
  return JSON.stringify(entityRef);
}

/**
 * Deep clone an object
 * 
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Sleep for specified milliseconds
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

