import os from "node:os";

export type NetworkAccessAddress = {
  interfaceName: string;
  address: string;
  url: string;
  mobileUploadUrl: string;
  family: string;
};

export type NetworkAccessInfo = {
  port: string;
  localhostUrl: string;
  localhostMobileUploadUrl: string;
  addresses: NetworkAccessAddress[];
};

export function getNetworkAccessInfo(): NetworkAccessInfo {
  const port = process.env.PORT || "3000";
  const addresses: NetworkAccessAddress[] = [];
  const interfaces = os.networkInterfaces();

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") continue;
      if (!isLikelyLocalNetworkIp(entry.address)) continue;
      const baseUrl = `http://${entry.address}:${port}`;
      addresses.push({
        interfaceName,
        address: entry.address,
        url: baseUrl,
        mobileUploadUrl: `${baseUrl}/mobile/upload`,
        family: entry.family
      });
    }
  }

  return {
    port,
    localhostUrl: `http://localhost:${port}/admin`,
    localhostMobileUploadUrl: `http://localhost:${port}/mobile/upload`,
    addresses
  };
}

function isLikelyLocalNetworkIp(address: string) {
  return (
    address.startsWith("192.168.") ||
    address.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address) ||
    address.startsWith("169.254.")
  );
}
