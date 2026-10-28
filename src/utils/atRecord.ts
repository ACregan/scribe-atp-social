// Reads a public record straight from its owner's PDS, no sign-in needed.

type DidDoc = { service?: Array<{ id: string; serviceEndpoint: string }> };

export async function resolvePds(did: string): Promise<string | null> {
  let url: string;
  if (did.startsWith('did:plc:')) {
    url = `https://plc.directory/${encodeURIComponent(did)}`;
  } else if (did.startsWith('did:web:')) {
    url = `https://${did.slice('did:web:'.length)}/.well-known/did.json`;
  } else {
    return null;
  }
  const res = await fetch(url);
  if (!res.ok) return null;
  const doc = (await res.json()) as DidDoc;
  return doc.service?.find((s) => s.id === '#atproto_pds')?.serviceEndpoint ?? null;
}

export async function fetchAtRecord(
  atUri: string,
): Promise<{ cid: string; value: Record<string, unknown> } | null> {
  try {
    const match = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!match) return null;
    const [, did, collection, rkey] = match;

    const pds = await resolvePds(did);
    if (!pds) return null;

    const url = new URL(`${pds}/xrpc/com.atproto.repo.getRecord`);
    url.searchParams.set('repo', did);
    url.searchParams.set('collection', collection);
    url.searchParams.set('rkey', rkey);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { cid?: string; value?: Record<string, unknown> };
    if (!data.cid) return null;
    return { cid: data.cid, value: data.value ?? {} };
  } catch {
    return null;
  }
}
