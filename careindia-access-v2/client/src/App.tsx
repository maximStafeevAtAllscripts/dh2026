import { LakebasePage } from './pages/lakebase/LakebasePage';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col antialiased">
      <header className="border-b border-slate-200 bg-white/95 px-6 py-3 shadow-sm backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-700 shadow-sm shadow-teal-900/20 ring-1 ring-teal-600/20">
              <div className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-amber-400" />
              <div className="grid h-6 w-6 grid-cols-2 gap-1">
                <span className="rounded-sm bg-white" />
                <span className="rounded-sm bg-white/45" />
                <span className="rounded-sm bg-white/45" />
                <span className="rounded-sm bg-white" />
              </div>
            </div>
            <div className="leading-tight">
              <h1 className="flex items-baseline gap-1.5 text-xl font-black tracking-tight">
                <span className="text-slate-950">CareAccess</span>
                <span className="text-teal-700">India</span>
              </h1>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Regional planning console</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <LakebasePage />
      </main>
    </div>
  );
}
