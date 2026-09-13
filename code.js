function doGet() {
  const template = HtmlService.createTemplateFromFile('index');
  // フォームURLをリポジトリに書かず、GASのScript Propertiesから読み込む
  template.formUrl = PropertiesService.getScriptProperties().getProperty('FORM_URL') || '';
  return template.evaluate()
    .setTitle('家計簿レポート')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getReportData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  // 修正ポイント： getValues() ではなく getDisplayValues() を使い、すべて「文字列」として取得してエラーを防ぐ
  const data = sheet.getDataRange().getDisplayValues();

  if (data.length <= 1) return [];

  const headers = data[0];
  const rows = data.slice(1);

  const result = rows.map(row => {
    let obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });

    if (obj['日付']) {
      // 文字列の日付を計算用に再変換
      let dateStr = obj['日付'].replace(/\//g, '-');
      let date = new Date(dateStr);

      if (!isNaN(date.getTime())) {
        let year = date.getFullYear();
        let month = ('0' + (date.getMonth() + 1)).slice(-2);
        obj['年月'] = year + '-' + month;

        let day = ('0' + date.getDate()).slice(-2);
        obj['表示用日付'] = `${year}/${month}/${day}`;
      } else {
        obj['年月'] = '不明';
        obj['表示用日付'] = obj['日付'];
      }
    }
    return obj;
  });

  return result.filter(row => row['日付'] !== '');
}
