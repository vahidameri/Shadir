// The organisation, set by the program manager in the back office (Config tab, JSON lists):
//   org.titles — job titles (code, Persian, English)
//   org.teams  — teams a person can belong to
//   org.sides  — the department's units (lines, product managers, CRM & ops, data, …)
//   org.plans  — what a planning session can be for (demo, roadmap, sprint, …)
// The label maps used across the app are updated in place, so every page follows the settings.
import { ACCESS, JOB_TITLE, JOB_TITLE_OPTIONS, MEETING_SERIES, PLAN_PURPOSE, TEAM_NAMES } from './labels'
import { TRACK, TRACKS, SIDE_COLOR } from './tracks'
import type { T2 } from './i18n'

export interface OrgItem {
  id: string
  fa: string
  en: string
  color?: string
}
export type OrgKind = 'titles' | 'teams' | 'sides' | 'series' | 'access' | 'links' | 'plans'
export const ORG_KEYS: Record<OrgKind, string> = { titles: 'org.titles', teams: 'org.teams', sides: 'org.sides', series: 'org.series', access: 'org.access', links: 'org.links', plans: 'org.plans' }

const fromMap = (m: Record<string, T2>): OrgItem[] => Object.entries(m).map(([id, [fa, en]]) => ({ id, fa, en }))
const ORG_DEFAULT: Record<OrgKind, OrgItem[]> = {
  titles: fromMap(JOB_TITLE),
  teams: fromMap(TEAM_NAMES),
  series: fromMap(MEETING_SERIES),
  access: fromMap(ACCESS),
  plans: fromMap(PLAN_PURPOSE),
  links: [
    { id: 'stage', fa: 'محیط استیج', en: 'Staging' },
    { id: 'prod', fa: 'محیط اصلی (پروداکشن)', en: 'Production' },
    { id: 'figma', fa: 'فیگما', en: 'Figma' },
    { id: 'repo', fa: 'کد (گیت)', en: 'Code repository' },
    { id: 'docs', fa: 'مستندات / درایو', en: 'Docs / Drive' },
    { id: 'prd', fa: 'PRD', en: 'PRD' },
    { id: 'board', fa: 'بورد کار', en: 'Work board' },
    { id: 'mizito', fa: 'میزیتو', en: 'Mizito' },
    { id: 'chat', fa: 'گروه پیام‌رسان', en: 'Chat group' },
  ],
  sides: [
    { id: 'product', fa: 'مدیران محصول', en: 'Product managers', color: '#e8650a' },
    { id: 'crm_ops', fa: 'CRM و عملیات', en: 'CRM & operations', color: '#1f7a76' },
    { id: 'data', fa: 'داده', en: 'Data', color: '#5b5bd6' },
    { id: 'tech', fa: 'فنی', en: 'Tech', color: '#2f6f9f' },
  ],
}

let cur: Record<OrgKind, OrgItem[]> = { ...ORG_DEFAULT }
export const orgList = (k: OrgKind) => cur[k]

function parse(raw: string | undefined, def: OrgItem[]): OrgItem[] {
  try {
    const v = raw ? JSON.parse(raw) : null
    if (Array.isArray(v)) {
      const list = v
        .filter((x) => x && typeof x.id === 'string' && x.id.trim())
        .map((x) => ({ id: String(x.id).trim().toLowerCase(), fa: String(x.fa || x.en || x.id), en: String(x.en || x.fa || x.id), ...(x.color ? { color: String(x.color) } : {}) }))
      if (list.length) return list
    }
  } catch {}
  return def
}

const refill = (target: Record<string, T2>, items: OrgItem[]) => {
  for (const k of Object.keys(target)) delete target[k]
  for (const i of items) target[i.id] = [i.fa, i.en]
}

/** Planning sessions are part of the product, so a saved list always has them (1.11.0's demo/retro series are gone). */
function withPlanning(list: OrgItem[]): OrgItem[] {
  const kept = list.filter((x) => x.id !== 'demo' && x.id !== 'retro')
  return kept.some((x) => x.id === 'planning') ? kept : [...kept, ORG_DEFAULT.series.find((d) => d.id === 'planning')!]
}

export function applyOrg(get: (k: string) => string | undefined) {
  cur = {
    titles: parse(get(ORG_KEYS.titles), ORG_DEFAULT.titles),
    teams: parse(get(ORG_KEYS.teams), ORG_DEFAULT.teams),
    sides: parse(get(ORG_KEYS.sides), ORG_DEFAULT.sides),
    series: withPlanning(parse(get(ORG_KEYS.series), ORG_DEFAULT.series)),
    plans: parse(get(ORG_KEYS.plans), ORG_DEFAULT.plans),
    links: parse(get(ORG_KEYS.links), ORG_DEFAULT.links),
    // access levels are fixed (they decide what each person sees); only their names change
    access: ORG_DEFAULT.access.map((d) => parse(get(ORG_KEYS.access), ORG_DEFAULT.access).find((x) => x.id === d.id) || d),
  }
  refill(ACCESS, cur.access)
  refill(MEETING_SERIES as Record<string, T2>, cur.series)
  refill(PLAN_PURPOSE, cur.plans)
  refill(JOB_TITLE, cur.titles)
  refill(JOB_TITLE_OPTIONS, cur.titles.map((t) => ({ ...t, fa: `${t.fa} · ${t.id.toUpperCase()}`, en: t.en.toUpperCase() === t.id.toUpperCase() ? t.en : `${t.en} · ${t.id.toUpperCase()}` })))
  refill(TEAM_NAMES, cur.teams)
  refill(TRACK as Record<string, T2>, cur.sides)
  TRACKS.splice(0, TRACKS.length, ...cur.sides.map((s) => s.id))
  for (const k of Object.keys(SIDE_COLOR)) delete SIDE_COLOR[k]
  const palette = ['#e8650a', '#1f7a76', '#5b5bd6', '#2f6f9f', '#b45309', '#be185d', '#15803d', '#7c3aed']
  cur.sides.forEach((s, i) => (SIDE_COLOR[s.id] = s.color || palette[i % palette.length]))
}
