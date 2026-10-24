import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { can } from './lib/access'
import Admin from './pages/Admin'
import { StoreProvider, useStore } from './lib/store'
import { GoogleProvider, useGoogle } from './lib/google'
import { AutomationProvider } from './lib/automations'
import { I18nProvider } from './lib/i18n'
import { EditorProvider } from './components/Editor'
import { Layout } from './components/Layout'
import MyDesk from './pages/MyDesk'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Tasks from './pages/Tasks'
import MizitoPage from './pages/Mizito'
import CartablePage from './pages/Cartable'
import Teams from './pages/Teams'
import TeamDetail from './pages/TeamDetail'
import Overview from './pages/Overview'
import OkrPage from './pages/Okr'
import Resources from './pages/Resources'
import Sprints from './pages/Sprints'
import SprintReport from './pages/SprintReport'
import Plan from './pages/Plan'
import Report from './pages/Report'
import FollowUps from './pages/FollowUps'
import Risks from './pages/Risks'
import CalendarPage from './pages/Calendar'
import Weekly from './pages/Weekly'
import Profile from './pages/Profile'
import { ComposerProvider } from './components/UpdateComposer'
import { Skeleton } from './components/ui'
import { Login } from './components/Login'
import { MadarLoader } from './components/Brand'
import { usePref } from './lib/prefs'

/** Department-wide pages are for the PgM and the CPTO; everyone lands on their own desk. */
function Only({ rule, children }: { rule: 'portfolio' | 'backoffice' | 'contracts' | 'mizito' | 'cartable'; children: React.ReactNode }) {
  const { access } = useStore()
  return can[rule](access) ? <>{children}</> : <Navigate to="/my" replace />
}
function Home() {
  return <Navigate to="/my" replace />
}

/** Hosted in Apps Script: sign-in happens by itself; show the brand while it does, or what went wrong. */
function HostedSplash({ error, retry }: { error: string; retry: () => void }) {
  const fa = (localStorage.getItem('madar.lang') || 'fa') === 'fa'
  const msg =
    error === 'API_URL'
      ? fa ? 'نصب کامل نشده: مدیر برنامه باید setApiUrl را در Apps Script اجرا کند.' : 'Setup incomplete: the program manager must run setApiUrl in Apps Script.'
      : error
  return (
    <div className="band fixed inset-0 z-[90] grid place-items-center px-6 text-center">
      <div className="relative z-10 max-w-md rise">
        {msg ? (
          <div className="display text-4xl text-white">{fa ? 'مدار' : 'Madar'}</div>
        ) : (
          <MadarLoader className="mx-auto h-36 w-36" />
        )}
        <div className={msg ? 'mt-2 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-band-sub' : 'madar-word mt-8 font-mono text-[0.6875rem] uppercase tracking-[0.35em] text-band-sub'}>Shad · Madar</div>
        {msg ? (
          <>
            <p className="mt-8 whitespace-pre-line [overflow-wrap:anywhere] text-sm leading-7 text-[#ff8a9a]" dir="auto">{msg}</p>
            <button className="btn mt-4 h-10 bg-white text-band" onClick={retry}>
              {fa ? 'تلاش دوباره' : 'Try again'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

function Gate({ children }: { children: React.ReactNode }) {
  const { loading, lastSync, mode, authed, error } = useStore()
  const g = useGoogle()
  const [entered, setEntered] = usePref<boolean>('madar.entered', false)
  // an email-link / code session goes straight in
  const inside = entered || g.session?.kind === 'otp'
  if (!inside || (mode === 'live' && !authed && (!g.hosted || (g.otp && !g.busy)))) return <Login onEnter={() => setEntered(true)} />
  if (g.hosted && (!g.session || !g.apiUrl || (error && !lastSync))) return <HostedSplash error={g.error || (g.session && !g.apiUrl ? 'API_URL' : '') || (!lastSync ? error : '')} retry={() => g.signIn('')} />
  if (mode === 'live' && loading && !lastSync && g.hosted) return <HostedSplash error="" retry={() => g.signIn('')} />
  if (mode === 'live' && loading && !lastSync)
    return (
      <div className="mx-auto max-w-[112rem] space-y-4 pt-8">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-5 w-1/2" />
        <div className="grid gap-4 pt-6 md:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    )
  return <>{children}</>
}

export default function App() {
  return (
    <GoogleProvider>
    <StoreProvider>
      <I18nProvider>
      <HashRouter>
        <AutomationProvider>
        <EditorProvider>
        <ComposerProvider>
          <Layout>
            <Gate>
              <Routes>
                <Route path="/" element={<Navigate to="/my" replace />} />
                <Route path="/my" element={<MyDesk />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/followups" element={<FollowUps />} />
                <Route path="/mizito" element={<Only rule="mizito"><MizitoPage /></Only>} />
                <Route path="/cartable" element={<Only rule="cartable"><CartablePage /></Only>} />
                <Route path="/meetings" element={<Weekly />} />
                <Route path="/weekly" element={<Navigate to="/meetings" replace />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/teams" element={<Teams />} />
                <Route path="/teams/:id" element={<TeamDetail />} />
                <Route path="/overview" element={<Overview />} />
                <Route path="/okr" element={<OkrPage />} />
                <Route path="/resources" element={<Resources />} />
                <Route path="/sprints" element={<Sprints />} />
                <Route path="/sprints/:id" element={<SprintReport />} />
                <Route path="/plan" element={<Plan />} />
                <Route path="/report" element={<Report />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/risks" element={<Only rule="portfolio"><Risks /></Only>} />
                <Route path="/people/:id" element={<Profile />} />
                <Route path="/me" element={<Profile />} />
                <Route path="/admin" element={<Only rule="backoffice"><Admin /></Only>} />
                <Route path="/settings" element={<Only rule="backoffice"><Admin initial="settings" /></Only>} />
                <Route path="*" element={<Home />} />
              </Routes>
            </Gate>
          </Layout>
        </ComposerProvider>
        </EditorProvider>
        </AutomationProvider>
      </HashRouter>
      </I18nProvider>
    </StoreProvider>
    </GoogleProvider>
  )
}
