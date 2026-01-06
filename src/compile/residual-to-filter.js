#!/usr/bin/env node

/**
 * Residual to OpenSearch Filter Compiler
 * 
 * Translates Cedar residual policies into OpenSearch metadata filters.
 * This is application logic that interprets Cedar's residual conditions
 * and converts them into database query constraints.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { compileResidual } from './mapping.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');

// Parse command-line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    residual: null,
    out: null,
    mapping: resolve(__dirname, 'mapping.js')
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--residual':
      case '-r':
        options.residual = args[++i];
        break;
      case '--out':
      case '-o':
        options.out = args[++i];
        break;
      case '--mapping':
      case '-m':
        options.mapping = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  // Validate required arguments
  if (!options.residual || !options.out) {
    console.error('Error: Missing required arguments');
    printHelp();
    process.exit(1);
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: node residual-to-filter.js [options]

Required:
  --residual, -r <file>    Input residual policy JSON file
  --out, -o <file>         Output OpenSearch filter JSON file

Optional:
  --mapping, -m <file>     Custom mapping module (default: mapping.js)
  --help, -h               Show this help message

Example:
  node src/compile/residual-to-filter.js \\
    --residual out/residual-kate.json \\
    --out examples/queries/opensearch-filter-kate.json

The compiler translates Cedar residual conditions into OpenSearch bool queries
with must/must_not/should clauses based on the attribute mappings defined
in mapping.js.
`);
}

/**
 * Compile a Cedar residual policy into an OpenSearch filter
 * 
 * @param {Object} residual - The residual policy from Cedar TPE
 * @returns {Object} OpenSearch bool query filter
 */
function compileToOpenSearchFilter(residual) {
  // The residual may be in different formats depending on Cedar version
  // Common formats:
  // 1. A PolicySet with residual policies
  // 2. A JSON object with conditions
  // 3. A string representation that needs parsing

  let conditions = [];
  
  // Extract conditions from residual
  if (typeof residual === 'string') {
    // Try to parse as JSON or Cedar policy text
    try {
      residual = JSON.parse(residual);
    } catch (e) {
      // If not JSON, might be Cedar policy text - would need a parser
      console.warn('Residual is a string but not JSON. Assuming Cedar policy text.');
      // For now, we'll need to parse Cedar syntax (simplified approach)
      conditions = parseCedarResidualText(residual);
    }
  }

  if (residual && typeof residual === 'object') {
    // Handle different residual formats
    if (residual.policies) {
      // PolicySet format
      conditions = extractConditionsFromPolicySet(residual);
    } else if (residual.conditions || residual.expr) {
      // Direct conditions format
      conditions = residual.conditions || [residual.expr];
    } else if (Array.isArray(residual)) {
      conditions = residual;
    } else {
      // Try to extract from common fields
      conditions = extractConditions(residual);
    }
  }

  // Build OpenSearch bool query from conditions
  const filter = buildOpenSearchFilter(conditions);

  return filter;
}

/**
 * Extract conditions from a PolicySet-like structure
 */
function extractConditionsFromPolicySet(policySet) {
  const conditions = [];
  
  if (policySet.policies && Array.isArray(policySet.policies)) {
    for (const policy of policySet.policies) {
      if (policy.expr || policy.condition) {
        conditions.push(policy.expr || policy.condition);
      }
    }
  }
  
  return conditions;
}

/**
 * Extract conditions from a residual object
 */
function extractConditions(residual) {
  const conditions = [];
  
  // Look for common condition patterns
  const keys = Object.keys(residual);
  for (const key of keys) {
    if (key.includes('condition') || key.includes('expr') || key.includes('when')) {
      const value = residual[key];
      if (value) {
        conditions.push(value);
      }
    }
  }
  
  return conditions;
}

/**
 * Parse Cedar residual policy text (simplified)
 * This is a basic parser - a full implementation would need a proper Cedar parser
 */
function parseCedarResidualText(text) {
  // This is a placeholder - would need proper Cedar AST parsing
  // For now, return empty array and let the mapping handle it
  console.warn('Cedar text parsing not fully implemented. Using mapping-based compilation.');
  return [];
}

/**
 * Build OpenSearch bool filter from Cedar conditions
 * Uses the mapping module to translate Cedar expressions to OpenSearch queries
 */
function buildOpenSearchFilter(conditions) {
  const must = [];
  const mustNot = [];
  const should = [];

  // Use the mapping module to compile each condition
  for (const condition of conditions) {
    try {
      const compiled = compileResidual(condition);
      
      if (compiled.must) {
        must.push(...(Array.isArray(compiled.must) ? compiled.must : [compiled.must]));
      }
      if (compiled.must_not) {
        mustNot.push(...(Array.isArray(compiled.must_not) ? compiled.must_not : [compiled.must_not]));
      }
      if (compiled.should) {
        should.push(...(Array.isArray(compiled.should) ? compiled.should : [compiled.should]));
      }
    } catch (error) {
      console.warn(`Warning: Could not compile condition: ${JSON.stringify(condition)}`, error.message);
    }
  }

  // Build the bool query
  const boolQuery = {};
  
  if (must.length > 0) {
    boolQuery.must = must;
  }
  if (mustNot.length > 0) {
    boolQuery.must_not = mustNot;
  }
  if (should.length > 0) {
    boolQuery.should = should;
    boolQuery.minimum_should_match = 1;
  }

  // Return as a filter (can be used in bool.filter or directly)
  return {
    bool: boolQuery
  };
}

// Main execution
async function main() {
  const options = parseArgs();

  try {
    // Load residual policy
    console.log(`Loading residual policy from ${options.residual}...`);
    const residualText = readFileSync(options.residual, 'utf-8');
    const residual = JSON.parse(residualText);

    console.log(`\nCompiling residual to OpenSearch filter...`);
    console.log(`Residual structure:`, JSON.stringify(residual, null, 2).substring(0, 200) + '...');

    // Compile to OpenSearch filter
    const filter = compileToOpenSearchFilter(residual);

    // Ensure output directory exists
    const outDir = dirname(options.out);
    if (outDir !== '.') {
      mkdirSync(outDir, { recursive: true });
    }

    // Write output
    const output = {
      filter: filter,
      // Also include a full query example for k-NN search
      query_example: {
        size: 10,
        query: {
          bool: {
            filter: filter.bool,
            // k-NN query would be added separately in the actual search
            // This is just the filter portion
          }
        }
      },
      metadata: {
        compiled_from: options.residual,
        compiled_at: new Date().toISOString()
      }
    };

    const outputJson = JSON.stringify(output, null, 2);
    writeFileSync(options.out, outputJson, 'utf-8');

    console.log(`\n✓ OpenSearch filter written to ${options.out}`);
    console.log(`\nFilter structure:`);
    console.log(JSON.stringify(filter, null, 2));

  } catch (error) {
    console.error('Error compiling residual to filter:', error);
    if (error.message) {
      console.error('  ', error.message);
    }
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { compileToOpenSearchFilter, buildOpenSearchFilter };

