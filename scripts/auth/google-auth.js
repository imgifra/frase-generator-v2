const { google } = require("googleapis");
const path = require("path");

function getSheetsAuth() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

    return new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
  }

  return new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, "..", "..", "config", "service_account.json"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

module.exports = { getSheetsAuth };