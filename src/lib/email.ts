import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY)

export const FROM_EMAIL = 'Inovatic <noreply@udruga-inovatic.hr>'
export const REPLY_TO = 'prijave@udruga-inovatic.hr'
