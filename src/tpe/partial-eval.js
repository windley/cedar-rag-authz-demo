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

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';
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

    // Try to use Cedar CLI for actual partial evaluation
    // If CLI is not available, fall back to mock residual
    let residual;
    let usedCli = false;

    try {
      // Check if Cedar CLI is available
      execSync('cedar --version', { stdio: 'ignore' });
      
      console.log('\nAttempting to use Cedar CLI for type-aware partial evaluation (TPE)...');
      
      // Parse principal and resource type from the strings
      // Format: "Platform::Customer::\"kate\"" -> type: "Platform::Customer", eid: "kate"
      const principalMatch = principal.match(/^([^:]+::[^:]+)::"([^"]+)"$/);
      const resourceTypeMatch = resourceType.match(/^([^:]+::[^:]+)$/);
      
      if (!principalMatch || !resourceTypeMatch) {
        throw new Error('Unable to parse principal or resource type format');
      }
      
      const principalType = principalMatch[1];
      const principalEid = principalMatch[2];
      const resourceTypeName = resourceTypeMatch[1];
      
      // Prepare temporary files for Cedar CLI
      const tmpDir = resolve(PROJECT_ROOT, '.tmp');
      mkdirSync(tmpDir, { recursive: true });
      
      const tmpSchema = resolve(tmpDir, 'schema.cedarschema');
      const tmpPolicies = resolve(tmpDir, 'policies.cedar');
      const tmpEntities = resolve(tmpDir, 'entities.json');
      const tmpContext = resolve(tmpDir, 'context.json');
      
      // Write temporary files
      writeFileSync(tmpSchema, schemaText, 'utf-8');
      writeFileSync(tmpPolicies, combinedPolicies, 'utf-8');
      writeFileSync(tmpEntities, JSON.stringify(entities, null, 2), 'utf-8');
      writeFileSync(tmpContext, JSON.stringify(context, null, 2), 'utf-8');
      
      // Build Cedar CLI TPE command
      // Use array form to properly handle quoting
      const tpeArgs = [
        'cedar', 'tpe',
        '--schema', tmpSchema,
        '--entities', tmpEntities,
        '--principal-type', principalType,
        '--principal-eid', principalEid,
        '--action', action,
        '--resource-type', resourceTypeName,
        '--policies', tmpPolicies,
        '--context', tmpContext,
        '--error-format', 'human'
      ];
      
      try {
        // Use spawnSync to properly handle arguments with quotes
        const result = spawnSync(
          'cedar',
          [
            'tpe',
            '--schema', tmpSchema,
            '--entities', tmpEntities,
            '--principal-type', principalType,
            '--principal-eid', principalEid,
            '--action', action,
            '--resource-type', resourceTypeName,
            '--policies', tmpPolicies,
            '--context', tmpContext,
            '--error-format', 'human'
          ],
          {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
          }
        );
        
        if (result.error) {
          throw result.error;
        }
        
        if (result.status !== 0) {
          const errorMsg = result.stderr || result.stdout || 'Unknown error';
          throw new Error(`Cedar CLI exited with status ${result.status}: ${errorMsg}`);
        }
        
        const cliOutput = result.stdout;
        
        // Parse CLI output (text format with residual policies)
        // The output contains residual policies in Cedar syntax
        // Format: Decision (ALLOW/DENY/UNKNOWN) followed by policy residuals
        const lines = cliOutput.split('\n');
        const decision = lines.find(line => line.match(/^(ALLOW|DENY|UNKNOWN)$/)) || 'UNKNOWN';
        const residualPolicies = [];
        let currentPolicy = null;
        let inPolicy = false;
        
        for (const line of lines) {
          // Look for policy ID markers
          if (line.match(/^@id\(/)) {
            if (currentPolicy) {
              residualPolicies.push(currentPolicy);
            }
            const idMatch = line.match(/^@id\("([^"]+)"\)/);
            currentPolicy = {
              id: idMatch ? idMatch[1] : null,
              text: line + '\n',
              type: null
            };
            inPolicy = true;
          } else if (inPolicy && currentPolicy) {
            currentPolicy.text += line + '\n';
            // Detect policy type
            if (line.trim().startsWith('permit(')) {
              currentPolicy.type = 'permit';
            } else if (line.trim().startsWith('forbid(')) {
              currentPolicy.type = 'forbid';
            }
            // End of policy (semicolon on its own line or empty line after policy)
            if (line.trim() === '};' || (line.trim() === '' && currentPolicy.type)) {
              inPolicy = false;
            }
          }
        }
        if (currentPolicy) {
          residualPolicies.push(currentPolicy);
        }
        
        // Structure the residual output
        residual = {
          decision: decision,
          principal: principal,
          action: action,
          resourceType: resourceType,
          residuals: residualPolicies,
          _fromCli: true
        };
        
        usedCli = true;
        console.log(`✓ Successfully used Cedar CLI for type-aware partial evaluation`);
        console.log(`  Decision: ${decision}`);
        console.log(`  Residual policies: ${residualPolicies.length}`);
      } catch (cliError) {
        // CLI might not support tpe or command failed
        const stderr = cliError.stderr?.toString() || '';
        const stdout = cliError.stdout?.toString() || '';
        const errorMsg = stderr || cliError.message || 'Unknown error';
        console.log('  Cedar CLI available but TPE command failed, using fallback');
        console.log(`  Error: ${errorMsg.substring(0, 300)}`);
        if (stdout) {
          console.log(`  Output: ${stdout.substring(0, 200)}`);
        }
      } finally {
        // Clean up temporary directory
        try {
          rmSync(tmpDir, { recursive: true, force: true });
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
    } catch (cliCheckError) {
      // Cedar CLI not available
      console.log('\nCedar CLI not found. Using mock residual.');
      console.log('  To use actual TPE, install Cedar CLI: https://github.com/cedar-policy/cedar');
      console.log('  Build with: cargo build --release --bin cedar --features tpe');
    }

    // Fallback to mock residual if CLI wasn't used
    if (!usedCli) {
      console.log('\n⚠️  Using mock residual (Cedar CLI not available or TPE not supported)');
      console.log('   For actual TPE results, install Cedar CLI or use Cedar service.\n');
      
      // Create a mock residual based on the policies
      // In a real implementation, this would be generated by Cedar TPE
      residual = {
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
        note: 'This is a mock residual. Install Cedar CLI for actual TPE results.',
        _mock: true
      };
    }

    // Ensure output directory exists
    const outDir = dirname(options.out);
    if (outDir !== '.') {
      mkdirSync(outDir, { recursive: true });
    }

    // Write output
    const residualJson = JSON.stringify(residual, null, 2);
    writeFileSync(options.out, residualJson, 'utf-8');
    console.log(`✓ Residual policy written to ${options.out}`);
    
    if (!usedCli) {
      console.log(`\n  To get actual TPE results, install Cedar CLI:`);
      console.log(`  https://github.com/cedar-policy/cedar`);
    }

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
