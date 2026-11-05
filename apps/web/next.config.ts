import type { NextConfig } from 'next';
const config:NextConfig={output:'export',trailingSlash:true,transpilePackages:['@floor/shared','@floor/proof-engine'],images:{unoptimized:true},poweredByHeader:false,devIndicators:false};
export default config;
