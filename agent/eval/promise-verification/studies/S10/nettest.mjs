// Control for the network-less container: a request to a public host must fail there.
try {
  await globalThis.fetch('https://registry.npmjs.org/');
  console.log('REACHED THE NETWORK (control failed)');
} catch (e) {
  console.log('request failed as expected:', e.cause?.code || e.message);
}
