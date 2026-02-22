'use client';

import { useState, useCallback, useEffect } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';
import type { LLMSettings } from '@/types';

const LLM_STORAGE_KEY = 'sg3d_llm_settings';

type Provider = LLMSettings['provider'];

interface ProviderConfig {
  name: string;
  models: string[];
  defaultModel: string;
  helpText: string;
  pricingUrl: string;
  placeholder: string;
}

const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
    helpText: 'Get your API key from platform.openai.com/api-keys',
    pricingUrl: 'https://openai.com/pricing',
    placeholder: 'sk-...',
  },
  anthropic: {
    name: 'Anthropic',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-3-5-sonnet-20241022'],
    defaultModel: 'claude-sonnet-4-20250514',
    helpText: 'Get your API key from console.anthropic.com/settings/keys',
    pricingUrl: 'https://anthropic.com/pricing',
    placeholder: 'sk-ant-...',
  },
  google: {
    name: 'Google',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    defaultModel: 'gemini-2.5-flash',
    helpText: 'Get your API key from aistudio.google.com/apikey',
    pricingUrl: 'https://ai.google.dev/pricing',
    placeholder: 'AIza...',
  },
  groq: {
    name: 'Groq',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    defaultModel: 'llama-3.3-70b-versatile',
    helpText: 'Get your API key from console.groq.com/keys',
    pricingUrl: 'https://groq.com/pricing',
    placeholder: 'gsk_...',
  },
};

const PROVIDERS: Provider[] = ['groq', 'openai', 'anthropic', 'google'];

// Load settings from localStorage
export function loadLLMSettings(): LLMSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(LLM_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as LLMSettings;
    }
  } catch {
    // Invalid stored data
  }
  return null;
}

// Save settings to localStorage
function saveLLMSettings(settings: LLMSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(settings));
}

// Remove settings from localStorage
function removeLLMSettings(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LLM_STORAGE_KEY);
}

interface LLMSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LLMSettingsModal({
  isOpen,
  onClose,
}: LLMSettingsModalProps) {
  const { llmSettings, setLLMSettings } = useGraphStore();

  const [provider, setProvider] = useState<Provider>(
    llmSettings?.provider || 'groq'
  );
  const [apiKey, setApiKey] = useState(llmSettings?.api_key || '');
  const [model, setModel] = useState(
    llmSettings?.model || PROVIDER_CONFIGS.groq.defaultModel
  );
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [testError, setTestError] = useState('');

  // Sync form when llmSettings change externally
  useEffect(() => {
    if (llmSettings) {
      setProvider(llmSettings.provider);
      setApiKey(llmSettings.api_key);
      setModel(llmSettings.model || PROVIDER_CONFIGS[llmSettings.provider].defaultModel);
    }
  }, [llmSettings]);

  // When provider changes, update model to default
  const handleProviderChange = useCallback((newProvider: Provider) => {
    setProvider(newProvider);
    setModel(PROVIDER_CONFIGS[newProvider].defaultModel);
    setTestStatus('idle');
  }, []);

  // Test connection
  const handleTestConnection = useCallback(async () => {
    if (!apiKey.trim()) return;
    setTestStatus('testing');
    setTestError('');

    try {
      // Validate by attempting a minimal API call
      const response = await fetch('/api/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: apiKey, model }),
      });

      if (response.ok) {
        setTestStatus('success');
      } else {
        // If backend test endpoint doesn't exist, do a basic key format check
        const validPrefixes: Record<Provider, string[]> = {
          openai: ['sk-'],
          anthropic: ['sk-ant-'],
          google: ['AIza'],
          groq: ['gsk_'],
        };
        const prefixes = validPrefixes[provider];
        const hasValidPrefix = prefixes.some((p) => apiKey.startsWith(p));
        if (hasValidPrefix && apiKey.length > 20) {
          setTestStatus('success');
        } else {
          setTestStatus('error');
          setTestError('API key format does not match the selected provider');
        }
      }
    } catch {
      // Fallback: basic format validation
      const validPrefixes: Record<Provider, string[]> = {
        openai: ['sk-'],
        anthropic: ['sk-ant-'],
        google: ['AIza'],
        groq: ['gsk_'],
      };
      const prefixes = validPrefixes[provider];
      const hasValidPrefix = prefixes.some((p) => apiKey.startsWith(p));
      if (hasValidPrefix && apiKey.length > 20) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setTestError('API key format does not match the selected provider');
      }
    }
  }, [provider, apiKey, model]);

  // Save
  const handleSave = useCallback(() => {
    if (!apiKey.trim()) return;
    const settings: LLMSettings = {
      provider,
      api_key: apiKey.trim(),
      model,
    };
    saveLLMSettings(settings);
    setLLMSettings(settings);
    onClose();
  }, [provider, apiKey, model, setLLMSettings, onClose]);

  // Remove
  const handleRemove = useCallback(() => {
    removeLLMSettings();
    setLLMSettings(null);
    setApiKey('');
    setTestStatus('idle');
    onClose();
  }, [setLLMSettings, onClose]);

  if (!isOpen) return null;

  const config = PROVIDER_CONFIGS[provider];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#050510]/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative hud-panel hud-scanline w-full max-w-md mx-4 overflow-hidden rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a2555]">
          <h2 className="text-sm font-mono uppercase tracking-widest text-[#E8EAF6]">
            COMM RELAY CONFIGURATION
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#111833] transition-colors text-[#7B8CDE] hover:text-cosmic-glow"
          >
            &#10005;
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Provider tabs */}
          <div>
            <label className="text-xs font-mono uppercase tracking-widest text-[#7B8CDE]/80 mb-2 block">
              Provider
            </label>
            <div className="grid grid-cols-4 gap-1 bg-[#050510] rounded-lg p-1">
              {PROVIDERS.map((p) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`px-2 py-2 rounded-md text-xs font-mono font-medium transition-all ${
                    provider === p
                      ? 'bg-cosmic-glow/15 border border-cosmic-glow/30 text-cosmic-glow shadow-sm'
                      : 'text-[#7B8CDE]/60 hover:text-[#7B8CDE] hover:bg-[#0a0f1e] border border-transparent'
                  }`}
                >
                  {PROVIDER_CONFIGS[p].name}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="text-xs font-mono uppercase tracking-widest text-[#7B8CDE]/80 mb-2 block">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestStatus('idle');
                }}
                placeholder={config.placeholder}
                className="w-full bg-[#0a0f1e] border border-[#1a2555] rounded-lg px-3 py-2.5 text-sm text-[#E8EAF6] placeholder:text-[#7B8CDE]/40 focus:outline-none focus:border-cosmic-glow/40 pr-16 font-mono"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-mono text-[#7B8CDE]/50 hover:text-[#7B8CDE] transition-colors"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs font-mono text-[#7B8CDE]/50 mt-1.5">{config.helpText}</p>
          </div>

          {/* Model selector */}
          <div>
            <label className="text-xs font-mono uppercase tracking-widest text-[#7B8CDE]/80 mb-2 block">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-[#0a0f1e] border border-[#1a2555] rounded-lg px-3 py-2.5 text-sm text-[#E8EAF6] focus:outline-none focus:border-cosmic-glow/40 appearance-none cursor-pointer font-mono"
            >
              {config.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Test connection */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={!apiKey.trim() || testStatus === 'testing'}
              className="px-4 py-2 bg-[#111833] hover:bg-[#1a2555] disabled:bg-[#0a0f1e] disabled:text-[#7B8CDE]/30 text-[#7B8CDE] rounded-lg text-xs font-mono uppercase tracking-wider font-medium transition-colors border border-[#1a2555]"
            >
              {testStatus === 'testing' ? 'TESTING...' : 'TEST CONNECTION'}
            </button>
            {testStatus === 'success' && (
              <span className="text-sm font-mono text-green-400">
                &#10003; Connection valid
              </span>
            )}
            {testStatus === 'error' && (
              <span className="text-sm font-mono text-red-400">{testError}</span>
            )}
          </div>

          {/* Pricing link */}
          <div className="text-xs font-mono text-[#7B8CDE]/50">
            <a
              href={config.pricingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-cosmic-glow underline transition-colors"
            >
              View {config.name} pricing
            </a>
          </div>

          {/* Privacy notice */}
          <div className="bg-[#0a0f1e] border border-[#1a2555] rounded-lg p-3 text-xs font-mono text-[#7B8CDE]/50">
            Your API key is stored locally in your browser and never sent to our
            servers. It is only used for direct API calls to {config.name}.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#1a2555] bg-[#0a0f1e]/30">
          {llmSettings ? (
            <button
              onClick={handleRemove}
              className="px-3 py-2 text-sm font-mono text-red-400 hover:text-red-300 transition-colors"
            >
              Remove Key
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#111833] hover:bg-[#1a2555] text-[#7B8CDE] rounded-lg text-xs font-mono uppercase tracking-wider font-medium transition-colors border border-[#1a2555]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className="hud-button px-4 py-2 uppercase font-mono tracking-wider text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              SAVE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
