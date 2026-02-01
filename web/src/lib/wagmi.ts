import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [mainnet],
  connectors: [
    injected(),
  ],
  transports: {
    [mainnet.id]: http(),
  },
})

// Siwer API URL
export const SIWER_URL = import.meta.env.PROD 
  ? 'https://siwer.larisara.workers.dev'
  : 'https://siwer.larisara.workers.dev' // Use prod for now
