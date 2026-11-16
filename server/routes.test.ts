import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';

const records = vi.hoisted(() => ({ maps: [] as any[] }));

vi.mock('./db', () => ({ pool: { query: vi.fn() } }));
vi.mock('./storage', () => ({
  storage: {
    listMaps: async (ownerHash: string) => records.maps.filter((map) => map.ownerHash === ownerHash),
    getMap: async (id: number, ownerHash: string) => records.maps.find((map) => map.id === id && map.ownerHash === ownerHash),
    createMap: async (input: any, ownerHash: string) => {
      const map = { ...input, id: records.maps.length + 1, ownerHash, updatedAt: new Date().toISOString() };
      records.maps.push(map);
      return map;
    },
    updateMap: async (id: number, ownerHash: string, input: any) => {
      const map = records.maps.find((row) => row.id === id && row.ownerHash === ownerHash);
      if (map) Object.assign(map, input);
      return map;
    },
    deleteMap: async (id: number, ownerHash: string) => {
      const index = records.maps.findIndex((map) => map.id === id && map.ownerHash === ownerHash);
      if (index < 0) return false;
      records.maps.splice(index, 1);
      return true;
    },
    claimLegacyMaps: async (ownerHash: string) => {
      const claimed = records.maps.filter((map) => map.ownerHash === null);
      for (const map of claimed) map.ownerHash = ownerHash;
      return claimed;
    },
  },
}));

import { registerRoutes } from './routes';

let server: Server;
let baseUrl: string;

async function visitor() {
  const response = await fetch(`${baseUrl}/api/session`);
  const { csrfToken } = await response.json();
  return { cookie: response.headers.get('set-cookie')!.split(';')[0], csrfToken };
}

describe('map access', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    server = createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => { records.maps = []; });

  it('isolates reads and writes between two browser visitors', async () => {
    const alice = await visitor();
    const bob = await visitor();
    const created = await fetch(`${baseUrl}/api/maps`, {
      method: 'POST',
      headers: { Cookie: alice.cookie, 'Content-Type': 'application/json', 'X-MindSky-CSRF': alice.csrfToken },
      body: JSON.stringify({ name: 'Private', nodes: [], edges: [] }),
    });
    expect(created.status).toBe(200);
    const map = await created.json();
    expect(map.ownerHash).toBeUndefined();

    const bobList = await fetch(`${baseUrl}/api/maps`, { headers: { Cookie: bob.cookie } });
    expect(await bobList.json()).toEqual([]);
    const bobRead = await fetch(`${baseUrl}/api/maps/${map.id}`, { headers: { Cookie: bob.cookie } });
    expect(bobRead.status).toBe(404);
    const bobWrite = await fetch(`${baseUrl}/api/maps/${map.id}`, {
      method: 'PATCH',
      headers: { Cookie: bob.cookie, 'Content-Type': 'application/json', 'X-MindSky-CSRF': bob.csrfToken },
      body: JSON.stringify({ name: 'Stolen' }),
    });
    expect(bobWrite.status).toBe(404);
    const aliceRead = await fetch(`${baseUrl}/api/maps/${map.id}`, { headers: { Cookie: alice.cookie } });
    expect((await aliceRead.json()).name).toBe('Private');
  });

  it('rejects writes without a request token', async () => {
    const alice = await visitor();
    const response = await fetch(`${baseUrl}/api/maps`, {
      method: 'POST',
      headers: { Cookie: alice.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Blocked', nodes: [], edges: [] }),
    });
    expect(response.status).toBe(403);
    expect(records.maps).toHaveLength(0);
  });

  it('assigns old maps once to the visitor with the recovery code', async () => {
    const code = 'c'.repeat(32);
    process.env.MINDSKY_LEGACY_CLAIM_CODE = code;
    records.maps.push({ id: 1, name: 'Older map', nodes: [], edges: [], ownerHash: null, updatedAt: new Date().toISOString() });
    try {
      const alice = await visitor();
      const bob = await visitor();
      const claim = await fetch(`${baseUrl}/api/maps/claim-legacy`, {
        method: 'POST',
        headers: { Cookie: alice.cookie, 'Content-Type': 'application/json', 'X-MindSky-CSRF': alice.csrfToken },
        body: JSON.stringify({ code }),
      });
      expect((await claim.json()).maps).toHaveLength(1);
      const aliceList = await fetch(`${baseUrl}/api/maps`, { headers: { Cookie: alice.cookie } });
      expect(await aliceList.json()).toHaveLength(1);
      const bobList = await fetch(`${baseUrl}/api/maps`, { headers: { Cookie: bob.cookie } });
      expect(await bobList.json()).toEqual([]);
    } finally {
      delete process.env.MINDSKY_LEGACY_CLAIM_CODE;
    }
  });
});
