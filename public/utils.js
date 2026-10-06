//定数
const THRESHOLD_M = 70;
const ROUND_DECIMALS = 5;

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
   const line = document.createElement("div");

   line.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
   
   logDiv.appendChild(line);

   //古すぎるログは削除
   while (logDiv.children.length > 200) {
      logDiv.firstElementChild.remove();
   }

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
 * 点Pから線分ABまでの最短距離をメートルで求める
 * @param {number} pLat 現在地の緯度
 * @param {number} pLon 現在地の経度
 * @param {number} aLat 線分の始点の緯度
 * @param {number} aLon 線分の始点の経度
 * @param {number} bLat 線分の終点の緯度
 * @param {number} bLon 線分の終点の経度
 * @returns {number} 線分までの距離（メートル）
 */
function getDistanceToSegmentMeters(pLat, pLon, aLat, aLon, bLat, bLon) {
   const latScale = 111320;
   const lonScale = 111320 * Math.cos(pLat * Math.PI / 180);

   const ax = (aLon - pLon) * lonScale;
   const ay = (aLat - pLat) * latScale;

   const bx = (bLon - pLon) * lonScale;
   const by = (bLat - pLat) * latScale;

   const abx = bx - ax;
   const aby = by - ay;

   const abLengthSquared = abx * abx + aby * aby;

   if (abLengthSquared === 0) {
      return Math.sqrt(ax * ax + ay * ay);
   }

   let t = -(ax * abx + ay * aby) / abLengthSquared;

   t = Math.max(0, Math.min(1, t));

   const closestX = ax + t * abx;
   const closestY = ay + t * aby;

   return Math.sqrt(closestX * closestX + closestY * closestY);

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

let dbPromise = null;

function openDB() {
   if (dbPromise) {
      return dbPromise;
   }

   dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = (e) => {
         const db = e.target.result;

         if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(
               STORE_NAME,
               { autoIncrement: true }
            );
         }
      };

      request.onsuccess = (e) => {
         const db = e.target.result;

         db.onversionchange = () => {
            db.close();
            dbPromise = null;
         };
         resolve(db);
      };
      request.onerror = (e) => {
         dbPromise = null;
         reject(e.target.error);
      };
   });
   return dbPromise;
}

let lastSavePos = null;
async function savePointToDB(lat, lon) {
   if (lastSavePos) {
      const dist = getDistanceMeters(lat, lon, lastSavePos.lat, lastSavePos.lon);
      if (dist < 5) return;
   }

   const db = await openDB();
   return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      store.put({ lat, lon, time: new Date() });

      tx.oncomplete = () => {
         lastSavePos = { lat, lon };
         resolve();
      };

      tx.onerror = () => {
         reject(tx.error);
      };
   });
}

async function bulkSavePoints(points) {
   const db = await openDB();

   //スマホでも安定するように分割して保存
   const BATCH_SIZE = 200;

   for (let i = 0; i < points.length; i+=BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);

      await new Promise((resolve, reject) => {
         const tx = db.transaction(STORE_NAME, "readwrite");
         const store = tx.objectStore(STORE_NAME);

         for (const p of batch) {
            store.put({
               lat: p.lat,
               lon: p.lon,
               time: p.time
            });
         }
         tx.oncomplete = () => resolve();

         tx.onerror = () => {
            reject(tx.error || new Error("IndexDB保存エラー"));
         };

         tx.onabort = () => {
            reject(tx.error || new Error("IndexDB保存が中断されました"));
         };
      });

      logMessage(`保存中：${Math.min(i + BATCH_SIZE, points.length)} / ${points.length}地点`);
   }
   logMessage(`${points.length}地点のDB保存が完了しました`);
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
      distText.innerHTML = distance;
   }
}

/**
 * テキストで音声を読み上げる
 * @param {string} text 読み上げるテキスト
 */
function speakText (text) {
   if (!('speechSynthesis' in window)) {
      console.warn("このブラウザは音声合成をサポートしてません");
      return;
   }

   window.speechSynthesis.cancel();

   const uttr = new SpeechSynthesisUtterance(text);
   uttr.lang = 'ja-JP';
   uttr.rate = 1.0;
   uttr.pitch = 1.0;

   window.speechSynthesis.speak(uttr);
}