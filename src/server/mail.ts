import nodemailer from "nodemailer";

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

let transporter: nodemailer.Transporter | null = null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!mailConfigured()) return false;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
  return true;
}
