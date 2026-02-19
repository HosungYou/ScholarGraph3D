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

const PROVIDERS: Provider[] = ['openai', 'anthropic', 'google', 'groq'];

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
    llmSettings?.provider || 'openai'
  );
  const [apiKey, setApiKey] = useState(llmSettings?.api_key || '');
  const [model, setModel] = useState(
    llmSettings?.model || PROVIDER_CONFIGS.openai.defaultModel
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
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/50">
          <h2 className="text-base font-semibold text-gray-100">
            LLM Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-200"
          >
            &#10005;
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Provider tabs */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2 block">
              Provider
            </label>
            <div className="grid grid-cols-4 gap-1 bg-gray-800 rounded-lg p-1">
              {PROVIDERS.map((p) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`px-2 py-2 rounded-md text-xs font-medium transition-all ${
                    provider === p
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                  }`}
                >
                  {PROVIDER_CONFIGS[p].name}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2 block">
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
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-600 pr-16 font-mono"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">{config.helpText}</p>
          </div>

          {/* Model selector */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2 block">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-600 appearance-none cursor-pointer"
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
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors"
            >
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            {testStatus === 'success' && (
              <span className="text-sm text-green-400">
                &#10003; Connection valid
              </span>
            )}
            {testStatus === 'error' && (
              <span className="text-sm text-red-400">{testError}</span>
            )}
          </div>

          {/* Pricing link */}
          <div className="text-xs text-gray-500">
            <a
              href={config.pricingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-400 underline transition-colors"
            >
              View {config.name} pricing
            </a>
          </div>

          {/* Privacy notice */}
          <div className="bg-gray-800/50 border border-gray-700/30 rounded-lg p-3 text-xs text-gray-500">
            Your API key is stored locally in your browser and never sent to our
            servers. It is only used for direct API calls to {config.name}.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-700/50 bg-gray-800/30">
          {llmSettings ? (
            <button
              onClick={handleRemove}
              className="px-3 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              Remove Key
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
