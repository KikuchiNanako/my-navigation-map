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

 const DB_NAME = "CatNaviLogDB";
 const STORE_NAME = "locationLogs";

 function openDB() {
   return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e) => {
         const db = e.target.result;
         if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { autoIncrement: true });
         }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
   });
 }

let lastSavePos = null;
async function savePointToDB(lat, lon) {
   if (lastSavePos) {
      const dist = getDistanceMeters(lat, lon, lastSavePos.lat, lastSavePos.lon);
      if (dist < 5) return;
   }

   const db = await openDB();
   const tx = db.transaction(STORE_NAME, "readwrite");
   const store = tx.objectStore(STORE_NAME);
   store.put({ lat, lon, time: new Date() });
   lastSavePos = { lat, lon };
}

async function bulkSavePoints(points) {
   const db = await openDB();
   const tx = db.transaction(STORE_NAME, "readwrite");
   const store = tx.objectStore(STORE_NAME);

   points.forEach(p => {
      store.put(p);
   });
   return new Promise(resolve => tx.oncomplete = resolve);
}

async function getAllPointsFromDB() {
   const db = await openDB();
   return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
   });
}
 
/**
 * ナビ専用パネルの表示を更新する
 * @param {string} instruction 案内文（「右折です」など）
 * @param {string} distance 距離
 * @param {string} bgColor パネルの背景色
 */
function updateNavDisplay(instruction, distance = "", bgColor = "#333") {
   const panel = document.getElementById('nav-panel');
   const insText = document.getElementById('nav-instruction');
   const distText = document.getElementById('nav-distance');

   if (panel) {
      panel.style.display = 'block';
      panel.style.background = bgColor;
   }
   if (insText) {
      insText.innerHTML = instruction;
   }
   if (distText) {
      distText.innerText = distance;
   }

   /**
    * 指定したテキストで音声を読み上げる
    * @param {string} text 読み上げるテキスト
    */
   function speak(text) {
      if (!text) return;

      if(!('speechSynthesis' in window)) {
         logMessage("このブラウザは音声合成に対応してません");
         return;
      }

      window.speechSynthesis.cancel();

      const uttr = new SpeechSynthesisUtterance();
      uttr.text = text.replace(/<[^>]*./g, "");
      uttr.lang = "ja-JP";
      uttr.rate = 1.0;
      uttr.pitch = 1.0;

      window.speechSynthesis.speak(uttr);
      logMessage(`音声案内： $[uttr.text]`);
   }
}