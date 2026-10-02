import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiProvider } from '../src/data/api/apiProvider.js';
import { mockProvider } from '../src/data/mock/mockProvider.js';
import type { ReviewDecisionSubmission } from '../src/data/types.js';

/**
 * P7-01 -- the provider write path. Confirm/Correct is no longer a local
 * state change: it leaves the browser, and the provider reports honestly
 * whether it was stored.
 */

const SUBMISSION: ReviewDecisionSubmission = {
  targetObjectId: 'ctr-payments',
  targetLabel: 'Payments Gateway Adapter — technology',
  decision: 'corrected',
  previousValue: 'Node.js/Express (from source code)',
  correctedValue: 'Java / Spring Boot',
  reviewerId: 'reviewer-a',
  previousStatus: 'pending',
};

function mockFetchOnce(body: unknown, ok = true, status = 200, statusText = 'OK') {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, statusText, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiProvider.submitReviewDecision (P7-01)', () => {
  it('POSTs the decision to the real review-decisions endpoint', async () => {
    const fetchMock = mockFetchOnce({ durability: 'graph' });

    await apiProvider.submitReviewDecision(SUBMISSION);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/review-decisions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      targetObjectId: 'ctr-payments',
      decision: 'corrected',
      correctedValue: 'Java / Spring Boot',
      previousValue: 'Node.js/Express (from source code)',
      reviewerId: 'reviewer-a',
    });
  });

  it('returns the durability the API reported, rather than assuming a durable save', async () => {
    mockFetchOnce({ durability: 'graph' });
    await expect(apiProvider.submitReviewDecision(SUBMISSION)).resolves.toMatchObject({
      durability: 'graph',
    });

    mockFetchOnce({ durability: 'memory' });
    await expect(apiProvider.submitReviewDecision(SUBMISSION)).resolves.toMatchObject({
      durability: 'memory',
    });
  });

  it('surfaces the API failure message so a rejected save is never read as a success', async () => {
    mockFetchOnce(
      { message: 'Review decisions cannot be saved right now — your decision was NOT recorded.' },
      false,
      503,
      'Service Unavailable',
    );

    await expect(apiProvider.submitReviewDecision(SUBMISSION)).rejects.toThrow('NOT recorded');
  });

  it('still fails loudly when the error body cannot be parsed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiProvider.submitReviewDecision(SUBMISSION)).rejects.toThrow(
      '/api/review-decisions',
    );
  });
});

describe('mockProvider.submitReviewDecision (P7-01) — the demo dataset cannot persist', () => {
  it('reports durability "none" with a reason instead of faking a save', async () => {
    const result = await mockProvider.submitReviewDecision(SUBMISSION);
    expect(result.durability).toBe('none');
    expect(result.reason).toContain('not saved');
  });

  it('never invents browser storage — a second call still reports nothing persisted', async () => {
    await mockProvider.submitReviewDecision(SUBMISSION);
    const again = await mockProvider.submitReviewDecision(SUBMISSION);
    expect(again.durability).toBe('none');
  });

  it('leaves the review queue unchanged, since nothing was recorded', async () => {
    const before = await mockProvider.getReviewItems();
    await mockProvider.submitReviewDecision(SUBMISSION);
    const after = await mockProvider.getReviewItems();
    expect(after.map((i) => i.status)).toEqual(before.map((i) => i.status));
  });
});
