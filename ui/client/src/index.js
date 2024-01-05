import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

import {
  getDefaultWallets,
  RainbowKitProvider,
} from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { configureChains, createConfig, WagmiConfig } from 'wagmi';

import { alchemyProvider } from 'wagmi/providers/alchemy';
import { publicProvider } from 'wagmi/providers/public';
import {jsonRpcProvider} from "@wagmi/core/providers/jsonRpc";

const artela = {
  id: 11820,
  name: 'Artela',
  network: 'artela-testnet-2',
  iconUrl: 'https://framerusercontent.com/images/xLv7JZ8nzPaZ9zk7j63YbRZHqY.png',
  iconBackground: '#fff',
  nativeCurrency: {
    decimals: 18,
    name: 'Artela',
    symbol: 'ART',
  },
  rpcUrls: {
    public: { http: ['http://127.0.0.1:8545/'] },
    default: { http: ['http://127.0.0.1:8545/'] },
  },
  blockExplorers: {
    default: { name: 'SnowTrace', url: 'https://testnet-scan.artela.network/' },
    etherscan: { name: 'SnowTrace', url: 'https://testnet-scan.artela.network/' },
  },
  testnet: false,
};

const { chains, publicClient } = configureChains(
  [artela],
  [
    jsonRpcProvider({ rpc: () => {
        return  {
          http: 'http://127.0.0.1:8545/',
        }
      }}),
    // alchemyProvider({ apiKey: "b4dmYzJ5ztY18ziStcClJ_jRjEdieQqo" }),
    // publicProvider()
  ]
);

const { connectors } = getDefaultWallets({
  appName: 'My RainbowKit App',
  projectId: '080999b35ff4ade22e595b9aeb16db24',
  chains
});

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors,
  publicClient
})

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(


  <React.StrictMode>
    <WagmiConfig config={wagmiConfig}>
      <RainbowKitProvider modalSize="compact" locale="en-US" chains={chains}>
        <App />
      </RainbowKitProvider>
    </WagmiConfig>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
