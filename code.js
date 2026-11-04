function doGet(e) {
  // 不正な ?page= で createTemplateFromFile が例外を投げないよう、既知の値のみ許可する
  const page = (e && e.parameter && e.parameter.page === 'annual') ? 'annual' : 'index';
  const template = HtmlService.createTemplateFromFile(page);
  // フォームURLをリポジトリに書かず、GASのScript Propertiesから読み込む
  template.formUrl = PropertiesService.getScriptProperties().getProperty('FORM_URL') || '';
  // HtmlServiceはサンドボックスiframeで配信され相対リンクが効かないため、ページ間移動に絶対URLが要る
  template.baseUrl = ScriptApp.getService().getUrl() || '';
  return template.evaluate()
    .setTitle(page === 'annual' ? '家計簿 年間レポート' : '家計簿レポート')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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

const AI_SHEET_NAME = 'AI分析';
const AI_SHEET_HEADERS = ['年月', '分析日時', 'データ指紋', 'モデル', '結果'];

function readAiAdviceRows_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  const rows = {};
  values.slice(1).forEach((row, i) => {
    if (!row[0]) return;
    rows[row[0]] = { rowNumber: i + 2, analyzedAt: row[1], fingerprint: row[2], model: row[3], markdown: row[4] };
  });
  return rows;
}

/**
 * 保存済みのAI分析結果を年月ごとに返す。閲覧のたびにGeminiを呼ばないよう、表示はこれだけで済ませる
 */
function getSavedAiAdvice() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AI_SHEET_NAME);
  if (!sheet) return {};
  const rows = readAiAdviceRows_(sheet);
  const result = {};
  Object.keys(rows).forEach(ym => {
    const { analyzedAt, fingerprint, model, markdown } = rows[ym];
    result[ym] = { analyzedAt, fingerprint, model, markdown };
  });
  return result;
}

/**
 * クライアントで集計済みの当月・前月サマリーを受け取り、Geminiで振り返りと改善案（Markdown）を生成する
 */
function generateMonthlyAiAdvice(req) {
  // google.script.run はWebアプリにアクセスできる人なら任意の引数で呼べるため、プロンプトに埋め込む前に形を確かめる
  const ymPattern = /^\d{4}-\d{2}$/;
  if (!req || !ymPattern.test(req.month) || !ymPattern.test(req.prevMonth) || !req.current || !req.prev
    || !/^[0-9a-f]{8}$/.test(req.fingerprint)) {
    throw new Error('分析対象の指定が不正です。');
  }

  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('スクリプトプロパティに GEMINI_API_KEY が設定されていません。');
  }
  // 家族の名前を公開リポジトリに書かないため、世帯の説明はScript Propertiesから読む
  const household = props.getProperty('HOUSEHOLD_DESC') || '家族';
  // Gemini APIの無料枠では送信内容がGoogleの製品改善に使われうるため、明細の「内容・詳細」は明示的に許可したときだけ送る
  const sendDetails = props.getProperty('AI_SEND_DETAILS') === 'true';

  const { month, prevMonth, current, prev } = req;
  const toNum = v => Number(v) || 0;
  const formatObj = (obj) => Object.entries(obj || {})
    .sort((a, b) => toNum(b[1]) - toNum(a[1]))
    .map(([k, v]) => `・${k}: ¥${toNum(v).toLocaleString()}`)
    .join('\n') || '・なし';

  const detailSection = sendDetails ? `
■ 当月の主な出費明細（2,000円以上・金額の大きい順に最大25件）
${(current.details || []).slice(0, 25)
      .map(d => `${d.date} [${d.category}] ${d.content || '詳細なし'}: ¥${toNum(d.amount).toLocaleString()} (払:${d.payer}/用:${d.user})`)
      .join('\n') || '・該当なし'}
` : '';

  const prompt = `
あなたは${household}の家計をサポートする、優秀で親しみやすいファイナンシャルプランナーです。
以下の${month}の家計簿データ（および前月${prevMonth}との比較）を分析し、振り返りと来月に向けた改善案を作成してください。

■ 当月（${month}）の収支サマリー
・収入合計: ¥${toNum(current.income).toLocaleString()}
・支出合計: ¥${toNum(current.expense).toLocaleString()}
・収支残高: ¥${(toNum(current.income) - toNum(current.expense)).toLocaleString()}

■ 当月の費目別支出
${formatObj(current.categories)}

■ 当月の支払い者別 / 利用者別の支出
【支払い者別】
${formatObj(current.payers)}
【利用者別】
${formatObj(current.users)}
${detailSection}
■（参考）前月（${prevMonth}）の支出状況
・前月の支出合計: ¥${toNum(prev.expense).toLocaleString()}
・前月の費目別支出:
${formatObj(prev.categories)}

【出力フォーマット】
Markdown形式で出力してください。見出しは次の3つを「##」で使い、箇条書きや**太字**で要点を分かりやすくしてください。スマートフォンで読むため、表は使わないでください。
## 1. 今月の家計総評と前月比較
（全体の収支バランスや、前月と比べて増減したポイント、良かった点をポジティブに評価）
## 2. 支出の傾向と注目ポイント
（費目別の割合${sendDetails ? '、主な出費明細から見える傾向' : ''}、支払い者・利用者ごとの負担や利用バランスについて）
## 3. 来月に向けた具体的な改善アクション（3つ）
（無理なく楽しく節約や家計改善ができる具体的なアイデアを3つ提案）
`;

  // 無料枠で利用可能な最新モデル「gemini-3.8-flash」を指定
  // （※有料設定済みのプロジェクトでArgonを使う場合は 'gemini-4-argon' に変更可能）
  const model = 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      // 3.8 Flashは省略時mediumで推論し待ち時間が長いため、家計アドバイス程度ならlowで十分と判断した
      thinkingConfig: { thinkingLevel: 'low' }
    }
  };

  // 家族が同時に分析しても行が二重にならず、同じデータへのGemini呼び出しも重複しないよう、呼び出しから保存までを直列化する
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(200000)) {
    throw new Error('ほかの分析が実行中です。しばらくしてからもう一度お試しください。');
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(AI_SHEET_NAME);
    if (!sheet) {
      // getReportData は getSheets()[0] を家計簿として読むため、先頭シートを動かさないよう必ず末尾に追加する
      sheet = ss.insertSheet(AI_SHEET_NAME, ss.getSheets().length);
      sheet.getRange(1, 1, 1, AI_SHEET_HEADERS.length).setValues([AI_SHEET_HEADERS]);
    }
    const saved = readAiAdviceRows_(sheet)[month];

    // 押した時点で見ていた結果とは別の結果が、待っている間に同じデータで保存されていたら、それを使い回す
    if (saved && saved.fingerprint === req.fingerprint && saved.analyzedAt !== (req.baseAnalyzedAt || '')) {
      return { analyzedAt: saved.analyzedAt, fingerprint: saved.fingerprint, model: saved.model, markdown: saved.markdown };
    }

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const resCode = response.getResponseCode();
    const resText = response.getContentText();

    if (resCode !== 200) {
      throw new Error(`Gemini API エラー (${resCode}): ${resText}`);
    }

    const json = JSON.parse(resText);
    const markdown = json.candidates[0].content.parts[0].text;
    const analyzedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');

    const record = [month, analyzedAt, req.fingerprint, model, markdown];
    const rowNumber = saved ? saved.rowNumber : sheet.getLastRow() + 1;
    // 「2026-10」が日付に、16進の指紋が数値や指数表記に自動変換されないよう、書式なしテキストとして書き込む
    sheet.getRange(rowNumber, 1, 1, record.length).setNumberFormat('@').setValues([record]);

    return { analyzedAt, fingerprint: req.fingerprint, model, markdown };
  } finally {
    lock.releaseLock();
  }
}
