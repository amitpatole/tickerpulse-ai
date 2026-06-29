'use client';

import { useState } from 'react';
import {
  Key,
  CheckCircle,
  XCircle,
  Loader2,
  Shield,
  DollarSign,
  Database,
  Brain,
  Eye,
  EyeOff,
} from 'lucide-react';
import { clsx } from 'clsx';
import Header from '@/components/layout/Header';
import { useApi } from '@/hooks/useApi';
import { getAIProviders, getHealth } from '@/lib/api';
import type { AIProvider, HealthCheck } from '@/lib/types';

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'border-green-500/30 bg-green-500/5',
  anthropic: 'border-orange-500/30 bg-orange-500/5',
  deepseek: 'border-cyan-500/30 bg-cyan-500/5',
  google: 'border-blue-500/30 bg-blue-500/5',
  opencode: 'border-fuchsia-500/30 bg-fuchsia-500/5',
  openai_compatible: 'border-teal-500/30 bg-teal-500/5',
  xai: 'border-purple-500/30 bg-purple-500/5',
};

const PROVIDER_ICONS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  google: 'Google AI',
  opencode: 'OpenCode',
  openai_compatible: 'OpenAI-Compatible',
  xai: 'xAI',
};

function ProviderCard({ provider }: { provider: AIProvider }) {
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const colorClass = PROVIDER_COLORS[provider.name] || 'border-slate-500/30 bg-slate-500/5';

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/settings/ai-provider/${provider.name}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setTestResult(data.success ? 'success' : 'error');
    } catch {
      setTestResult('error');
    }
    setTesting(false);
  };

  return (
    <div className={clsx('rounded-xl border p-5', colorClass)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-700/50">
            <Brain className="h-5 w-5 text-slate-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              {provider.display_name || PROVIDER_ICONS[provider.name] || provider.name}
            </h3>
            <span
              className={clsx(
                'text-xs',
                provider.configured ? 'text-emerald-400' : 'text-slate-500'
              )}
            >
              {provider.configured ? 'Configured' : 'Not configured'}
            </span>
          </div>
        </div>

        {provider.configured ? (
          <CheckCircle className="h-5 w-5 text-emerald-400" />
        ) : (
          <XCircle className="h-5 w-5 text-slate-600" />
        )}
      </div>

      {/* API Key Input */}
      <div className="mt-4">
        <label className="mb-1.5 block text-xs text-slate-400">API Key</label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            defaultValue={provider.configured ? '••••••••••••••••••••' : ''}
            placeholder={`Enter ${provider.display_name || provider.name} API key`}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 pr-10 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Model Selector */}
      <div className="mt-3">
        <label className="mb-1.5 block text-xs text-slate-400">Default Model</label>
        <select
          defaultValue={provider.default_model || ''}
          className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        >
          {provider.models && provider.models.length > 0 ? (
            provider.models.map((model) => (
              <option key={model} value={model} className="bg-slate-800">
                {model}
              </option>
            ))
          ) : (
            <option value="" className="bg-slate-800">No models available</option>
          )}
        </select>
      </div>

      {/* Test Connection */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
        >
          {testing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Key className="h-3 w-3" />
          )}
          Test Connection
        </button>

        {testResult === 'success' && (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle className="h-3 w-3" /> Connected
          </span>
        )}
        {testResult === 'error' && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <XCircle className="h-3 w-3" /> Failed
          </span>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: providers, loading: providersLoading } = useApi<AIProvider[]>(getAIProviders, []);
  const { data: health } = useApi<HealthCheck>(getHealth, [], { refreshInterval: 30000 });

  const [framework, setFramework] = useState<'crewai' | 'openclaw'>('crewai');

  return (
    <div className="flex flex-col">
      <Header title="Settings" subtitle="Configure AI providers and system settings" />

      <div className="flex-1 p-6">
        {/* AI Providers */}
        <div className="mb-8">
          <h2 className="mb-4 text-sm font-semibold text-white">AI Providers</h2>

          {providersLoading && !providers && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-56 animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/30" />
              ))}
            </div>
          )}

          {providers && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {providers.map((provider) => (
                <ProviderCard key={provider.name} provider={provider} />
              ))}
            </div>
          )}

          {providers && providers.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/20 p-6 text-center">
              <p className="text-sm text-slate-500">No AI providers found. Check backend configuration.</p>
            </div>
          )}
        </div>

        {/* Agent Framework */}
        <div className="mb-8">
          <h2 className="mb-4 text-sm font-semibold text-white">Agent Framework</h2>
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-blue-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Framework Selection</p>
                <p className="text-xs text-slate-400">Choose the AI agent orchestration framework</p>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setFramework('crewai')}
                className={clsx(
                  'flex-1 rounded-lg border px-4 py-3 text-left transition-colors',
                  framework === 'crewai'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
                )}
              >
                <p className="text-sm font-medium text-white">CrewAI</p>
                <p className="mt-0.5 text-xs text-slate-400">Default framework - stable and well-tested</p>
              </button>
              <button
                onClick={() => setFramework('openclaw')}
                className={clsx(
                  'flex-1 rounded-lg border px-4 py-3 text-left transition-colors',
                  framework === 'openclaw'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
                )}
              >
                <p className="text-sm font-medium text-white">OpenClaw</p>
                <p className="mt-0.5 text-xs text-slate-400">Alternative framework - experimental</p>
              </button>
            </div>
          </div>
        </div>

        {/* Cost Budget */}
        <div className="mb-8">
          <h2 className="mb-4 text-sm font-semibold text-white">Cost Budget</h2>
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
            <div className="flex items-center gap-3 mb-4">
              <DollarSign className="h-5 w-5 text-amber-400" />
              <div>
                <p className="text-sm font-medium text-white">Budget Controls</p>
                <p className="text-xs text-slate-400">Set spending limits for AI agent operations</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Monthly Budget Limit</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                  <input
                    type="number"
                    defaultValue="50"
                    step="1"
                    min="0"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/50 py-2 pl-7 pr-3 text-sm text-white outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Daily Warning Threshold</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                  <input
                    type="number"
                    defaultValue="5"
                    step="0.50"
                    min="0"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/50 py-2 pl-7 pr-3 text-sm text-white outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>
            </div>

            <button className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
              Save Budget Settings
            </button>
          </div>
        </div>

        {/* Data Providers / System Health */}
        <div>
          <h2 className="mb-4 text-sm font-semibold text-white">System Status</h2>
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
            <div className="flex items-center gap-3 mb-4">
              <Database className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-white">Data Providers & Health</p>
                <p className="text-xs text-slate-400">Current status of system components</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-slate-900/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      'h-2 w-2 rounded-full',
                      health?.status === 'ok' ? 'bg-emerald-500' : 'bg-red-500'
                    )}
                  />
                  <span className="text-sm text-slate-300">Backend API</span>
                </div>
                <span className="text-xs text-slate-400">
                  {health ? (health.status === 'ok' ? 'Healthy' : 'Unhealthy') : 'Checking...'}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-900/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={clsx('h-2 w-2 rounded-full', health?.database === 'ok' ? 'bg-emerald-500' : health ? 'bg-red-500' : 'bg-slate-500')} />
                  <span className="text-sm text-slate-300">Database</span>
                </div>
                <span className="text-xs text-slate-400">
                  {health?.database === 'ok' ? 'Connected' : health ? 'Error' : 'Checking...'}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-900/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-sm text-slate-300">yfinance (Free)</span>
                </div>
                <span className="text-xs text-slate-400">Default Provider</span>
              </div>

              {health?.version && (
                <div className="mt-3 flex items-center justify-between border-t border-slate-700/50 pt-3">
                  <span className="text-xs text-slate-500">Version</span>
                  <span className="text-xs font-mono text-slate-400">{health.version}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
