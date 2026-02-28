'use client';

import Header from '@/components/layout/Header';
import { AlertSoundSettings } from '@/components/settings/AlertSoundSettings';
import { AlertList } from '@/components/alerts/AlertList';

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header title="Settings" subtitle="Configure application preferences" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Sound & Alerts */}
        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Sound &amp; Alerts</h2>
            <p className="mt-1 text-sm text-slate-400">
              Configure how price alerts sound and behave
            </p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
            <AlertSoundSettings />
          </div>
        </section>

        {/* Price Alerts */}
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Price Alerts</h2>
            <p className="mt-1 text-sm text-slate-400">
              Manage active alerts and per-alert sound overrides
            </p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40">
            <AlertList />
          </div>
        </section>

      </main>
    </div>
  );
}
