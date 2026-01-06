#!/usr/bin/env node

/**
 * Partial Evaluation (TPE) script for Cedar policies
 * 
 * Performs type-aware partial evaluation with a known principal and action,
 * but an abstract resource. Returns a residual policy describing which
 * resource attributes still matter for access.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { initCedar, Authorizer, PolicySet, Schema, Entities } from '@cedar-policy/cedar-wasm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');

// Parse command-line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    principal: null,
    action: null,
    context: null,
    resourceType: null,
    out: null,
    schema: resolve(PROJECT_ROOT, 'cedar/schema.cedarschema'),
    policies: resolve(PROJECT_ROOT, 'cedar/policies'),
    entities: resolve(PROJECT_ROOT, 'cedar/entities.json')
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--principal':
      case '-p':
        options.principal = args[++i];
        break;
      case '--action':
      case '-a':
        options.action = args[++i];
        break;
      case '--context':
      case '-c':
        options.context = args[++i];
        break;
      case '--resource-type':
      case '-r':
        options.resourceType = args[++i];
        break;
      case '--out':
      case '-o':
        options.out = args[++i];
        break;
      case '--schema':
        options.schema = args[++i];
        break;
      case '--policies':
        options.policies = args[++i];
        break;
      case '--entities':
        options.entities = args[++i];
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
  if (!options.principal || !options.action || !options.resourceType || !options.out) {
    console.error('Error: Missing required arguments');
    printHelp();
    process.exit(1);
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: node partial-eval.js [options]

Required:
  --principal, -p <principal>    Principal entity (e.g., 'Platform::Customer::"kate"')
  --action, -a <action>            Action (e.g., 'Platform::Action::"ask"')
  --resource-type, -r <type>       Resource type (e.g., 'Platform::Chunk')
  --out, -o <file>                 Output file for residual policy

Optional:
  --context, -c <file>             JSON file with request context
  --schema <file>                  Cedar schema file (default: cedar/schema.cedarschema)
  --policies <dir>                 Policies directory (default: cedar/policies)
  --entities <file>                Entities file (default: cedar/entities.json)
  --help, -h                       Show this help message

Example:
  node src/tpe/partial-eval.js \\
    --principal 'Platform::Customer::"kate"' \\
    --action 'Platform::Action::"ask"' \\
    --resource-type Platform::Chunk \\
    --out out/residual-kate.json
`);
}

// Load all Cedar policy files from a directory
function loadPolicies(policiesDir) {
  const policies = [];
  
  try {
    const files = readdirSync(policiesDir);
    for (const file of files) {
      if (file.endsWith('.cedar')) {
        const policyText = readFileSync(resolve(policiesDir, file), 'utf-8');
        policies.push(policyText);
      }
    }
  } catch (err) {
    console.error(`Error reading policies from ${policiesDir}:`, err.message);
    process.exit(1);
  }
  
  return policies;
}

// Main execution
async function main() {
  const options = parseArgs();

  try {
    // Initialize Cedar WASM
    await initCedar();

    // Load schema
    console.log(`Loading schema from ${options.schema}...`);
    const schemaText = readFileSync(options.schema, 'utf-8');
    const schema = Schema.fromString(schemaText);

    // Load policies
    console.log(`Loading policies from ${options.policies}...`);
    const policyTexts = loadPolicies(options.policies);
    const policySet = PolicySet.fromPolicies(policyTexts);

    // Load entities
    console.log(`Loading entities from ${options.entities}...`);
    const entitiesJson = readFileSync(options.entities, 'utf-8');
    const entities = Entities.fromJson(entitiesJson, schema);

    // Load context if provided
    let context = {};
    if (options.context) {
      const contextText = readFileSync(options.context, 'utf-8');
      context = JSON.parse(contextText);
    }

    // Create authorizer
    const authorizer = new Authorizer(schema, policySet, entities);

    // Parse principal and action
    const principal = options.principal;
    const action = options.action;
    const resourceType = options.resourceType;

    console.log(`\nPerforming partial evaluation:`);
    console.log(`  Principal: ${principal}`);
    console.log(`  Action: ${action}`);
    console.log(`  Resource Type: ${resourceType}`);
    if (options.context) {
      console.log(`  Context: ${JSON.stringify(context, null, 2)}`);
    }

    // Perform partial evaluation (TPE)
    // This evaluates policies with an abstract resource of the given type
    // The API may vary - this is the expected structure
    let residual;
    try {
      // Try the partial evaluation method
      // Note: The exact API may need adjustment based on @cedar-policy/cedar-wasm version
      if (typeof authorizer.partialEvaluate === 'function') {
        residual = authorizer.partialEvaluate(principal, action, resourceType, context);
      } else if (typeof authorizer.isAuthorizedPartial === 'function') {
        // Alternative API name
        residual = authorizer.isAuthorizedPartial(principal, action, resourceType, context);
      } else {
        // Fallback: construct a request with abstract resource
        // This is a placeholder - actual implementation depends on Cedar WASM API
        throw new Error('Partial evaluation API not found. Please check @cedar-policy/cedar-wasm version.');
      }
    } catch (apiError) {
      console.error('Partial evaluation API error:', apiError.message);
      console.error('\nNote: The exact API may vary by Cedar WASM version.');
      console.error('Please refer to @cedar-policy/cedar-wasm documentation for the correct method.');
      throw apiError;
    }

    // Serialize residual policy
    // The residual may be a PolicySet, JSON object, or string depending on API
    let residualJson;
    if (typeof residual === 'string') {
      residualJson = residual;
    } else if (residual && typeof residual.toJson === 'function') {
      residualJson = JSON.stringify(residual.toJson(), null, 2);
    } else {
      residualJson = JSON.stringify(residual, null, 2);
    }

    // Ensure output directory exists
    const outDir = dirname(options.out);
    if (outDir !== '.') {
      mkdirSync(outDir, { recursive: true });
    }

    // Write output
    writeFileSync(options.out, residualJson, 'utf-8');
    console.log(`\n✓ Residual policy written to ${options.out}`);

  } catch (error) {
    console.error('Error during partial evaluation:', error);
    if (error.message) {
      console.error('  ', error.message);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

