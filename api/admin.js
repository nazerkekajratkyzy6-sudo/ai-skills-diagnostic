// Vercel Serverless Function: әкімші аккаунттарын басқару (тек серверде, service_role кілтімен).
// Серверная функция Vercel: управление аккаунтами администраторов (service_role ключ только на сервере).
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const INTERNAL_DOMAIN = 'users.aisd.local'
const LOGIN_RE = /^[a-z0-9._-]{3,40}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

function normalizeLogin(login) {
  const v = String(login || '').trim().toLowerCase()
  if (v.includes('@')) return EMAIL_RE.test(v) ? { login: v, email: v } : null
  return LOGIN_RE.test(v) ? { login: v, email: `${v}@${INTERNAL_DOMAIN}` } : null
}

// Педагог жүктей алатын файл түрлері (Supabase бакетінде де осы тізім)
const MAX_FILE = 10 * 1024 * 1024
const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  pdf: 'application/pdf', txt: 'text/plain', html: 'text/html', htm: 'text/html',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

function validPassword(p) { return typeof p === 'string' && p.length >= 8 && p.length <= 72 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' })

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return send(res, 500, { error: 'server_not_configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const body = await readBody(req)
  const action = body.action

  try {
    // ---------- Бірінші SUPER ADMIN (кіру талап етілмейді) ----------
    if (action === 'setup_status') {
      const { count, error } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'super_admin')
      if (error) throw error
      return send(res, 200, { needed: (count || 0) === 0, secret_required: Boolean(process.env.SETUP_SECRET) })
    }

    if (action === 'bootstrap') {
      const { count, error } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'super_admin')
      if (error) throw error
      if ((count || 0) > 0) return send(res, 409, { error: 'setup_exists' })
      if (process.env.SETUP_SECRET && body.secret !== process.env.SETUP_SECRET) return send(res, 403, { error: 'setup_bad_secret' })
      const n = normalizeLogin(body.login)
      if (!n) return send(res, 400, { error: 'err_login_format' })
      if (!validPassword(body.password)) return send(res, 400, { error: 'err_password_short' })
      const created = await createUser(db, n, body.password, 'super_admin', null, body.full_name)
      return send(res, 200, created)
    }

    // ---------- Педагогтің файл-дәлелін жүктеуге бір реттік сілтеме ----------
    if (action === 'upload_url') {
      const ext = String(body.file_name || '').toLowerCase().split('.').pop()
      const mime = EXT_MIME[ext]
      if (!mime) return send(res, 400, { error: 'file_type' })
      if (!(Number(body.size) > 0 && Number(body.size) <= MAX_FILE)) return send(res, 400, { error: 'file_size' })
      let school = null
      if (body.personal_code) {
        const { data: pa } = await db.from('participants').select('school_id').eq('personal_code', String(body.personal_code).toUpperCase().trim()).maybeSingle()
        if (pa) school = (await db.from('schools').select('id,status,diagnostic_open').eq('id', pa.school_id).maybeSingle()).data
      } else {
        school = (await db.from('schools').select('id,status,diagnostic_open').eq('code', String(body.school_code || '').toUpperCase().trim()).maybeSingle()).data
      }
      if (!school || school.status !== 'active' || !school.diagnostic_open) return send(res, 403, { error: 'school_not_found' })
      const { data: camp } = await db.from('campaigns').select('allow_files').eq('code', String(body.campaign_code || '').toUpperCase()).eq('status', 'published').maybeSingle()
      if (!camp || !camp.allow_files) return send(res, 403, { error: 'files_disabled' })
      const month = new Date().toISOString().slice(0, 7)
      const path = `${school.id}/${month}/${crypto.randomUUID()}.${ext}`
      const { data, error } = await db.storage.from('evidence').createSignedUploadUrl(path)
      if (error) throw error
      return send(res, 200, { path: data.path, token: data.token, content_type: mime })
    }

    // ---------- Қалған әрекеттер тек SUPER ADMIN үшін ----------
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return send(res, 401, { error: 'unauthorized' })
    const { data: userData, error: userErr } = await db.auth.getUser(token)
    if (userErr || !userData?.user) return send(res, 401, { error: 'unauthorized' })
    const { data: me } = await db.from('profiles').select('role,is_active').eq('id', userData.user.id).maybeSingle()
    if (!me || me.role !== 'super_admin' || !me.is_active) return send(res, 403, { error: 'forbidden' })

    if (action === 'create_admin') {
      const role = body.role === 'super_admin' ? 'super_admin' : 'school_admin'
      const n = normalizeLogin(body.login)
      if (!n) return send(res, 400, { error: 'err_login_format' })
      if (!validPassword(body.password)) return send(res, 400, { error: 'err_password_short' })
      let schoolId = null
      if (role === 'school_admin') {
        const { data: school } = await db.from('schools').select('id').eq('id', body.school_id).maybeSingle()
        if (!school) return send(res, 400, { error: 'school_not_found' })
        schoolId = school.id
      }
      const created = await createUser(db, n, body.password, role, schoolId, body.full_name)
      return send(res, 200, created)
    }

    if (action === 'set_password') {
      if (!validPassword(body.password)) return send(res, 400, { error: 'err_password_short' })
      const { error } = await db.auth.admin.updateUserById(body.user_id, { password: body.password })
      if (error) throw error
      return send(res, 200, { ok: true })
    }

    if (action === 'set_active') {
      if (body.user_id === userData.user.id) return send(res, 400, { error: 'cannot_disable_self' })
      const active = Boolean(body.active)
      const { error } = await db.auth.admin.updateUserById(body.user_id, { ban_duration: active ? 'none' : '876000h' })
      if (error) throw error
      const { error: e2 } = await db.from('profiles').update({ is_active: active }).eq('id', body.user_id)
      if (e2) throw e2
      return send(res, 200, { ok: true })
    }

    if (action === 'delete_admin') {
      if (body.user_id === userData.user.id) return send(res, 400, { error: 'cannot_delete_self' })
      const { error } = await db.auth.admin.deleteUser(body.user_id)
      if (error) throw error
      return send(res, 200, { ok: true })
    }

    return send(res, 400, { error: 'unknown_action' })
  } catch (e) {
    const msg = e?.message || String(e)
    if (/already (been )?registered|already exists|duplicate/i.test(msg)) return send(res, 409, { error: 'err_login_exists' })
    console.error('[api/admin]', action, msg)
    return send(res, 500, { error: msg })
  }
}

async function createUser(db, n, password, role, schoolId, fullName) {
  const { data, error } = await db.auth.admin.createUser({
    email: n.email, password, email_confirm: true,
    user_metadata: { full_name: fullName || null, login: n.login },
  })
  if (error) throw error
  const { error: pErr } = await db.from('profiles').insert({
    id: data.user.id, role, school_id: schoolId, full_name: (fullName || '').trim() || null, login: n.login,
  })
  if (pErr) { await db.auth.admin.deleteUser(data.user.id); throw pErr }
  return { id: data.user.id, login: n.login, role }
}
