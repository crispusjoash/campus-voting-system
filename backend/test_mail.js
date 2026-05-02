require('dotenv').config();
const nodemailer = require("nodemailer");

async function testMail() {
  console.log("MAIL_USER:", process.env.MAIL_USER);
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Test" <${process.env.MAIL_USER}>`,
      to: process.env.MAIL_USER,
      subject: "Test",
      text: "Test email"
    });
    console.log("Email sent!", info.response);
  } catch (err) {
    console.error("Mail Error:", err.message);
  }
}

testMail();
