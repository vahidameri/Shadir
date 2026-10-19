// The glossary: the words Madar uses for its main ideas. The program manager renames any of them
// in the back office (Config "terms", JSON {id: {fa, en}}); every label follows (see i18n setTermSwaps).
import { setTermSwaps, type T2 } from './i18n'

export interface Term {
  id: string
  /** the word as written in the interface (Persian, English) */
  word: T2
  /** what it means, shown in the settings */
  hint: T2
}

export const TERMS: Term[] = [
  { id: 'company', word: ['CPTO', 'CPTO'], hint: ['نام کل دپارتمان (نمای کلی، جلسه‌ی هفتگی اصلی)', 'The whole department (overview, main weekly)'] },
  { id: 'project', word: ['پروژه', 'Project'], hint: ['پروژه یا اینیشیتیو که وظیفه‌ها به آن وصل می‌شوند', 'A project or initiative tasks belong to'] },
  { id: 'task', word: ['تسک', 'Task'], hint: ['کوچک‌ترین واحد کار', 'The smallest piece of work'] },
  { id: 'followup', word: ['پیگیری', 'Follow-up'], hint: ['موضوعی که از کسی دنبال می‌کنید', 'Something you chase with someone'] },
  { id: 'risk', word: ['ریسک', 'Risk'], hint: ['اتفاقی که ممکن است برنامه را به هم بزند', 'Something that could derail the plan'] },
  { id: 'deadline', word: ['ددلاین', 'Deadline'], hint: ['آخرین مهلت', 'The final due date'] },
  { id: 'unit', word: ['تیم', 'Team'], hint: ['تیم یک تسک یا فرد (لاین‌ها، مدیران محصول، CRM و عملیات، داده و…)', 'A task’s or person’s team (lines, product managers, CRM & ops, data, …)'] },
]

export const TERMS_KEY = 'terms'
export type TermOverrides = Record<string, { fa?: string; en?: string }>
let current: TermOverrides = {}
export const termOverrides = () => current

export function applyTerms(raw: string | undefined) {
  try {
    current = raw ? JSON.parse(raw) || {} : {}
  } catch {
    current = {}
  }
  const fa: [string, string][] = []
  const en: [string, string][] = []
  // longer words first, so "گزارش هفتگی" is swapped before shorter words inside it
  for (const t of [...TERMS].sort((a, b) => b.word[0].length - a.word[0].length)) {
    const o = current[t.id]
    if (o?.fa?.trim()) fa.push([t.word[0], o.fa.trim()])
    if (o?.en?.trim()) en.push([t.word[1], o.en.trim()])
  }
  setTermSwaps(fa, en)
}
