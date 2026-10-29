// Optional alternative to SMTP: a Google Apps Script web app that sends the
// emails your server hands it. Set MAIL_WEBHOOK_URL + MAIL_WEBHOOK_TOKEN in
// server/.env and a script property WEBHOOK_TOKEN with the same value.
//
// The server builds the full email (subject, text, HTML, legal footer and
// unsubscribe link), so this script only validates and delivers it.
function doPost(event) {
  try {
    var payload = JSON.parse(event.postData.contents);
    var expectedToken =
      PropertiesService.getScriptProperties().getProperty('WEBHOOK_TOKEN');

    if (!expectedToken || payload.token !== expectedToken) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }

    if (
      typeof payload.to !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.to) ||
      typeof payload.subject !== 'string' ||
      typeof payload.text !== 'string' ||
      typeof payload.html !== 'string' ||
      payload.subject.length > 200 ||
      payload.html.length > 100000
    ) {
      return jsonResponse({ ok: false, error: 'Invalid request' });
    }

    MailApp.sendEmail({
      to: payload.to,
      subject: payload.subject,
      name: 'Chirpergram',
      body: payload.text,
      htmlBody: payload.html,
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error && error.message ? error.message : 'Email delivery failed',
    });
  }
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
