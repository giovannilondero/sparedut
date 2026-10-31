// "Same network" = same public IP as seen by the server (same home/office NAT).
// If the server runs on a LAN the clients have private IPs: we consider them all
// on the same network, because to reach the server they must already be inside it.

export interface NetworkId {
  key: string;
  lan: boolean;
}

export function networkOf(rawIp: string | undefined): NetworkId {
  const ip = (rawIp ?? "").replace(/^::ffff:/, "");
  if (!ip || isPrivate(ip)) return { key: "lan", lan: true };
  if (ip.includes(":")) {
    // IPv6: every device has its own address, the network is the /64 prefix.
    return { key: expandV6(ip).slice(0, 4).join(":"), lan: false };
  }
  return { key: ip, lan: false };
}

function isPrivate(ip: string) {
  if (ip.includes(":")) {
    const first = parseInt(expandV6(ip)[0], 16);
    return ip === "::1" || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) // CGNAT / Tailscale
  );
}

function expandV6(ip: string): string[] {
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = ip.includes("::") ? Array(8 - h.length - t.length).fill("0") : [];
  return [...h, ...fill, ...t].map((part) => part.padStart(4, "0").toLowerCase());
}
