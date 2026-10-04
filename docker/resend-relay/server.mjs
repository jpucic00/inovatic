// A local stand-in for the Resend HTTP API that delivers into Mailpit instead.
//
// The app keeps sending exactly as in production — `new Resend(key).emails.send`
// with a React element. The SDK renders the element to HTML itself and POSTs
// it to `${RESEND_BASE_URL}/emails`; pointing RESEND_BASE_URL here (in
// .env.local) is the only change, so what lands in Mailpit is what Resend would
// have been handed: From, To, Reply-To, subject, HTML and attachments.
//
// Dev only. No dependencies — Node's own http server and fetch.

import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 3025)
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://mailpit:8025'

/** "Inovatic <prijave@x.hr>" or "prijave@x.hr" → Mailpit's address shape. */
function address(value) {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value)
  return match ? { Name: match[1].replace(/^"|"$/g, ''), Email: match[2] } : { Name: '', Email: value.trim() }
}

const list = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]).map(address)

/** Same refusals Resend gives for a malformed request, so a broken payload
 *  fails here the way it would in production instead of being caught silently. */
function validationError(email) {
  if (!email.from) return 'Missing `from` field.'
  if (!email.to || (Array.isArray(email.to) && email.to.length === 0)) return 'Missing `to` field.'
  if (!email.subject) return 'Missing `subject` field.'
  if (!email.html && !email.text) return 'Missing `html` or `text` field.'
  return null
}

async function deliver(email) {
  const res = await fetch(`${MAILPIT_URL}/api/v1/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      From: address(email.from),
      To: list(email.to),
      Cc: list(email.cc),
      Bcc: list(email.bcc).map((a) => a.Email),
      ReplyTo: list(email.reply_to),
      Subject: email.subject,
      HTML: email.html ?? '',
      Text: email.text ?? '',
      Headers: email.headers ?? {},
      Attachments: (email.attachments ?? []).map((a) => ({
        Content: a.content,
        Filename: a.filename,
        ContentType: a.content_type ?? 'application/octet-stream',
      })),
    }),
  })
  if (!res.ok) throw new Error(`Mailpit answered ${res.status}: ${await res.text()}`)
  return randomUUID()
}

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/emails') {
      const email = await readJson(req)
      const invalid = validationError(email)
      if (invalid) return reply(res, 422, { name: 'validation_error', message: invalid, statusCode: 422 })
      const id = await deliver(email)
      console.log(`relayed ${id}: "${email.subject}" → ${list(email.to).map((a) => a.Email).join(', ')}`)
      return reply(res, 200, { id })
    }
    if (req.method === 'POST' && req.url === '/emails/batch') {
      const emails = await readJson(req)
      const invalid = emails.map(validationError).find(Boolean)
      if (invalid) return reply(res, 422, { name: 'validation_error', message: invalid, statusCode: 422 })
      const data = []
      for (const email of emails) data.push({ id: await deliver(email) })
      return reply(res, 200, { data })
    }
    reply(res, 404, { name: 'not_found', message: `The local relay only accepts POST /emails and /emails/batch, not ${req.method} ${req.url}.`, statusCode: 404 })
  } catch (err) {
    console.error(err)
    reply(res, 500, { name: 'application_error', message: String(err?.message ?? err), statusCode: 500 })
  }
}).listen(PORT, () => {
  console.log(`Resend relay on :${PORT} → ${MAILPIT_URL}`)
})
