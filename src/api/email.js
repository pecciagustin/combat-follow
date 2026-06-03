import emailjs from '@emailjs/browser'

export function sendChangeAlert({ config, fighter, changes }) {
  if (!config.serviceId || !config.templateId || !config.publicKey || !config.toEmail) return

  emailjs.init(config.publicKey)

  const changeLines = changes.map((c) => `• ${c.field}: ${c.from} → ${c.to}`).join('\n')

  return emailjs.send(config.serviceId, config.templateId, {
    to_email: config.toEmail,
    fighter_name: fighter,
    changes: changeLines,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  })
}

export function sendLiveAlert({ config, fighter, matchData }) {
  if (!config.serviceId || !config.templateId || !config.publicKey || !config.toEmail) return

  emailjs.init(config.publicKey)

  return emailjs.send(config.serviceId, config.templateId, {
    to_email: config.toEmail,
    fighter_name: fighter,
    changes: `⚡ Pelea EN VIVO\nvs ${matchData?.opponent || 'TBD'} · Mat ${matchData?.mat || '?'} · Fight ${matchData?.fight || '?'}`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  })
}
