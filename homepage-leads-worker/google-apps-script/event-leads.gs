const TAB_NAME = "Event Leads";

function doPost(event) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    const expectedToken = PropertiesService.getScriptProperties().getProperty("WEBHOOK_TOKEN");
    const configuredSheetId = PropertiesService.getScriptProperties().getProperty("SHEET_ID");

    if (!expectedToken || payload.token !== expectedToken) {
      return ContentService.createTextOutput("UNAUTHORIZED");
    }
    if (!configuredSheetId || payload.sheet_id !== configuredSheetId) {
      return ContentService.createTextOutput("INVALID_SHEET");
    }

    const sheet = SpreadsheetApp.openById(configuredSheetId).getSheetByName(TAB_NAME);
    if (!sheet) return ContentService.createTextOutput("MISSING_TAB");

    const leadId = String(payload.lead_id || "");
    if (!leadId) return ContentService.createTextOutput("INVALID_LEAD");

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      if (ids.some((row) => row[0] === leadId)) {
        return ContentService.createTextOutput("OK_DUPLICATE");
      }
    }

    sheet.appendRow([
      leadId,
      payload.email || "",
      payload.source || "",
      payload.category || "",
      payload.campaign_id || "",
      payload.submitted_at || "",
      payload.email_status || "",
      payload.sheet_status || "synced",
      Number(payload.duplicate_count || 0),
      payload.last_error || ""
    ]);
    SpreadsheetApp.flush();
    return ContentService.createTextOutput("OK");
  } catch (error) {
    return ContentService.createTextOutput(`ERROR:${String(error).slice(0, 200)}`);
  } finally {
    lock.releaseLock();
  }
}
