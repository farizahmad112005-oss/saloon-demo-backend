import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!env.smtp.user || !env.smtp.pass) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass,
    },
  });
  return transporter;
}

function formatMoney(value) {
  const n = Number(value || 0);
  return `Rs. ${Math.round(n).toLocaleString('en-PK')}`;
}

function formatTime(time) {
  if (!time) return '';
  const [h, m] = String(time).slice(0, 5).split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDateLabel(date) {
  if (!date) return '';
  try {
    return new Date(`${String(date).slice(0, 10)}T12:00:00`).toLocaleDateString('en-PK', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return String(date);
  }
}

function statusLabel(status) {
  const map = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show',
  };
  return map[status] || status;
}

function wrapHtml(title, body) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${title}</title></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:Arial,Helvetica,sans-serif;color:#f5f0e8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#161616;border:1px solid #c5a05933;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 28px 12px;border-bottom:1px solid #c5a05944;">
          <p style="margin:0;font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#c5a059;">Velour Men's Salon</p>
          <h1 style="margin:10px 0 0;font-size:24px;color:#f5f0e8;font-weight:normal;">${title}</h1>
        </td></tr>
        <tr><td style="padding:24px 28px 28px;font-size:15px;line-height:1.6;color:#d4cbb8;">
          ${body}
          <p style="margin:28px 0 0;font-size:12px;color:#8a8274;">
            Market Place 204, 1st Floor Near Crumble, Canal Road, Faisalabad<br/>
            03007273029 · farizahmad112005@gmail.com
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function appointmentDetailsHtml(appt) {
  const service = appt.service_name || appt.package_name || 'Service';
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;">
      <tr><td style="padding:6px 0;color:#8a8274;">Booking ID</td><td style="padding:6px 0;text-align:right;color:#f5f0e8;">${appt.appointment_code || ''}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8274;">Customer</td><td style="padding:6px 0;text-align:right;color:#f5f0e8;">${appt.client_name || ''}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8274;">Phone</td><td style="padding:6px 0;text-align:right;color:#f5f0e8;">${appt.client_phone || ''}</td></tr>
      ${appt.client_email ? `<tr><td style="padding:6px 0;color:#8a8274;">Email</td><td style="padding:6px 0;text-align:right;color:#f5f0e8;">${appt.client_email}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#8a8274;">Service</td><td style="padding:6px 0;text-align:right;color:#f5f0e8;">${service}</td></tr>
      ${appt.staff_name ? `<tr><td style="padding:6px 0;color:#8a8274;">Barber</td><td style="padding:6px 0;text-align:right;color:#f5f0e8;">${appt.staff_name}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#8a8274;">Date</td><td style="padding:6px 0;text-align:right;color:#f5f0e8;">${formatDateLabel(appt.appointment_date)}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8274;">Time</td><td style="padding:6px 0;text-align:right;color:#f5f0e8;">${formatTime(appt.appointment_time)}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8274;">Status</td><td style="padding:6px 0;text-align:right;color:#c5a059;">${statusLabel(appt.status)}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8274;">Amount</td><td style="padding:6px 0;text-align:right;color:#f5f0e8;">${formatMoney(appt.final_price)}</td></tr>
    </table>`;
}

async function sendMail({ to, subject, html, text }) {
  const tx = getTransporter();
  if (!tx) {
    console.warn('[mail] SMTP not configured — skipped:', subject, '→', to);
    return { skipped: true };
  }
  if (!to) {
    console.warn('[mail] No recipient — skipped:', subject);
    return { skipped: true };
  }
  try {
    const info = await tx.sendMail({
      from: env.smtp.from,
      to,
      subject,
      html,
      text: text || subject,
    });
    return { skipped: false, messageId: info.messageId };
  } catch (err) {
    console.error('[mail] Failed to send:', subject, err.message);
    return { skipped: false, error: err.message };
  }
}

function resolveCustomerEmail(appt) {
  return (appt.client_email || appt.customer_email || '').trim() || null;
}

/** Booking success → customer + admin */
export async function sendBookingEmails(appt) {
  const customerEmail = resolveCustomerEmail(appt);
  const details = appointmentDetailsHtml(appt);
  const service = appt.service_name || appt.package_name || 'your appointment';

  const jobs = [
    sendMail({
      to: env.smtp.adminEmail,
      subject: `New booking — ${appt.appointment_code} · ${appt.client_name}`,
      html: wrapHtml(
        'New appointment booked',
        `<p>A customer just booked an appointment at Velour.</p>${details}`
      ),
      text: `New booking ${appt.appointment_code}: ${appt.client_name}, ${service}, ${appt.appointment_date} ${appt.appointment_time}`,
    }),
  ];

  if (customerEmail) {
    jobs.push(
      sendMail({
        to: customerEmail,
        subject: `Appointment confirmed — Velour Men's Salon (${appt.appointment_code})`,
        html: wrapHtml(
          'You’re booked at Velour',
          `<p>Hi ${appt.client_name || 'there'},</p>
           <p>Your appointment for <strong style="color:#f5f0e8;">${service}</strong> is confirmed. We look forward to seeing you.</p>
           ${details}
           <p>Need to change something? Call us at 03007273029.</p>`
        ),
        text: `Hi ${appt.client_name}, your Velour appointment ${appt.appointment_code} is booked for ${formatDateLabel(appt.appointment_date)} at ${formatTime(appt.appointment_time)}.`,
      })
    );
  }

  await Promise.allSettled(jobs);
}

/** Status change → customer */
export async function sendStatusChangeEmail(appt, previousStatus) {
  const customerEmail = resolveCustomerEmail(appt);
  if (!customerEmail) return;
  const service = appt.service_name || appt.package_name || 'your appointment';
  await sendMail({
    to: customerEmail,
    subject: `Appointment ${statusLabel(appt.status)} — ${appt.appointment_code}`,
    html: wrapHtml(
      `Appointment ${statusLabel(appt.status)}`,
      `<p>Hi ${appt.client_name || 'there'},</p>
       <p>Your appointment status changed from <strong>${statusLabel(previousStatus)}</strong> to <strong style="color:#c5a059;">${statusLabel(appt.status)}</strong>.</p>
       ${appointmentDetailsHtml(appt)}
       <p>Questions? Contact Velour at 03007273029 or farizahmad112005@gmail.com.</p>`
    ),
    text: `Your Velour appointment ${appt.appointment_code} (${service}) is now ${statusLabel(appt.status)}.`,
  });
}

/** Slot/date shift → customer */
export async function sendShiftEmail(appt, previous) {
  const customerEmail = resolveCustomerEmail(appt);
  if (!customerEmail) return;
  const newDate = formatDateLabel(appt.appointment_date);
  const newTime = formatTime(appt.appointment_time);
  const oldDate = formatDateLabel(previous?.date);
  const oldTime = formatTime(previous?.time);

  await sendMail({
    to: customerEmail,
    subject: `Appointment shifted — ${appt.appointment_code}`,
    html: wrapHtml(
      'Your appointment was shifted',
      `<p>Hi ${appt.client_name || 'there'},</p>
       <p>Your appointment has been moved to a new date and time.</p>
       <p style="margin:16px 0;padding:14px 16px;background:#1c1c1c;border-radius:10px;border-left:3px solid #c5a059;">
         <strong style="color:#f5f0e8;">New schedule:</strong><br/>
         ${newDate} at ${newTime}
       </p>
       <p style="font-size:13px;color:#8a8274;">Previously: ${oldDate} at ${oldTime}</p>
       ${appointmentDetailsHtml(appt)}
       <p>If this time does not work, please call 03007273029.</p>`
    ),
    text: `Your Velour appointment ${appt.appointment_code} was shifted to ${newDate} at ${newTime}. (Was ${oldDate} ${oldTime})`,
  });
}
