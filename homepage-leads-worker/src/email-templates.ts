const SIGNAL = "#c7ff00";
const INK = "#080a07";
const PAPER = "#f4f3ed";
const MUTED = "#a6aa9f";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);
}

function shell(content: string, preheader: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agmentic</title></head>
<body style="margin:0;padding:0;background:${INK};color:${PAPER};font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${INK}"><tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;border:1px solid #26311d;background:#0b0e09">
    <tr><td style="padding:26px 30px 22px;border-bottom:1px solid #26311d">
      <span style="display:inline-block;color:${SIGNAL};font-size:24px;font-weight:800;letter-spacing:-1px">A!</span>
      <span style="display:inline-block;margin-left:12px;color:${PAPER};font-size:12px;font-weight:700;letter-spacing:3px;vertical-align:4px">AGMENTIC</span>
    </td></tr>
    <tr><td style="padding:48px 30px 42px">${content}</td></tr>
    <tr><td style="padding:20px 30px;border-top:1px solid #26311d;color:${MUTED};font-size:11px;line-height:1.7;letter-spacing:1.2px">
      © 2026 AGMENTIC&nbsp;&nbsp;•&nbsp;&nbsp;MUNICH<br>
      <a href="https://agmentic.com" style="color:${MUTED};text-decoration:none">agmentic.com</a>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

export function welcomeEmail() {
  return {
    subject: "Welcome to Agmentic",
    text: "Welcome to Agmentic. Thanks for joining us. You’re now on the list for what’s next — new ideas, experiments and gatherings around agentic commerce. We’ll be in touch soon.",
    html: shell(`
      <div style="width:42px;height:2px;background:${SIGNAL};margin-bottom:28px"></div>
      <p style="margin:0 0 14px;color:${SIGNAL};font-size:12px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase">Welcome to Agmentic</p>
      <h1 style="margin:0 0 24px;color:${PAPER};font-size:46px;line-height:1.02;letter-spacing:-2.2px;font-weight:700">Thanks for<br>joining us.</h1>
      <p style="margin:0;max-width:490px;color:#c8cbc2;font-size:18px;line-height:1.6">You’re now on the list for what’s next — new ideas, experiments and gatherings around agentic commerce.</p>
      <p style="margin:28px 0 0;color:${PAPER};font-size:16px;line-height:1.6">We’ll be in touch soon.</p>
    `, "Thanks for joining Agmentic. You’re now on the list for what’s next."),
  };
}

export interface EventEmailInput {
  name: string;
  date: string;
  time: string;
  place: string;
  description: string;
  url: string;
}

export function eventInvitationEmail(input: EventEmailInput) {
  const event = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, escapeHtml(value)])) as unknown as EventEmailInput;
  return {
    subject: `You’re invited: ${input.name}`,
    text: `You’re invited to ${input.name}. ${input.description}\n\nDate: ${input.date}\nTime: ${input.time}\nPlace: ${input.place}\n\nView event: ${input.url}`,
    html: shell(`
      <p style="margin:0 0 14px;color:${SIGNAL};font-size:12px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase">Agmentic event</p>
      <h1 style="margin:0 0 22px;color:${PAPER};font-size:44px;line-height:1.04;letter-spacing:-2px;font-weight:700">${event.name}</h1>
      <p style="margin:0 0 30px;max-width:500px;color:#c8cbc2;font-size:17px;line-height:1.6">${event.description}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #26311d;border-bottom:1px solid #26311d"><tr>
        <td width="33%" style="padding:18px 8px 18px 0"><span style="display:block;color:${MUTED};font-size:10px;letter-spacing:1.6px">DATE</span><span style="display:block;margin-top:7px;color:${PAPER};font-size:14px">${event.date}</span></td>
        <td width="33%" style="padding:18px 8px"><span style="display:block;color:${MUTED};font-size:10px;letter-spacing:1.6px">TIME</span><span style="display:block;margin-top:7px;color:${PAPER};font-size:14px">${event.time}</span></td>
        <td width="34%" style="padding:18px 0 18px 8px"><span style="display:block;color:${MUTED};font-size:10px;letter-spacing:1.6px">PLACE</span><span style="display:block;margin-top:7px;color:${PAPER};font-size:14px">${event.place}</span></td>
      </tr></table>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:30px"><tr><td bgcolor="${SIGNAL}" style="border-radius:999px">
        <a href="${event.url}" style="display:inline-block;padding:14px 24px;color:${INK};font-size:13px;font-weight:800;letter-spacing:1px;text-decoration:none;text-transform:uppercase">View event&nbsp;&nbsp;→</a>
      </td></tr></table>
    `, `You’re invited to ${input.name}. ${input.date}, ${input.place}.`),
  };
}
