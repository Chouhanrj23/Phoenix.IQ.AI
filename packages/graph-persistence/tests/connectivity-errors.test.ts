import { describe, expect, it } from 'vitest';
import type { Driver } from 'neo4j-driver';
import { GraphIngestionError, ingestGraphWriteOperations } from '../src/ingest.js';
import {
  Neo4jUnavailableError,
  asNeo4jUnavailable,
  isNeo4jConnectivityError,
} from '../src/neo4j-client.js';
import { getFullGraph, getNodeById } from '../src/query.js';

/**
 * P8 -- a connection lost AFTER the up-front connectivity check must still be
 * reported as `Neo4jUnavailableError` (-> HTTP 503 "nothing was saved"), not
 * as an ingestion-logic failure or a raw driver error (-> HTTP 500).
 *
 * Driver-free on purpose: the failure being tested is the error
 * classification, and a fake session that passes the connectivity probe and
 * then fails is the only way to reproduce "dropped mid-operation"
 * deterministically.
 */

function driverError(code: string, message = `driver failure: ${code}`): Error {
  return Object.assign(new Error(message), { code });
}

/** A driver whose connectivity probe succeeds, and whose real work then fails with `failure`. */
function droppingDriver(failure: Error): Driver {
  const session = {
    run: () => Promise.resolve({ records: [{ get: () => true }] }),
    executeRead: () => Promise.reject(failure),
    executeWrite: () => Promise.reject(failure),
    close: () => Promise.resolve(),
  };
  return { session: () => session } as unknown as Driver;
}

const ONE_WRITE = {
  nodeOperations: [
    { id: 'n1', label: 'Container', cypher: 'MERGE (n {id: $id}) RETURN n', params: { id: 'n1' } },
  ],
  relationshipOperations: [],
};

describe('isNeo4jConnectivityError', () => {
  it('recognises the driver connection-level codes and the security family', () => {
    expect(isNeo4jConnectivityError(driverError('ServiceUnavailable'))).toBe(true);
    expect(isNeo4jConnectivityError(driverError('SessionExpired'))).toBe(true);
    expect(isNeo4jConnectivityError(driverError('Neo.ClientError.Security.Unauthorized'))).toBe(
      true,
    );
    expect(isNeo4jConnectivityError(new Neo4jUnavailableError('down'))).toBe(true);
  });

  it('does NOT classify a query/logic failure as an outage', () => {
    expect(isNeo4jConnectivityError(driverError('Neo.ClientError.Statement.SyntaxError'))).toBe(
      false,
    );
    expect(isNeo4jConnectivityError(new Error('plain bug'))).toBe(false);
    expect(isNeo4jConnectivityError(undefined)).toBe(false);
  });

  it('asNeo4jUnavailable keeps the original error as `cause`, and passes other errors through untouched', () => {
    const original = driverError('ServiceUnavailable');
    const mapped = asNeo4jUnavailable(original, 'neo4j');
    expect(mapped).toBeInstanceOf(Neo4jUnavailableError);
    expect((mapped as Error).cause).toBe(original);

    const logic = driverError('Neo.ClientError.Statement.SyntaxError');
    expect(asNeo4jUnavailable(logic, 'neo4j')).toBe(logic);
  });
});

describe('ingestGraphWriteOperations -- connection lost mid-transaction', () => {
  it('throws Neo4jUnavailableError, not GraphIngestionError', async () => {
    const write = ingestGraphWriteOperations(
      droppingDriver(driverError('ServiceUnavailable')),
      'neo4j',
      ONE_WRITE,
    );
    await expect(write).rejects.toBeInstanceOf(Neo4jUnavailableError);
  });

  it('still reports a genuine logic failure as GraphIngestionError', async () => {
    const write = ingestGraphWriteOperations(
      droppingDriver(driverError('Neo.ClientError.Statement.SyntaxError')),
      'neo4j',
      ONE_WRITE,
    );
    await expect(write).rejects.toBeInstanceOf(GraphIngestionError);
  });
});

describe('query layer -- connection lost mid-read', () => {
  it('getFullGraph throws Neo4jUnavailableError', async () => {
    await expect(
      getFullGraph(droppingDriver(driverError('SessionExpired')), 'neo4j'),
    ).rejects.toBeInstanceOf(Neo4jUnavailableError);
  });

  it('getNodeById throws Neo4jUnavailableError', async () => {
    await expect(
      getNodeById(droppingDriver(driverError('ServiceUnavailable')), 'neo4j', 'x'),
    ).rejects.toBeInstanceOf(Neo4jUnavailableError);
  });

  it('a non-connectivity read failure is rethrown unchanged', async () => {
    const logic = driverError('Neo.ClientError.Statement.SyntaxError');
    await expect(getNodeById(droppingDriver(logic), 'neo4j', 'x')).rejects.toBe(logic);
  });
});
