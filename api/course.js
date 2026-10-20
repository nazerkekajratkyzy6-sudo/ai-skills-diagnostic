// Vercel Serverless Function: курс — файл жүктеу және жұмысты автоматты тексеру.
// Серверная функция Vercel: курс — загрузка файлов и автоматическая проверка работы.
//
// Тексеру үш қабатты / проверка в три слоя:
//   1) сервер: дәлел бар ма, промпт пен сипаттама толық па, файлдар шынымен жүктелген бе
//   2) қайталау: файл хэші (SHA-256), сипаттама мәтіні, сілтеме — басқа педагогта бар ма
//   3) ЖИ: модульдің рубрикасы бойынша 0–2 балл (OPENAI_API_KEY болса ғана)
// Күмән болса — «қайта пысықтау қажет», «өтпеді» емес. / При сомнении — «нужно доработать», а не «не сдал».
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const MAX_FILE = 10 * 1024 * 1024
const MAX_FILES = 3
const MAX_ATTEMPTS = 10
const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  pdf: 'application/pdf', txt: 'text/plain', html: 'text/html', htm: 'text/html',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
const URL_RE = /^https?:\/\/[^\s/$.?#]+\.[^\s]+$/i

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  const chunks = []
  for await (const c of req) chunks.push(c)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
}

const clip = (v, n) => String(v ?? '').trim().slice(0, n)
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex')
const normText = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const normLink = s => String(s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/+$/, '')

async function findParticipant(db, code) {
  const pc = String(code || '').toUpperCase().trim()
  if (!/^[A-Z0-9]{6,12}$/.test(pc)) return null
  const { data: pa } = await db.from('participants').select('id,school_id,full_name').eq('personal_code', pc).maybeSingle()
  if (!pa) return null
  const { data: sc } = await db.from('schools').select('id,status').eq('id', pa.school_id).maybeSingle()
  if (!sc || sc.status !== 'active') return null
  return pa
}

async function currentGroup(db, participantId) {
  const { data } = await db.from('submissions').select('group_no').eq('participant_id', participantId)
    .order('finished_at', { ascending: false }).limit(1).maybeSingle()
  return data?.group_no ?? null
}

// Жария HTML сілтеменің мәтінін алу (вайб-кодинг тренажерін ЖИ көруі үшін). Ішкі адрестерге бармаймыз.
async function fetchPublicHtml(link) {
  try {
    const u = new URL(link)
    if (!/^https?:$/.test(u.protocol)) return null
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/i.test(u.hostname)) return null
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const r = await fetch(u.toString(), { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'AISD-course-check' } })
    clearTimeout(timer)
    if (!r.ok || !/text\/html|text\/plain/i.test(r.headers.get('content-type') || '')) return null
    return (await r.text()).slice(0, 15000)
  } catch { return null }
}

async function aiReview({ module, lang, prompt, text, reflection, link, files, html, imageUrls }) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { skipped: 'no_key' }
  const L = lang === 'ru' ? 'ru' : 'kk'
  const criteria = (module.rubric || []).map((c, i) => `${i + 1}. ${c[L] || c.ru || c.kk}`)
  if (!criteria.length) return { skipped: 'no_rubric' }

  const system = [
    'You are a strict but fair evaluator of a teacher\'s practical assignment in an AI professional-development course in Kazakhstan.',
    'Score EACH criterion as 0 (not met), 1 (partly met) or 2 (fully met), using only the evidence provided.',
    'If you cannot see the material itself (e.g. a link or a document you cannot open), judge from the description, prompt and reflection and lower your confidence — never give 0 only because a file could not be opened.',
    'Never accuse the teacher of cheating. Feedback must be short (2–4 sentences), specific and supportive, and say what to improve.',
    `Write the feedback in ${L === 'ru' ? 'Russian' : 'Kazakh'}.`,
    'Return ONLY JSON: {"scores":[int,...],"feedback":"...","confidence":0.0-1.0}',
  ].join('\n')

  const userText = [
    `MODULE: ${module.title_ru} / ${module.title_kk}`,
    `TASK: ${module.task_ru}`,
    `CRITERIA:\n${criteria.join('\n')}`,
    `TEACHER PROMPT:\n${prompt.slice(0, 4000) || '(none)'}`,
    `TEACHER DESCRIPTION OF RESULT:\n${text.slice(0, 6000) || '(none)'}`,
    `REFLECTION:\n${reflection.slice(0, 2000) || '(none)'}`,
    `LINK: ${link || '(none)'}`,
    `FILES: ${files.map(f => f.name).join(', ') || '(none)'}`,
    html ? `CONTENT OF THE LINK (first part of the page source):\n${html}` : '',
  ].filter(Boolean).join('\n\n')

  const content = [{ type: 'text', text: userText }, ...imageUrls.slice(0, 3).map(url => ({ type: 'image_url', image_url: { url, detail: 'low' } }))]
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.COURSE_AI_MODEL || 'gpt-4o-mini',
        temperature: 0.2, max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content }],
      }),
    })
    if (!r.ok) return { error: `openai_${r.status}` }
    const data = await r.json()
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    const scores = criteria.map((_, i) => Math.max(0, Math.min(2, Math.round(Number(parsed.scores?.[i]) || 0))))
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0))
    return { scores, feedback: clip(parsed.feedback, 1500), confidence }
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 200) }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return send(res, 500, { error: 'server_not_configured' })
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const body = await readBody(req)

  try {
    const pa = await findParticipant(db, body.personal_code)
    if (!pa) return send(res, 403, { error: 'personal_code_not_found' })

    // ---------- Файл жүктеуге бір реттік сілтеме / одноразовая ссылка для загрузки ----------
    if (body.action === 'upload_url') {
      const ext = String(body.file_name || '').toLowerCase().split('.').pop()
      const mime = EXT_MIME[ext]
      if (!mime) return send(res, 400, { error: 'file_type' })
      if (!(Number(body.size) > 0 && Number(body.size) <= MAX_FILE)) return send(res, 400, { error: 'file_size' })
      const month = new Date().toISOString().slice(0, 7)
      const path = `${pa.school_id}/course/${month}/${crypto.randomUUID()}.${ext}`
      const { data, error } = await db.storage.from('evidence').createSignedUploadUrl(path)
      if (error) throw error
      return send(res, 200, { path: data.path, token: data.token, content_type: mime })
    }

    // ---------- Жұмысты тапсыру және тексеру / сдача и проверка работы ----------
    if (body.action === 'submit') {
      const { data: module } = await db.from('course_modules').select('*')
        .eq('key', String(body.module_key || '').toLowerCase().trim()).eq('enabled', true).maybeSingle()
      if (!module) return send(res, 404, { error: 'module_not_found' })
      const group = await currentGroup(db, pa.id)
      if (group == null) return send(res, 403, { error: 'no_diagnostic' })
      if (group !== module.group_no) return send(res, 403, { error: 'module_locked' })

      const { data: prev } = await db.from('course_works').select('id,attempts,created_at')
        .eq('participant_id', pa.id).eq('module_id', module.id).maybeSingle()
      if (prev && prev.attempts >= MAX_ATTEMPTS) return send(res, 429, { error: 'too_many_attempts' })

      const lang = body.language === 'ru' ? 'ru' : 'kk'
      const prompt = clip(body.prompt_text, 10000)
      const text = clip(body.result_text, 20000)
      const reflection = clip(body.reflection, 3000)
      const link = clip(body.link, 2000)

      // ===== 1-қабат: сервер тексеруі / слой 1: серверная проверка =====
      const files = []
      const fileHashes = []
      const imageUrls = []
      for (const f of (Array.isArray(body.files) ? body.files : []).slice(0, MAX_FILES)) {
        const path = String(f?.path || '')
        if (!path.startsWith(`${pa.school_id}/course/`) || path.includes('..')) continue
        const { data: blob, error } = await db.storage.from('evidence').download(path)
        if (error || !blob) continue
        const buf = Buffer.from(await blob.arrayBuffer())
        const hash = sha256(buf)
        const type = clip(f.type, 120)
        files.push({ path, name: clip(f.name, 200) || 'file', size: buf.length, type, sha256: hash })
        fileHashes.push(hash)
        if (/^image\/(jpeg|png|webp|gif)$/.test(type)) {
          const { data: signed } = await db.storage.from('evidence').createSignedUrl(path, 600)
          if (signed?.signedUrl) imageUrls.push(signed.signedUrl)
        }
      }
      const problems = []
      const hasEvidence = URL_RE.test(link) || files.length > 0
      if (!hasEvidence) problems.push('evidence')
      if (prompt.length < module.min_prompt_length) problems.push('prompt')
      if (text.length < module.min_text_length) problems.push('description')
      if (reflection.length < module.min_reflection) problems.push('reflection')
      if (problems.length) return send(res, 400, { error: 'incomplete', problems })

      // ===== 2-қабат: қайталауды тексеру / слой 2: проверка повторов =====
      // Тек БҰРЫН тапсырылған басқа жұмыстармен салыстырамыз — көшірген адам түпнұсқа авторға зиян келтірмейді.
      // Сравниваем только с работами, сданными РАНЬШЕ — копирующий не навредит автору оригинала.
      const since = prev?.created_at || new Date().toISOString()
      const textHash = text.length >= 80 ? sha256(normText(text)) : null
      const linkNorm = URL_RE.test(link) ? normLink(link) : null
      const dup = { files: false, text: false, link: false }
      if (fileHashes.length) {
        const { data } = await db.from('course_works').select('id').neq('participant_id', pa.id).lt('created_at', since).overlaps('file_hashes', fileHashes).limit(1)
        dup.files = Boolean(data?.length)
      }
      if (textHash) {
        const { data } = await db.from('course_works').select('id').neq('participant_id', pa.id).lt('created_at', since).eq('text_hash', textHash).limit(1)
        dup.text = Boolean(data?.length)
      }
      if (linkNorm) {
        const { data } = await db.from('course_works').select('id').neq('participant_id', pa.id).lt('created_at', since).eq('link_norm', linkNorm).limit(1)
        dup.link = Boolean(data?.length)
      }
      const duplicate = dup.files || dup.text || dup.link

      // ===== 3-қабат: ЖИ рубрика бойынша / слой 3: ИИ по рубрике =====
      const html = linkNorm ? await fetchPublicHtml(link) : null
      const ai = await aiReview({ module, lang, prompt, text, reflection, link: linkNorm ? link : '', files, html, imageUrls })
      const maxScore = (module.rubric || []).length * 2
      const aiOk = Array.isArray(ai.scores)
      const score = aiOk ? ai.scores.reduce((a, b) => a + b, 0) : 0
      const passNeed = Math.ceil(maxScore * (module.pass_percent / 100))

      let status = 'accepted'
      let reason = null
      if (duplicate) { status = 'needs_rework'; reason = 'duplicate' }
      else if (aiOk && score < passNeed) { status = 'needs_rework'; reason = 'low_score' }

      const checks = {
        layer1: 'ok', duplicate: dup, reason,
        ai: aiOk ? 'ok' : (ai.skipped || ai.error || 'unavailable'),
        low_confidence: aiOk && ai.confidence < 0.75,
        pass_need: passNeed, link_read: Boolean(html), images_seen: imageUrls.length,
      }
      const row = {
        participant_id: pa.id, school_id: pa.school_id, module_id: module.id, module_key: module.key,
        status, language: lang, prompt_text: prompt, result_text: text, link: link || null, files, reflection,
        checks, ai_scores: aiOk ? ai.scores : null, ai_feedback: aiOk ? ai.feedback : null,
        ai_confidence: aiOk ? ai.confidence : null, score, max_score: aiOk ? maxScore : 0,
        duplicate, file_hashes: fileHashes, text_hash: textHash, link_norm: linkNorm,
        attempts: (prev?.attempts || 0) + 1, updated_at: new Date().toISOString(),
      }
      const { error } = prev
        ? await db.from('course_works').update(row).eq('id', prev.id)
        : await db.from('course_works').insert(row)
      if (error) throw error

      return send(res, 200, {
        status, reason, checks, score, max_score: row.max_score,
        ai_scores: row.ai_scores, ai_feedback: row.ai_feedback, attempts: row.attempts,
      })
    }

    return send(res, 400, { error: 'unknown_action' })
  } catch (e) {
    const msg = e?.message || String(e)
    console.error('[api/course]', body.action, msg)
    return send(res, 500, { error: msg })
  }
}
