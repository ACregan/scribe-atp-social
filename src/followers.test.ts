import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { app } from './app.js';
import { actionEvents, follows, query } from './db.js';
import { checkedFollowers } from './followers.js';

const PUB = 'at://did:plc:author/site.standard.publication/pub1';
const PDS = 'https://pds.example';

// Follow records per reader DID, as their PDS would list them. A reader
// mapped to 'down' gets a 500 from their PDS.
function stubPds(recordsByDid: Record<string, Array<Record<string, unknown>> | 'down'>) {
  const listed: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.host === 'plc.directory') {
        return Response.json({ service: [{ id: '#atproto_pds', serviceEndpoint: PDS }] });
      }
      const did = url.searchParams.get('repo')!;
      listed.push(did);
      const records = recordsByDid[did];
      if (records === 'down') return new Response(null, { status: 500 });
      return Response.json({ records: (records ?? []).map((value) => ({ value })) });
    }),
  );
  return listed;
}

async function follow(did: string) {
  await actionEvents.log({
    actionType: 'subscribe',
    publicationUri: PUB,
    origin: 'https://example.com',
    did,
  });
}

beforeEach(async () => {
  await query('DELETE FROM action_events');
  await query('DELETE FROM follow_checks');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkedFollowers', () => {
  it('keeps readers whose Follow record is still there, old field or new', async () => {
    await follow('did:plc:a');
    await follow('did:plc:b');
    stubPds({
      'did:plc:a': [{ publication: PUB }],
      'did:plc:b': [{ subject: PUB }],
    });
    expect(await checkedFollowers(PUB, 0)).toEqual(['did:plc:a', 'did:plc:b']);
  });

  it('drops a reader who deleted their Follow record elsewhere, for good', async () => {
    await follow('did:plc:a');
    stubPds({ 'did:plc:a': [{ publication: 'at://someone/else/1' }] });
    expect(await checkedFollowers(PUB, 0)).toEqual([]);
    // Recorded as an unfollow, so they're no longer a candidate at all.
    expect(await follows.activeDids(PUB)).toEqual([]);
  });

  it("keeps a reader whose PDS can't be reached", async () => {
    await follow('did:plc:a');
    stubPds({ 'did:plc:a': 'down' });
    expect(await checkedFollowers(PUB, 0)).toEqual(['did:plc:a']);
  });

  it("doesn't check again within max_age, but does with max_age 0", async () => {
    await follow('did:plc:a');
    const listed = stubPds({ 'did:plc:a': [{ publication: PUB }] });
    await checkedFollowers(PUB, 3600);
    await checkedFollowers(PUB, 3600);
    expect(listed).toEqual(['did:plc:a']);
    await checkedFollowers(PUB, 0);
    expect(listed).toEqual(['did:plc:a', 'did:plc:a']);
  });
});

describe('GET /followers', () => {
  const auth = { Authorization: `Bearer ${process.env.APP_API_SECRET}` };

  it('needs the API secret', async () => {
    const res = await app.request(`/followers?publication_uri=${encodeURIComponent(PUB)}`);
    expect(res.status).toBe(401);
  });

  it('returns the count and the DIDs', async () => {
    await follow('did:plc:a');
    stubPds({ 'did:plc:a': [{ publication: PUB }] });
    const res = await app.request(
      `/followers?publication_uri=${encodeURIComponent(PUB)}&max_age=0`,
      { headers: auth },
    );
    expect(await res.json()).toEqual({ count: 1, followers: ['did:plc:a'] });
  });

  it('rejects a bad publication_uri or max_age', async () => {
    expect((await app.request('/followers?publication_uri=nope', { headers: auth })).status).toBe(
      400,
    );
    const res = await app.request(
      `/followers?publication_uri=${encodeURIComponent(PUB)}&max_age=-1`,
      { headers: auth },
    );
    expect(res.status).toBe(400);
  });
});
