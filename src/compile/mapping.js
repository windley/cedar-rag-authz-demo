/**
 * Cedar to OpenSearch Condition Mapping
 * 
 * Translates Cedar residual policy conditions into OpenSearch query filters.
 * This is application-specific logic that interprets Cedar expressions and
 * converts them to database query constraints.
 * 
 * The mapping handles common Cedar expression patterns:
 * - Equality: resource.attr == value
 * - Inequality: resource.attr != value
 * - Null checks: resource.attr != null
 * - Set membership: principal.teams.contains(resource.team)
 * - Logical operators: &&, ||
 */

/**
 * Map a Cedar condition expression to OpenSearch filter clauses
 * 
 * @param {Object|string} condition - Cedar condition (may be AST node, JSON, or string)
 * @returns {Object} OpenSearch filter clauses with must/must_not/should arrays
 */
export function compileResidual(condition) {
  const result = {
    must: [],
    must_not: [],
    should: []
  };

  // Handle different condition formats
  let expr = condition;
  if (typeof condition === 'string') {
    // Try to parse as JSON, otherwise treat as Cedar expression text
    try {
      expr = JSON.parse(condition);
    } catch (e) {
      // Parse Cedar expression syntax (simplified)
      return parseCedarExpression(condition, result);
    }
  }

  // Handle structured condition objects
  if (expr && typeof expr === 'object') {
    if (expr.kind === 'expr' || expr.expr) {
      return compileExpression(expr.expr || expr, result);
    }
    if (expr.op || expr.operator) {
      return compileExpression(expr, result);
    }
    // If it's already an array or object structure, try to extract conditions
    if (Array.isArray(expr)) {
      for (const item of expr) {
        const compiled = compileResidual(item);
        mergeResults(result, compiled);
      }
    } else {
      // Try to find condition-like structures
      return parseConditionObject(expr, result);
    }
  }

  return result;
}

/**
 * Compile a Cedar expression AST node
 */
function compileExpression(expr, result) {
  if (!expr || typeof expr !== 'object') {
    return result;
  }

  const op = expr.op || expr.operator || expr.kind;
  
  switch (op) {
    case 'and':
    case '&&':
      // Both conditions must be true
      if (expr.children || expr.args) {
        const children = expr.children || expr.args;
        for (const child of children) {
          const childResult = compileExpression(child, { must: [], must_not: [], should: [] });
          mergeResults(result, childResult);
        }
      }
      break;
      
    case 'or':
    case '||':
      // At least one condition must be true
      if (expr.children || expr.args) {
        const children = expr.children || expr.args;
        const shouldClauses = [];
        for (const child of children) {
          const childResult = compileExpression(child, { must: [], must_not: [], should: [] });
          // For OR, we need to combine into should clauses
          if (childResult.must.length > 0) {
            shouldClauses.push(...childResult.must);
          }
        }
        if (shouldClauses.length > 0) {
          result.should.push(...shouldClauses);
        }
      }
      break;
      
    case '==':
    case 'eq':
      result.must.push(compileEquality(expr));
      break;
      
    case '!=':
    case 'ne':
      result.must_not.push(compileEquality(expr));
      break;
      
    case 'in':
    case 'contains':
      result.must.push(compileContains(expr));
      break;
      
    default:
      // Try to parse as attribute access or literal
      if (expr.attr || expr.attribute) {
        // Attribute access - might be part of a larger expression
        return result;
      }
  }

  return result;
}

/**
 * Compile equality expression (== or !=)
 */
function compileEquality(expr) {
  const left = expr.left || expr.lhs;
  const right = expr.right || expr.rhs;
  
  // Extract attribute path and value
  const attrPath = extractAttributePath(left);
  const value = extractValue(right);
  
  if (!attrPath) {
    return null;
  }
  
  // Map Cedar attribute names to OpenSearch field names
  const fieldName = mapAttributeToField(attrPath);
  
  if (value === null || value === undefined) {
    // Null check
    return { exists: { field: fieldName } };
  }
  
  // Regular equality
  return { term: { [fieldName]: value } };
}

/**
 * Compile contains/in expression
 */
function compileContains(expr) {
  const left = expr.left || expr.lhs; // The set/array
  const right = expr.right || expr.rhs; // The value to check
  
  // Check if this is principal.teams.contains(resource.team) pattern
  const leftPath = extractAttributePath(left);
  const rightPath = extractAttributePath(right);
  
  if (rightPath && rightPath.startsWith('resource.')) {
    // This is checking if resource.attr is in principal.set
    const fieldName = mapAttributeToField(rightPath);
    const setValue = extractValue(left);
    
    if (Array.isArray(setValue)) {
      // Multiple values - use terms query
      return { terms: { [fieldName]: setValue } };
    } else if (setValue) {
      // Single value - use term query
      return { term: { [fieldName]: setValue } };
    }
  }
  
  return null;
}

/**
 * Extract attribute path from expression (e.g., "resource.tenant")
 */
function extractAttributePath(expr) {
  if (typeof expr === 'string') {
    if (expr.startsWith('resource.') || expr.startsWith('principal.')) {
      return expr;
    }
  }
  if (expr && typeof expr === 'object') {
    if (expr.attr || expr.attribute) {
      const base = expr.base || 'resource';
      const attr = expr.attr || expr.attribute;
      return `${base}.${attr}`;
    }
    if (expr.path) {
      return expr.path;
    }
  }
  return null;
}

/**
 * Extract literal value from expression
 */
function extractValue(expr) {
  if (expr === null || expr === undefined) {
    return null;
  }
  if (typeof expr === 'string' || typeof expr === 'number' || typeof expr === 'boolean') {
    return expr;
  }
  if (expr && typeof expr === 'object') {
    if (expr.value !== undefined) {
      return expr.value;
    }
    if (expr.literal) {
      return expr.literal;
    }
    // Handle entity references - extract ID
    if (expr.__entity && expr.id) {
      return expr.id;
    }
    if (expr.__entity) {
      // Just entity type, return the string representation
      return expr.__entity;
    }
  }
  return null;
}

/**
 * Map Cedar attribute path to OpenSearch field name
 */
function mapAttributeToField(attrPath) {
  // Remove "resource." prefix
  const field = attrPath.replace(/^resource\./, '');
  
  // Map entity references to just the ID field
  // e.g., tenant -> tenant_id (assuming we store just the ID in OpenSearch)
  const fieldMap = {
    'tenant': 'tenant_id',
    'customer_readers_team': 'customer_readers_team_id',
    'employee_readers_team': 'employee_readers_team_id',
    'doc': 'doc_id',
    'classification': 'classification'
  };
  
  return fieldMap[field] || field;
}

/**
 * Parse Cedar expression text (simplified parser)
 * Handles Cedar CLI TPE output format
 */
function parseCedarExpression(exprText, result) {
  // Handle boolean literals
  if (exprText.trim() === 'false') {
    // A policy that evaluates to false doesn't contribute to the filter
    // (it's already been evaluated away)
    return result;
  }
  
  // Pattern: entity reference == (resource.attr) or (resource.attr) == entity reference
  // e.g., Platform::Tenant::"custco" == (resource.tenant)
  const entityEqMatch = exprText.match(/(?:Platform::\w+::"([^"]+)"|\(resource\.(\w+)\))\s*==\s*(?:Platform::\w+::"([^"]+)"|\(resource\.(\w+)\))/);
  if (entityEqMatch) {
    const entityId = entityEqMatch[1] || entityEqMatch[3];
    const attrName = entityEqMatch[2] || entityEqMatch[4];
    if (entityId && attrName) {
      const field = mapAttributeToField(`resource.${attrName}`);
      result.must.push({ term: { [field]: entityId } });
      return result;
    }
  }
  
  // Pattern: resource.attr == entity reference (with or without parentheses)
  // e.g., (resource.tenant) == Platform::Tenant::"custco"
  const resourceEntityEqMatch = exprText.match(/\(?resource\.(\w+)\)?\s*==\s*Platform::\w+::"([^"]+)"/);
  if (resourceEntityEqMatch) {
    const field = mapAttributeToField(`resource.${resourceEntityEqMatch[1]}`);
    const entityId = resourceEntityEqMatch[2];
    result.must.push({ term: { [field]: entityId } });
    return result;
  }
  
  // Pattern: resource.attr == "string value" (with or without parentheses)
  // e.g., (resource.classification) == "confidential"
  const stringEqMatch = exprText.match(/\(?resource\.(\w+)\)?\s*==\s*"([^"]+)"/);
  if (stringEqMatch) {
    const field = mapAttributeToField(`resource.${stringEqMatch[1]}`);
    const value = stringEqMatch[2];
    result.must.push({ term: { [field]: value } });
    return result;
  }
  
  // Pattern: [Entity::"id"].contains(resource.attr)
  // e.g., [Platform::Team::"custco-readers"].contains(resource.customer_readers_team)
  const setContainsMatch = exprText.match(/\[Platform::\w+::"([^"]+)"\]\.contains\(resource\.(\w+)\)/);
  if (setContainsMatch) {
    const entityId = setContainsMatch[1];
    const field = mapAttributeToField(`resource.${setContainsMatch[2]}`);
    result.must.push({ term: { [field]: entityId } });
    return result;
  }
  
  // Pattern: resource.attr != null
  const notNullMatch = exprText.match(/resource\.(\w+)\s*!=\s*null/);
  if (notNullMatch) {
    const field = mapAttributeToField(`resource.${notNullMatch[1]}`);
    result.must.push({ exists: { field: field } });
    return result;
  }
  
  // Pattern: resource.attr == null
  const nullMatch = exprText.match(/resource\.(\w+)\s*==\s*null/);
  if (nullMatch) {
    const field = mapAttributeToField(`resource.${nullMatch[1]}`);
    result.must_not.push({ exists: { field: field } });
    return result;
  }
  
  // Pattern: principal.teams.contains(resource.team) - needs principal context
  const principalContainsMatch = exprText.match(/principal\.(\w+)\.contains\(resource\.(\w+)\)/);
  if (principalContainsMatch) {
    const field = mapAttributeToField(`resource.${principalContainsMatch[2]}`);
    // This would need principal context to resolve - simplified for now
    console.warn('Contains expression needs principal context:', exprText);
  }
  
  return result;
}

/**
 * Parse condition object structure
 */
function parseConditionObject(obj, result) {
  // Try to find common patterns in the object structure
  for (const [key, value] of Object.entries(obj)) {
    if (key.includes('tenant')) {
      result.must.push({ term: { tenant_id: extractEntityId(value) } });
    } else if (key.includes('classification')) {
      if (value === 'confidential') {
        result.must_not.push({ term: { classification: 'confidential' } });
      } else {
        result.must.push({ term: { classification: value } });
      }
    }
  }
  return result;
}

/**
 * Merge compiled results
 */
function mergeResults(target, source) {
  if (source.must && source.must.length > 0) {
    target.must.push(...source.must);
  }
  if (source.must_not && source.must_not.length > 0) {
    target.must_not.push(...source.must_not);
  }
  if (source.should && source.should.length > 0) {
    target.should.push(...source.should);
  }
}

