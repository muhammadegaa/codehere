// Preload: any network call writes a marker file, so a test can show a command made none.
import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns';
const mark = (what) => fs.appendFileSync(process.env.NET_MARKER, `${what}\n`);
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) {
  mark('net.connect');
  return origConnect.apply(this, a);
};
const origLookup = dns.lookup;
dns.lookup = function (...a) {
  mark('dns.lookup');
  return origLookup.apply(this, a);
};
const origFetch = globalThis.fetch;
globalThis.fetch = (...a) => (mark('fetch'), origFetch(...a));
