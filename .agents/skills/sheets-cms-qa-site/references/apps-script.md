# Spreadsheet-side Apps Script

Add this via Extensions > Apps Script in the spreadsheet. It gives
non-engineers a menu button instead of a URL to remember or paste.

```javascript
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('サイト更新')
    .addItem('今すぐ反映する', 'refreshSite')
    .addToUi();
}

function refreshSite() {
  const token = PropertiesService.getScriptProperties().getProperty('REFRESH_TOKEN');
  const res = UrlFetchApp.fetch('https://<your-site>.pages.dev/api/refresh', {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });
  const body = JSON.parse(res.getContentText());
  SpreadsheetApp.getUi().alert(body.message);
}
```

## Setup steps

1. Paste the script into the Apps Script editor for this spreadsheet.
2. Project Settings (gear icon) > Script Properties > add `REFRESH_TOKEN`
   with the same value as the `REFRESH_TOKEN` secret configured in
   Cloudflare Pages. This is a one-time manual copy — there's no way to
   automate it safely, since it's a secret crossing two separate systems.
3. Reload the spreadsheet. A "サイト更新" menu should appear next to Help.

Do not put the token directly in the script body — Script Properties keeps
it out of the visible source and out of any copy of the sheet made via
"File > Make a copy".
