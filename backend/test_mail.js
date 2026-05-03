require('dotenv').config();

async function testMail() {
  const brevoApiKey = process.env.BREVO_API_KEY || process.env.MAIL_PASS;
  const senderEmail = process.env.MAIL_USER || "noreply@mmust.ac.ke";
  
  console.log("MAIL_USER (Sender):", senderEmail);
  console.log("Using API Key:", brevoApiKey ? "Present (starts with " + brevoApiKey.substring(0, 10) + "...)" : "Missing");

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": brevoApiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: { name: "MMUST Electoral Commission", email: senderEmail },
        to: [{ email: senderEmail }], // Sending to the same email for testing
        subject: "Brevo API Test",
        htmlContent: "<h2>Brevo Test</h2><p>If you are receiving this, the Brevo HTTP API is working correctly!</p>"
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to send email via Brevo API");
    }

    const data = await response.json();
    console.log("Email sent successfully! Brevo Message ID:", data.messageId);
  } catch (err) {
    console.error("Mail Error:", err.message);
  }
}

testMail();
