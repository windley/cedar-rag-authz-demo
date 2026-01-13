/**
 * OpenSearch helper functions
 * 
 * Utilities for connecting to and querying OpenSearch/OpenSearch Serverless.
 */

import { Client } from '@opensearch-project/opensearch';
import { defaultProvider } from '@aws-sdk/credential-providers';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';

/**
 * Create an OpenSearch client
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.node - OpenSearch endpoint URL
 * @param {boolean} options.serverless - Whether using OpenSearch Serverless (requires AWS auth)
 * @param {string} options.region - AWS region (required for serverless)
 * @param {string} options.username - Basic auth username (optional)
 * @param {string} options.password - Basic auth password (optional)
 * @returns {Client} OpenSearch client
 */
export function createOpenSearchClient(options = {}) {
  const {
    node = process.env.OPENSEARCH_NODE || 'https://localhost:9200',
    serverless = false,
    region = process.env.AWS_REGION || 'us-east-1',
    username = process.env.OPENSEARCH_USERNAME,
    password = process.env.OPENSEARCH_PASSWORD
  } = options;

  const clientConfig = {
    node: node
  };

  // Configure authentication
  if (serverless) {
    // OpenSearch Serverless uses AWS SigV4
    clientConfig.auth = {
      credentials: defaultProvider(),
      region: region
    };
    clientConfig.connectionClass = AwsSigv4Signer;
  } else if (username && password) {
    // Basic auth for self-managed OpenSearch
    clientConfig.auth = {
      username: username,
      password: password
    };
  }

  return new Client(clientConfig);
}

/**
 * Build a k-NN vector search query with metadata filter
 * 
 * @param {Object} options - Query options
 * @param {number[]} options.vector - Query vector
 * @param {string} options.vectorField - Field name containing vectors
 * @param {number} options.k - Number of nearest neighbors
 * @param {Object} options.filter - OpenSearch filter (from residual compilation)
 * @param {number} options.size - Number of results to return
 * @returns {Object} OpenSearch query body
 */
export function buildVectorSearchQuery(options = {}) {
  const {
    vector,
    vectorField = 'embedding',
    k = 10,
    filter = null,
    size = 10
  } = options;

  if (!vector || !Array.isArray(vector)) {
    throw new Error('Query vector is required');
  }

  const query = {
    size: size,
    query: {
      bool: {}
    }
  };

  // Add k-NN clause
  query.query.bool.must = [
    {
      knn: {
        [vectorField]: {
          vector: vector,
          k: k
        }
      }
    }
  ];

  // Add authorization filter if provided
  if (filter) {
    query.query.bool.filter = filter.bool || filter;
  }

  return query;
}

/**
 * Execute a vector search query
 * 
 * @param {Client} client - OpenSearch client
 * @param {string} index - Index name
 * @param {Object} queryBody - Query body from buildVectorSearchQuery
 * @returns {Promise<Object>} Search results
 */
export async function executeVectorSearch(client, index, queryBody) {
  try {
    const response = await client.search({
      index: index,
      body: queryBody
    });

    return {
      hits: response.body.hits.hits.map(hit => ({
        id: hit._id,
        score: hit._score,
        source: hit._source
      })),
      total: response.body.hits.total.value || response.body.hits.total,
      maxScore: response.body.hits.max_score
    };
  } catch (error) {
    console.error('OpenSearch query error:', error);
    throw error;
  }
}

/**
 * Index a document with vector embedding
 * 
 * @param {Client} client - OpenSearch client
 * @param {string} index - Index name
 * @param {string} id - Document ID
 * @param {Object} document - Document with embedding and metadata
 * @returns {Promise<Object>} Index response
 */
export async function indexDocument(client, index, id, document) {
  try {
    const response = await client.index({
      index: index,
      id: id,
      body: document
    });

    return response;
  } catch (error) {
    console.error('OpenSearch index error:', error);
    throw error;
  }
}

/**
 * Check if an index exists
 * 
 * @param {Client} client - OpenSearch client
 * @param {string} index - Index name
 * @returns {Promise<boolean>} Whether index exists
 */
export async function indexExists(client, index) {
  try {
    const response = await client.indices.exists({ index: index });
    return response.body;
  } catch (error) {
    if (error.statusCode === 404) {
      return false;
    }
    throw error;
  }
}


