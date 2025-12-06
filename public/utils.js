//定数
const THRESHOLD_M = 70;
const ROUND_DECIMALS = 4;

//===ユーティリティ関数===
/**
 * ログメッセージをDOMに追加
 *@param {string} message
 */
 function logMessage(message) {
    const logDiv = document.getElementById('log');
    if(!logDiv) {
        console.error("ログ要素 #log が見つかりません:", message);
        return;
    }
    logDiv.innerHTML += `<div>${new Date().toLocaleTimeString()} - ${message}</div>`;
    logDiv.scrollTop = logDiv.scrollHeight;
 }

 /**
  * ハバーサインの公式を使って二点間の距離をメートルで計算する
  * @param {number} lat1
  * @param {number} lon1
  * @param {number} lat2
  * @param {number} lon2
  * @returns {number} 距離（メートル）
  */
 function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // メートル
 }

 /**
  * 緯度経度を指定桁数で丸める
 * @param {number} num
 * @parm {number} decimals
 * @returns {number} 丸められた数値
 */
 function roundToDecimals(num, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
 }
