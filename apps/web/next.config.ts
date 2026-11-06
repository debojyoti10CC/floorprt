import type { NextConfig } from 'next';
const config:NextConfig={output:'export',trailingSlash:true,transpilePackages:['@floor/shared','@floor/proof-engine'],images:{unoptimized:true},poweredByHeader:false,devIndicators:false};
if (process.env.NEXT_PUBLIC_AQRA_POSITIONS_DEV === 'true') config.distDir = '.next-positions';
export default config;
