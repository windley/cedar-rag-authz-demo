#!/usr/bin/env node

/**
 * OpenSearch Filter Validator
 * 
 * Validates that generated OpenSearch filters have correct syntax.
 * This script checks:
 * - JSON validity
 * - OpenSearch query structure
 * - Required fields and types
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function validateOpenSearchFilter(filterFile) {
  console.log(`Validating OpenSearch filter: ${filterFile}\n`);
  
  // Read and parse JSON
  let data;
  try {
    const content = readFileSync(filterFile, 'utf-8');
    data = JSON.parse(content);
  } catch (error) {
    console.error(`❌ Invalid JSON: ${error.message}`);
    return false;
  }
  
  // Check required fields
  if (!data.filter) {
    console.error('❌ Missing "filter" field');
    return false;
  }
  
  // Validate filter structure
  const filter = data.filter;
  if (!filter.bool) {
    console.error('❌ Filter must contain a "bool" query');
    return false;
  }
  
  const boolQuery = filter.bool;
  const errors = [];
  const warnings = [];
  
  // Validate bool query structure
  if (boolQuery.must && !Array.isArray(boolQuery.must)) {
    errors.push('"bool.must" must be an array');
  }
  
  if (boolQuery.must_not && !Array.isArray(boolQuery.must_not)) {
    errors.push('"bool.must_not" must be an array');
  }
  
  if (boolQuery.should && !Array.isArray(boolQuery.should)) {
    errors.push('"bool.should" must be an array');
  }
  
  // Validate term queries in must/must_not
  function validateTermQuery(termQuery, path) {
    if (!termQuery.term || typeof termQuery.term !== 'object') {
      errors.push(`${path}: term query must have a "term" object`);
      return;
    }
    
    const termKeys = Object.keys(termQuery.term);
    if (termKeys.length !== 1) {
      warnings.push(`${path}: term query should have exactly one field`);
    }
    
    for (const [field, value] of Object.entries(termQuery.term)) {
      if (value === null || value === undefined) {
        errors.push(`${path}: term query value for "${field}" cannot be null or undefined`);
      }
    }
  }
  
  // Validate must clauses
  if (boolQuery.must) {
    boolQuery.must.forEach((clause, i) => {
      if (clause.term) {
        validateTermQuery(clause, `bool.must[${i}]`);
      } else if (!clause.bool && !clause.match && !clause.range) {
        warnings.push(`bool.must[${i}]: unknown query type, expected term/bool/match/range`);
      }
    });
  }
  
  // Validate must_not clauses
  if (boolQuery.must_not) {
    boolQuery.must_not.forEach((clause, i) => {
      if (clause.term) {
        validateTermQuery(clause, `bool.must_not[${i}]`);
      } else if (!clause.bool && !clause.match && !clause.range) {
        warnings.push(`bool.must_not[${i}]: unknown query type, expected term/bool/match/range`);
      }
    });
  }
  
  // Validate query_example if present
  if (data.query_example) {
    const queryExample = data.query_example;
    if (queryExample.query && queryExample.query.bool) {
      if (queryExample.query.bool.filter) {
        if (!Array.isArray(queryExample.query.bool.filter)) {
          errors.push('query_example.query.bool.filter must be an array');
        } else {
          // Check that filter array contains the bool query
          const hasBoolFilter = queryExample.query.bool.filter.some(
            f => f.must || f.must_not || f.should
          );
          if (!hasBoolFilter && queryExample.query.bool.filter.length > 0) {
            warnings.push('query_example.query.bool.filter should contain bool queries');
          }
        }
      }
    }
  }
  
  // Report results
  if (errors.length > 0) {
    console.error('❌ Validation errors:');
    errors.forEach(err => console.error(`   - ${err}`));
    return false;
  }
  
  if (warnings.length > 0) {
    console.warn('⚠️  Warnings:');
    warnings.forEach(warn => console.warn(`   - ${warn}`));
  }
  
  console.log('✅ Filter structure is valid!');
  console.log(`\nFilter summary:`);
  console.log(`   - must clauses: ${boolQuery.must?.length || 0}`);
  console.log(`   - must_not clauses: ${boolQuery.must_not?.length || 0}`);
  console.log(`   - should clauses: ${boolQuery.should?.length || 0}`);
  
  return true;
}

// Main execution
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Usage: node validate-filter.js <filter-file>

Validates an OpenSearch filter JSON file for correct syntax and structure.

Example:
  node src/compile/validate-filter.js examples/queries/opensearch-filter-kate.json
`);
  process.exit(0);
}

const filterFile = args[0];
const success = validateOpenSearchFilter(filterFile);
process.exit(success ? 0 : 1);

