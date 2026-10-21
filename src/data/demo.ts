// Starting data for the demo (and a fresh sheet): only the two people who sign in — the program
// manager and the CPTO. Units, people, projects and tasks are entered in the back office or imported.
import type { DB, Member } from '../lib/types'
import { locale } from '../lib/i18n'
import { teamCodes } from '../lib/labels'

const x = (fa: string, en: string) => (locale.lang === 'en' ? en : fa)

export const demoMe = () => x('وحید عامری', 'Vahid Ameri')

const PEOPLE: [string, string, string, string, Member['track'], Member['access']][] = [
  ['m1', 'وحید عامری', 'Vahid Ameri', 'pgm', '', 'super'],
  ['m2', 'جلیل علیزاده', 'Jalil Alizadeh', 'cpto', '', 'exec'],
]

export function buildDemo(): DB {
  const Team: Member[] = PEOPLE.map(([id, fa, en, role, track, access]) => ({
    id, name: x(fa, en), name_en: '', role, email: '', team: teamCodes('', role, track || '').join(','),
    track, capacity: 100, photo: '', tasks_private: '', phone: '', access, active: 'true',
  }))
  return {
    Projects: [], Team, Scope: [], Milestones: [], Sprints: [], Tasks: [], FollowUps: [], Risks: [], Allocations: [], Updates: [], Comments: [],
    Deliverables: [], Meetings: [], Files: [], Config: [], Contracts: [], Handoffs: [], Deliveries: [], History: [], Contacts: [], Mizito: [], MizitoMentions: [], Objectives: [], KeyResults: [], Kpis: [], Checkins: [],
  }
}
