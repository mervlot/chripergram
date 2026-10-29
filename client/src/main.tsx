import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/manrope';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { Toaster } from './components/Toaster';
import { primeAudioOnInteraction } from './lib/sound';
import './lib/enhance';
import { initSplash } from './lib/splash';
import './store/theme'; // applies the dark class on boot
import './index.css';

primeAudioOnInteraction();
initSplash();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>,
);
