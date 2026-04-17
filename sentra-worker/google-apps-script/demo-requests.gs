function jsonResponse(body) {
  var output = ContentService.createTextOutput(JSON.stringify(body));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function getRequiredProperty(name) {
  var value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) {
    throw new Error("Missing script property: " + name);
  }
  return value;
}

function getOrCreateSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName("Demo Requests");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("Demo Requests");
    sheet.appendRow([
      "requested_at",
      "email",
      "page_category",
      "industry_key",
      "industry_label",
      "sales_lane",
      "origin",
      "user_agent",
      "mx_check_passed",
      "abstract_status",
      "abstract_status_detail",
      "abstract_is_smtp_valid",
      "abstract_is_mx_valid",
      "abstract_is_disposable",
      "abstract_is_catchall",
      "abstract_is_free_email",
      "abstract_quality_score",
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doPost(e) {
  try {
    var payload = JSON.parse((e.postData && e.postData.contents) || "{}");
    var expectedToken = getRequiredProperty("WEBHOOK_TOKEN");
    if (payload.token !== expectedToken) {
      return jsonResponse({ success: false, error: "unauthorized" });
    }

    var spreadsheet = SpreadsheetApp.openById(getRequiredProperty("SHEET_ID"));
    var sheet = getOrCreateSheet_(spreadsheet);
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      sheet.appendRow([
        payload.requestedAt || "",
        payload.email || "",
        payload.pageCategory || "",
        payload.industry || "",
        payload.industryLabel || "",
        payload.salesLane || "",
        payload.origin || "",
        payload.userAgent || "",
        payload.mxCheckPassed ? "true" : "false",
        payload.abstractStatus || "",
        payload.abstractStatusDetail || "",
        payload.abstractIsSmtpValid ? "true" : "false",
        payload.abstractIsMxValid ? "true" : "false",
        payload.abstractIsDisposable ? "true" : "false",
        payload.abstractIsCatchall ? "true" : "false",
        payload.abstractIsFreeEmail ? "true" : "false",
        payload.abstractQualityScore === null || payload.abstractQualityScore === undefined ? "" : payload.abstractQualityScore,
      ]);
    } finally {
      lock.releaseLock();
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse({ success: false, error: String(error && error.message ? error.message : error) });
  }
}
