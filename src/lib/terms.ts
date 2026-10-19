// The glossary: the words Atlas uses for its main ideas. The program manager renames any of them
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
  { id: 'company', word: ['ACG', 'ACG'], hint: ['نام کل مجموعه (نمای کلی، جلسه‌ی هفتگی اصلی)', 'The whole company (overview, main weekly)'] },
  { id: 'project', word: ['پروژه', 'Project'], hint: ['هر کار مستقل با کارفرما، تیم و ددلاین', 'An engagement with a client, team and deadline'] },
  { id: 'task', word: ['تسک', 'Task'], hint: ['کوچک‌ترین واحد کار', 'The smallest piece of work'] },
  { id: 'milestone', word: ['مایلستون', 'Milestone'], hint: ['نقطه‌ی کلیدی پروژه که پیشرفت با آن سنجیده می‌شود', 'A key point that measures progress'] },
  { id: 'sprint', word: ['اسپرینت', 'Sprint'], hint: ['دوره‌ی کاری کوتاه (معمولاً دو هفته)', 'A short work cycle (usually two weeks)'] },
  { id: 'backlog', word: ['بک‌لاگ', 'Backlog'], hint: ['کارهایی که هنوز در اسپرینتی نیستند', 'Work not yet in a sprint'] },
  { id: 'scope', word: ['محدوده‌ی کار', 'Scope'], hint: ['آنچه داخل یا خارج قرارداد است', 'What is in or out of the agreement'] },
  { id: 'deliverable', word: ['خروجی', 'Deliverable'], hint: ['چیزی که در تاریخی مشخص تحویل می‌شود', 'Something handed over on a date'] },
  { id: 'followup', word: ['پیگیری', 'Follow-up'], hint: ['موضوعی که از کسی دنبال می‌کنید', 'Something you chase with someone'] },
  { id: 'risk', word: ['ریسک', 'Risk'], hint: ['اتفاقی که ممکن است برنامه را به هم بزند', 'Something that could derail the plan'] },
  { id: 'points', word: ['امتیاز', 'Point'], hint: ['اندازه‌ی کار (استوری‌پوینت)', 'Size of work (story points)'] },
  { id: 'deadline', word: ['ددلاین', 'Deadline'], hint: ['آخرین مهلت', 'The final due date'] },
  { id: 'unit', word: ['واحد', 'Unit'], hint: ['پروداکت، دیزاین، تک — که کار را به هم تحویل می‌دهند', 'Product, design, tech — they hand work to each other'] },
  { id: 'lookout', word: ['دیده‌بان', 'Lookout'], hint: ['داشبورد مدیرعامل، مدیر برنامه و هدها', 'The leadership dashboard'] },
  { id: 'update', word: ['گزارش هفتگی', 'Weekly update'], hint: ['گزارش وضعیت هر پروژه در هفته', 'Each project’s status report for the week'] },
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
