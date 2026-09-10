import {
  Activity,
  AudioWaveform,
  Bot,
  Cloud,
  FileAudio,
  Gauge,
  Code2,
  Globe2,
  LockKeyhole,
  MessageCircle,
  Play,
  Radio,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

const stats = [
  ['24/7', 'Railway runtime'],
  ['1-5', 'files per batch'],
  ['2x', 'speed control'],
  ['OGG', 'Roblox-ready output'],
];

const features = [
  {
    icon: FileAudio,
    title: 'Upload from anywhere',
    body: 'Use files, direct public audio links, or YouTube. If YouTube blocks cloud servers, the bot guides users to safer fallback paths.',
  },
  {
    icon: Settings2,
    title: 'Server-owned setup',
    body: 'Each Discord server can store its own Roblox Open Cloud API key, creator type, and creator ID without mixing communities.',
  },
  {
    icon: Gauge,
    title: 'Speed without chaos',
    body: 'Choose 1x, 1.5x, or 2x. The bot keeps pitch stable while preparing the audio for Roblox limits.',
  },
  {
    icon: ShieldCheck,
    title: 'Rights-first workflow',
    body: 'Every upload asks for ownership or license confirmation. It helps teams avoid accidental misuse and keeps moderation expectations clear.',
  },
];

const flow = [
  ['01', 'Open /menu', 'A clean Discord menu shows every upload path.'],
  ['02', 'Confirm source', 'Upload a file, paste a link, or submit a public YouTube URL.'],
  ['03', 'Auto process', 'FFmpeg edits, normalizes, converts, and checks Roblox limits.'],
  ['04', 'Receive IDs', 'The bot returns Asset IDs plus JSON and Lua exports.'],
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#040713] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-18rem] h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-10rem] h-[35rem] w-[35rem] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(78,221,255,0.14),transparent_38%),linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:auto,64px_64px,64px_64px]" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
        <a href="#top" className="flex items-center gap-3" aria-label="Codex Eclipse Audio home">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/30 bg-white/10 shadow-[0_0_40px_rgba(67,220,255,0.25)]">
            <AudioWaveform className="h-5 w-5 text-cyan-200" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-[0.28em] text-cyan-100">CODEX ECLIPSE</span>
            <span className="block text-xs text-white/55">Roblox Audio Converter</span>
          </span>
        </a>
        <nav className="hidden items-center gap-7 text-sm text-white/70 md:flex">
          <a className="transition hover:text-white" href="#features">Features</a>
          <a className="transition hover:text-white" href="#workflow">Workflow</a>
          <a className="transition hover:text-white" href="#deploy">Deploy</a>
        </nav>
        <a href="#deploy" className="rounded-full border border-white/15 bg-white px-5 py-2.5 text-sm font-semibold text-[#050714] shadow-[0_0_40px_rgba(255,255,255,0.18)] transition hover:scale-[1.02]">
          Launch 24/7
        </a>
      </header>

      <section id="top" className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:pb-28 lg:pt-16">
        <div>
          <div className="mb-7 inline-flex items-center gap-3 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100">
            <Sparkles className="h-4 w-4" />
            Discord audio uploads, polished for Roblox creators
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] tracking-[-0.06em] text-white sm:text-7xl lg:text-8xl">
            Convert audio into Roblox assets at eclipse speed.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/68 sm:text-xl">
            A premium Discord bot for creator teams: upload files, paste public audio links, process YouTube when allowed, convert to Roblox-ready OGG, and return clean Asset IDs.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="#workflow" className="group inline-flex items-center justify-center gap-3 rounded-full bg-cyan-300 px-6 py-4 font-semibold text-slate-950 shadow-[0_0_52px_rgba(103,232,249,0.35)] transition hover:bg-white">
              See the flow
              <Play className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </a>
            <a href="#features" className="inline-flex items-center justify-center gap-3 rounded-full border border-white/15 bg-white/8 px-6 py-4 font-semibold text-white backdrop-blur transition hover:bg-white/14">
              <Bot className="h-4 w-4" />
              Explore features
            </a>
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[560px]">
          <div className="absolute inset-6 rounded-full border border-cyan-200/15 bg-[radial-gradient(circle,rgba(255,255,255,0.16),rgba(17,24,39,0.03)_44%,rgba(56,189,248,0.12)_70%,transparent_72%)] shadow-[inset_0_0_70px_rgba(125,249,255,0.18),0_0_120px_rgba(45,212,191,0.18)]" />
          <div className="absolute inset-20 rounded-full border border-fuchsia-300/20 bg-[#080c1f] shadow-[0_0_80px_rgba(217,70,239,0.18)]" />
          <div className="absolute left-1/2 top-1/2 grid h-44 w-44 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-white/10 backdrop-blur-xl">
            <div className="grid h-28 w-28 place-items-center rounded-full bg-cyan-300 text-slate-950 shadow-[0_0_70px_rgba(103,232,249,0.5)]">
              <Radio className="h-11 w-11" />
            </div>
          </div>
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <span
              key={item}
              className="absolute left-1/2 top-1/2 h-3 rounded-full bg-cyan-200/80 shadow-[0_0_24px_rgba(103,232,249,0.8)]"
              style={{
                width: `${74 + item * 18}px`,
                transform: `translate(-50%, -50%) rotate(${item * 30}deg) translateX(${132 + item * 8}px)`,
              }}
            />
          ))}
          <div className="absolute left-4 top-16 rounded-3xl border border-white/12 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2 text-sm text-white/70">
              <Cloud className="h-4 w-4 text-cyan-200" />
              Runtime
            </div>
            <p className="text-2xl font-semibold">24/7</p>
            <p className="text-xs text-white/50">Railway ready</p>
          </div>
          <div className="absolute bottom-12 right-0 rounded-3xl border border-white/12 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2 text-sm text-white/70">
              <LockKeyhole className="h-4 w-4 text-fuchsia-200" />
              API keys
            </div>
            <p className="text-2xl font-semibold">Encrypted</p>
            <p className="text-xs text-white/50">per server setup</p>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-y border-white/10 bg-white/[0.035]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-5 sm:grid-cols-4 sm:px-8">
          {stats.map(([value, label]) => (
            <div key={label} className="py-8 sm:py-10">
              <p className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">{value}</p>
              <p className="mt-2 text-sm text-white/50">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200">Creator stack</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
              Built for Discord groups that upload without confusion.
            </h2>
          </div>
          <p className="max-w-md text-base leading-7 text-white/58">
            No messy command maze. The bot gives teams a clean path from source audio to Roblox Asset ID.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {features.map((feature) => (
            <article key={feature.title} className="group rounded-[2rem] border border-white/10 bg-white/[0.055] p-7 transition hover:-translate-y-1 hover:border-cyan-200/35 hover:bg-cyan-200/[0.07]">
              <div className="mb-8 grid h-13 w-13 place-items-center rounded-2xl bg-white/10 text-cyan-200">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-semibold tracking-[-0.03em]">{feature.title}</h3>
              <p className="mt-3 leading-7 text-white/58">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="workflow" className="relative z-10 mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <div className="rounded-[2.5rem] border border-cyan-200/15 bg-[linear-gradient(135deg,rgba(103,232,249,0.12),rgba(217,70,239,0.08),rgba(255,255,255,0.035))] p-6 shadow-[0_0_120px_rgba(6,182,212,0.12)] sm:p-10">
          <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-fuchsia-200">Workflow</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
                From Discord menu to Roblox ID.
              </h2>
              <p className="mt-6 leading-7 text-white/60">
                Users get the easy interface. Developers keep control of creator IDs, API keys, upload targets, and server boundaries.
              </p>
            </div>
            <div className="grid gap-3">
              {flow.map(([step, title, body]) => (
                <div key={step} className="grid gap-5 rounded-3xl border border-white/10 bg-black/20 p-5 sm:grid-cols-[72px_1fr]">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-300/15 font-mono text-cyan-100">{step}</span>
                  <span>
                    <span className="block text-xl font-semibold">{title}</span>
                    <span className="mt-1 block text-white/55">{body}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="deploy" className="relative z-10 mx-auto max-w-7xl px-5 pb-28 pt-12 sm:px-8">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.055] p-8 sm:p-10">
            <Rocket className="mb-8 h-10 w-10 text-cyan-200" />
            <h2 className="text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
              Ready for a bot that feels expensive.
            </h2>
            <p className="mt-6 max-w-2xl leading-7 text-white/60">
              Codex Eclipse Audio is designed for communities that want Roblox uploads to feel clean, guided, and always online.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-6 py-4 font-semibold text-slate-950" href="https://github.com/Codex857/roblox-audio-converter-bot">
                <Code2 className="h-4 w-4" />
                View GitHub
              </a>
              <a className="inline-flex items-center justify-center gap-3 rounded-full border border-white/15 bg-white/8 px-6 py-4 font-semibold text-white" href="https://roblox-audio-converter-bot-production-f79c.up.railway.app/health">
                <Activity className="h-4 w-4" />
                Live status
              </a>
            </div>
          </div>
          <div className="rounded-[2.5rem] border border-white/10 bg-black/25 p-8 sm:p-10">
            <div className="mb-7 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-fuchsia-300/15 text-fuchsia-100">
                <Globe2 className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">24/7 deployment notes</p>
                <p className="text-sm text-white/45">Built for Railway + GitHub workflow</p>
              </div>
            </div>
            <ul className="space-y-4 text-white/60">
              <li className="flex gap-3"><Zap className="mt-1 h-4 w-4 shrink-0 text-cyan-200" /> Auto refresh and retry when YouTube blocks the first request.</li>
              <li className="flex gap-3"><Zap className="mt-1 h-4 w-4 shrink-0 text-cyan-200" /> Fallback buttons keep users moving without restarting the bot.</li>
              <li className="flex gap-3"><Zap className="mt-1 h-4 w-4 shrink-0 text-cyan-200" /> Default Roblox asset description: by codex eclipse.</li>
              <li className="flex gap-3"><MessageCircle className="mt-1 h-4 w-4 shrink-0 text-cyan-200" /> Discord-first UX with private, guided replies.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
