// Курс және кабинет: сервермен байланыс, сыртқы құралдар сілтемелері.
// Курс и кабинет: связь с сервером, ссылки на внешние инструменты.
import type { EvidenceFile } from './types'

/** Сыртқы құралдар. Vercel → Environment Variables арқылы өзгертуге болады; бос болса — батырма көрсетілмейді. */
export const TOOL_LINKS = {
  smartboard: (import.meta.env.VITE_SMARTBOARD_URL as string | undefined)?.trim() || '',
  prompt: (import.meta.env.VITE_USTAZ_PROMPT_URL as string | undefined)?.trim() || '/ustaz/',
  navigator: (import.meta.env.VITE_NAVIGATOR_URL as string | undefined)?.trim() || 'https://eduvisionkz.github.io/jasmamangakomek/',
}

export const cabinetLink = (personalCode: string) => `${window.location.origin}/k/${personalCode}`

export type WorkStatus = 'accepted' | 'needs_rework'

export interface CabinetModule {
  key: string; group_no: number; title_kk: string; title_ru: string; goal_kk: string; goal_ru: string
  status: WorkStatus | null; score: number | null; max_score: number | null; updated_at: string | null
}
export interface CabinetInfo {
  participant: { full_name: string; position: string | null; personal_code: string }
  school: { name: string; city: string | null; is_demo: boolean }
  group_no: 1 | 2 | 3 | null
  history: { campaign_kk: string; campaign_ru: string; finished_at: string; group_no: number; percent: number; result_token: string }[]
  modules: CabinetModule[]
  works: {
    module_key: string; title_kk: string; title_ru: string; group_no: number; status: WorkStatus
    score: number; max_score: number; link: string | null; files: { name: string }[]; updated_at: string
  }[]
}

export interface RubricItem { kk: string; ru: string }
export interface CourseFile extends EvidenceFile { sha256?: string }
export interface ModuleInfo {
  participant: { full_name: string; personal_code: string }
  group_no: number | null
  locked: boolean
  module: {
    key: string; group_no: number; title_kk: string; title_ru: string; goal_kk: string; goal_ru: string
    steps_kk: string; steps_ru: string; task_kk: string; task_ru: string; rubric: RubricItem[]; services: string[]
    video_url: string | null; prompt_url: string | null
    min_prompt_length: number; min_text_length: number; min_reflection: number; pass_percent: number
  }
  work: null | {
    status: WorkStatus; prompt_text: string | null; result_text: string | null; link: string | null
    files: CourseFile[]; reflection: string | null; checks: CheckInfo; ai_scores: number[] | null
    ai_feedback: string | null; score: number; max_score: number; attempts: number; updated_at: string
  }
}
export interface CheckInfo {
  reason?: 'duplicate' | 'low_score' | null
  ai?: string
  duplicate?: { files: boolean; text: boolean; link: boolean }
  low_confidence?: boolean
}
export interface SubmitResult {
  status: WorkStatus; reason: 'duplicate' | 'low_score' | null; checks: CheckInfo
  score: number; max_score: number; ai_scores: number[] | null; ai_feedback: string | null; attempts: number
}

export class CourseError extends Error {
  problems: string[]
  constructor(code: string, problems: string[] = []) { super(code); this.problems = problems }
}

/** /api/course шақыру / вызов /api/course */
export async function courseApi<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/course', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  let body: { error?: string; problems?: string[] } & Record<string, unknown> = {}
  try { body = await res.json() } catch { /* ignore */ }
  if (!res.ok) throw new CourseError(body.error || `HTTP ${res.status}`, body.problems || [])
  return body as T
}

/** Телефон фотосын 1920px-ке дейін кішірейту / уменьшить фото с телефона до 1920px */
export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch { return file }
}

/** Модульдің Ұстаз Промпт сілтемесі: «?item=…» болса, негізгі адреске қосамыз */
export function promptLink(moduleUrl: string | null | undefined): string {
  const base = TOOL_LINKS.prompt
  if (!moduleUrl) return base
  if (moduleUrl.startsWith('?')) return base ? base.replace(/[?#].*$/, '') + moduleUrl : ''
  return moduleUrl
}
