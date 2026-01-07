#!/usr/bin/env node

/**
 * Partial Evaluation (TPE) script for Cedar policies
 * 
 * Performs type-aware partial evaluation with a known principal and action,
 * but an abstract resource. Returns a residual policy describing which
 * resource attributes still matter for access.
 * 
 * NOTE: Partial evaluation (TPE) may not be directly available in the
 * Cedar WASM API. This script demonstrates the expected interface.
 * For actual TPE, you may need to use the Cedar CLI or implement a
 * custom solution based on Cedar's authorization API.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';

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
    console.log('Loading Cedar schema, policies, and entities...');
    
    // Load schema
    console.log(`  Schema: ${options.schema}`);
    const schemaText = readFileSync(options.schema, 'utf-8');
    const schemaParseResult = cedar.checkParseSchema(schemaText);
    if (schemaParseResult.type === 'failure') {
      throw new Error(`Schema parse error: ${JSON.stringify(schemaParseResult.errors)}`);
    }

    // Load policies
    console.log(`  Policies: ${options.policies}`);
    const policyTexts = loadPolicies(options.policies);
    // Combine policies into a single string (Cedar can parse multiple policies from one string)
    const combinedPolicies = policyTexts.join('\n\n');
    const policySet = {
      staticPolicies: combinedPolicies
    };
    const policySetParseResult = cedar.checkParsePolicySet(policySet);
    if (policySetParseResult.type === 'failure') {
      throw new Error(`Policy set parse error: ${JSON.stringify(policySetParseResult.errors)}`);
    }

    // Load entities
    console.log(`  Entities: ${options.entities}`);
    const entitiesJson = readFileSync(options.entities, 'utf-8');
    const entities = JSON.parse(entitiesJson);
    const entitiesParseResult = cedar.checkParseEntities({ entities, schema: schemaText });
    if (entitiesParseResult.type === 'failure') {
      throw new Error(`Entities parse error: ${JSON.stringify(entitiesParseResult.errors)}`);
    }

    // Load context if provided
    let context = {};
    if (options.context) {
      const contextText = readFileSync(options.context, 'utf-8');
      context = JSON.parse(contextText);
    }

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

    // NOTE: Partial evaluation (TPE) is not directly available in the current
    // Cedar WASM API. This is a placeholder implementation that demonstrates
    // the expected output format. For actual TPE, you would need to:
    // 1. Use the Cedar CLI with --partial-eval flag, or
    // 2. Implement a custom solution that analyzes policies with abstract resources
    //
    // For now, we'll create a mock residual that represents the conditions
    // that would be extracted from the policies for this principal/action combination.
    
    console.log('\n⚠️  NOTE: Partial evaluation (TPE) is not directly available in Cedar WASM.');
    console.log('   This is a demonstration of the expected interface.');
    console.log('   For actual TPE, use Cedar CLI or implement custom solution.\n');

    // Create a mock residual based on the policies
    // In a real implementation, this would be generated by Cedar TPE
    const mockResidual = {
      principal: principal,
      action: action,
      resourceType: resourceType,
      conditions: [
        {
          type: 'permit',
          expr: `resource.tenant == principal.tenant && resource.customer_readers_team != null && principal.teams.contains(resource.customer_readers_team)`
        },
        {
          type: 'forbid',
          expr: `resource.classification == "confidential"`
        }
      ],
      note: 'This is a mock residual. Actual TPE implementation needed.'
    };

    // Ensure output directory exists
    const outDir = dirname(options.out);
    if (outDir !== '.') {
      mkdirSync(outDir, { recursive: true });
    }

    // Write output
    const residualJson = JSON.stringify(mockResidual, null, 2);
    writeFileSync(options.out, residualJson, 'utf-8');
    console.log(`✓ Mock residual policy written to ${options.out}`);
    console.log(`\n  To get actual TPE results, use Cedar CLI or implement custom TPE logic.`);

  } catch (error) {
    console.error('Error during partial evaluation:', error);
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
