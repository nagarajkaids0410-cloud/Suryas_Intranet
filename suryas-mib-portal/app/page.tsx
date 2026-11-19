import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-col px-6 py-16 lg:px-12">
        <header className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300">
              SURYA’S MiB ENTERPRISES
            </p>
            <h1 className="mt-2 text-2xl font-bold text-white">
              Enterprise Portal
            </h1>
          </div>
          <a
            href="/login"
            className="rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
          >
            Login
          </a>
        </header>

        <section className="grid gap-10 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-300">
              Operations • HR • Finance • Compliance
            </p>
            <h2 className="mt-6 text-4xl font-black leading-tight tracking-tight text-white md:text-6xl">
              One portal for every business workflow.
            </h2>
            <p className="mt-6 max-w-xl text-lg text-slate-300">
              Manage approvals, leave requests, project coordination, reports,
              claims, and internal operations from a single secure enterprise
              dashboard.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="/login"
                className="rounded-xl bg-sky-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-sky-400"
              >
                Access Portal
              </a>
              <a
                href="/register"
                className="rounded-xl border border-slate-700 bg-slate-900 px-6 py-3 font-semibold text-white transition hover:border-sky-400 hover:text-sky-300"
              >
                Request Access
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-sky-500/10">
            <div className="space-y-4">
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-sky-300">
                  Workflow
                </p>
                <p className="mt-2 text-2xl font-bold text-white">
                  Approval Engine
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                  <p className="text-sm text-slate-400">Leave</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    Multi-level approvals
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                  <p className="text-sm text-slate-400">Claims</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    Audit-ready processing
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                  <p className="text-sm text-slate-400">Projects</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    Approval tracking
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                  <p className="text-sm text-slate-400">Reports</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    Guide review enforced
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
