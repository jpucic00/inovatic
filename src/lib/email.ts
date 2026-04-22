import { Resend } from 'resend'

let resendClient: Resend | null = null

export const resend = {
  get emails() {
    if (!resendClient) {
      resendClient = new Resend(process.env.RESEND_API_KEY)
    }
    return resendClient.emails
  },
}

export const FROM_EMAIL = 'Inovatic <noreply@udruga-inovatic.hr>'
export const REPLY_TO = 'prijave@udruga-inovatic.hr'
