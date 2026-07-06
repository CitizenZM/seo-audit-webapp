import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Blocks SSRF (S1): rejects URLs that resolve to loopback, link-local, private,
 * or cloud-metadata addresses so `/api/analyze?url=` can't be used to make the
 * server fetch internal services (e.g. http://169.254.169.254/, localhost:xxxx).
 *
 * Checks both the literal hostname (in case it's already an IP) and the
 * resolved DNS address, since an attacker can point a public domain at a
 * private IP (DNS rebinding).
 */
function isDisallowedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('::ffff:')) return isDisallowedIp(lower.slice(7)); // IPv4-mapped
    return false;
  }
  return false;
}

export async function assertSafeUrl(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http/https URLs are allowed');
  }

  const hostname = url.hostname;
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Requests to local hostnames are not allowed');
  }
  if (net.isIP(hostname) && isDisallowedIp(hostname)) {
    throw new Error('Requests to private/internal IP addresses are not allowed');
  }

  // Resolve DNS and check every returned address (defends against DNS rebinding).
  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const { address } of records) {
      if (isDisallowedIp(address)) {
        throw new Error('URL resolves to a private/internal IP address');
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('private/internal')) throw e;
    throw new Error(`Could not resolve hostname: ${hostname}`);
  }
}
